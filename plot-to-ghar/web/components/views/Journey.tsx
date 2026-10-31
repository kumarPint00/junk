'use client';

import { useEffect, useState } from 'react';
import type { ProjectState } from '@/lib/types';
import { money, PageTitle } from '@/components/ui';

export function Journey({
  state,
  save,
  focusSection = 'milestones',
  onEditProperty,
}: {
  state: ProjectState;
  save: (state: ProjectState) => Promise<void>;
  focusSection?: 'milestones' | 'budgets';
  onEditProperty?: () => void;
}) {
  const [draft, setDraft] = useState<ProjectState>(() => structuredClone(state));
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const hasChanges = JSON.stringify(draft.milestones) !== JSON.stringify(state.milestones)
    || JSON.stringify(draft.phases) !== JSON.stringify(state.phases);
  useEffect(() => setDraft(structuredClone(state)), [state]);
  useEffect(() => {
    const element = document.getElementById('ptg-journey-' + focusSection);
    if (!element) return;
    const frame = requestAnimationFrame(() => element.scrollIntoView({behavior:'smooth',block:'start'}));
    return () => cancelAnimationFrame(frame);
  }, [focusSection]);

  async function saveJourney() {
    setSaving(true); setFeedback('');
    try { await save(draft); setFeedback('Journey settings saved (or queued for cloud sync if offline).'); }
    catch (e) { setFeedback(e instanceof Error ? e.message : 'Could not save phase budgets.'); }
    finally { setSaving(false); }
  }

  function updateMilestone(id: string, status: ProjectState['milestones'][number]['status']) {
    setDraft((s) => ({
      ...s,
      milestones: s.milestones.map((m) =>
        m.id === id
          ? { ...m, status, completedAt: status === 'COMPLETED' ? new Date().toISOString() : undefined }
          : m
      ),
    }));
  }

  function updatePhase(id: string, patch: Partial<ProjectState['phases'][number]>) {
    setDraft((s) => ({
      ...s,
      phases: s.phases.map((p) =>
        p.id === id
          ? {
              ...p,
              ...patch,
              progressPercent: Math.max(0, Math.min(100, Number(patch.progressPercent ?? p.progressPercent))),
              completedAt:
                patch.status === 'COMPLETED'
                  ? new Date().toISOString()
                  : patch.status
                    ? undefined
                    : p.completedAt,
            }
          : p
      ),
    }));
  }

  return (
    <div className="stack">
      <PageTitle title="Property Journey" description="Edit milestone status, phase budgets and progress. Save when you finish." />

      <div className="controlSaveBar journeySaveBar" role="status">
        <div><b>{hasChanges ? 'Unsaved journey changes' : 'Milestones and budgets are saved'}</b>
          <small>{hasChanges ? 'Save status, budget and progress edits below.' : 'Actual financial spending is never edited from this screen.'}</small>
          {feedback && <small className="controlFeedback">{feedback}</small>}
        </div>
        <div className="formActions">
          <button type="button" className="secondary small" disabled={!hasChanges || saving} onClick={() => {setDraft(structuredClone(state));setFeedback('Edits discarded.');}}>Discard</button>
          <button type="button" className="primary" disabled={!hasChanges || saving} onClick={saveJourney}>{saving ? 'Saving…' : 'Save journey'}</button>
        </div>
      </div>

      <section className="panel timeline" id="ptg-journey-milestones">
        <div className="sectionHead"><div><h2>Project milestones</h2><p>Change any status below, then save your updates.</p></div><span className="summaryEdit">Editable ✎</span></div>
        {draft.milestones
          .slice()
          .sort((a, b) => a.sequence - b.sequence)
          .map((m, i) => (
            <div className="milestone" key={m.id}>
              <div className={'dot ' + m.status.toLowerCase()}>{m.status === 'COMPLETED' ? '✓' : i + 1}</div>
              <div className="grow">
                <b>{m.name}</b>
                <small>{m.status.replaceAll('_', ' ')}</small>
              </div>
              <select value={m.status} onChange={(e) => updateMilestone(m.id, e.target.value as typeof m.status)}>
                <option value="PENDING">Pending</option>
                <option value="IN_PROGRESS">In progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="SKIPPED">Skipped</option>
              </select>
            </div>
          ))}
      </section>

      <section className="panel" id="ptg-journey-budgets">
        <div className="sectionHead">
          <div>
            <h2>Construction phase budgets</h2>
            <p>Update allocations and progress. Actual costs always come from the ledger.</p>
          </div>
          <b>{money(draft.phases.filter(p=>p.name!=='Plot Purchase').reduce((a, p) => a + Number(p.budgetAmount || 0), 0))}</b>
        </div>
        <p className="muted">This is the sum of construction and ancillary phase budgets, excluding the plot-purchase price. The plot price is edited in Property Control.</p>
        {onEditProperty && <button type="button" className="secondary small" onClick={onEditProperty}>Edit agreed plot price</button>}

        <div className="phaseGrid">
          {draft.phases
            .slice()
            .sort((a, b) => a.sequence - b.sequence)
            .map((p) => (
              <article className="phaseCard" key={p.id}>
                <div className="sectionHead">
                  <b>{p.sequence}. {p.name}</b>
                  <span className={'status ' + p.status.toLowerCase()}>{p.status.replaceAll('_', ' ')}</span>
                </div>
                <div className="grid2">
                  <label>
                    Budget ₹
                    <input
                      type="number" min="0" step="any"
                      inputMode="decimal"
                      value={p.budgetAmount}
                      onChange={(e) => updatePhase(p.id, { budgetAmount: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    Status
                    <select value={p.status} onChange={(e) => updatePhase(p.id, { status: e.target.value as typeof p.status })}>
                      <option value="PENDING">Pending</option>
                      <option value="IN_PROGRESS">In progress</option>
                      <option value="ON_HOLD">On hold</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="SKIPPED">Skipped</option>
                    </select>
                  </label>
                </div>
                <label>
                  Progress — {p.progressPercent}%
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={p.progressPercent}
                    onChange={(e) => updatePhase(p.id, { progressPercent: Number(e.target.value) })}
                  />
                </label>
                <label>Exact progress %<input type="number" min="0" max="100" step="1" value={p.progressPercent} onChange={e => updatePhase(p.id, {progressPercent: Number(e.target.value)})} /></label>
              </article>
            ))}
        </div>

      </section>

    </div>
  );
}
