'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, ArrowRight, BookOpen, Camera, CheckCircle2, File, FileCheck2, FileText, FolderOpen, Landmark, Plus, Receipt, Search, ShieldCheck, TrendingDown, TrendingUp, Upload } from 'lucide-react';
import type { AttachmentRef, ConstructionDocument, ProjectState, Transaction } from '@/lib/types';
import type { SuiteProps, UpdateSuite } from './ConstructionHub';
import { saveEvidence, openEvidence } from '@/lib/evidence';
import { computeLedger } from '@/lib/ledger';
import { auditIntegrity } from '@/lib/integrity-audit';
import { money } from '@/components/ui';

type ToolProps = SuiteProps & { patch: UpdateSuite };
type Entry = { id: string; title: string; date: string; category: string; attachments: AttachmentRef[]; origin: string; notes?: string };

const categories: ConstructionDocument['category'][] = ['REGISTRY','PLAN','PERMIT','BILL','AGREEMENT','WARRANTY','PHOTO','OTHER'];
const formatDate = (date: string) => {
  const parsed = new Date(date);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString('en-IN') : date;
};

export function DocumentsView({ state, txs, mode, patch }: ToolProps) {
  const docs = state.construction.documents;
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ConstructionDocument['category']>('PLAN');
  const [date, setDate] = useState(new Date().toISOString().slice(0,10));
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const entries = useMemo<Entry[]>(() => [
    ...docs.map(d => ({ ...d, origin: 'Document library' })),
    ...txs.flatMap(tx => tx.attachments?.length ? [{
      id: 'tx-' + tx.id, title: tx.payee || tx.category || 'Ledger receipt',
      date: tx.transactionDate, category: 'BILL', origin: 'Financial ledger',
      notes: tx.description, attachments: tx.attachments,
    }] : []),
    ...state.construction.agreements.flatMap(a => a.attachments.length ? [{
      id: 'agreement-' + a.id, title: a.title, date: a.startDate || '', category: 'AGREEMENT',
      origin: 'Contractor agreement', attachments: a.attachments,
    }] : []),
    ...state.construction.progress.flatMap(p => p.attachments.length ? [{
      id: 'progress-' + p.id, title: p.notes.slice(0,65) || 'Progress photos', date: p.date,
      category: 'PHOTO', origin: 'Progress journal', attachments: p.attachments,
    }] : []),
  ].sort((a,b) => b.date.localeCompare(a.date)), [docs, txs, state.construction.agreements, state.construction.progress]);

  const visible = entries.filter(d => (filter==='ALL'||d.category===filter) && [d.title,d.notes||'',d.origin].join(' ').toLowerCase().includes(query.toLowerCase()));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date) { setError('Enter a title and date.'); return; }
    if (!editing && (!files.length || files.length > 12)) { setError('Attach between 1 and 12 files.'); return; }
    setSaving(true); setError('');
    try {
      if (editing) {
        const existing=docs.find(d=>d.id===editing);
        if (!existing) throw new Error('Document not found.');
        const refs=[...existing.attachments];
        for(const file of files) refs.push(await saveEvidence(file,mode));
        if(refs.length>12) throw new Error('Maximum 12 attachments per document.');
        await patch({documents:docs.map(d=>d.id===editing ? {...d,title:title.trim(),category,date,notes:notes.trim(),attachments:refs}:d)});
      } else {
        const refs:AttachmentRef[]=[];
        for(const file of files) refs.push(await saveEvidence(file,mode));
        await patch({documents:[...docs,{id:crypto.randomUUID(),title:title.trim(),category,date,notes:notes.trim(),attachments:refs}]});
      }
      setTitle('');setNotes('');setFiles([]);setEditing(null);
    } catch(err){setError(err instanceof Error?err.message:'Unable to save document');}
    finally {setSaving(false);}
  }
  function editDoc(d:ConstructionDocument) {
    setEditing(d.id);setTitle(d.title);setCategory(d.category);setDate(d.date);setNotes(d.notes||'');setFiles([]);setError('');
    document.getElementById('ptg-document-form')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function deleteDoc(d:ConstructionDocument) {
    if(!confirm('Remove this document record from the library? Its financial transactions will not be affected.')) return;
    await patch({documents:docs.filter(x=>x.id!==d.id)});
  }
  return <div className="stack">
    <div className="sectionIntro"><div><span className="eyebrow">YOUR PROJECT FILES</span><h2>Documents & evidence</h2><p>Registry papers, site plans, contractor agreements and receipts in one searchable library.</p></div><span className="viewCount"><FolderOpen size={17}/> {entries.length} records</span></div>
    <form id="ptg-document-form" className="panel form" onSubmit={submit}>
      <div className="sectionHead"><h2>{editing ? 'Edit document' : 'Add a document'}</h2><FileCheck2 size={20} color="#159b74"/></div>
      <div className="grid2">
        <label>Document title<input required value={title} onChange={e=>setTitle(e.target.value)} placeholder="Registry sale deed / Structural drawing"/></label>
        <label>Category<select value={category} onChange={e=>setCategory(e.target.value as ConstructionDocument['category'])}>{categories.map(c=><option key={c} value={c}>{c[0]+c.slice(1).toLowerCase()}</option>)}</select></label>
        <label>Date<input required type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
        <label>Files (JPG / PNG / WebP / PDF)<input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>setFiles(Array.from(e.target.files||[]))}/></label>
      </div>
      <label>Notes<textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="What is this document? Where is the original stored?"/></label>
      {editing ? <small>Existing attachments remain linked. Add new files if needed.</small> : null}
      {files.length ? <p className="muted">{files.length} file(s) selected · maximum 8 MB per file</p> : null}
      {error && <p role="alert" className="error">{error}</p>}
      <div className="formActions"><button className="primary" type="submit" disabled={saving}><Upload size={16}/> {saving?'Saving…':editing?'Save changes':'Add to library'}</button>
      {editing && <button className="secondary" type="button" onClick={()=>{setEditing(null);setTitle('');setNotes('');setFiles([]);}}>Cancel</button>}</div>
    </form>
    <section className="panel">
      <div className="sectionHead"><div><h2>All documents</h2><p>Evidence recorded elsewhere also appears here automatically.</p></div></div>
      <div className="docFilters"><label className="docSearch"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search evidence…" aria-label="Search project documents"/></label>
      <select value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Document category"><option value="ALL">All categories</option>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
      {visible.length ? <div className="docList">{visible.map(d=><article className="docRow" key={d.id}>
        <span className="docGlyph"><FileText size={22}/></span>
        <div className="docInfo"><b>{d.title}</b><small>{d.origin} · {d.category} · {formatDate(d.date)} · {d.attachments.length} file(s)</small>
          {d.notes && <small>{d.notes}</small>}
          <div className="docActions">{d.attachments.map((f,i)=><button className="textLink" key={f.pathname+i} type="button" onClick={()=>openEvidence(f).catch(err=>alert(err instanceof Error?err.message:'Could not open evidence'))}><File size={14}/>{f.name}</button>)}</div>
        </div>
        {d.origin==='Document library' && <div className="docEditActions">
          <button type="button" className="secondary small" onClick={()=>{const own=docs.find(x=>x.id===d.id);if(own)editDoc(own);}}>Edit</button>
          <button type="button" className="linkButton" onClick={()=>{const own=docs.find(x=>x.id===d.id);if(own)deleteDoc(own);}}>Remove</button>
        </div>}
      </article>)}</div> : <div className="emptySection"><FolderOpen size={28}/><b>No matching documents</b><p>Upload a file above or add receipts, agreements and progress photos in their sections.</p></div>}
      {mode==='standalone' && <p className="muted">Evidence is stored on this device. Download full JSON backups regularly to avoid losing original documents.</p>}
    </section>
  </div>;
}

