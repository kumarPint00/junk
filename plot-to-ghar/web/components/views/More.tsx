'use client';

import { useEffect, useMemo, useState } from 'react';
import { computeLedger } from '@/lib/ledger';
import { buildStandaloneBackup, restoreStandaloneBackup } from '@/lib/local-db';
import type { Entity, ProjectState, Transaction } from '@/lib/types';
import { money, PageTitle } from '@/components/ui';

export function More({
  state,
  txs,
  save,
  reload,
  mode,
  onLock,
  focusSection = 'property',
  openSection,
}: {
  state: ProjectState;
  txs: Transaction[];
  save: (state: ProjectState) => Promise<void>;
  reload: () => Promise<void>;
  mode: 'cloud' | 'standalone';
  onLock: () => Promise<void>;
  focusSection?: 'property' | 'accounts' | 'funding' | 'partners' | 'cash';
  openSection: (tab: 'journey' | 'build' | 'add' | 'ledger' | 'more', feature?: string) => void;
}) {
  const [draft, setDraft] = useState<ProjectState>(() => structuredClone(state));
  const [restore, setRestore] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const hasEdits = useMemo(() => JSON.stringify(draft) !== JSON.stringify(state), [draft, state]);
  const [cashAccount, setCashAccount] = useState(state.accounts.find((a) => a.type === 'CASH')?.id || '');
  const [countedCash, setCountedCash] = useState('');
  const [health, setHealth] = useState<{ ok?: boolean; database?: boolean; storageConfigured?: boolean; version?: string } | null>(null);

  useEffect(() => setDraft(structuredClone(state)), [state]);
  useEffect(() => {
    const element = document.getElementById('ptg-control-' + focusSection) as HTMLDetailsElement | null;
    if (element) {
      element.open = true;
      const frame = requestAnimationFrame(() => element.scrollIntoView({ block: 'start', behavior: 'smooth' }));
      return () => cancelAnimationFrame(frame);
    }
  }, [focusSection]);

  async function saveControls() {
    setSaving(true); setFeedback('');
    try {
      await save(draft);
      setFeedback('Settings saved on this device. If cloud sync is pending, check the status banner.');
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : 'Saving project settings failed.');
    } finally { setSaving(false); }
  }

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

  async function downloadBackup() {
    if (mode === 'standalone') {
      const backup = await buildStandaloneBackup(state, txs);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `plot-to-ghar-full-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      return;
    }
    window.location.href = '/api/backup';
  }

  async function doRestore() {
    if (!restore) return;
    const message = mode === 'standalone'
      ? 'Restore will replace this device\'s project configuration, ledger and local evidence. Continue?'
      : 'Restore will replace cloud project configuration and ledger. A server restore point is created first. Continue?';
    if (!window.confirm(message)) return;

    const backup = JSON.parse(await restore.text());
    if (mode === 'standalone') {
      await restoreStandaloneBackup(backup);
      setRestore(null);
      await reload();
      return;
    }

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
      <PageTitle title="Project Control" description="Edit property, accounts, funding, loans and contractors. Save changes using the bar below." />
      <div className="controlSaveBar" role="status">
        <div><b>{hasEdits ? 'Unsaved changes' : 'All settings saved'}</b><small>{hasEdits ? 'Save your edits before leaving this screen.' : 'Your latest property configuration is displayed.'}</small>
          {feedback && <small className="controlFeedback">{feedback}</small>}</div>
        <div className="formActions"><button type="button" className="secondary small" disabled={!hasEdits || saving} onClick={() => {setDraft(structuredClone(state));setFeedback('Edits discarded.');}}>Discard</button>
        <button type="button" className="primary" disabled={!hasEdits || saving} onClick={saveControls}>{saving ? 'Saving…' : 'Save changes'}</button></div>
      </div>

      <section className="panel controlHelp">
        <div className="sectionHead"><div><h2>What can I change?</h2><p>Configuration can be edited here. Actual spending and current balances are calculated from transactions.</p></div></div>
        <div className="controlShortcuts">
          <button type="button" className="secondary small" onClick={() => openSection('add')}>+ Record payment or funding</button>
          <button type="button" className="secondary small" onClick={() => openSection('ledger')}>View actual transactions</button>
          <button type="button" className="secondary small" onClick={() => openSection('journey', 'budgets')}>Edit phase budgets</button>
          <button type="button" className="secondary small" onClick={() => openSection('build', 'finance')}>Loan and EMI simulator</button>
        </div>
      </section>

      <details className="panel focusSection" id="ptg-control-property" open={focusSection === 'property'}>
        <summary>Property & registry profile <span className="summaryEdit">Edit <span aria-hidden="true">✎</span></span></summary>
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

      <details className="panel focusSection" id="ptg-control-accounts" open={focusSection === 'accounts'}>
        <summary>Accounts & opening balances <span className="summaryEdit">Edit <span aria-hidden="true">✎</span></span></summary>
        <div className="detailsBody">
          <p className="warning">Opening balance is your account's initial balance before recorded transactions, not its current available cash. Record new deposits, payments or transfers using Add Transaction.</p>
          {draft.accounts.map((a, i) => (
            <div className="editRow accountEdit" key={a.id}>
              <input value={a.name} onChange={(e) => { const rows = [...draft.accounts]; rows[i] = { ...a, name: e.target.value }; setDraft({ ...draft, accounts: rows }); }} />
              <select value={a.type} onChange={(e) => { const rows = [...draft.accounts]; rows[i] = { ...a, type: e.target.value as typeof a.type }; setDraft({ ...draft, accounts: rows }); }}>
                <option value="BANK">Bank</option><option value="CASH">Cash</option><option value="OTHER">Other</option>
              </select>
              <label className="controlValueLabel">Opening ₹<input aria-label={'Opening balance for '+a.name} type="number" step="any" value={a.openingBalance} onChange={(e) => { const rows = [...draft.accounts]; rows[i] = { ...a, openingBalance: Number(e.target.value) }; setDraft({ ...draft, accounts: rows }); }} /></label>
              <label className="check"><input type="checkbox" checked={a.active} onChange={(e) => { const rows = [...draft.accounts]; rows[i] = { ...a, active: e.target.checked }; setDraft({ ...draft, accounts: rows }); }} />Active</label>
            </div>
          ))}
          <button type="button" className="secondary small" onClick={() => setDraft((s) => ({ ...s, accounts: [...s.accounts, { id: crypto.randomUUID(), name: 'New Account', type: 'BANK', openingBalance: 0, active: true }] }))}>+ Account</button>
        </div>
      </details>

      <details className="panel focusSection" id="ptg-control-funding" open={focusSection === 'funding'}>
        <summary>Funding & loan facilities <span className="summaryEdit">Edit <span aria-hidden="true">✎</span></span></summary>
        <div className="detailsBody">
          <p className="muted">Edit commitments and lender terms here. Sanctioned funds are not counted as received until disbursement is recorded in the ledger.</p>
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

      <details className="panel focusSection" id="ptg-control-partners" open={focusSection === 'partners'}>
        <summary>Vendors & contractors <span className="summaryEdit">Edit <span aria-hidden="true">✎</span></span></summary>
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

      <details className="panel focusSection" id="ptg-control-cash" open={focusSection === 'cash'}>
        <summary>Cash reconciliation <span className="summaryEdit">Manage <span aria-hidden="true">✎</span></span></summary>
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



      <section className="panel">
        <h2>Backup & recovery</h2>
        <p className="muted">
          {mode === 'standalone'
            ? 'Full backup includes project data, ledger and locally stored evidence files.'
            : 'A restore automatically creates a server-side restore point before replacing cloud data.'}
        </p>
        <button className="secondary" type="button" onClick={() => downloadBackup().catch((e) => alert(e instanceof Error ? e.message : 'Backup failed'))}>
          Download full JSON backup
        </button>
        <div className="restore">
          <input type="file" accept="application/json" onChange={(e) => setRestore(e.target.files?.[0] || null)} />
          <button className="danger" disabled={!restore} onClick={doRestore}>Restore backup</button>
        </div>
      </section>

      <section className="panel">
        <h2>System status</h2>
        <div className="row"><span>Runtime mode</span><b>{mode === 'standalone' ? 'On-device / zero-cost' : 'Cloud sync'}</b></div>
        <div className="row"><span>Database</span><b>{mode === 'standalone' ? 'IndexedDB ready' : health?.database ? 'Cloud ready' : 'Unavailable'}</b></div>
        <div className="row"><span>Evidence storage</span><b>{mode === 'standalone' ? 'On-device ready' : health?.storageConfigured ? 'Cloud ready' : 'Not configured'}</b></div>
        <div className="row"><span>App version</span><b>{health?.version || '2.5.1'}</b></div>
        <button className="secondary" onClick={() => onLock()}>Lock app</button>
      </section>
    </div>
  );
}
