'use client';

import { useEffect, useState } from 'react';
import type { ProjectState } from '@/lib/types';
import { money, PageTitle } from '@/components/ui';

export function Journey({
  state,
  save,
}: {
  state: ProjectState;
  save: (state: ProjectState) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ProjectState>(() => structuredClone(state));
  useEffect(() => setDraft(structuredClone(state)), [state]);

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
      <PageTitle title="Property Journey" description="Milestones, phase budgets and construction progress." />

      <section className="panel timeline">
        <h2>Project milestones</h2>
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

      <section className="panel">
        <div className="sectionHead">
          <div>
            <h2>Construction phase plan</h2>
            <p>Budgets can be filled gradually as estimates become reliable.</p>
          </div>
          <b>{money(draft.phases.reduce((a, p) => a + Number(p.budgetAmount || 0), 0))}</b>
        </div>

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
                    Budget
                    <input
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
              </article>
            ))}
        </div>

        <button className="primary" onClick={() => save(draft)}>Save journey & phase plan</button>
      </section>
    </div>
  );
}
