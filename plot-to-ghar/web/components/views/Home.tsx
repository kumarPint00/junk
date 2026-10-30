'use client';

import { useEffect, useMemo, useState } from 'react';
import { computeLedger } from '@/lib/ledger';
import type { ProjectState, Transaction } from '@/lib/types';
import { Card, money, PageTitle } from '@/components/ui';

export type DashboardDestination = 'journey' | 'build' | 'add' | 'ledger' | 'more';
export function Home({
  state, txs, save, navigate,
}: {
  state: ProjectState;
  txs: Transaction[];
  save: (state: ProjectState) => Promise<void>;
  navigate: (to: DashboardDestination) => void;
}) {
  const summary = useMemo(() => computeLedger(state.accounts, txs), [state.accounts, txs]);
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<ProjectState>(() => structuredClone(state));
  const [editingError, setEditingError] = useState('');

  useEffect(() => { if (!edit) setDraft(structuredClone(state)); }, [state, edit]);
  const available = Object.values(summary.accountBalances).reduce((a, b) => a + b, 0);
  const committedFunding = state.fundingSources.reduce((a, f) => a + Number(f.committedAmount || 0), 0);
  // Plot Purchase phase overlaps the agreed purchase price. Do not double-count it.
  const phasesExceptPlot = state.phases.filter((p) => !/^(plot purchase)$/i.test(p.name.trim()));
  const phaseBudget = phasesExceptPlot.reduce((a, p) => a + Number(p.budgetAmount || 0), 0);
  const acquisitionBudget = Number(state.project.agreedPurchasePrice || 0);
  const floorBudget = state.construction.floors.reduce((sum, f) => sum + Number(f.budgetAmount || 0), 0);
  // Construction budgets may be organized by floor or phase. Use one method
  // rather than adding both and counting the same planned work twice.
  const activeConstructionBudget = floorBudget > 0 ? floorBudget : phaseBudget;
  const totalBudget = acquisitionBudget + activeConstructionBudget;
  const budgetRemaining = totalBudget ? totalBudget - summary.projectCost : 0;
  const next = state.milestones
    .slice().sort((a, b) => a.sequence - b.sequence)
    .find((m) => m.status !== 'COMPLETED' && m.status !== 'SKIPPED');
  const currentPhase = state.phases
    .slice().sort((a, b) => a.sequence - b.sequence)
    .find((p) => p.status === 'IN_PROGRESS');
  const topCategories = Object.entries(summary.categorySpend).filter(([, v]) => v !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6);

  const chart = state.phases.filter((p) => p.budgetAmount || summary.phaseSpend[p.id])
    .map((phase) => ({ phase, spent: summary.phaseSpend[phase.id] || 0 }));

  function patchProject(patch: Partial<ProjectState['project']>) {
    setDraft((s) => ({ ...s, project: { ...s.project, ...patch } }));
  }
  function patchPhase(id: string, values: Partial<ProjectState['phases'][number]>) {
    setDraft((s) => ({ ...s, phases: s.phases.map((p) => p.id === id ? { ...p, ...values } : p) }));
  }
  async function saveDashboard(e: React.FormEvent) {
    e.preventDefault();
    setEditingError('');
    const numbers = [draft.project.plotAreaSqYard, draft.project.agreedPurchasePrice, ...draft.fundingSources.map((f) => f.committedAmount), ...draft.phases.map((p) => p.budgetAmount)];
    if (numbers.some((n) => !Number.isFinite(n) || n < 0) || draft.project.plotAreaSqYard <= 0) {
      setEditingError('Enter valid non-negative budget amounts and a positive plot area.');
      return;
    }
    await save(draft);
    // Parent state will refresh if the write was accepted. Keep editor open for
    // server-side errors instead of claiming success before verification.
  }

  return (
    <div className="stack">
      <div className="sectionHead dashboardTitle">
        <PageTitle title="Project Dashboard" description="Editable planning · immutable financial ledger · reconciled balances." />
        <button type="button" className="secondary small" onClick={() => { setDraft(structuredClone(state)); setEdit(!edit); setEditingError(''); }}>
          {edit ? 'Close editor' : '✎ Edit dashboard'}
        </button>
      </div>

      <section className="hero">
        <small>TOTAL RECOGNIZED PROJECT COST</small>
        <h1>{money(summary.projectCost)}</h1>
        <div className="heroGrid">
          <div><span>Tracked account cash</span><b>{money(available)}</b></div>
          <div><span>Funding actually received</span><b>{money(summary.fundingReceived)}</b></div>
          <div><span>Outstanding advances</span><b>{money(summary.advancesOutstanding)}</b></div>
        </div>
      </section>

      <div className="dashActions">
        <button className="primary" onClick={() => navigate('add')}>+ Record payment</button>
        <button className="secondary" onClick={() => navigate('ledger')}>Review ledger</button>
        <button className="secondary" onClick={() => navigate('build')}>Construction studio</button>
        <button className="secondary" onClick={() => navigate('more')}>Accounts & loans</button>
      </div>

      {summary.integrityWarnings.length > 0 ? <section className="warning">
        <b>⚠ Financial records needing review ({summary.integrityWarnings.length})</b>
        <div className="integrityWarnings">
          {summary.integrityWarnings.slice(0, 8).map((w, i) => <small key={i}>{w}</small>)}
          {summary.integrityWarnings.length > 8 ? <small>More warnings in the ledger data.</small> : null}
        </div>
        <button type="button" className="secondary small" onClick={() => navigate('ledger')}>Inspect transactions</button>
      </section> : null}

      {edit ? <form className="panel form" onSubmit={saveDashboard}>
        <div className="sectionHead"><div><h2>Dashboard settings</h2><p>Update project facts, budgets and current work. Recorded payments are corrected in Ledger.</p></div></div>
        <label>Project name
          <input required maxLength={120} value={draft.project.name} onChange={(e) => patchProject({ name:e.target.value })}/>
        </label>
        <div className="grid2">
          <label>Property address
            <input value={draft.project.propertyAddress} onChange={(e) => patchProject({ propertyAddress:e.target.value })}/>
          </label>
          <label>Project status
            <select value={draft.project.status} onChange={(e) => patchProject({ status:e.target.value })}>
              <option value="REGISTRY_PENDING">Registry pending</option>
              <option value="REGISTRY_COMPLETED">Registry completed</option>
              <option value="POSSESSION_RECEIVED">Possession received</option>
              <option value="CONSTRUCTION_PLANNING">Construction planning</option>
              <option value="CONSTRUCTION_IN_PROGRESS">Under construction</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </label>
          <label>Plot area (gaj)
            <input type="number" min="0.01" step="any" required value={draft.project.plotAreaSqYard} onChange={(e)=>patchProject({plotAreaSqYard:Number(e.target.value)})}/>
          </label>
          <label>Agreed plot purchase price (₹)
            <input type="number" min="0" step="0.01" value={draft.project.agreedPurchasePrice} onChange={(e)=>patchProject({agreedPurchasePrice:Number(e.target.value)})}/>
          </label>
          <label>Registered owner
            <input value={draft.project.ownerName} onChange={(e)=>patchProject({ownerName:e.target.value})}/>
          </label>
          <label>Seller
            <input value={draft.project.sellerName} onChange={(e)=>patchProject({sellerName:e.target.value})}/>
          </label>
          <label>Registry target date
            <input type="date" value={draft.project.registryTargetDate || ''} onChange={(e)=>patchProject({registryTargetDate:e.target.value})}/>
          </label>
        </div>
        <label>Project notes
          <textarea value={draft.project.notes || ''} onChange={(e)=>patchProject({notes:e.target.value})}/>
        </label>
        <h3>Funding commitments — not money received</h3>
        {draft.fundingSources.map((fund, i) => (
          <div className="grid2" key={fund.id}>
            <label>Funding source name
              <input value={fund.name} onChange={(e)=>setDraft((s)=>({...s, fundingSources:s.fundingSources.map((f,j)=>i===j?{...f,name:e.target.value}:f)}))}/>
            </label>
            <label>Commitment (₹)
              <input type="number" min="0" step="0.01" value={fund.committedAmount} onChange={(e)=>setDraft((s)=>({...s, fundingSources:s.fundingSources.map((f,j)=>i===j?{...f,committedAmount:Number(e.target.value)}:f)}))}/>
            </label>
          </div>
        ))}
        <h3>Construction phase budgets & progress</h3>
        <p className="muted">The Plot Purchase phase is shown for existing tracking but excluded from the combined dashboard budget to avoid counting the plot price twice.</p>
        <div className="phaseEditor">
          {draft.phases.map((phase) => (
            <div className="suiteRecord" key={phase.id}>
              <b>{phase.name}</b>
              <div className="grid3">
                <label>Budget ₹
                  <input min="0" step="0.01" type="number" value={phase.budgetAmount} onChange={(e)=>patchPhase(phase.id,{budgetAmount:Number(e.target.value)})}/>
                </label>
                <label>Progress %
                  <input type="number" min="0" max="100" step="1" value={phase.progressPercent} onChange={(e)=>patchPhase(phase.id,{progressPercent:Number(e.target.value)})}/>
                </label>
                <label>Status
                  <select value={phase.status} onChange={(e)=>patchPhase(phase.id,{status:e.target.value as typeof phase.status})}>
                    <option value="PENDING">Pending</option><option value="IN_PROGRESS">In progress</option><option value="ON_HOLD">On hold</option><option value="COMPLETED">Completed</option><option value="SKIPPED">Skipped</option>
                  </select>
                </label>
              </div>
            </div>
          ))}
        </div>
        {editingError && <div className="error">{editingError}</div>}
        <button className="primary" type="submit">Save dashboard settings</button>
      </form> : null}

      <section className="cards">
        <Card label="Plot & acquisition expense" value={money(summary.acquisitionCost)} />
        <Card label="Construction expense" value={money(summary.constructionCost)} />
        <Card label={budgetRemaining < 0 ? 'Over budget' : 'Budget remaining'} value={totalBudget ? money(Math.abs(budgetRemaining)) : 'Set budget'} />
        <Card label="Next milestone" value={next?.name || 'Project complete'} />
        <Card label="Funding commitments" value={money(committedFunding)} />
        <Card label="Recorded transactions" value={String(summary.txCount)} />
      </section>

      <section className="panel">
        <div className="sectionHead"><h2>Next milestone</h2><button type="button" className="secondary small" onClick={()=>navigate('journey')}>Update milestones</button></div>
        <p>{next?.name || 'All milestones complete'}</p>
        {currentPhase && <>
          <div className="sectionHead"><h3>Current phase · {currentPhase.name}</h3><span>{currentPhase.progressPercent}%</span></div>
          <progress max={100} value={currentPhase.progressPercent}/>
          <div className="row"><span>Planned budget</span><b>{money(currentPhase.budgetAmount)}</b></div>
          <div className="row"><span>Recognized expense</span><b>{money(summary.phaseSpend[currentPhase.id] || 0)}</b></div>
          <button type="button" className="secondary small" onClick={()=>{setDraft(structuredClone(state));setEdit(true);window.scrollTo({top:0,behavior:'smooth'});}}>Edit budget / progress</button>
        </>}
      </section>

      <section className="panel">
        <div className="sectionHead"><h2>Project bank and cash accounts</h2><button type="button" className="secondary small" onClick={()=>navigate('more')}>Manage accounts</button></div>
        {state.accounts.filter((a) => a.active).map((a) => <div className="row" key={a.id}>
          <div><b>{a.name}</b><small>{a.type} · Opening {money(a.openingBalance)}</small></div>
          <strong>{money(summary.accountBalances[a.id] || 0)}</strong>
        </div>)}
        <small className="muted">These balances are calculated from opening balances and transactions. Don't edit them as arbitrary dashboard totals; record funding, transfers or an audited correction.</small>
        <button type="button" className="secondary small" onClick={()=>navigate('add')}>Adjust balance via ledger</button>
      </section>

      <section className="panel">
        <h2>Funding commitments vs actual receipts</h2>
        {state.fundingSources.map((f) => {
          const received = summary.receivedBySource[f.id] || 0;
          return <div className="fund" key={f.id}>
            <div className="row"><span>{f.name}</span><b>{money(received)} / {money(f.committedAmount)}</b></div>
            <progress max={Math.max(1, f.committedAmount)} value={Math.max(0,Math.min(received, f.committedAmount))}/>
          </div>;
        })}
      </section>

      <section className="panel">
        <h2>Floor-wise budgets vs actual expenses</h2>
        <p className="muted">{floorBudget > 0 ? 'Floor budgets are used for the dashboard total. Phase budgets are tracked separately to prevent double counting.' : 'Set floor budgets to use them as the dashboard construction budget instead of phase estimates.'}</p>
        {state.construction.floors.map((floor) => {
          const spent = summary.floorSpend[floor.id] || 0;
          return <div className="fund" key={floor.id}>
            <div className="row"><span>{floor.name}</span><b>{money(spent)} / {money(floor.budgetAmount)}</b></div>
            <progress max={Math.max(1,floor.budgetAmount)} value={Math.max(0,Math.min(spent,floor.budgetAmount))}/>
          </div>;
        })}
        {summary.unallocatedConstructionCost > 0 && <p className="warning">Unallocated construction expense: {money(summary.unallocatedConstructionCost)}. Link future expense records to a floor. Existing transactions remain unchanged.</p>}
        <button className="secondary small" onClick={() => navigate('build')}>Edit floor budgets</button>
      </section>

      <section className="panel">
        <h2>Phase budgets vs recognized expenses</h2>
        {!chart.length && <p className="muted">Enter phase budgets to see planned and actual values.</p>}
        {chart.map(({phase,spent}) => <div className="fund" key={phase.id}>
          <div className="row"><span>{phase.name}</span><b>{money(spent)} / {money(phase.budgetAmount)}</b></div>
          <progress max={Math.max(1,phase.budgetAmount)} value={Math.max(0,Math.min(spent,phase.budgetAmount))}/>
        </div>)}
      </section>

      <section className="panel">
        <h2>Largest recorded cost categories</h2>
        {!topCategories.length && <p className="muted">No recognized expenses yet.</p>}
        {topCategories.map(([name,value]) => <div className="row" key={name}><span>{name}</span><b>{money(value)}</b></div>)}
      </section>
    </div>
  );
}
