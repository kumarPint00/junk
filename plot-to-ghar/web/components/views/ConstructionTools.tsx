'use client';

import { useMemo, useState } from 'react';
import type { AttachmentRef, ContractorAgreement, ConstructionSuite, ProgressEntry, ProjectReminder, ProjectState, StockItem, StockMovement, Transaction } from '@/lib/types';
import { money } from '@/components/ui';
import { emi, loanProjection, stockBalances, dueReminders } from '@/lib/construction-calcs';
import { openEvidence, saveEvidence } from '@/lib/evidence';
import type { SuiteProps, UpdateSuite } from './ConstructionHub';

type ChildProps = SuiteProps & { patch: UpdateSuite };
const dateNow = () => new Date().toISOString().slice(0, 10);
function validNumber(s: string, min = 0) { const n = Number(s); return Number.isFinite(n) && n >= min ? n : NaN; }
function ErrorLine({ message }: { message: string }) { return message ? <div className="error" role="alert">{message}</div> : null; }
function AttachmentLinks({ refs }: { refs: AttachmentRef[] }) {
  return refs.length ? <div className="chips">{refs.map((a) =>
    <button className="secondary small" type="button" key={a.pathname} onClick={() => openEvidence(a).catch((e) => alert(e.message))}>📎 {a.name}</button>
  )}</div> : null;
}

