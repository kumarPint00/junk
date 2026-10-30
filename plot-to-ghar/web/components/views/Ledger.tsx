'use client';

import { useMemo, useState } from 'react';
import type { ProjectState, Transaction, TxType } from '@/lib/types';
import { openLocalAttachment } from '@/lib/local-db';
import { money, PageTitle } from '@/components/ui';
import { computeLedger } from '@/lib/ledger';

function csvCell(value: unknown) {
  const raw = String(value ?? '');
  const safe = /^[=+\-@]/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function Ledger({
  state,
  txs,
  onVoid,
  mode,
}: {
  state: ProjectState;
  txs: Transaction[];
  onVoid: (id: string) => Promise<void>;
  mode: 'cloud' | 'standalone';
}) {
  const [q, setQ] = useState('');
  const [type, setType] = useState<'ALL' | TxType>('ALL');
  const [phase, setPhase] = useState('ALL');
  const [floor, setFloor] = useState('ALL');
  const summary = useMemo(() => computeLedger(state.accounts, txs), [state.accounts, txs]);

  const reversed = useMemo(() => new Set(txs.map((t) => t.reversalOf).filter(Boolean)), [txs]);
  const accountName = (id?: string) => state.accounts.find((a) => a.id === id)?.name || '';
  const phaseName = (id?: string) => state.phases.find((p) => p.id === id)?.name || '';
  const floorName = (id?: string) => state.construction.floors.find((p) => p.id === id)?.name || '';
  const vendorName = (id?: string) => state.vendors.find((p) => p.id === id)?.name || '';
  const contractorName = (id?: string) => state.contractors.find((p) => p.id === id)?.name || '';

  const rows = [...txs]
    .reverse()
    .filter((t) => type === 'ALL' || t.type === type)
    .filter((t) => phase === 'ALL' || t.phaseId === phase)
    .filter((t) => floor === 'ALL' || t.floorId === floor)
    .filter((t) => JSON.stringify(t).toLowerCase().includes(q.toLowerCase()));

  function exportCsv() {
    const header = ['Date', 'Type', 'Cost bucket', 'Category', 'Payee', 'Phase', 'Floor', 'Amount', 'From', 'To', 'Reference'];
    const lines = [
      header.map(csvCell).join(','),
      ...[...txs].map((t) =>
        [
          t.transactionDate.slice(0, 10),
          t.type,
          t.costBucket || '',
          t.category || '',
          t.payee || vendorName(t.vendorId) || contractorName(t.contractorId),
          phaseName(t.phaseId),
          floorName(t.floorId),
          t.amount,
          accountName(t.sourceAccountId),
          accountName(t.destinationAccountId),
          t.referenceNumber || '',
        ].map(csvCell).join(',')
      ),
    ];
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `plot-to-ghar-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function openEvidence(pathname: string) {
    if (pathname.startsWith('local://')) {
      await openLocalAttachment(pathname);
      return;
    }
    window.open(`/api/attachments?path=${encodeURIComponent(pathname)}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="stack">
      <PageTitle title="Ledger" description="Append-only money trail. Correct errors through reversals or linked refunds, never silent edits." />

      {summary.integrityWarnings.length > 0 ? <section className="warning">
        <b>Financial integrity review</b>
        <p>These are discrepancies or historical entries requiring review. Nothing was automatically rewritten.</p>
        <div className="integrityWarnings">
          {summary.integrityWarnings.map((w,i)=><small key={i}>{w}</small>)}
        </div>
      </section> : null}
      <div className="toolbar">
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ledger…" />
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="ALL">All types</option>
          <option value="EXPENSE">Expenses</option>
          <option value="TRANSFER">Transfers</option>
          <option value="FUNDING_IN">Funding</option>
          <option value="ADVANCE">Advances</option>
          <option value="ADVANCE_ADJUSTMENT">Advance adjustments</option>
          <option value="ADVANCE_REFUND">Advance returns</option>
          <option value="REFUND">Expense refunds</option>
          <option value="DIRECT_FUNDED_EXPENSE">Direct funded</option>
          <option value="LOAN_REPAYMENT">Loan repayments</option>
          <option value="BALANCE_ADJUSTMENT">Balance corrections</option>
          <option value="REVERSAL">Reversals</option>
        </select>
        <select value={phase} onChange={(e) => setPhase(e.target.value)}>
          <option value="ALL">All phases</option>
          {state.phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={floor} onChange={(e)=>setFloor(e.target.value)}>
          <option value="ALL">All floors</option>
          {state.construction.floors.map((f)=><option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <button className="secondary small" onClick={exportCsv}>Export CSV</button>
      </div>

      <section className="panel ledger">
        {!rows.length ? <p className="muted">No matching transactions.</p> : null}
        {rows.map((t) => {
          const canVoid = t.type !== 'REVERSAL' && !reversed.has(t.id) && !t.reversalOf;
          const context =
            t.payee ||
            vendorName(t.vendorId) ||
            contractorName(t.contractorId) ||
            (accountName(t.sourceAccountId) + (t.destinationAccountId ? ' → ' + accountName(t.destinationAccountId) : ''));
          return (
            <article key={t.id} className={t.reversalOf ? 'reversal' : ''}>
              <div className={'txIcon ' + t.type.toLowerCase()}>
                {t.type === 'EXPENSE' ? '−' : t.type === 'FUNDING_IN' ? '+' : t.type === 'TRANSFER' ? '↔' : '•'}
              </div>
              <div className="grow">
                <div className="ledgerTitle">
                  <b>{t.category || t.type.replaceAll('_', ' ')}</b>
                  {t.costBucket ? <span className="status">{t.costBucket}</span> : null}
                  {t.type === 'REVERSAL' ? <span className="status">Correcting entry</span> : null}
                  {t.type === 'BALANCE_ADJUSTMENT' ? <span className="status">No cost impact</span> : null}
                </div>
                <small>
                  {new Date(t.transactionDate).toLocaleDateString('en-IN')}
                  {context ? ' · ' + context : ''}
                  {phaseName(t.phaseId) ? ' · ' + phaseName(t.phaseId) : ''}
                  {floorName(t.floorId) ? ' · ' + floorName(t.floorId) : ''}
                </small>
                {t.description ? <p className="txDescription">{t.description}</p> : null}
                {t.lineItems?.length ? (
                  <div className="miniItems">
                    {t.lineItems.map((item, i) => (
                      <span key={i}>{item.description}: {item.quantity || ''} {item.unit || ''} × {money(item.rate || 0)}</span>
                    ))}
                  </div>
                ) : null}
                {t.attachments?.length ? (
                  <div className="chips">
                    {t.attachments.map((a) => (
                      <button
                        key={a.pathname}
                        type="button"
                        className="linkButton"
                        onClick={() => openEvidence(a.pathname).catch((e) => alert(e instanceof Error ? e.message : 'Unable to open evidence'))}
                      >
                        {a.name}
                      </button>
                    ))}
                  </div>
                ) : null}
                {t.reversalOf ? <small className="muted">Reverses transaction {t.reversalOf}</small> : null}
                {t.type === 'REFUND' && !t.linkedTransactionId && !t.reversalOf ? <small className="error">Historical refund is not linked to a purchase. Reverse and replace with linked refund.</small> : null}
                {t.linkedTransactionId ? <small className="muted">Linked record: {t.linkedTransactionId}</small> : null}
                {reversed.has(t.id) ? <small className="muted">Reversed by a correcting entry</small> : null}
              </div>
              <div className="ledgerAmount">
                <strong className={t.type === 'FUNDING_IN' ? 'positive' : ''}>{money(t.amount)}</strong>
                {canVoid ? <button className="linkButton" onClick={() => onVoid(t.id)}>Reverse / correct</button> : null}
              </div>
            </article>
          );
        })}
      </section>

      {mode === 'standalone' ? <small className="muted">Evidence marked local is stored in this device's app data and included in full JSON backups.</small> : null}
    </div>
  );
}
