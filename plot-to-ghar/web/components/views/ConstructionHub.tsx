'use client';

import { useEffect, useMemo, useState } from 'react';
import { Building2, CalendarDays, Calculator, ClipboardList, FileText, FolderOpen, HardHat, Landmark, Package, ScanLine, Bell, Camera, BarChart3, ChevronLeft, Pencil } from 'lucide-react';
import type { ConstructionSuite, ProjectState, Transaction, FloorPlan, WorkTask } from '@/lib/types';
import { money, PageTitle } from '@/components/ui';
import { hasScheduleCycle, materialEstimate } from '@/lib/construction-calcs';
import { MaterialsView, AgreementsView, ProgressView, FinanceView, RemindersView, ReceiptView } from './ConstructionTools';
import { DocumentsView, ReportsView } from './ConstructionInsights';

export type SuiteProps = {
  state: ProjectState;
  txs: Transaction[];
  save: (next: ProjectState) => Promise<void>;
  mode: 'standalone' | 'cloud';
  onScanned: (draft: { amount: string; date: string; payee: string; description: string; attachment?: import('@/lib/types').AttachmentRef }) => void;
};
export type UpdateSuite = (patch: Partial<ConstructionSuite>) => Promise<void>;

export const tabs = [
  {id:'floors',title:'Floors',Icon:Building2,description:'Plans and budgets'},
  {id:'estimate',title:'Estimator',Icon:Calculator,description:'Material quantities'},
  {id:'schedule',title:'Schedule',Icon:CalendarDays,description:'Milestones & tasks'},
  {id:'materials',title:'Materials',Icon:Package,description:'Inventory & stock'},
  {id:'agreements',title:'Contracts',Icon:HardHat,description:'Contractor agreements'},
  {id:'progress',title:'Progress',Icon:Camera,description:'Photo timeline'},
  {id:'finance',title:'Finance',Icon:Landmark,description:'Loans and cash flow'},
  {id:'documents',title:'Documents',Icon:FolderOpen,description:'Project evidence'},
  {id:'reports',title:'Reports',Icon:BarChart3,description:'Real spending & audit'},
  {id:'reminders',title:'Reminders',Icon:Bell,description:'Payments and work'},
  {id:'ocr',title:'Scan bill',Icon:ScanLine,description:'OCR expense drafts'},
] as const;
export type BuildTab = (typeof tabs)[number]['id'];

function numeric(s: string): number {
  const value = Number(s);
  return Number.isFinite(value) ? value : 0;
}
const today = () => new Date().toISOString().slice(0, 10);

export function ConstructionHub(props: SuiteProps & { initialTab?: BuildTab }) {
  const [tab, setTab] = useState<BuildTab>(props.initialTab || 'floors');
  useEffect(() => { if (props.initialTab) setTab(props.initialTab); }, [props.initialTab]);
  const suite = props.state.construction;
  async function patch(next: Partial<ConstructionSuite>) {
    await props.save({ ...props.state, construction: { ...suite, ...next } });
  }

  return <div className="stack">
    <div className="sectionIntro buildIntro">
      <div><span className="eyebrow">PLAN • BUILD • TRACK</span><h1>Construction Studio</h1><p>Every stage of your project, from plans to payments and evidence.</p></div>
      <span className="viewCount"><Building2 size={18}/> {props.state.construction.schedule.length} tasks</span>
    </div>
    <div className="suiteTabs" role="tablist" aria-label="Construction sections">
      {tabs.map(({id,title,Icon}) => <button key={id} type="button" role="tab" aria-selected={tab === id}
        className={tab === id ? 'suiteTab selected' : 'suiteTab'} onClick={() => setTab(id)}>
        <Icon size={17}/><span>{title}</span></button>)}
    </div>
    <div className="tabSubtitle"><span>{tabs.find(t => t.id === tab)?.description}</span></div>
    {tab === 'floors' && <FloorsView state={props.state} txs={props.txs} patch={patch} />}
    {tab === 'estimate' && <section className="panel estimatePanel"><div className="sectionHead"><div><h2>Material quantity calculator</h2><p>Use verified measurements to plan purchase allowances.</p></div><Calculator size={23} color="#149c76"/></div><MaterialEstimator/></section>}
    {tab === 'schedule' && <ScheduleView state={props.state} patch={patch} />}
    {tab === 'materials' && <MaterialsView {...props} patch={patch} />}
    {tab === 'agreements' && <AgreementsView {...props} patch={patch} />}
    {tab === 'progress' && <ProgressView {...props} patch={patch} />}
    {tab === 'finance' && <FinanceView {...props} patch={patch} />}
    {tab === 'reminders' && <RemindersView {...props} patch={patch} />}
    {tab === 'ocr' && <ReceiptView {...props} patch={patch} />}
    {tab === 'documents' && <DocumentsView {...props} patch={patch} />}
    {tab === 'reports' && <ReportsView {...props} patch={patch} />}
  </div>;
}