export function MaterialsView({ state, txs, patch }: ChildProps) {
  const { stockItems: items, stockMovements: moves } = state.construction;
  const [name, setName] = useState(''); const [unit, setUnit] = useState('bag'); const [reorder, setReorder] = useState('0');
  const [itemId, setItemId] = useState(''); const [type, setType] = useState<StockMovement['type']>('RECEIPT');
  const [quantity, setQuantity] = useState(''); const [floorId, setFloorId] = useState('');
  const [transactionId, setTransactionId] = useState(''); const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const balances = useMemo(() => stockBalances(items, moves), [items, moves]);
  const purchaseTxs = txs.filter((t) => ['EXPENSE', 'DIRECT_FUNDED_EXPENSE', 'ADVANCE_ADJUSTMENT'].includes(t.type) && !t.reversalOf);
  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    const r = validNumber(reorder);
    if (!name.trim() || !unit.trim() || !Number.isFinite(r) || items.some((x) => x.name.toLowerCase() === name.trim().toLowerCase() && x.unit.toLowerCase() === unit.trim().toLowerCase())) {
      setError('Use a unique item+unit name and non-negative reorder point.'); return;
    }
    const item = { id: crypto.randomUUID(), name: name.trim(), unit: unit.trim(), reorderLevel: r };
    await patch({ stockItems: [...items, item] });
    setName(''); setError(''); setItemId(item.id);
  }
  async function addMove(e: React.FormEvent) {
    e.preventDefault();
    const q = validNumber(quantity, Number.EPSILON);
    if (!itemId || !Number.isFinite(q) || q <= 0) { setError('Choose material and positive quantity.'); return; }
    const sign = ['RECEIPT','CORRECTION_IN'].includes(type) ? 1 : -1;
    if ((balances[itemId] || 0) + sign * q < -0.000001) { setError('Not enough stock for this movement.'); return; }
    const entry: StockMovement = { id: crypto.randomUUID(), date: dateNow(), itemId, type, quantity:q, floorId:floorId || undefined, transactionId: transactionId || undefined, notes:note.trim() || undefined };
    await patch({ stockMovements: [...moves, entry] });
    setQuantity(''); setTransactionId(''); setNote(''); setError('');
  }
  return <div className="stack">
    <section className="panel">
      <h2>Material inventory</h2>
      <p className="muted">Receipt adds physical stock. Consumption, wastage and return reduce stock. This register never creates a financial expense; link existing bills below.</p>
      {items.length === 0 && <p className="muted">No materials added yet.</p>}
      {items.map((i) => <div className="row" key={i.id}><div><b>{i.name}</b><small>Reorder below {i.reorderLevel} {i.unit}</small></div>
        <strong className={(balances[i.id] || 0) <= i.reorderLevel ? 'negativeStock' : ''}>{(balances[i.id] || 0).toLocaleString('en-IN')} {i.unit}</strong>
      </div>)}
    </section>
    <form className="panel form" onSubmit={addItem}><h2>Register material</h2><div className="grid3">
      <label>Material<input required value={name} onChange={(e)=>setName(e.target.value)} placeholder="Cement OPC 43" /></label>
      <label>Unit<input required value={unit} onChange={(e)=>setUnit(e.target.value)} placeholder="bag / kg / pcs" /></label>
      <label>Reorder point<input type="number" min="0" step="any" value={reorder} onChange={(e)=>setReorder(e.target.value)} /></label>
    </div><ErrorLine message={error} /><button className="primary" type="submit">Add material</button></form>
    <form className="panel form" onSubmit={addMove}>
      <h2>Log stock movement</h2><div className="grid2">
        <label>Material<select required value={itemId} onChange={(e)=>setItemId(e.target.value)}><option value="">Choose material</option>{items.map((i)=><option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}</select></label>
        <label>Movement<select value={type} onChange={(e)=>setType(e.target.value as StockMovement['type'])}>
          <option value="RECEIPT">Received from vendor</option><option value="CONSUMPTION">Used at site</option><option value="WASTAGE">Wasted / damaged</option><option value="RETURN">Returned to vendor</option><option value="CORRECTION_IN">Verified stock correction (+)</option>
        </select></label>
        <label>Quantity<input required type="number" min="0.0001" step="any" value={quantity} onChange={(e)=>setQuantity(e.target.value)} /></label>
        <label>Floor / zone<select value={floorId} onChange={(e)=>setFloorId(e.target.value)}><option value="">Shared site</option>{state.construction.floors.map((f)=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
      </div>
      {type === 'RECEIPT' && <label>Link existing ledger purchase (optional)
        <select value={transactionId} onChange={(e)=>setTransactionId(e.target.value)}><option value="">Not linked / purchased elsewhere</option>{purchaseTxs.map((t)=><option value={t.id} key={t.id}>{String(t.transactionDate).slice(0,10)} · {t.payee||t.category||'Expense'} · {money(t.amount)}</option>)}</select>
      </label>}
      <label>Notes<input value={note} onChange={(e)=>setNote(e.target.value)} placeholder="Received 40 bags, invoice number..." /></label>
      <button className="primary" type="submit" disabled={!items.length}>Save movement</button>
    </form>
    <section className="panel"><h2>Recent material movements</h2>{[...moves].reverse().slice(0,25).map((m)=><div className="row" key={m.id}>
      <div><b>{items.find((i)=>i.id===m.itemId)?.name} · {m.type.replace('_',' ')}</b><small>{m.date} · {m.notes||'No notes'}</small></div><b>{['RECEIPT','CORRECTION_IN'].includes(m.type)?'+':'−'}{m.quantity}</b>
    </div>)}</section>
  </div>;
}

export function AgreementsView({ state, patch, mode, txs }: ChildProps) {
  const { agreements } = state.construction;
  const [contractor, setContractor] = useState('');
  const [title, setTitle] = useState(''); const [scope, setScope] = useState('');
  const [value, setValue] = useState(''); const [advanceLimit, setAdvanceLimit] = useState('0');
  const [retention, setRetention] = useState('0'); const [terms, setTerms] = useState('');
  const [start, setStart] = useState(''); const [end, setEnd] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [error, setError] = useState(''); const [working, setWorking] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const v = validNumber(value), a = validNumber(advanceLimit), r = validNumber(retention);
    if (!contractor || !title.trim() || !scope.trim() || !Number.isFinite(v) || !Number.isFinite(a) || !Number.isFinite(r) || r > 100 || a > v || (end && start && end < start)) {
      setError('Choose a contractor, scope and valid amount/date/retention.'); return;
    }
    setWorking(true);
    try {
      const files = attachment ? [await saveEvidence(attachment, mode)] : [];
      const agreement: ContractorAgreement = { id: crypto.randomUUID(), contractorId: contractor, title:title.trim(), scope:scope.trim(), value:v, advanceLimit:a, retentionPercent:r, startDate:start||undefined, endDate:end||undefined, paymentTerms:terms.trim(), status:'DRAFT', attachments:files };
      await patch({ agreements:[...agreements,agreement] });
      setTitle(''); setScope(''); setValue(''); setAttachment(null); setTerms(''); setError('');
    } catch(e) { setError(e instanceof Error?e.message:'Cannot save agreement'); } finally {setWorking(false);}
  }
  async function change(id:string, status: ContractorAgreement['status']) {
    await patch({ agreements: agreements.map((a)=>a.id===id ? {...a,status} : a) });
  }

  return <div className="stack">
    <section className="panel">
      <h2>Contractor work agreements</h2>
      <p className="muted">Agreed values are commitments only. Actual advances and payments must be recorded separately in the Ledger and linked to the contractor.</p>
      {!state.contractors.length && <div className="warning">Add contractors in More → Vendors & contractors before creating agreements.</div>}
      {agreements.map((a)=>{
        const paid = txs.filter((t)=>t.contractorId===a.contractorId && ['EXPENSE','ADVANCE','ADVANCE_ADJUSTMENT'].includes(t.type)).reduce((v,t)=>v + (t.type==='ADVANCE_ADJUSTMENT' ? 0 : t.amount),0);
        return <div className="suiteRecord" key={a.id}>
          <div className="sectionHead"><b>{a.title}</b><span className="status">{a.status}</span></div>
          <small className="muted">{state.contractors.find((x)=>x.id===a.contractorId)?.name||'Contractor'} · {money(a.value)} · Max advance {money(a.advanceLimit)}</small>
          <p>{a.scope}</p><small className="muted">Terms: {a.paymentTerms||'Not recorded'} · Retention {a.retentionPercent}%</small>
          <small className="muted">All recorded ledger payments to this contractor: {money(paid)} (across all agreements; not contract-specific)</small>
          <AttachmentLinks refs={a.attachments} />
          <select aria-label={'Agreement status: '+a.title} value={a.status} onChange={(e)=>change(a.id,e.target.value as ContractorAgreement['status'])}><option value="DRAFT">Draft</option><option value="SIGNED">Signed (confirm actual signatures)</option><option value="CLOSED">Closed</option></select>
        </div>;
      })}
    </section>
    <form className="panel form" onSubmit={add}>
      <h2>New agreement record</h2>
      <label>Contractor<select required value={contractor} onChange={(e)=>setContractor(e.target.value)}><option value="">Choose contractor</option>{state.contractors.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Work title<input required value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="RCC labour agreement" /></label>
      <label>Scope of work<textarea required value={scope} onChange={(e)=>setScope(e.target.value)} placeholder="Materials included/excluded, work measurements and quality expectations" /></label>
      <div className="grid3">
        <label>Agreed value ₹<input required min="0" type="number" value={value} onChange={(e)=>setValue(e.target.value)} /></label>
        <label>Advance limit ₹<input min="0" type="number" value={advanceLimit} onChange={(e)=>setAdvanceLimit(e.target.value)} /></label>
        <label>Retention %<input min="0" max="100" type="number" value={retention} onChange={(e)=>setRetention(e.target.value)} /></label>
        <label>Start<input type="date" value={start} onChange={(e)=>setStart(e.target.value)} /></label>
        <label>Finish<input type="date" value={end} onChange={(e)=>setEnd(e.target.value)} /></label>
      </div>
      <label>Milestone / payment terms<textarea value={terms} onChange={(e)=>setTerms(e.target.value)} placeholder="20% after plinth, 30% after slab..." /></label>
      <label>Signed agreement / quotation (PDF or image)<input type="file" accept="image/*,application/pdf" onChange={(e)=>setAttachment(e.target.files?.[0]||null)} /></label>
      <ErrorLine message={error} />
      <button className="primary" disabled={working||!state.contractors.length} type="submit">{working?'Saving…':'Save agreement draft'}</button>
    </form>
  </div>;
}

export function ProgressView({state,patch,mode}:ChildProps) {
  const { progress }=state.construction;
  const [floorId,setFloorId]=useState(''); const [phaseId,setPhaseId]=useState('');
  const [taskId,setTaskId]=useState(''); const [date,setDate]=useState(dateNow());
  const [percent,setPercent]=useState('0'); const [notes,setNotes]=useState('');
  const [files,setFiles]=useState<File[]>([]); const [error,setError]=useState(''); const [working,setWorking]=useState(false);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const p=validNumber(percent);
    if(!Number.isFinite(p)||p>100||!notes.trim()){setError('Notes and progress between 0 and 100% are required.');return;}
    setWorking(true);
    try {
      const attachments:AttachmentRef[]=[];
      for(const file of files) attachments.push(await saveEvidence(file,mode));
      const entry:ProgressEntry={id:crypto.randomUUID(),date,floorId:floorId||undefined,phaseId:phaseId||undefined,taskId:taskId||undefined,progressPercent:p,notes:notes.trim(),attachments};
      await patch({ progress:[...progress,entry] });
      setNotes('');setFiles([]);setError('');
    } catch(e){setError(e instanceof Error?e.message:'Unable to save progress');} finally{setWorking(false);}
  }
  return <div className="stack">
    <form className="panel form" onSubmit={add}>
      <h2>Construction photo journal</h2>
      <p className="muted">Log site progress as immutable dated observations. Percentage here is an observation, not an automatic financial cost.</p>
      <div className="grid2">
        <label>Date<input type="date" required value={date} onChange={(e)=>setDate(e.target.value)}/></label>
        <label>Progress noted %<input type="number" min="0" max="100" value={percent} onChange={(e)=>setPercent(e.target.value)}/></label>
        <label>Floor / zone<select value={floorId} onChange={(e)=>setFloorId(e.target.value)}><option value="">Shared site</option>{state.construction.floors.map((f)=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        <label>Phase<select value={phaseId} onChange={(e)=>setPhaseId(e.target.value)}><option value="">None</option>{state.phases.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>Scheduled activity<select value={taskId} onChange={(e)=>setTaskId(e.target.value)}><option value="">None</option>{state.construction.schedule.map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      </div>
      <label>Work completed / observations<textarea required value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="Ground-floor pillars completed, curing started..." /></label>
      <label>Photographs / PDF<input type="file" multiple accept="image/*,application/pdf" capture="environment" onChange={(e)=>setFiles(Array.from(e.target.files||[]))}/></label>
      <ErrorLine message={error}/><button className="primary" disabled={working} type="submit">{working?'Saving evidence…':'Save progress entry'}</button>
    </form>
    <section className="panel"><h2>Site progress timeline</h2>
      {!progress.length && <p className="muted">No site updates yet.</p>}
      {[...progress].reverse().sort((a,b)=>b.date.localeCompare(a.date)).map((p)=><div className="suiteRecord" key={p.id}>
        <div className="sectionHead"><b>{p.date}</b><span className="status">{p.progressPercent}% noted</span></div>
        <small className="muted">{state.construction.floors.find((f)=>f.id===p.floorId)?.name||'Site'} · {state.phases.find((x)=>x.id===p.phaseId)?.name||'General'}</small>
        <p>{p.notes}</p><AttachmentLinks refs={p.attachments}/>
      </div>)}
    </section>
  </div>;
}

export function FinanceView({state,txs}:ChildProps){
  const loan=state.loans[0];
  const fromSource=txs.filter((t)=>['FUNDING_IN','DIRECT_FUNDED_EXPENSE'].includes(t.type) && state.fundingSources.some((f)=>f.id===t.fundingSourceId && ['PURCHASE_LOAN','CONSTRUCTION_LOAN'].includes(f.type))).reduce((s,t)=>s+t.amount,0);
  const loanRepayments=txs.filter((t)=>t.type==='LOAN_REPAYMENT').reduce((s,t)=>s+t.amount,0);
  const [principal,setPrincipal]=useState('');
  const [rate,setRate]=useState(String(loan?.interestRate||10.35));
  const [tenure,setTenure]=useState(String(loan?.tenureMonths||240));
  const [extra,setExtra]=useState('50000');
  const [monthly,setMonthly]=useState('0');
  const p=validNumber(principal);
  const r=validNumber(rate);
  const n=validNumber(tenure,1);
  const loanCalc=useMemo(()=>loanProjection(Number.isFinite(p)?p:0,Number.isFinite(r)?r:0,Number.isFinite(n)?n:0,validNumber(extra)||0),[p,r,n,extra]);
  const startingCash=Object.values((awaitlessBalances(state,txs))).reduce((a,b)=>a+b,0);
  let projectedCash=startingCash;
  const baseMonth=new Date();baseMonth.setDate(1);
  const forecast=Array.from({length:6},(_,i)=>{
    const d=new Date(baseMonth.getFullYear(),baseMonth.getMonth()+i,1);
    const key=d.toISOString().slice(0,7);
    const planned=state.construction.schedule.filter((t)=>t.status!=='COMPLETED' && t.endDate.slice(0,7)===key).reduce((s,t)=>s+t.estimatedCost,0);
    const inflow=validNumber(monthly)||0;
    projectedCash+=inflow-planned;
    return {key,planned,inflow,balance:projectedCash};
  });
  return <div className="stack">
    <section className="panel">
      <h2>Loan repayment scenario</h2>
      <p className="muted">Sanctioned amount {money(loan?.sanctionedAmount||0)} · Recorded loan disbursements {money(fromSource)} · Recorded EMI/repayment cash outflow {money(loanRepayments)}.</p>
      <p className="warning">The ledger does not separate EMI principal vs interest, so outstanding principal is entered manually from your lender statement. Never treat sanction amount as cash received.</p>
      <div className="grid2">
        <label>Outstanding principal ₹<input type="number" min="0" value={principal} onChange={(e)=>setPrincipal(e.target.value)} placeholder="Enter verified balance"/></label>
        <label>Annual interest %<input type="number" step="any" min="0" value={rate} onChange={(e)=>setRate(e.target.value)}/></label>
        <label>Remaining tenure months<input type="number" step="1" min="1" value={tenure} onChange={(e)=>setTenure(e.target.value)}/></label>
        <label>Extra monthly repayment ₹<input type="number" min="0" value={extra} onChange={(e)=>setExtra(e.target.value)}/></label>
      </div>
      {principal && <div className="cards">
        <div className="card"><small>Calculated EMI</small><strong>{money(loanCalc.emi)}</strong></div>
        <div className="card"><small>Months until payoff</small><strong>{loanCalc.schedule.length || '—'}</strong></div>
        <div className="card"><small>Interest over projection</small><strong>{money(loanCalc.totalInterest)}</strong></div>
        <div className="card"><small>Balance after projection</small><strong>{money(loanCalc.remainingAfterHorizon)}</strong></div>
      </div>}
      <p className="muted">Illustrative amortization only; actual EMI dates, rate changes, charges and prepayment rules depend on your loan agreement.</p>
    </section>
    <section className="panel">
      <h2>Six-month construction cash forecast</h2>
      <p className="muted">Starts with balances of tracked project accounts. Only planned task costs are deducted; loan instalments and household expenses are not automatically included.</p>
      <div className="row"><span>Recorded available project funds</span><b>{money(startingCash)}</b></div>
      <label>Expected fresh contributions each month ₹<input type="number" min="0" value={monthly} onChange={(e)=>setMonthly(e.target.value)}/></label>
      {forecast.map((x)=><div className="suiteRecord" key={x.key}>
        <b>{x.key}</b><div className="row"><small>Planned work</small><b>{money(x.planned)}</b></div>
        <div className="row"><small>Projected end cash</small><b className={x.balance<0?'negativeStock':''}>{money(x.balance)}</b></div>
      </div>)}
      {forecast.some((x)=>x.balance<0) && <p className="warning">Funding shortfall projected. Revise the schedule or record confirmed funding, but never assume an undisbursed loan is available cash.</p>}
    </section>
  </div>;
}
function awaitlessBalances(state:ProjectState,txs:Transaction){
  const b:Record<string,number>=Object.fromEntries(state.accounts.map((a)=>[a.id,a.openingBalance]));
  for(const t of txs) {
    if(t.type==='FUNDING_IN'||t.type==='REFUND'||t.type==='ADVANCE_REFUND'||t.type==='TRANSFER') {if(t.destinationAccountId)b[t.destinationAccountId]=(b[t.destinationAccountId]||0)+t.amount;}
    if(['EXPENSE','ADVANCE','LOAN_REPAYMENT','TRANSFER'].includes(t.type)&&t.sourceAccountId)b[t.sourceAccountId]=(b[t.sourceAccountId]||0)-t.amount;
  }
  return b;
}

export function RemindersView({state,patch}:ChildProps){
  const reminders=state.construction.reminders;
  const [title,setTitle]=useState(''); const [due,setDue]=useState(dateNow());
  const [category,setCategory]=useState<ProjectReminder['category']>('WORK');
  const [repeat,setRepeat]=useState<ProjectReminder['repeat']>('NONE');
  const [error,setError]=useState('');
  const [permission,setPermission]=useState(typeof Notification==='undefined'?'unavailable':Notification.permission);
  const dueNow=dueReminders(reminders,new Date());
  async function add(e:React.FormEvent){
    e.preventDefault();
    if(!title.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(due)){setError('Enter title and valid date.');return;}
    await patch({reminders:[...reminders,{id:crypto.randomUUID(),title:title.trim(),dueDate:due,category,repeat,completed:false}]});
    setTitle('');setError('');
  }
  async function mark(id:string,completed:boolean){
    await patch({reminders:reminders.map((r)=>r.id===id?{...r,completed}:r)});
  }
  async function allowNotifications(){
    if(typeof Notification==='undefined'){setError('Notification API is not supported in this webview. Reminders remain visible in the app.');return;}
    const next=await Notification.requestPermission();
    setPermission(next);
    if(next==='granted') new Notification('Plot to Ghar',{body:'Notification permission enabled while the app is open.',icon:'/icon.svg'});
  }
  return <div className="stack">
    <section className="panel">
      <h2>Reminders & alerts</h2>
      <div className="row"><span>Due or overdue</span><b>{dueNow.filter((r)=>!r.completed).length}</b></div>
      <p className="muted">Reminders are saved offline. Browser notifications can appear while this app is open; reliable notifications when closed require a separate push backend or Android native scheduling.</p>
      <div className="row"><span>Browser notification permission</span><b>{permission}</b></div>
      <button className="secondary" type="button" onClick={allowNotifications}>Enable browser notifications</button>
      {reminders.slice().sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).map((r)=><div className="suiteRecord" key={r.id}>
        <div className="sectionHead"><b>{r.title}</b><span className="status">{r.category}</span></div>
        <small className="muted">{r.dueDate} · {r.repeat==='MONTHLY'?'Every month':'Once'}</small>
        <label className="check"><input type="checkbox" checked={r.completed} onChange={(e)=>mark(r.id,e.target.checked)}/>Done</label>
      </div>)}
    </section>
    <form className="panel form" onSubmit={add}><h2>New reminder</h2>
      <label>Reminder<input required value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="Construction loan EMI" /></label>
      <div className="grid3">
        <label>Due date<input type="date" required value={due} onChange={(e)=>setDue(e.target.value)}/></label>
        <label>Category<select value={category} onChange={(e)=>setCategory(e.target.value as ProjectReminder['category'])}>
          <option value="EMI">EMI</option><option value="PAYMENT">Contractor payment</option><option value="DELIVERY">Material delivery</option><option value="WORK">Site work</option><option value="OTHER">Other</option>
        </select></label>
        <label>Repeat<select value={repeat} onChange={(e)=>setRepeat(e.target.value as ProjectReminder['repeat'])}><option value="NONE">Once</option><option value="MONTHLY">Monthly</option></select></label>
      </div>
      <ErrorLine message={error}/><button className="primary" type="submit">Add reminder</button>
    </form>
  </div>;
}

function parseText(raw:string) {
  const lines=raw.split(/\r?\n/).map((s)=>s.trim()).filter(Boolean);
  const totalLines=lines.filter((s)=>/total|grand|net\s*amount|amount\s*due|payable/i.test(s));
  const target=totalLines.at(-1)||lines.at(-1)||'';
  const prices=(target.match(/(?:₹|rs\.?\s*)?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|(?:₹|rs\.?\s*)?\d+(?:\.\d{1,2})?/ig)||[])
    .map((v)=>Number(v.replace(/[^0-9.]/g,''))).filter((n)=>Number.isFinite(n)&&n>0);
  const amount=prices.at(-1)||0;
  return { amount: amount ? String(amount):'',payee:lines[0]||'',description:lines.slice(0,8).join(' | '),text:raw };
}

export function ReceiptView({mode,onScanned}:ChildProps){
  const [file,setFile]=useState<File|null>(null);
  const [text,setText]=useState(''); const [amount,setAmount]=useState(''); const [payee,setPayee]=useState(''); const [date,setDate]=useState(dateNow());
  const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [scanned,setScanned]=useState(false);
  async function scan(){
    if(!file){setError('Choose a receipt photo.');return;}
    if(!file.type.startsWith('image/')){setError('OCR supports JPEG/PNG/WebP images. PDF extraction is not enabled.');return;}
    setBusy(true);setError('');
    try{
      const mod=await import('tesseract.js');
      const worker=await mod.createWorker('eng');
      let raw='';
      try{const out=await worker.recognize(file);raw=out.data.text;}finally{await worker.terminate();}
      const detected=parseText(raw);
      setText(detected.text);setAmount(detected.amount);setPayee(detected.payee);setScanned(true);
    }catch(e){setError('OCR failed. First scan requires a network connection for language data. '+(e instanceof Error?e.message:''));}
    finally{setBusy(false);}
  }
  async function useDraft(){
    if(!file)return;
    if(!amount||!Number.isFinite(Number(amount))||Number(amount)<=0){setError('Confirm a valid receipt amount first.');return;}
    setBusy(true);
    try{
      const attachment=await saveEvidence(file,mode);
      onScanned({amount,date,payee,description:text.slice(0,700),attachment});
    }catch(e){setError(e instanceof Error?e.message:'Unable to attach receipt');}finally{setBusy(false);}
  }
  return <section className="panel form">
    <h2>Scan a receipt</h2>
    <p className="muted">Free on-device Tesseract OCR for printed English bills. OCR can be inaccurate, especially on handwritten Hindi. It never posts money automatically.</p>
    <label>Receipt image<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(e)=>{setFile(e.target.files?.[0]||null);setScanned(false);setError('');}}/></label>
    <button className="secondary" disabled={busy||!file} onClick={scan} type="button">{busy?'Reading…':'Extract text from image'}</button>
    {scanned&&<>
      <div className="grid2">
        <label>Confirm amount ₹<input type="number" min="0.01" step="any" value={amount} onChange={(e)=>setAmount(e.target.value)}/></label>
        <label>Confirm date<input type="date" value={date} onChange={(e)=>setDate(e.target.value)}/></label>
      </div>
      <label>Confirm vendor / payee<input value={payee} onChange={(e)=>setPayee(e.target.value)}/></label>
      <label>Recognized text<textarea value={text} onChange={(e)=>setText(e.target.value)} rows={6}/></label>
      <p className="warning">Confirm all fields against the actual receipt. The next step opens an editable expense draft, not a posted transaction.</p>
      <button className="primary" disabled={busy} onClick={useDraft} type="button">Create editable expense draft</button>
    </>}
    <ErrorLine message={error}/>
  </section>;
}
