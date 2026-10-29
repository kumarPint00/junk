import { useState } from 'react';
import { CATEGORIES, TX_LABELS, num, type Data } from '../appData';
import type { Transaction, Attachment, TransactionType } from '../types';
import { db, id, nowIso, bumpRevision } from '../db';
import { uploadAttachment } from '../cloud';
import { formatINR } from '../finance';

export default function AddTransaction({data,reload,notify,syncKey}:{data:Data;reload:()=>Promise<void>;notify:(s:string)=>void;syncKey:string}) {
  const [type,setType]=useState<TransactionType>('EXPENSE');
  const [file,setFile]=useState<File|null>(null);
  const [saving,setSaving]=useState(false);
  const [materialMode,setMaterialMode]=useState(false);
  const needsSource=['EXPENSE','TRANSFER','ADVANCE','LOAN_REPAYMENT'].includes(type);
  const needsDestination=['FUNDING_IN','TRANSFER','REFUND'].includes(type);
  const needsFunding=['FUNDING_IN','DIRECT_FUNDED_EXPENSE'].includes(type);
  const advances=data.transactions.filter(t=>t.type==='ADVANCE');

  const submit=async(e:React.FormEvent<HTMLFormElement>)=>{
    e.preventDefault();setSaving(true);
    try{
      const f=new FormData(e.currentTarget);
      const quantity=num(f.get('quantity')),rate=num(f.get('rate')),transport=num(f.get('transport')),discount=num(f.get('discount'));
      const computed=materialMode&&quantity&&rate?quantity*rate+transport-discount:0;
      const value=computed||num(f.get('amount'));
      if(value<=0) throw new Error('Enter an amount greater than zero.');
      const source=String(f.get('sourceAccountId')||'')||undefined;
      const destination=String(f.get('destinationAccountId')||'')||undefined;
      if(needsSource&&!source) throw new Error('Select payment/source account.');
      if(needsDestination&&!destination) throw new Error('Select destination account.');
      if(type==='TRANSFER'&&source===destination) throw new Error('Source and destination must be different.');

      const tx:Transaction={
        id:id(),projectId:data.project!.id,date:String(f.get('date')||new Date().toISOString().slice(0,10)),
        type,amount:value,sourceAccountId:source,destinationAccountId:destination,
        fundingSourceId:String(f.get('fundingSourceId')||'')||undefined,milestoneId:String(f.get('milestoneId')||'')||undefined,
        partyId:String(f.get('partyId')||'')||undefined,category:String(f.get('category')||'')||undefined,
        description:String(f.get('description')||TX_LABELS[type]),notes:String(f.get('notes')||'')||undefined,
        paymentMethod:String(f.get('paymentMethod')||'OTHER') as Transaction['paymentMethod'],
        referenceNumber:String(f.get('referenceNumber')||'')||undefined,
        materialId:materialMode?String(f.get('materialId')||'')||undefined:undefined,
        quantity:materialMode?quantity||undefined:undefined,unit:materialMode?String(f.get('unit')||'')||undefined:undefined,
        rate:materialMode?rate||undefined:undefined,transportCost:materialMode?transport||undefined:undefined,
        discount:materialMode?discount||undefined:undefined,
        linkedTransactionId:type==='ADVANCE_ADJUSTMENT'?String(f.get('linkedTransactionId')||'')||undefined:undefined,
        createdAt:nowIso(),updatedAt:nowIso()
      };
      await db.transactions.add(tx);
      if(file){
        const attachment:Attachment={id:id(),projectId:data.project!.id,transactionId:tx.id,name:file.name,mimeType:file.type||'application/octet-stream',size:file.size,localBlob:file,createdAt:nowIso(),updatedAt:nowIso()};
        await db.attachments.add(attachment);
        if(syncKey&&navigator.onLine){try{await uploadAttachment(attachment,syncKey);}catch{/* local copy is retained */}}
      }
      await bumpRevision();e.currentTarget.reset();setFile(null);await reload();notify('Transaction saved.');
    }catch(err){notify(err instanceof Error?err.message:'Could not save transaction.');}
    finally{setSaving(false);}
  };

  return <section className="card"><div className="eyebrow">NEW ENTRY</div><h2>Record money movement</h2>
    <div className="typeGrid">{(Object.keys(TX_LABELS) as TransactionType[]).map(t=><button type="button" className={type===t?'typeBtn selected':'typeBtn'} key={t} onClick={()=>setType(t)}>{TX_LABELS[t]}</button>)}</div>
    <form className="formGrid" onSubmit={submit}>
      <div className="twoCol"><label>Date<input name="date" type="date" defaultValue={new Date().toISOString().slice(0,10)} required/></label>{!materialMode&&<label>Amount<input name="amount" type="number" min="1" step="1" required/></label>}</div>
      {type==='EXPENSE'&&<label className="checkLine"><input type="checkbox" checked={materialMode} onChange={e=>setMaterialMode(e.target.checked)}/> Material purchase with quantity × rate</label>}
      {materialMode&&<div className="materialBox"><label>Material<select name="materialId"><option value="">Select / generic</option>{data.materials.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        <div className="threeCol"><label>Quantity<input name="quantity" type="number" min="0" step=".01" required/></label><label>Unit<input name="unit" placeholder="kg / bag / piece"/></label><label>Rate<input name="rate" type="number" min="0" step=".01" required/></label></div>
        <div className="twoCol"><label>Transport<input name="transport" type="number" min="0" defaultValue="0"/></label><label>Discount<input name="discount" type="number" min="0" defaultValue="0"/></label></div></div>}
      {needsSource&&<label>From account<select name="sourceAccountId" required><option value="">Select account</option>{data.accounts.map(a=><option value={a.id} key={a.id}>{a.name}</option>)}</select></label>}
      {needsDestination&&<label>To account<select name="destinationAccountId" required><option value="">Select account</option>{data.accounts.map(a=><option value={a.id} key={a.id}>{a.name}</option>)}</select></label>}
      {needsFunding&&<label>Funding source<select name="fundingSourceId" required><option value="">Select funding source</option>{data.fundingSources.map(s=><option value={s.id} key={s.id}>{s.name} · {formatINR(s.committedAmount)}</option>)}</select></label>}
      {type==='ADVANCE_ADJUSTMENT'&&<label>Advance being adjusted<select name="linkedTransactionId"><option value="">Select advance (optional)</option>{advances.map(a=><option key={a.id} value={a.id}>{a.date} · {a.description} · {formatINR(a.amount)}</option>)}</select></label>}
      <div className="twoCol"><label>Milestone<select name="milestoneId"><option value="">General / not linked</option>{data.milestones.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        <label>Category<select name="category"><option value="">Select</option>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label></div>
      <label>Vendor / contractor / party<select name="partyId"><option value="">Not linked</option>{data.parties.map(p=><option key={p.id} value={p.id}>{p.name} · {p.kind}</option>)}</select></label>
      <label>Description<input name="description" placeholder="50 bags cement / seller payment / registry fee"/></label>
      <div className="twoCol"><label>Payment method<select name="paymentMethod"><option>CASH</option><option>UPI</option><option>BANK_TRANSFER</option><option>CHEQUE</option><option>CARD</option><option>OTHER</option></select></label><label>Reference / cheque / bill no.<input name="referenceNumber"/></label></div>
      <label>Notes<textarea name="notes" rows={2}/></label>
      <label>Bill / receipt / evidence<input type="file" accept="image/*,.pdf" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
      {file&&<small className="subtle">Attached locally: {file.name} · {(file.size/1024).toFixed(0)} KB</small>}
      <button className="primary" disabled={saving}>{saving?'Saving…':'Save '+TX_LABELS[type]}</button>
    </form>
  </section>;
}
