'use client';

import { useEffect, useMemo, useState } from 'react';
import { computeLedger } from '@/lib/ledger';
import type { Entity, ProjectState, Transaction } from '@/lib/types';
import { money, PageTitle } from '@/components/ui';

export function More({
  state,
  txs,
  save,
  reload,
}: {
  state: ProjectState;
  txs: Transaction[];
  save: (state: ProjectState) => Promise<void>;
  reload: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<ProjectState>(() => structuredClone(state));
  const [restore, setRestore] = useState<File | null>(null);
  const [cashAccount, setCashAccount] = useState(state.accounts.find((a) => a.type === 'CASH')?.id || '');
  const [countedCash, setCountedCash] = useState('');
  const [health, setHealth] = useState<{ ok?: boolean; database?: boolean; storageConfigured?: boolean; version?: string } | null>(null);

  useEffect(() => setDraft(structuredClone(state)), [state]);
  useEffect(() => {
    fetch('/api/health', { cache: 'no-store' }).then((r) => r.json()).then(setHealth).catch(() => setHealth({ ok: false }));
  }, []);

  const summary = useMemo(() => computeLedger(state.accounts, txs), [state.accounts, txs]);
  const systemCash = cashAccount ? summary.accountBalances[cashAccount] || 0 : 0;

  function addEntity(kind: 'vendors' | 'contractors') {
    const next: Entity = { id: crypto.randomUUID(), name: kind === 'vendors' ? 'New Vendor' : 'New Contractor', active: true };
    setDraft((s) => ({ ...s, [kind]: [...s[kind], next] }));
  }

  function updateEntity(kind: 'vendors' | 'contractors', index: number, patch: Partial<Entity>) {
    setDraft((s) => {
      const rows = [...s[kind]];
      rows[index] = { ...rows[index], ...patch };
      return { ...s, [kind]: rows };
    });
  }

  function reconcileCash() {
    const counted = Number(countedCash);
    if (!cashAccount || !Number.isFinite(counted)) return;
    const entry = {
      id: crypto.randomUUID(),
      accountId: cashAccount,
      date: new Date().toISOString(),
      systemBalance: systemCash,
      countedBalance: counted,
      difference: counted - systemCash,
    };
    const next = { ...draft, cashReconciliations: [entry, ...draft.cashReconciliations].slice(0, 100) };
    setDraft(next);
    setCountedCash('');
  }

  async function doRestore() {
    if (!restore) return;
    if (!window.confirm('Restore will replace cloud project configuration and ledger. A server restore point is created first. Continue?')) return;
    const backup = JSON.parse(await restore.text());
    const response = await fetch('/api/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-confirm-restore': 'RESTORE' },
      body: JSON.stringify(backup),
    });
    if (!response.ok) {
      alert((await response.json().catch(() => ({}))).error || 'Restore failed');
      return;
    }
    await reload();
  }

  return (
    <div className="stack">
      <PageTitle title="Project Control" description="Property, accounts, funding, loans, vendors, contractors, cash and recovery." />

      <details className="panel" open>
        <summary>Property & registry profile</summary>
        <div className="form detailsBody">
          <label>Project name<input value={draft.project.name} onChange={(e) => setDraft({ ...draft, project: { ...draft.project, name: e.target.value } })} /></label>
          <label>Property address<textarea value={draft.project.propertyAddress} onChange={(e) => setDraft({ ...draft, project: { ...draft.project, propertyAddress: e.target.value } })} /></label>
          <div className="grid2">
            <label>Plot area (gaj)<input inputMode="decimal" value={draft.project.plotAreaSqYard} onChange={(e) => setDraft({ ...draft, project: { ...draft.project, plotAreaSqYard: Number(e.target.value) } })} /></label>
            <label>Agreed purchase price<input inputMode="decimal" value={draft.project.agreedPurchasePrice} onChange={(e) => setDraft({ ...draft, project: { ...draft.project, agreedPurchasePrice: Number(e.target.value) } })} /></label>
          </div>
          <div className="grid2">
            <label>Registered owner<input value={draft.project.ownerName} onChange={(e) => setDraft({ ...draft, project: { ...draft.project, ownerName: e.target.value } })} /></label>
            <label>Seller<input value={draft.project.sellerName} onChange={(e) => setDraft({ ...draft, project: { ...draft.project, sellerName: e.target.value } })} /></label>
          </div>
          <label>Registry target date<input type="date" value={draft.project.registryTargetDate || ''} onChange={(e) => setDraft({ ...draft, project: { ...draft.project, registryTargetDate: e.target.value } })} /></label>
        </div>
      </details>

      <details className="panel">
        <summary>Accounts</summary>
        <div className="detailsBody">
          {draft.accounts.map((a, i) => (
            <div className="editRow accountEdit" key={a.id}>
              <input value={a.name} onChange={(e) => { const rows = [...draft.accounts]; rows[i] = { ...a, name: e.target.value }; setDraft({ ...draft, accounts: rows }); }} />
              <select value={a.type} onChange={(e) => { const rows = [...draft.accounts]; rows[i] = { ...a, type: e.target.value as typeof a.type }; setDraft({ ...draft, accounts: rows }); }}>
                <option value="BANK">Bank</option><option value="CASH">Cash</option><option value="OTHER">Other</option>
              </select>
              <input inputMode="decimal" value={a.openingBalance} onChange={(e) => { const rows = [...draft.accounts]; rows[i] = { ...a, openingBalance: Number(e.target.value) }; setDraft({ ...draft, accounts: rows }); }} />
              <label className="check"><input type="checkbox" checked={a.active} onChange={(e) => { const rows = [...draft.accounts]; rows[i] = { ...a, active: e.target.checked }; setDraft({ ...draft, accounts: rows }); }} />Active</label>
            </div>
          ))}
          <button type="button" className="secondary small" onClick={() => setDraft((s) => ({ ...s, accounts: [...s.accounts, { id: crypto.randomUUID(), name: 'New Account', type: 'BANK', openingBalance: 0, active: true }] }))}>+ Account</button>
        </div>
      </details>

      <details className="panel">
        <summary>Funding & loans</summary>
        <div className="detailsBody">
          <h3>Funding commitments</h3>
          {draft.fundingSources.map((f, i) => (
            <div className="editRow" key={f.id}>
              <input value={f.name} onChange={(e) => { const rows = [...draft.fundingSources]; rows[i] = { ...f, name: e.target.value }; setDraft({ ...draft, fundingSources: rows }); }} />
              <input inputMode="decimal" value={f.committedAmount} onChange={(e) => { const rows = [...draft.fundingSources]; rows[i] = { ...f, committedAmount: Number(e.target.value) }; setDraft({ ...draft, fundingSources: rows }); }} />
            </div>
          ))}
          <button type="button" className="secondary small" onClick={() => setDraft((s) => ({ ...s, fundingSources: [...s.fundingSources, { id: crypto.randomUUID(), name: 'New Funding Source', type: 'OTHER', committedAmount: 0 }] }))}>+ Funding source</button>

          <h3>Loan facilities</h3>
          {draft.loans.map((loan, i) => (
            <div className="loanCard" key={loan.id}>
              <input value={loan.lenderName} onChange={(e) => { const rows = [...draft.loans]; rows[i] = { ...loan, lenderName: e.target.value }; setDraft({ ...draft, loans: rows }); }} />
              <div className="grid3">
                <label>Sanction<input inputMode="decimal" value={loan.sanctionedAmount} onChange={(e) => { const rows = [...draft.loans]; rows[i] = { ...loan, sanctionedAmount: Number(e.target.value) }; setDraft({ ...draft, loans: rows }); }} /></label>
                <label>Purchase<input inputMode="decimal" value={loan.purchaseComponent} onChange={(e) => { const rows = [...draft.loans]; rows[i] = { ...loan, purchaseComponent: Number(e.target.value) }; setDraft({ ...draft, loans: rows }); }} /></label>
                <label>Construction<input inputMode="decimal" value={loan.constructionComponent} onChange={(e) => { const rows = [...draft.loans]; rows[i] = { ...loan, constructionComponent: Number(e.target.value) }; setDraft({ ...draft, loans: rows }); }} /></label>
              </div>
              <div className="grid3">
                <label>Interest %<input inputMode="decimal" value={loan.interestRate ?? ''} onChange={(e) => { const rows = [...draft.loans]; rows[i] = { ...loan, interestRate: Number(e.target.value) }; setDraft({ ...draft, loans: rows }); }} /></label>
                <label>Tenure months<input inputMode="numeric" value={loan.tenureMonths ?? ''} onChange={(e) => { const rows = [...draft.loans]; rows[i] = { ...loan, tenureMonths: Number(e.target.value) }; setDraft({ ...draft, loans: rows }); }} /></label>
                <label>EMI<input inputMode="decimal" value={loan.emiAmount ?? ''} onChange={(e) => { const rows = [...draft.loans]; rows[i] = { ...loan, emiAmount: Number(e.target.value) }; setDraft({ ...draft, loans: rows }); }} /></label>
              </div>
            </div>
          ))}
        </div>
      </details>

      <details className="panel">
        <summary>Vendors & contractors</summary>
        <div className="detailsBody">
          <h3>Vendors</h3>
          {draft.vendors.map((v, i) => (
            <div className="entityCard" key={v.id}>
              <input value={v.name} onChange={(e) => updateEntity('vendors', i, { name: e.target.value })} placeholder="Vendor name" />
              <input value={v.phone || ''} onChange={(e) => updateEntity('vendors', i, { phone: e.target.value })} placeholder="Phone" />
              <input value={v.specialty || ''} onChange={(e) => updateEntity('vendors', i, { specialty: e.target.value })} placeholder="Material / specialty" />
              <label className="check"><input type="checkbox" checked={v.active !== false} onChange={(e) => updateEntity('vendors', i, { active: e.target.checked })} />Active</label>
            </div>
          ))}
          <button className="secondary small" type="button" onClick={() => addEntity('vendors')}>+ Vendor</button>

          <h3>Contractors</h3>
          {draft.contractors.map((v, i) => (
            <div className="entityCard" key={v.id}>
              <input value={v.name} onChange={(e) => updateEntity('contractors', i, { name: e.target.value })} placeholder="Contractor name" />
              <input value={v.phone || ''} onChange={(e) => updateEntity('contractors', i, { phone: e.target.value })} placeholder="Phone" />
              <input value={v.specialty || ''} onChange={(e) => updateEntity('contractors', i, { specialty: e.target.value })} placeholder="RCC / plumbing / electrical" />
              <label className="check"><input type="checkbox" checked={v.active !== false} onChange={(e) => updateEntity('contractors', i, { active: e.target.checked })} />Active</label>
            </div>
          ))}
          <button className="secondary small" type="button" onClick={() => addEntity('contractors')}>+ Contractor</button>
        </div>
      </details>

      <details className="panel">
        <summary>Cash reconciliation</summary>
        <div className="detailsBody">
          <label>Cash account<select value={cashAccount} onChange={(e) => setCashAccount(e.target.value)}><option value="">Choose…</option>{state.accounts.filter((a) => a.type === 'CASH').map((a) => <option value={a.id} key={a.id}>{a.name}</option>)}</select></label>
          <div className="row"><span>System cash</span><b>{money(systemCash)}</b></div>
          <label>Counted physical cash<input inputMode="decimal" value={countedCash} onChange={(e) => setCountedCash(e.target.value)} /></label>
          <div className="row"><span>Difference</span><b>{money(Number(countedCash || 0) - systemCash)}</b></div>
          <button type="button" className="secondary" onClick={reconcileCash}>Record reconciliation</button>
          {draft.cashReconciliations.slice(0, 10).map((r) => (
            <div className="row" key={r.id}>
              <span>{new Date(r.date).toLocaleString('en-IN')} · {state.accounts.find((a) => a.id === r.accountId)?.name}</span>
              <b>{money(r.difference)}</b>
            </div>
          ))}
        </div>
      </details>

      <button className="primary" onClick={() => save(draft)}>Save project controls</button>

      <section className="panel">
        <h2>Backup & recovery</h2>
        <p className="muted">A restore automatically creates a server-side restore point before replacing data.</p>
        <a className="button secondary" href="/api/backup">Download full JSON backup</a>
        <div className="restore">
          <input type="file" accept="application/json" onChange={(e) => setRestore(e.target.files?.[0] || null)} />
          <button className="danger" disabled={!restore} onClick={doRestore}>Restore backup</button>
        </div>
      </section>

      <section className="panel">
        <h2>System status</h2>
        <div className="row"><span>Database</span><b>{health?.database ? 'Ready' : 'Unavailable'}</b></div>
        <div className="row"><span>Evidence storage</span><b>{health?.storageConfigured ? 'Configured' : 'Not configured'}</b></div>
        <div className="row"><span>App version</span><b>{health?.version || '—'}</b></div>
        <button className="secondary" onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); location.reload(); }}>Lock app</button>
      </section>
    </div>
  );
}
