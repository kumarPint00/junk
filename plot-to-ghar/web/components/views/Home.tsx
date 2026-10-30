'use client';

import { computeLedger } from '@/lib/ledger';
import type { ProjectState, Transaction } from '@/lib/types';
import { Card, money, PageTitle } from '@/components/ui';

export function Home({ state, txs }: { state: ProjectState; txs: Transaction[] }) {
  const summary = computeLedger(state.accounts, txs);
  const available = Object.values(summary.accountBalances).reduce((a, b) => a + b, 0);
  const committedFunding = state.fundingSources.reduce((a, f) => a + Number(f.committedAmount || 0), 0);
  const phaseBudget = state.phases.reduce((a, p) => a + Number(p.budgetAmount || 0), 0);
  const totalBudget = Number(state.project.agreedPurchasePrice || 0) + phaseBudget;
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

      <section className="hero">
        <small>TOTAL RECOGNIZED PROJECT COST</small>
        <h1>{money(summary.projectCost)}</h1>
        <div className="heroGrid">
          <div><span>Money available</span><b>{money(available)}</b></div>
          <div><span>Funding received</span><b>{money(summary.fundingReceived)}</b></div>
          <div><span>Open advances</span><b>{money(summary.advancesOutstanding)}</b></div>
        </div>
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
