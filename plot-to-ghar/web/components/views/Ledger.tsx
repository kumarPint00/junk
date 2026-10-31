'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ProjectState, Transaction, TxType } from '@/lib/types';
import { openLocalAttachment } from '@/lib/local-db';
import { money, PageTitle } from '@/components/ui';

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
  initialType = 'ALL',
  focusTransactionId = null,
  onAdd,
}: {
  state: ProjectState;
  txs: Transaction[];
  onVoid: (id: string) => Promise<void>;
  mode: 'cloud' | 'standalone';
  initialType?: 'ALL' | TxType;
  focusTransactionId?: string | null;
  onAdd?: () => void;
}) {
  const [q, setQ] = useState('');
  const [type, setType] = useState<'ALL' | TxType>(initialType);
  const [selectedId, setSelectedId] = useState<string | null>(focusTransactionId);
  useEffect(() => {
    setType(initialType);
    if (focusTransactionId) {
      setSelectedId(focusTransactionId);
      setQ('');
      setPhase('ALL');
    } else setSelectedId(null);
  }, [initialType, focusTransactionId]);
  const [phase, setPhase] = useState('ALL');

  const reversed = useMemo(() => new Set(txs.map((t) => t.reversalOf).filter(Boolean)), [txs]);
  const accountName = (id?: string) => state.accounts.find((a) => a.id === id)?.name || '';
  const phaseName = (id?: string) => state.phases.find((p) => p.id === id)?.name || '';
  const vendorName = (id?: string) => state.vendors.find((p) => p.id === id)?.name || '';
  const contractorName = (id?: string) => state.contractors.find((p) => p.id === id)?.name || '';

  const selected = selectedId ? txs.find(t => t.id === selectedId) : null;
  const selectedReversed = selected ? txs.some(t=>t.reversalOf===selected.id) : false;
  const canReverseSelected = selected && ['EXPENSE','TRANSFER','ADVANCE'].includes(selected.type)
    && !selected.reversalOf && !selectedReversed;

  const rows = [...txs]
    .reverse()
    .filter((t) => type === 'ALL' || t.type === type)
    .filter((t) => phase === 'ALL' || t.phaseId === phase)
    .filter((t) => JSON.stringify(t).toLowerCase().includes(q.toLowerCase()));

  function exportCsv() {
    const header = ['Date', 'Type', 'Cost bucket', 'Category', 'Payee', 'Phase', 'Amount', 'From', 'To', 'Reference'];
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
      <PageTitle title="Ledger" description="Tap Details on a transaction to inspect the entry. Corrections are recorded separately." />
      <div className="ledgerQuickActions">
        {onAdd && <button type="button" className="primary small" onClick={onAdd}>+ Record transaction</button>}
        <span>Amounts shown here come from recorded entries, not editable dashboard totals.</span>
      </div>
      {selected && <section className="panel transactionDetails" aria-label="Selected transaction details">
        <div className="sectionHead"><div><h2>Transaction details</h2><p>Original entry · {selected.type.replaceAll('_',' ')}</p></div>
          <button type="button" className="secondary small" onClick={() => setSelectedId(null)}>Close details ×</button></div>
        <div className="transactionDetailAmount">{money(selected.amount)}</div>
        <div className="transactionFacts">
          <div><small>Recorded date</small><b>{new Date(selected.transactionDate).toLocaleDateString('en-IN')}</b></div>
          <div><small>Category</small><b>{selected.category || 'Not categorized'}</b></div>
          <div><small>Cost bucket</small><b>{selected.costBucket || 'Not applicable'}</b></div>
          <div><small>From account</small><b>{accountName(selected.sourceAccountId) || '—'}</b></div>
          <div><small>To account</small><b>{accountName(selected.destinationAccountId) || '—'}</b></div>
          <div><small>Project phase</small><b>{phaseName(selected.phaseId) || '—'}</b></div>
          <div><small>Vendor / payee</small><b>{selected.payee || vendorName(selected.vendorId) || contractorName(selected.contractorId) || '—'}</b></div>
          <div><small>Reference</small><b>{selected.referenceNumber || '—'}</b></div>
        </div>
        {selected.description && <p className="muted">{selected.description}</p>}
        {!!selected.attachments?.length && <div className="docActions">{selected.attachments.map(a=><button type="button" className="textLink" key={a.pathname} onClick={()=>openEvidence(a.pathname).catch(e=>alert(e instanceof Error?e.message:'Cannot open evidence'))}>{a.name}</button>)}</div>}
        <div className="transactionAdvice">
          Direct editing is disabled to protect your audit trail. If a recorded expense, transfer or advance is incorrect, create a reversal and enter the corrected transaction.
        </div>
        {selectedReversed && <small className="muted">This entry has already been reversed.</small>}
        <div className="formActions">
          {canReverseSelected && <button type="button" className="danger" onClick={()=>onVoid(selected.id)}>Reverse this entry</button>}
          {onAdd && <button type="button" className="primary" onClick={onAdd}>+ Add correcting transaction</button>}
        </div>
      </section>}

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
        </select>
        <select value={phase} onChange={(e) => setPhase(e.target.value)}>
          <option value="ALL">All phases</option>
          {state.phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="secondary small" onClick={exportCsv}>Export CSV</button>
      </div>

      <section className="panel ledger">
        {!rows.length ? <p className="muted">No matching transactions.</p> : null}
        {rows.map((t) => {
          const canVoid = ['EXPENSE', 'TRANSFER', 'ADVANCE'].includes(t.type) && !reversed.has(t.id) && !t.reversalOf;
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
                </div>
                <small>
                  {new Date(t.transactionDate).toLocaleDateString('en-IN')}
                  {context ? ' · ' + context : ''}
                  {phaseName(t.phaseId) ? ' · ' + phaseName(t.phaseId) : ''}
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
                {reversed.has(t.id) ? <small className="muted">Reversed by a correcting entry</small> : null}
                <button type="button" className="detailLink" onClick={() => {setSelectedId(t.id);window.scrollTo({top:0,behavior:'smooth'});}}>View details →</button>
              </div>
              <div className="ledgerAmount">
                <strong className={t.type === 'FUNDING_IN' ? 'positive' : ''}>{money(t.amount)}</strong>
                {canVoid ? <button className="linkButton" onClick={() => onVoid(t.id)}>Void</button> : null}
              </div>
            </article>
          );
        })}
      </section>

      {mode === 'standalone' ? <small className="muted">Evidence marked local is stored in this device's app data and included in full JSON backups.</small> : null}
    </div>
  );
}