function FloorsView({ state, txs, patch }: { state: ProjectState; txs: Transaction[]; patch: UpdateSuite }) {
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [budget, setBudget] = useState('');
  const [error, setError] = useState('');
  const floors = state.construction.floors;
  const estimated = floors.reduce((s, f) => s + f.budgetAmount, 0);

  function costForFloor(floor: FloorPlan) {
    // Existing ledger has phase references, not floor references. Only report explicitly linked
    // stock and scheduled work. Never infer expenses from unrelated phases.
    const linkedWork = state.construction.schedule.filter((w) => w.floorId === floor.id);
    const linkedEstimate = linkedWork.reduce((s, w) => s + w.estimatedCost, 0);
    return { linkedEstimate, workCount: linkedWork.length };
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const a = numeric(area), b = numeric(budget);
    if (!name.trim() || a < 0 || b < 0) { setError('Enter a floor name and non-negative amounts.'); return; }
    await patch({ floors: [...floors, { id: crypto.randomUUID(), name: name.trim(), areaSqFt: a, budgetAmount: b, status: 'PLANNED' }] });
    setName(''); setArea(''); setBudget(''); setError('');
  }
  async function change(id: string, values: Partial<FloorPlan>) {
    await patch({ floors: floors.map((f) => f.id === id ? { ...f, ...values } : f) });
  }
  return <div className="stack">
    <section className="panel">
      <h2>Floor-wise construction plan</h2>
      <p className="muted">Your 45 × 24 ft plot is approximately 1,080 sq ft. Enter each floor’s actual built-up area separately; do not assume it equals plot area.</p>
      <div className="row"><span>Total floor budget</span><b>{money(estimated)}</b></div>
      {floors.map((floor) => {
        const totals = costForFloor(floor);
        const tasks = state.construction.schedule.filter(t=>t.floorId===floor.id);
        const completion = tasks.length ? Math.round(tasks.filter(t=>t.status==='COMPLETED').length / tasks.length * 100) : null;
        return <div className="suiteRecord floorPlanCard" key={floor.id}>
          <div className="floorCardHeader"><span className="floorPlanIllustration"><Building2 size={41} strokeWidth={1.35}/></span><div><b>{floor.name}</b>
            <small>{floor.areaSqFt ? floor.areaSqFt.toLocaleString('en-IN')+' sq ft built-up' : 'Area not set'} · {tasks.length} planned tasks</small></div><span className="status">{floor.status.replace('_',' ')}</span></div>
          {completion !== null ? <div className="floorProgress"><progress max={100} value={completion}/><small>{completion}% of linked work finished</small></div>:null}
          <label>Floor / zone name<input defaultValue={floor.name} key={floor.id+'-name-'+floor.name} maxLength={100} onBlur={e=>{const name=e.target.value.trim(); if(name && name!==floor.name)change(floor.id,{name});}} /></label>
          <div className="grid3">
            <label>Built-up area (sq ft)
              <input type="number" min="0" defaultValue={floor.areaSqFt} key={floor.id + '-area-' + floor.areaSqFt}
                onBlur={(e) => { const n = numeric(e.target.value); if (n >= 0 && n !== floor.areaSqFt) change(floor.id, { areaSqFt: n }); }} />
            </label>
            <label>Budget (₹)
              <input type="number" min="0" defaultValue={floor.budgetAmount} key={floor.id + '-budget-' + floor.budgetAmount}
                onBlur={(e) => { const n = numeric(e.target.value); if (n >= 0 && n !== floor.budgetAmount) change(floor.id, { budgetAmount: n }); }} />
            </label>
            <label>Status
              <select value={floor.status} onChange={(e) => change(floor.id, { status: e.target.value as FloorPlan['status'] })}>
                <option value="PLANNED">Planned</option><option value="IN_PROGRESS">In progress</option><option value="COMPLETED">Completed</option>
              </select>
            </label>
          </div>
          <label>Planning notes<textarea defaultValue={floor.notes || ''} key={floor.id+'-notes-'+floor.notes} placeholder="Shops, parking spaces, staircase, rooms…" onBlur={e=>{if(e.target.value!==(floor.notes || ''))change(floor.id,{notes:e.target.value});}} /></label>
          <small className="muted">Scheduled work estimate: {money(totals.linkedEstimate)} · {totals.workCount} tasks. Not actual ledger spending. Name, budget and area save when you leave the field.</small>
        </div>;
      })}
      <p className="muted">Actual project costs remain in Ledger; floor budgets and task estimates are forecasts, not additional expenses.</p>
    </section>
    <form className="panel form" onSubmit={add}>
      <h2>Add floor / independent construction zone</h2>
      <div className="grid3">
        <label>Name<input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Parking / Shop 1" /></label>
        <label>Area sq ft<input type="number" min="0" value={area} onChange={(e) => setArea(e.target.value)} /></label>
        <label>Budget ₹<input type="number" min="0" value={budget} onChange={(e) => setBudget(e.target.value)} /></label>
      </div>
      {error && <p className="error">{error}</p>}
      <button className="primary" type="submit">Add zone</button>
    </form>
  </div>;
}

