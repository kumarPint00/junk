'use client';

import { useMemo, useState } from 'react';
import type { AttachmentRef, LineItem, ProjectState, Transaction, TxType } from '@/lib/types';
import { saveLocalAttachment } from '@/lib/local-db';
import { money, PageTitle } from '@/components/ui';

async function compressImage(file: File) {
  if (!file.type.startsWith('image/') || file.type === 'image/webp') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const max = 1600;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.78));
    if (!blob) return file;
    const base = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${base}.webp`, { type: 'image/webp', lastModified: Date.now() });
  } catch {
    return file;
  }
}

export function AddTransaction({
  state,
  txs,
  onSave,
  mode,
}: {
  state: ProjectState;
  txs: Transaction[];
  onSave: (t: Transaction) => Promise<void>;
  mode: 'cloud' | 'standalone';
}) {
  const [type, setType] = useState<TxType>('EXPENSE');
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState('');
  const [dest, setDest] = useState('');
  const [funding, setFunding] = useState('');
  const [category, setCategory] = useState('');
  const [payee, setPayee] = useState('');
  const [description, setDescription] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [milestoneId, setMilestoneId] = useState(state.milestones.find((m) => m.status === 'IN_PROGRESS')?.id || '');
  const [phaseId, setPhaseId] = useState(state.phases.find((p) => p.status === 'IN_PROGRESS')?.id || '');
  const [vendorId, setVendorId] = useState('');
  const [contractorId, setContractorId] = useState('');
  const [costBucket, setCostBucket] = useState<'ACQUISITION' | 'CONSTRUCTION' | 'OTHER'>('CONSTRUCTION');
  const [attachments, setAttachments] = useState<AttachmentRef[]>([]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [linkedTransactionId, setLinkedTransactionId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const openAdvances = useMemo(() => {
    return txs
      .filter((t) => t.type === 'ADVANCE')
      .map((advance) => {
        const settled = txs
          .filter(
            (t) =>
              (t.type === 'ADVANCE_ADJUSTMENT' || t.type === 'ADVANCE_REFUND') &&
              t.linkedTransactionId === advance.id
          )
          .reduce((sum, t) => sum + t.amount, 0);
        return { advance, remaining: advance.amount - settled };
      })
      .filter((x) => x.remaining > 0.01);
  }, [txs]);

  const itemTotal = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const finalAmount = items.length ? itemTotal : Number(amount || 0);

  async function upload(files: FileList | null) {
    if (!files) return;
    setError('');
    setUploading(true);
    try {
      const refs: AttachmentRef[] = [];
      for (const original of Array.from(files)) {
        const file = await compressImage(original);
        if (file.size > 8 * 1024 * 1024) throw new Error(`${file.name} exceeds the 8 MB evidence limit.`);
        if (mode === 'standalone') {
          refs.push(await saveLocalAttachment(file));
          continue;
        }
        const fd = new FormData();
        fd.append('file', file);
        const response = await fetch('/api/attachments', { method: 'POST', body: fd });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Evidence upload failed');
        refs.push(body.attachment);
      }
      setAttachments((x) => [...x, ...refs]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Evidence upload failed');
    } finally {
      setUploading(false);
    }
  }

  function addItem() {
    setItems((x) => [...x, { description: '', quantity: 1, unit: 'pcs', rate: 0, amount: 0 }]);
  }

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((all) => {
      const copy = [...all];
      const next = { ...copy[index], ...patch };
      if ('quantity' in patch || 'rate' in patch) {
        next.amount = Number(next.quantity || 0) * Number(next.rate || 0);
      }
      copy[index] = next;
      return copy;
    });
  }

  function selectAdvance(id: string) {
    setLinkedTransactionId(id);
    const found = openAdvances.find((x) => x.advance.id === id)?.advance;
    if (found) {
      setContractorId(found.contractorId || '');
      setPayee(found.payee || '');
      setCategory(found.category || 'Advance settlement');
      if (type === 'ADVANCE_REFUND') setDest(found.sourceAccountId || '');
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    const tx: Transaction = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      transactionDate: new Date(date + 'T12:00:00').toISOString(),
      type,
      amount: finalAmount,
      sourceAccountId: source || undefined,
      destinationAccountId: dest || undefined,
      fundingSourceId: funding || undefined,
      milestoneId: milestoneId || undefined,
      phaseId: phaseId || undefined,
      vendorId: vendorId || undefined,
      contractorId: contractorId || undefined,
      costBucket,
      category: category.trim() || undefined,
      payee: payee.trim() || undefined,
      referenceNumber: referenceNumber.trim() || undefined,
      description: description.trim() || undefined,
      lineItems: items.length ? items : undefined,
      attachments,
      linkedTransactionId: linkedTransactionId || undefined,
    };
    await onSave(tx);
  }

  const needsSource = ['EXPENSE', 'TRANSFER', 'ADVANCE', 'LOAN_REPAYMENT'].includes(type);
  const needsDest = ['FUNDING_IN', 'TRANSFER', 'REFUND', 'ADVANCE_REFUND'].includes(type);
  const settlesAdvance = ['ADVANCE_ADJUSTMENT', 'ADVANCE_REFUND'].includes(type);
  const isCost = ['EXPENSE', 'ADVANCE_ADJUSTMENT', 'REFUND', 'DIRECT_FUNDED_EXPENSE'].includes(type);

  return (
    <div className="stack">
      <PageTitle title="Add Transaction" description="Transfers, funding, advances and actual cost are accounted separately." />
      <form className="panel form" onSubmit={submit}>
        <label>
          Transaction type
          <select value={type} onChange={(e) => {
            const next = e.target.value as TxType;
            setType(next);
            setLinkedTransactionId('');
          }}>
            <option value="EXPENSE">Expense</option>
            <option value="TRANSFER">Transfer — not an expense</option>
            <option value="FUNDING_IN">Funding received</option>
            <option value="ADVANCE">Advance paid</option>
            <option value="ADVANCE_ADJUSTMENT">Recognize contractor advance as work</option>
            <option value="ADVANCE_REFUND">Advance returned — not an expense</option>
            <option value="REFUND">Expense refund</option>
            <option value="DIRECT_FUNDED_EXPENSE">Lender paid expense directly</option>
            <option value="LOAN_REPAYMENT">Loan repayment — not project cost</option>
          </select>
        </label>

        <div className="grid2">
          <label>
            Amount
            <input
              required={!items.length}
              inputMode="decimal"
              value={items.length ? String(itemTotal || '') : amount}
              disabled={Boolean(items.length)}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </label>
          <label>
            Date
            <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>

        {needsSource ? (
          <label>
            From account
            <select required value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Choose…</option>
              {state.accounts.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        ) : null}

        {needsDest ? (
          <label>
            To account
            <select required value={dest} onChange={(e) => setDest(e.target.value)}>
              <option value="">Choose…</option>
              {state.accounts.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        ) : null}

        {['FUNDING_IN', 'DIRECT_FUNDED_EXPENSE'].includes(type) ? (
          <label>
            Funding source
            <select required value={funding} onChange={(e) => setFunding(e.target.value)}>
              <option value="">Choose…</option>
              {state.fundingSources.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
        ) : null}

        {settlesAdvance ? (
          <label>
            Advance to settle
            <select required value={linkedTransactionId} onChange={(e) => selectAdvance(e.target.value)}>
              <option value="">Choose open advance…</option>
              {openAdvances.map(({ advance, remaining }) => (
                <option key={advance.id} value={advance.id}>
                  {advance.payee || advance.category || 'Advance'} — {money(remaining)} remaining
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {isCost ? (
          <label>
            Cost bucket
            <select value={costBucket} onChange={(e) => setCostBucket(e.target.value as typeof costBucket)}>
              <option value="ACQUISITION">Plot / registry / acquisition</option>
              <option value="CONSTRUCTION">Construction</option>
              <option value="OTHER">Other project cost</option>
            </select>
          </label>
        ) : null}

        <div className="grid2">
          <label>
            Milestone
            <select value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)}>
              <option value="">None</option>
              {state.milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <label>
            Construction phase
            <select value={phaseId} onChange={(e) => setPhaseId(e.target.value)}>
              <option value="">None</option>
              {state.phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        </div>

        <div className="grid2">
          <label>
            Vendor
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              <option value="">None</option>
              {state.vendors.filter((v) => v.active !== false).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </label>
          <label>
            Contractor
            <select value={contractorId} onChange={(e) => setContractorId(e.target.value)}>
              <option value="">None</option>
              {state.contractors.filter((v) => v.active !== false).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </label>
        </div>

        <div className="grid2">
          <label>
            Category
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Steel / Registry / Labour" />
          </label>
          <label>
            Payee
            <input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Person or shop" />
          </label>
        </div>

        <label>
          Reference / bill number
          <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="Optional" />
        </label>

        <label>
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was this for?" />
        </label>

        <div className="lineItemHead">
          <div>
            <b>Itemized materials</b>
            <small>Optional. Quantity × rate automatically becomes the transaction total.</small>
          </div>
          <button type="button" className="secondary small" onClick={addItem}>+ Item</button>
        </div>

        {items.map((item, i) => (
          <div className="lineItem" key={i}>
            <input value={item.description} onChange={(e) => updateItem(i, { description: e.target.value })} placeholder="Cement / steel / bricks" />
            <input inputMode="decimal" value={item.quantity ?? ''} onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })} placeholder="Qty" />
            <input value={item.unit || ''} onChange={(e) => updateItem(i, { unit: e.target.value })} placeholder="bag/kg" />
            <input inputMode="decimal" value={item.rate ?? ''} onChange={(e) => updateItem(i, { rate: Number(e.target.value) })} placeholder="Rate" />
            <b>{money(item.amount)}</b>
            <button type="button" className="iconButton" onClick={() => setItems((x) => x.filter((_, n) => n !== i))}>×</button>
          </div>
        ))}

        {items.length ? <div className="row totalRow"><span>Item total</span><b>{money(itemTotal)}</b></div> : null}

        <label>
          Receipt / photo / PDF
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple capture="environment" onChange={(e) => upload(e.target.files)} />
        </label>
        {uploading ? <small>{mode === 'standalone' ? 'Compressing and saving evidence on this device…' : 'Compressing and uploading evidence…'}</small> : null}
        {attachments.length ? <div className="chips">{attachments.map((a) => <span key={a.pathname}>{a.name}</span>)}</div> : null}
        {error ? <div className="error">{error}</div> : null}

        <button className="primary" disabled={uploading}>Save transaction</button>
      </form>
    </div>
  );
}
