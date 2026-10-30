'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ConstructionSuite, ProjectState, Transaction, FloorPlan, WorkTask } from '@/lib/types';
import { money, PageTitle } from '@/components/ui';
import { hasScheduleCycle, materialEstimate } from '@/lib/construction-calcs';
import { MaterialsView, AgreementsView, ProgressView, FinanceView, RemindersView, ReceiptView } from './ConstructionTools';

export type SuiteProps = {
  state: ProjectState;
  txs: Transaction[];
  save: (next: ProjectState) => Promise<void>;
  mode: 'standalone' | 'cloud';
  onScanned: (draft: { amount: string; date: string; payee: string; description: string; attachment?: import('@/lib/types').AttachmentRef }) => void;
};
export type UpdateSuite = (patch: Partial<ConstructionSuite>) => Promise<void>;

const tabs = [
  ['floors', '🏢 Floors'],
  ['schedule', '📅 Schedule'],
  ['materials', '🧱 Materials'],
  ['agreements', '📑 Agreements'],
  ['progress', '📸 Timeline'],
  ['finance', '📉 Finance'],
  ['reminders', '🔔 Reminders'],
  ['ocr', '🔍 Scan bill'],
] as const;

function numeric(s: string): number {
  const value = Number(s);
  return Number.isFinite(value) ? value : 0;
}
const today = () => new Date().toISOString().slice(0, 10);

export function ConstructionHub(props: SuiteProps) {
  const [tab, setTab] = useState<(typeof tabs)[number][0]>('floors');
  const suite = props.state.construction;
  async function patch(next: Partial<ConstructionSuite>) {
    await props.save({ ...props.state, construction: { ...suite, ...next } });
  }

  return <div className="stack">
    <PageTitle title="Construction Studio" description="Floors, engineering allowances, scheduling, inventory, contracts, progress and forecasting." />
    <div className="suiteTabs" role="tablist" aria-label="Construction sections">
      {tabs.map(([id, title]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'secondary selected' : 'secondary'} onClick={() => setTab(id)}>{title}</button>)}
    </div>
    {tab === 'floors' && <FloorsView state={props.state} txs={props.txs} patch={patch} />}
    {tab === 'schedule' && <ScheduleView state={props.state} patch={patch} />}
    {tab === 'materials' && <MaterialsView {...props} patch={patch} />}
    {tab === 'agreements' && <AgreementsView {...props} patch={patch} />}
    {tab === 'progress' && <ProgressView {...props} patch={patch} />}
    {tab === 'finance' && <FinanceView {...props} patch={patch} />}
    {tab === 'reminders' && <RemindersView {...props} patch={patch} />}
    {tab === 'ocr' && <ReceiptView {...props} patch={patch} />}
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
        return <FloorEditor key={floor.id} floor={floor} floors={floors} totals={totals} patch={patch} />;
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
    <section className="panel">
      <h2>Quantity estimator · preliminary only</h2>
      <MaterialEstimator />
    </section>
  </div>;
}