export function MaterialEstimator() {
  const [kind, setKind] = useState<'concrete'|'brickwork'>('concrete');
  const [length, setLength] = useState('5');
  const [width, setWidth] = useState('3');
  const [depth, setDepth] = useState('0.15');
  const result = useMemo(() => materialEstimate(kind, numeric(length), numeric(width), numeric(depth)), [kind, length, width, depth]);
  return <div className="form">
    <label>Work type<select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
      <option value="concrete">Nominal M20 (1:1.5:3) concrete allowance</option>
      <option value="brickwork">Brickwork volume</option>
    </select></label>
    <div className="grid3">
      <label>Length (m)<input type="number" step="any" min="0.001" value={length} onChange={(e) => setLength(e.target.value)} /></label>
      <label>Width (m)<input type="number" step="any" min="0.001" value={width} onChange={(e) => setWidth(e.target.value)} /></label>
      <label>Depth / height (m)<input type="number" step="any" min="0.001" value={depth} onChange={(e) => setDepth(e.target.value)} /></label>
    </div>
    <div className="cards">
      <div className="card"><small>Volume</small><strong>{result.volume.toFixed(2)} m³</strong></div>
      {kind === 'concrete' ? <>
        <div className="card"><small>Cement (50 kg bags)</small><strong>{result.cementBags}</strong></div>
        <div className="card"><small>Sand</small><strong>{result.sandM3.toFixed(2)} m³</strong></div>
        <div className="card"><small>Aggregate</small><strong>{result.aggregateM3.toFixed(2)} m³</strong></div>
        <div className="card"><small>Indicative steel range</small><strong>{result.steelKgLow}–{result.steelKgHigh} kg</strong></div>
      </> : <div className="card"><small>Approximate bricks</small><strong>{result.bricks.toLocaleString('en-IN')}</strong></div>}
    </div>
    <p className="warning">Not an engineering design or bill of quantities. Mix, reinforcement, wall thickness, openings, wastage and approved drawings change requirements. Consult your structural engineer before purchasing or casting.</p>
  </div>;
}

