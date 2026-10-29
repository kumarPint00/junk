import { useState } from 'react';
import type { Data } from '../appData';
import { TX_LABELS } from '../appData';
import type { FinanceSummary, Transaction, TransactionType } from '../types';
import { formatINR } from '../finance';
import { TransactionRow, Empty } from '../components';
import { db, bumpRevision, nowIso } from '../db';

export default function Ledger({data,finance,reload,notify}:{data:Data;finance:FinanceSummary;reload:()=>Promise<void>;notify:(s:string)=>void}) {
  const [query,setQuery]=useState(''); const [filter,setFilter]=useState<'ALL'|TransactionType>('ALL');
  const rows=data.transactions.filter(tx=>{const q=query.toLowerCase();return(filter==='ALL'||tx.type===filter)&&(!q||(tx.description+' '+(tx.category||'')+' '+(tx.notes||'')).toLowerCase().includes(q));});
  const voidTx=async(tx:Transaction)=>{if(!confirm('Void this transaction? It will remain in the audit trail.'))return;
    await db.transactions.update(tx.id,{deletedAt:nowIso(),updatedAt:nowIso()});await bumpRevision();await reload();notify('Transaction voided.');};
  return <section className="card ledgerCard"><div className="sectionTitle"><div><div className="eyebrow">AUDITABLE MONEY TRAIL</div><h2>Ledger</h2></div><strong>{formatINR(finance.totalCost)} cost</strong></div>
    <div className="filters"><input placeholder="Search ledger…" value={query} onChange={e=>setQuery(e.target.value)}/><select value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}>
      <option value="ALL">All types</option>{(Object.keys(TX_LABELS) as TransactionType[]).map(t=><option key={t} value={t}>{TX_LABELS[t]}</option>)}</select></div>
    {rows.length?rows.map(tx=><div className="ledgerWrap" key={tx.id}><TransactionRow tx={tx} data={data}/><button className="dangerLink" onClick={()=>voidTx(tx)}>Void</button></div>):<Empty text="No matching transactions."/>}
  </section>;
}
