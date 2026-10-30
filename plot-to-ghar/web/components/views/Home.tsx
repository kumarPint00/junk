'use client';

import { useEffect, useState } from 'react';
import { computeLedger } from '@/lib/ledger';
import { auditIntegrity } from '@/lib/integrity-audit';
import type { ProjectState, Transaction } from '@/lib/types';
import { Card, money, PageTitle } from '@/components/ui';

export function Home({ state, txs, save, openSection }: { state: ProjectState; txs: Transaction[]; save: (next: ProjectState) => Promise<void>; openSection: (section: 'journey'|'build'|'add'|'ledger'|'more') => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => structuredClone(state));
  const [error, setError] = useState('');
  useEffect(() => { if (!editing) setDraft(structuredClone(state)); }, [state, editing]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!Number.isFinite(draft.project.agreedPurchasePrice) || draft.project.agreedPurchasePrice < 0) { setError('Enter a valid agreement price.'); return; }
    await save(draft);
    setEditing(false); setError('');
  }
  const summary = computeLedger(state.accounts, txs);
  const issues = auditIntegrity(state, txs);
  const available = Object.values(summary.accountBalances).reduce((a, b) => a + b, 0);
  const committedFunding = state.fundingSources.reduce((a, f) => a + Number(f.committedAmount || 0), 0);
  const phaseBudget = state.phases.filter(p => p.name !== 'Plot Purchase').reduce((a, p) => a + Number(p.budgetAmount || 0), 0);
  const totalBudget = Number(state.project.agreedPurchasePrice || 0) + phaseBudget; // Purchase price is not added twice through Plot Purchase phase.
  const budgetRemaining = totalBudget > 0 ? totalBudget - summary.projectCost : 0;
  const next = state.milestones
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .find((m) => m.status !== 'COMPLETED' && m.status !== 'SKIPPED');
  const currentPhase = state.phases
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .find((p) => p.status === 'IN_PROGRESS');

  const topCategories = Object.entries(summary.categorySpend)
    .filter(([, v]) => v !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 6);

  const negativeAccounts = state.accounts.filter((a) => (summary.accountBalances[a.id] || 0) < -0.01);

  return (
    <div className="stack">
      <PageTitle title="Project Dashboard" description="Plot purchase to completed building — one financial truth." />
      <section className="panel">
        <div className="sectionHead"><div><h2>Project controls</h2><p className="muted">Edit project facts and budgets; transaction-derived balances cannot be edited directly.</p></div>
          <button className="secondary small" onClick={() => setEditing(!editing)}>{editing ? 'Cancel' : 'Edit project'}</button>
        </div>
        {editing ? <form className="form detailsBody" onSubmit={submit}>
          <label>Project name<input required value={draft.project.name} onChange={e=>setDraft({...draft,project:{...draft.project,name:e.target.value}})}/></label>
          <label>Project status<select value={draft.project.status} onChange={e=>setDraft({...draft,project:{...draft.project,status:e.target.value}})}><option value="REGISTRY_PENDING">Registry pending</option><option value="REGISTERED">Registered</option><option value="POSSESSION">Possession</option><option value="CONSTRUCTION">Construction</option><option value="COMPLETED">Completed</option></select></label>
          <label>Plot address<textarea value={draft.project.propertyAddress} onChange={e=>setDraft({...draft,project:{...draft.project,propertyAddress:e.target.value}})}/></label>
          <div className="grid2">
            <label>Agreed plot price ₹<input type="number" min="0" value={draft.project.agreedPurchasePrice} onChange={e=>setDraft({...draft,project:{...draft.project,agreedPurchasePrice:Number(e.target.value)}})}/></label>
            <label>Plot area (gaj)<input type="number" min="0" step="any" value={draft.project.plotAreaSqYard} onChange={e=>setDraft({...draft,project:{...draft.project,plotAreaSqYard:Number(e.target.value)}})}/></label>
            <label>Registry target<input type="date" value={draft.project.registryTargetDate || ''} onChange={e=>setDraft({...draft,project:{...draft.project,registryTargetDate:e.target.value}})}/></label>
            <label>Registered owner<input value={draft.project.ownerName} onChange={e=>setDraft({...draft,project:{...draft.project,ownerName:e.target.value}})}/></label>
          </div>
          {error && <div className="error">{error}</div>}
          <button className="primary" type="submit">Save project changes</button>
        </form> : <div className="chips">
          <button className="secondary small" onClick={()=>openSection('journey')}>Edit milestone & phase budgets</button>
          <button className="secondary small" onClick={()=>openSection('build')}>Edit floor construction plan</button>
          <button className="secondary small" onClick={()=>openSection('more')}>Edit accounts & funding</button>
          <button className="secondary small" onClick={()=>openSection('add')}>Record money movement</button>
        </div>}
      </section>

      <section className="hero">
        <small>TOTAL RECOGNIZED PROJECT COST</small>
        <h1>{money(summary.projectCost)}</h1>
        <div className="heroGrid">
          <div><span>Money available</span><b>{money(available)}</b></div>
          <div><span>Funding received</span><b>{money(summary.fundingReceived)}</b></div>
          <div><span>Open advances</span><b>{money(summary.advancesOutstanding)}</b></div>
        </div>
      </section>

      <section className="panel">
        <div className="sectionHead"><h2>Financial integrity audit</h2><b>{issues.filter(x=>x.severity==='CRITICAL').length} critical · {issues.filter(x=>x.severity==='WARNING').length} warnings</b></div>
        <p className="muted">Historical entries are never silently rewritten. Resolve problems using linked corrections and reconcile physical balances.</p>
        {issues.length === 0 ? <div className="row"><span>No detected ledger issues</span><b>✓</b></div> : issues.slice(0,10).map((issue,i)=><div className="row" key={issue.code+i}><div><b>{issue.severity}: {issue.code.replaceAll('_',' ')}</b><small>{issue.message}</small></div></div>)}
        {issues.length > 10 ? <p className="muted">{issues.length-10} additional issues; download backup and review transaction history.</p> : null}
        <button className="secondary small" onClick={()=>openSection('ledger')}>Review ledger</button>
      </section>
      {negativeAccounts.length ? (
        <div className="warning">
          <b>Reconciliation required:</b>{' '}
          {negativeAccounts.map((a) => a.name).join(', ')} has a negative calculated balance.
        </div>
      ) : null}

      <section className="cards">
        <Card label="Acquisition cost" value={money(summary.acquisitionCost)} />
        <Card label="Construction cost" value={money(summary.constructionCost)} />
        <Card label="Budget remaining" value={totalBudget ? money(budgetRemaining) : 'Set budgets'} />
        <Card label="Next milestone" value={next?.name || 'Project complete'} />
        <Card label="Funding committed" value={money(committedFunding)} />
        <Card label="Transactions" value={String(summary.txCount)} />
      </section>

      {currentPhase ? (
        <section className="panel">
          <div className="sectionHead">
            <div>
              <h2>Current construction phase</h2>
              <p>{currentPhase.name}</p>
            </div>
            <b>{currentPhase.progressPercent}%</b>
          </div>
          <progress max={100} value={currentPhase.progressPercent} />
          <div className="row">
            <span>Budget</span>
            <b>{money(currentPhase.budgetAmount)}</b>
          </div>
          <div className="row">
            <span>Recognized cost</span>
            <b>{money(summary.phaseSpend[currentPhase.id] || 0)}</b>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <h2>Where is the project money?</h2>
        {state.accounts.filter((a) => a.active).map((a) => (
          <div className="row" key={a.id}>
            <div>
              <b>{a.name}</b>
              <small>{a.type}</small>
            </div>
            <strong>{money(summary.accountBalances[a.id] || 0)}</strong>
          </div>
        ))}
      </section>

      <section className="panel">
        <h2>Funding utilization</h2>
        {state.fundingSources.map((f) => {
          const received = txs
            .filter((t) => t.fundingSourceId === f.id && ['FUNDING_IN', 'DIRECT_FUNDED_EXPENSE'].includes(t.type))
            .reduce((a, t) => a + Number(t.amount || 0), 0);
          return (
            <div className="fund" key={f.id}>
              <div className="row">
                <span>{f.name}</span>
                <b>{money(received)} / {money(f.committedAmount)}</b>
              </div>
              <progress max={Math.max(1, f.committedAmount)} value={Math.min(received, f.committedAmount)} />
            </div>
          );
        })}
      </section>

      <section className="panel">
        <h2>Largest cost categories</h2>
        {!topCategories.length ? <p className="muted">No recognized expenses yet.</p> : null}
        {topCategories.map(([name, value]) => (
          <div className="row" key={name}>
            <span>{name}</span>
            <b>{money(value)}</b>
          </div>
        ))}
      </section>
    </div>
  );
}