function FloorEditor({
  floor, floors, totals, patch,
}: {
  floor: FloorPlan;
  floors: FloorPlan[];
  totals: { linkedEstimate: number; workCount: number };
  patch: UpdateSuite;
}) {
  const [draft, setDraft] = useState<FloorPlan>(floor);
  const [error, setError] = useState('');
  useEffect(() => { setDraft(floor); }, [floor]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim() || !Number.isFinite(draft.areaSqFt) || draft.areaSqFt < 0 ||
      !Number.isFinite(draft.budgetAmount) || draft.budgetAmount < 0) {
      setError('Provide a floor name and valid area and budget.');
      return;
    }
    await patch({ floors: floors.map((f) => f.id === floor.id ? { ...draft, name: draft.name.trim() } : f) });
    setError('');
  }

  return <details className="suiteRecord">
    <summary><b>{floor.name}</b> · {money(floor.budgetAmount)} · {floor.status.replace('_',' ')} <span className="muted">✎ Edit</span></summary>
    <form className="form detailsBody" onSubmit={submit}>
      <label>Name / zone
        <input required value={draft.name} onChange={(e)=>setDraft((s)=>({...s,name:e.target.value}))}/>
      </label>
      <div className="grid3">
        <label>Built-up area (sq ft)
          <input type="number" min="0" step="any" value={draft.areaSqFt} onChange={(e)=>setDraft((s)=>({...s,areaSqFt:Number(e.target.value)}))}/>
        </label>
        <label>Budget (₹)
          <input type="number" min="0" step="0.01" value={draft.budgetAmount} onChange={(e)=>setDraft((s)=>({...s,budgetAmount:Number(e.target.value)}))}/>
        </label>
        <label>Status
          <select value={draft.status} onChange={(e)=>setDraft((s)=>({...s,status:e.target.value as FloorPlan['status']}))}>
            <option value="PLANNED">Planned</option><option value="IN_PROGRESS">In progress</option><option value="COMPLETED">Completed</option>
          </select>
        </label>
      </div>
      <label>Notes<textarea value={draft.notes||''} onChange={(e)=>setDraft((s)=>({...s,notes:e.target.value}))}/></label>
      <small className="muted">Scheduled work estimate: {money(totals.linkedEstimate)} · {totals.workCount} tasks. This is not actual spending.</small>
      {error && <span className="error">{error}</span>}
      <button className="primary" type="submit">Save this floor</button>
    </form>
  </details>;
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
  const sorted = [...tasks].sort((a,b) => a.startDate.localeCompare(b.startDate));
  const todayLocal = today();

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const amount = numeric(cost);
    if (!name.trim() || !start || !end || end < start || amount < 0) { setError('Check name, dates and estimated cost.'); return; }
    const task: WorkTask = { id: crypto.randomUUID(), name: name.trim(), phaseId: phase || undefined, floorId: floor || undefined, contractorId: contractor || undefined, startDate: start, endDate: end, estimatedCost: amount, status:'PENDING', dependsOnId: depends || undefined };
    await patch({ schedule: [...tasks, task] });
    setName(''); setCost(''); setDepends(''); setError('');
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
          <select aria-label={'Status for ' + t.name} value={t.status} onChange={(e) => updateStatus(t, e.target.value as WorkTask['status'])}>
            <option value="PENDING">Pending</option><option value="IN_PROGRESS">In progress</option><option value="BLOCKED">Blocked</option><option value="COMPLETED">Completed</option>
          </select>
          <TaskEditor task={t} state={state} patch={patch} />
        </div>;
      })}
      {error && <div className="error">{error}</div>}
    </section>
    <form className="panel form" onSubmit={add}>
      <h2>Add construction activity</h2>
      <label>Work description<input required value={name} onChange={(e)=>setName(e.target.value)} placeholder="Foundation footing shuttering" /></label>
      <div className="grid2">
        <label>Start date<input type="date" required value={start} onChange={(e)=>setStart(e.target.value)} /></label>
        <label>Expected finish<input type="date" required value={end} onChange={(e)=>setEnd(e.target.value)} /></label>
        <label>Floor / zone<select value={floor} onChange={(e)=>setFloor(e.target.value)}><option value="">Shared / all</option>{state.construction.floors.map((f)=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        <label>Construction phase<select value={phase} onChange={(e)=>setPhase(e.target.value)}><option value="">None</option>{state.phases.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>Contractor<select value={contractor} onChange={(e)=>setContractor(e.target.value)}><option value="">Not assigned</option>{state.contractors.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Depends on<select value={depends} onChange={(e)=>setDepends(e.target.value)}><option value="">None</option>{tasks.map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label>Estimated cost ₹<input type="number" min="0" value={cost} onChange={(e)=>setCost(e.target.value)} /></label>
      </div>
      <button className="primary" type="submit">Add activity</button>
    </form>
  </div>;
}

function TaskEditor({ task, state, patch }: {task: WorkTask; state: ProjectState; patch: UpdateSuite}) {
  const [draft, setDraft] = useState<WorkTask>(task);
  const [error,setError] = useState('');
  useEffect(()=>setDraft(task),[task]);
  const tasks = state.construction.schedule;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim() || !draft.startDate || !draft.endDate || draft.endDate < draft.startDate ||
        !Number.isFinite(draft.estimatedCost) || draft.estimatedCost < 0) {
      setError('Check task name, scheduled dates and cost.'); return;
    }
    if (hasScheduleCycle(tasks, task.id, draft.dependsOnId)) {
      setError('Circular prerequisites are not allowed.'); return;
    }
    if ((draft.status === 'COMPLETED' || draft.status === 'IN_PROGRESS') && draft.dependsOnId) {
      const before = tasks.find((x)=>x.id===draft.dependsOnId);
      if (before && before.status !== 'COMPLETED') {setError('Complete prerequisite first: '+before.name);return;}
    }
    await patch({schedule:tasks.map((x)=>x.id===task.id?{...draft,name:draft.name.trim()}:x)});
    setError('');
  }
  return <details className="editDetails">
    <summary>✎ Edit work plan / dependencies</summary>
    <form className="form detailsBody" onSubmit={save}>
      <label>Work name<input required value={draft.name} onChange={(e)=>setDraft((s)=>({...s,name:e.target.value}))}/></label>
      <div className="grid2">
        <label>Start<input type="date" required value={draft.startDate} onChange={(e)=>setDraft((s)=>({...s,startDate:e.target.value}))}/></label>
        <label>Finish<input type="date" required value={draft.endDate} onChange={(e)=>setDraft((s)=>({...s,endDate:e.target.value}))}/></label>
        <label>Floor<select value={draft.floorId||''} onChange={(e)=>setDraft((s)=>({...s,floorId:e.target.value||undefined}))}>
          <option value="">Shared site</option>{state.construction.floors.map((f)=><option key={f.id} value={f.id}>{f.name}</option>)}
        </select></label>
        <label>Phase<select value={draft.phaseId||''} onChange={(e)=>setDraft((s)=>({...s,phaseId:e.target.value||undefined}))}>
          <option value="">None</option>{state.phases.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select></label>
        <label>Contractor<select value={draft.contractorId||''} onChange={(e)=>setDraft((s)=>({...s,contractorId:e.target.value||undefined}))}>
          <option value="">Not assigned</option>{state.contractors.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
        <label>Prerequisite<select value={draft.dependsOnId||''} onChange={(e)=>setDraft((s)=>({...s,dependsOnId:e.target.value||undefined}))}>
          <option value="">None</option>{tasks.filter((t)=>t.id!==task.id).map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}
        </select></label>
        <label>Work estimate (₹)<input type="number" min="0" step="0.01" value={draft.estimatedCost} onChange={(e)=>setDraft((s)=>({...s,estimatedCost:Number(e.target.value)}))}/></label>
        <label>Status<select value={draft.status} onChange={(e)=>setDraft((s)=>({...s,status:e.target.value as WorkTask['status']}))}>
          <option value="PENDING">Pending</option><option value="IN_PROGRESS">In progress</option><option value="BLOCKED">Blocked</option><option value="COMPLETED">Completed</option>
        </select></label>
      </div>
      <label>Notes<textarea value={draft.notes||''} onChange={(e)=>setDraft((s)=>({...s,notes:e.target.value}))}/></label>
      {error&&<div className="error">{error}</div>}
      <button type="submit" className="primary">Save activity changes</button>
    </form>
  </details>;
}