function ScheduleView({ state, patch }: { state: ProjectState; patch: UpdateSuite }) {
  const tasks = state.construction.schedule;
  const [name, setName] = useState('');
  const [phase, setPhase] = useState('');
  const [floor, setFloor] = useState('');
  const [contractor, setContractor] = useState('');
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState(today());
  const [depends, setDepends] = useState('');
  const [cost, setCost] = useState('');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const sorted = [...tasks].sort((a,b) => a.startDate.localeCompare(b.startDate));
  const todayLocal = today();

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const amount = numeric(cost);
    if (!name.trim() || !start || !end || end < start || amount < 0) { setError('Check name, dates and estimated cost.'); return; }
    const id = editingId || crypto.randomUUID();
    if (hasScheduleCycle(tasks, id, depends || undefined)) { setError('This would create a circular task dependency.'); return; }
    const old = tasks.find(t => t.id === id);
    const task: WorkTask = { id, name: name.trim(), phaseId: phase || undefined, floorId: floor || undefined, contractorId: contractor || undefined, startDate: start, endDate: end, estimatedCost: amount, status: old?.status || 'PENDING', dependsOnId: depends || undefined };
    await patch({ schedule: editingId ? tasks.map(t=>t.id===editingId?task:t) : [...tasks,task] });
    setName(''); setCost(''); setDepends(''); setError(''); setEditingId(null);
  }

  function beginEdit(t:WorkTask) {
    setEditingId(t.id);setName(t.name);setPhase(t.phaseId||'');setFloor(t.floorId||'');
    setContractor(t.contractorId||'');setStart(t.startDate);setEnd(t.endDate);
    setDepends(t.dependsOnId||'');setCost(String(t.estimatedCost));setError('');
    document.getElementById('ptg-task-form')?.scrollIntoView({behavior:'smooth',block:'start'});
  }

  async function updateStatus(t: WorkTask, status: WorkTask['status']) {
    if (status === 'IN_PROGRESS' || status === 'COMPLETED') {
      const dependency = tasks.find((x) => x.id === t.dependsOnId);
      if (dependency && dependency.status !== 'COMPLETED') {
        setError('Complete the prerequisite task first: ' + dependency.name);
        return;
      }
    }
    setError('');
    await patch({ schedule: tasks.map((x) => x.id === t.id ? { ...x, status } : x) });
  }

  return <div className="stack">
    <section className="panel">
      <h2>Construction work schedule</h2>
      <p className="muted">Tasks have start/end dates, floor, phase, contractor and optional prerequisite. Dates are planning targets, not payment entries.</p>
      {sorted.length === 0 && <p className="muted">No tasks yet. Start with design approvals or site preparation.</p>}
      {sorted.map((t) => {
        const dependency = tasks.find((x) => x.id === t.dependsOnId);
        const blocked = Boolean(dependency && dependency.status !== 'COMPLETED');
        return <div className="suiteRecord" key={t.id}>
          <div className="sectionHead"><b>{t.name}</b><span className={'status ' + t.status.toLowerCase()}>{t.status.replace('_',' ')}</span></div>
          <small className="muted">{t.startDate} → {t.endDate} · {state.construction.floors.find((f)=>f.id===t.floorId)?.name || 'Shared'} · {money(t.estimatedCost)}</small>
          {dependency && <small className="muted">Prerequisite: {dependency.name} {blocked ? '(not complete)' : '✓'}</small>}
          {t.endDate < todayLocal && t.status !== 'COMPLETED' && <small className="warning">Overdue</small>}
          <div className="taskActions"><button type="button" className="secondary small" onClick={()=>beginEdit(t)}><Pencil size={14}/> Edit task</button></div>
          <select aria-label={'Status for ' + t.name} value={t.status} onChange={(e) => updateStatus(t, e.target.value as WorkTask['status'])}>
            <option value="PENDING">Pending</option><option value="IN_PROGRESS">In progress</option><option value="BLOCKED">Blocked</option><option value="COMPLETED">Completed</option>
          </select>
        </div>;
      })}
      {error && <div className="error">{error}</div>}
    </section>
    <form id="ptg-task-form" className="panel form" onSubmit={add}>
      <h2>{editingId ? 'Edit construction activity' : 'Add construction activity'}</h2>
      <label>Work description<input required value={name} onChange={(e)=>setName(e.target.value)} placeholder="Foundation footing shuttering" /></label>
      <div className="grid2">
        <label>Start date<input type="date" required value={start} onChange={(e)=>setStart(e.target.value)} /></label>
        <label>Expected finish<input type="date" required value={end} onChange={(e)=>setEnd(e.target.value)} /></label>
        <label>Floor / zone<select value={floor} onChange={(e)=>setFloor(e.target.value)}><option value="">Shared / all</option>{state.construction.floors.map((f)=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        <label>Construction phase<select value={phase} onChange={(e)=>setPhase(e.target.value)}><option value="">None</option>{state.phases.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>Contractor<select value={contractor} onChange={(e)=>setContractor(e.target.value)}><option value="">Not assigned</option>{state.contractors.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Depends on<select value={depends} onChange={(e)=>setDepends(e.target.value)}><option value="">None</option>{tasks.filter(t=>t.id!==editingId).map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label>Estimated cost ₹<input type="number" min="0" value={cost} onChange={(e)=>setCost(e.target.value)} /></label>
      </div>
      <div className="formActions"><button className="primary" type="submit">{editingId ? 'Save activity changes' : 'Add activity'}</button>{editingId && <button type="button" className="secondary" onClick={()=>{setEditingId(null);setName('');setCost('');setDepends('');}}>Cancel edit</button>}</div>
    </form>
  </div>;
}