function csvCell(value:unknown) {const s=String(value??'');return '"'+(/^[=+\-@]/.test(s)?"'"+s:s).replaceAll('"','""')+'"';}
function downloadCsv(name:string,rows:(string|number)[][]) {
  const csv='\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1500);
}

export function ReportsView({state,txs}: ToolProps) {
  const ledger=useMemo(()=>computeLedger(state.accounts,txs),[state.accounts,txs]);
  const issues=useMemo(()=>auditIntegrity(state,txs),[state,txs]);
  const [showAll,setShowAll]=useState(false);
  const accounts=state.accounts.map(a=>({...a,balance:ledger.accountBalances[a.id]||0}));
  const byPhase=state.phases.map(p=>({...p,actual:ledger.phaseSpend[p.id]||0})).filter(p=>p.budgetAmount||p.actual);
  const byCategory=Object.entries(ledger.categorySpend).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]));
  const months=Object.entries(ledger.monthlySpend).sort(([a],[b])=>a.localeCompare(b));
  const max=Math.max(1,...months.map(([,v])=>Math.max(0,v)));
  const totalBudget=state.project.agreedPurchasePrice+state.phases.filter(p=>p.name!=='Plot Purchase').reduce((s,p)=>s+p.budgetAmount,0);
  return <div className="stack">
    <div className="sectionIntro"><div><span className="eyebrow">LIVE ACCOUNTING REPORTS</span><h2>Financial reports</h2><p>Real ledger totals. Funding, transfers and advances are not counted as expenses until they become recognized project costs.</p></div>
      <button type="button" className="outlineAction" onClick={()=>downloadCsv('plot-to-ghar-summary.csv',[
        ['Metric','Amount'],['Project cost',ledger.projectCost],['Acquisition',ledger.acquisitionCost],['Construction',ledger.constructionCost],['Other',ledger.otherCost],
        ['Funding received',ledger.fundingReceived],['Advances outstanding',ledger.advancesOutstanding],['Loan repayments',ledger.loanRepayments],
        ...accounts.map(a=>['Account: '+a.name,a.balance]),
      ])}><ArrowDownToLine size={16}/> Export report</button></div>
    <div className="metricGrid compactMetrics">
      <div className="metricCard"><span className="metricIcon green"><Landmark size={18}/></span><small>Funding received</small><strong>{money(ledger.fundingReceived)}</strong></div>
      <div className="metricCard"><span className="metricIcon coral"><Receipt size={18}/></span><small>Recognized cost</small><strong>{money(ledger.projectCost)}</strong></div>
      <div className="metricCard"><span className="metricIcon blue"><FileCheck2 size={18}/></span><small>Available in accounts</small><strong>{money(accounts.reduce((s,a)=>s+a.balance,0))}</strong></div>
      <div className="metricCard"><span className="metricIcon amber"><TrendingUp size={18}/></span><small>Outstanding advances</small><strong>{money(ledger.advancesOutstanding)}</strong></div>
    </div>
    <section className="panel">
      <div className="sectionHead"><div><h2>Spending by month</h2><p>Net recognized costs, including refunds</p></div></div>
      {months.length ? <div className="reportGraph">
        {months.slice(-12).map(([month,value])=><div className="reportBar" key={month}>
          <div className="reportBarTrack"><div style={{height:Math.max(3,Math.max(0,value)/max*100)+'%'}} title={month+': '+money(value)}/></div>
          <small>{month.slice(5)}</small><span>{value ? money(value) : '—'}</span>
        </div>)}
      </div>:<div className="emptySection"><TrendingUp size={28}/><p>Record expenses to see monthly spending.</p></div>}
    </section>
    <div className="reportColumns">
      <section className="panel">
        <div className="sectionHead"><h2>Cost breakdown</h2><span className="viewCount">{byCategory.length} categories</span></div>
        {byCategory.length ? byCategory.map(([label,value])=><div className="reportCategory" key={label}><div className="row"><span>{label}</span><b>{money(value)}</b></div><progress max={Math.max(1,ledger.projectCost)} value={Math.max(0,value)}/></div>):<p className="muted">No recognized costs yet.</p>}
      </section>
      <section className="panel">
        <div className="sectionHead"><h2>Account reconciliation</h2><ShieldCheck size={19} color="#159b74"/></div>
        {accounts.map(a=><div className="row" key={a.id}><div><b>{a.name}</b><small>{a.type}</small></div><strong>{money(a.balance)}</strong></div>)}
        <small className="muted">These balances come from the immutable transaction ledger and configured opening balances.</small>
      </section>
    </div>
    <section className="panel">
      <div className="sectionHead"><div><h2>Phase budgets vs actual cost</h2><p>Project budgets are separate from contractual advances and loan commitments.</p></div></div>
      {byPhase.length ? byPhase.map(p=><div key={p.id} className="reportPhase">
        <div className="row"><div><b>{p.name}</b><small>{money(p.actual)} spent · {money(p.budgetAmount)} budget</small></div>
          <strong className={p.budgetAmount&&p.actual>p.budgetAmount?'negativeStock':''}>{p.budgetAmount?Math.round(p.actual/p.budgetAmount*100)+'%':'Unbudgeted'}</strong></div>
        <progress max={Math.max(1,p.budgetAmount)} value={Math.max(0,Math.min(p.actual,p.budgetAmount||0))} />
      </div>) : <p className="muted">Add phase budgets in the Journey screen.</p>}
      <small className="muted">Overall project allocation: {totalBudget?money(totalBudget):'Not set'} (agreed plot price plus phase budgets, excluding duplicate Plot Purchase phase).</small>
    </section>
    <section className="panel">
      <div className="sectionHead"><div><h2>Financial integrity</h2><p>Audit flags suspicious historical entries. Records are never automatically rewritten.</p></div>
        <span className={'integrityCount '+(issues.length?'unhealthy':'healthy')}>{issues.length?issues.length+' flags':'Checks clear'}</span></div>
      {issues.length?<>
        {(showAll?issues:issues.slice(0,8)).map((i,n)=><div key={i.transactionId+'-'+i.code+'-'+n} className="auditRow">
          <span className={i.severity==='CRITICAL'?'criticalIcon':'warningIcon'}><AlertTriangle size={17}/></span>
          <div><b>{i.code.replaceAll('_',' ')} · {i.severity}</b><small>{i.message}</small>{i.transactionId&&<code>{i.transactionId}</code>}</div>
        </div>)}
        {issues.length>8 && <button className="secondary small" type="button" onClick={()=>setShowAll(!showAll)}>{showAll?'Show fewer':'Show all '+issues.length+' findings'}</button>}
      </>:<div className="emptySection"><CheckCircle2 size={30}/><p>No problems detected by automatic checks. Still compare balances with actual bank and cash records.</p></div>}
    </section>
  </div>;
}
