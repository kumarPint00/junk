'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, Bell, BookOpen, Building2, CalendarDays,
  Camera, CheckCircle2, ChevronRight, CircleAlert, ClipboardList, FileCheck2,
  FileText, HardHat, House, Landmark, Layers3, Package, Pencil, Plus,
  Receipt, ScanLine, ShieldCheck, TrendingUp, Wallet, Wrench
} from 'lucide-react';
import { computeLedger } from '@/lib/ledger';
import { auditIntegrity } from '@/lib/integrity-audit';
import { dueReminders } from '@/lib/construction-calcs';
import type { ProjectState, Transaction } from '@/lib/types';
import { money } from '@/components/ui';

type Section = 'journey' | 'build' | 'add' | 'ledger' | 'more';
type HomeProps = {
  state: ProjectState;
  txs: Transaction[];
  save: (next: ProjectState) => Promise<void>;
  openSection: (section: Section, feature?: string) => void;
};

function sixMonths() {
  const now = new Date();
  return Array.from({ length: 6 }, (_, index) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    return { key: [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0')].join('-'), label: d.toLocaleString('en-IN', { month: 'short' }) };
  });
}

function statusLabel(v: string) {
  return v.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
}

export function Home({ state, txs, save, openSection }: HomeProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => structuredClone(state));
  const [error, setError] = useState('');
  useEffect(() => { if (!editing) setDraft(structuredClone(state)); }, [state, editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.project.name.trim() || !Number.isFinite(draft.project.agreedPurchasePrice) || draft.project.agreedPurchasePrice < 0 || draft.project.plotAreaSqYard < 0) {
      setError('Check the project name, plot area and purchase price.'); return;
    }
    try { await save(draft); setEditing(false); setError(''); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to save project changes'); }
  }

  const summary = useMemo(() => computeLedger(state.accounts, txs), [state.accounts, txs]);
  const issues = useMemo(() => auditIntegrity(state, txs), [state, txs]);
  const available = Object.values(summary.accountBalances).reduce((a, b) => a + b, 0);
  const committed = state.fundingSources.reduce((a, f) => a + Number(f.committedAmount || 0), 0);
  const phaseBudget = state.phases.filter(p => p.name !== 'Plot Purchase').reduce((a, p) => a + Number(p.budgetAmount || 0), 0);
  const totalBudget = Number(state.project.agreedPurchasePrice || 0) + phaseBudget;
  const spentRatio = totalBudget > 0 ? Math.min(100, Math.max(0, summary.projectCost / totalBudget * 100)) : 0;
  const completedMilestones = state.milestones.filter(m => m.status === 'COMPLETED').length;
  const milestonesCount = state.milestones.length;
  const nextMilestone = [...state.milestones].sort((a, b) => a.sequence - b.sequence).find(m => m.status !== 'COMPLETED' && m.status !== 'SKIPPED');

  const months = useMemo(sixMonths, []);
  const monthlyData = months.map(({ key, label }) => {
    const expense = summary.monthlySpend[key] || 0;
    const funding = txs
      .filter(t => ['FUNDING_IN', 'DIRECT_FUNDED_EXPENSE'].includes(t.type) && t.transactionDate.startsWith(key))
      .reduce((sum, t) => sum + t.amount, 0);
    return { key, label, expense: Math.max(0, expense), funding };
  });
  const chartMax = Math.max(1, ...monthlyData.flatMap(x => [x.expense, x.funding]));
  const hasChartData = monthlyData.some(x => x.expense > 0 || x.funding > 0);

  const upcoming = [...state.construction.reminders]
    .filter(r => !r.completed)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 3);
  const due = dueReminders(state.construction.reminders, new Date()).filter(r => !r.completed);
  const recent = [...txs].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate)).slice(0, 4);
  const activeSchedules = state.construction.schedule.filter(t => t.status === 'IN_PROGRESS').length;
  const totalItems = state.construction.stockItems.length;
  const floorCompletion = (id: string) => {
    const tasks = state.construction.schedule.filter(t => t.floorId === id);
    return tasks.length ? Math.round(tasks.filter(t => t.status === 'COMPLETED').length / tasks.length * 100) : null;
  };

  const menu = [
    { label: 'Floor plans', desc: 'Budgets and areas', Icon: Layers3, tint: 'mint', section: 'build', feature: 'floors', detail: state.construction.floors.length + ' zones' },
    { label: 'Materials', desc: 'Estimate & inventory', Icon: Package, tint: 'orange', section: 'build', feature: 'materials', detail: totalItems + ' items' },
    { label: 'Schedule', desc: 'Plan and track tasks', Icon: CalendarDays, tint: 'violet', section: 'build', feature: 'schedule', detail: activeSchedules + ' active' },
    { label: 'Expenses', desc: 'Bills and payments', Icon: Receipt, tint: 'coral', section: 'add', detail: 'New entry' },
    { label: 'Contractors', desc: 'Contracts & advances', Icon: HardHat, tint: 'amber', section: 'build', feature: 'agreements', detail: state.construction.agreements.length + ' contracts' },
    { label: 'Loans', desc: 'EMI and cash flow', Icon: Landmark, tint: 'blue', section: 'build', feature: 'finance', detail: state.loans.length + ' facilities' },
    { label: 'Documents', desc: 'Photos, bills, proofs', Icon: FileText, tint: 'indigo', section: 'build', feature: 'documents', detail: 'Evidence library' },
    { label: 'Reports', desc: 'Spending and budgets', Icon: TrendingUp, tint: 'teal', section: 'build', feature: 'reports', detail: 'View insights' },
    { label: 'Progress', desc: 'Site photo diary', Icon: Camera, tint: 'rose', section: 'build', feature: 'progress', detail: state.construction.progress.length + ' updates' },
    { label: 'Reminders', desc: 'Due dates and alerts', Icon: Bell, tint: 'yellow', section: 'build', feature: 'reminders', detail: due.length + ' due' },
    { label: 'Receipt scanner', desc: 'Read bills with OCR', Icon: ScanLine, tint: 'sky', section: 'build', feature: 'ocr', detail: 'Review before save' },
    { label: 'Property journey', desc: 'Registry to finishing', Icon: BookOpen, tint: 'slate', section: 'journey', detail: completedMilestones + '/' + milestonesCount + ' steps' },
  ] as const;

  return <div className="stack dashboardPage">
    <div className="dashboardIntro">
      <div>
        <span className="eyebrow">YOUR CONSTRUCTION WORKSPACE</span>
        <h1>Good to see you <span className="wave">✦</span></h1>
        <p>Keep every rupee, material and milestone in one place.</p>
      </div>
      <button type="button" className="outlineAction" onClick={() => { setDraft(structuredClone(state)); setEditing(!editing); }}>
        <Pencil size={16} /> {editing ? 'Close editor' : 'Edit project'}
      </button>
    </div>

    {editing && <form className="panel form dashboardEdit" onSubmit={submit}>
      <div className="sectionHead"><div><h2>Edit project profile</h2><p>Changing the profile will not change ledger balances.</p></div></div>
      <div className="grid2">
        <label>Project name<input required value={draft.project.name} onChange={e => setDraft({ ...draft, project: { ...draft.project, name: e.target.value } })} /></label>
        <label>Project status<select value={draft.project.status} onChange={e => setDraft({ ...draft, project: { ...draft.project, status: e.target.value } })}>
          <option value="REGISTRY_PENDING">Registry pending</option><option value="REGISTERED">Registered</option><option value="POSSESSION">Possession</option><option value="CONSTRUCTION">Construction</option><option value="COMPLETED">Completed</option>
        </select></label>
        <label>Agreed price (₹)<input type="number" min="0" value={draft.project.agreedPurchasePrice} onChange={e => setDraft({ ...draft, project: { ...draft.project, agreedPurchasePrice: Number(e.target.value) } })} /></label>
        <label>Plot area (sq yd / gaj)<input type="number" min="0" step="any" value={draft.project.plotAreaSqYard} onChange={e => setDraft({ ...draft, project: { ...draft.project, plotAreaSqYard: Number(e.target.value) } })} /></label>
        <label>Registry target date<input type="date" value={draft.project.registryTargetDate || ''} onChange={e => setDraft({ ...draft, project: { ...draft.project, registryTargetDate: e.target.value } })} /></label>
        <label>Owner<input value={draft.project.ownerName} onChange={e => setDraft({ ...draft, project: { ...draft.project, ownerName: e.target.value } })} /></label>
      </div>
      <label>Property address<textarea value={draft.project.propertyAddress} onChange={e => setDraft({ ...draft, project: { ...draft.project, propertyAddress: e.target.value } })} /></label>
      {error && <div className="error" role="alert">{error}</div>}
      <div className="formActions"><button className="primary" type="submit">Save project</button><button className="secondary" type="button" onClick={() => setEditing(false)}>Cancel</button></div>
    </form>}

    <section className="dashboardHero">
      <div className="dashboardHeroText">
        <span className="heroEyebrow"><House size={15} /> PROPERTY & CONSTRUCTION</span>
        <h2>{state.project.name}</h2>
        <p>{state.project.propertyAddress || 'Your plot, from registry to the final finishing touch.'}</p>
        <div className="heroMeta">
          <span><ShieldCheck size={15} /> {statusLabel(state.project.status)}</span>
          <span><Building2 size={15} /> {state.project.plotAreaSqYard ? state.project.plotAreaSqYard.toLocaleString('en-IN') + ' sq yd' : 'Plot area not set'}</span>
        </div>
        <div className="heroActions">
          <button className="heroActionPrimary" type="button" onClick={() => openSection('add')}><Plus size={17} /> Record transaction</button>
          <button className="heroActionSecondary" type="button" onClick={() => openSection('journey')}>View journey <ArrowRight size={16} /></button>
        </div>
      </div>
      <div className="heroIllustration" aria-hidden="true">
        <svg viewBox="0 0 320 240" role="presentation">
          <ellipse cx="164" cy="220" rx="134" ry="12" fill="#0b6f56" opacity=".17"/>
          <path d="M78 99L163 33L252 103V206H78Z" fill="#f4f8f7"/>
          <path d="M64 105L163 26L265 105" fill="none" stroke="#60dfb6" strokeWidth="19" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M94 111H235V204H94Z" fill="#e0f1e9"/>
          <rect x="147" y="136" width="47" height="68" rx="5" fill="#12463f"/>
          <rect x="105" y="129" width="31" height="33" rx="5" fill="#32aa83"/>
          <path d="M120 130V162M105 145H136" stroke="#eefbf7" strokeWidth="4"/>
          <rect x="205" y="129" width="31" height="33" rx="5" fill="#32aa83"/>
          <path d="M220 130V162M205 145H236" stroke="#eefbf7" strokeWidth="4"/>
          <path d="M251 52V22H288M252 35H304M288 36V88" fill="none" stroke="#a2eed5" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M288 88q0 13-13 13" fill="none" stroke="#a2eed5" strokeWidth="5"/>
          <path d="M54 205H275" stroke="#2ed59d" strokeWidth="10" strokeLinecap="round"/>
          <circle cx="62" cy="167" r="30" fill="#35c596"/><circle cx="43" cy="179" r="21" fill="#2bb784"/>
          <path d="M62 187V218" stroke="#a1e8cc" strokeWidth="7"/>
        </svg>
      </div>
    </section>

    <section className="metricGrid" aria-label="Project financial summary">
      <div className="metricCard"><div className="metricHead"><span className="metricIcon green"><Wallet size={19} /></span><ArrowUpRight size={17} className="metricArrow" /></div><small>Available cash</small><strong>{money(available)}</strong><span className="metricHint">Tracked account balances</span></div>
      <div className="metricCard"><div className="metricHead"><span className="metricIcon blue"><Landmark size={19} /></span><ArrowDownRight size={17} className="metricArrow" /></div><small>Funding received</small><strong>{money(summary.fundingReceived)}</strong><span className="metricHint">Actual inflows + direct funding</span></div>
      <div className="metricCard"><div className="metricHead"><span className="metricIcon coral"><Receipt size={19} /></span><TrendingUp size={17} className="metricArrow" /></div><small>Project spending</small><strong>{money(summary.projectCost)}</strong><span className="metricHint">Recognized costs, net refunds</span></div>
      <div className="metricCard"><div className="metricHead"><span className="metricIcon violet"><Layers3 size={19} /></span><ChevronRight size={17} className="metricArrow" /></div><small>Budget remaining</small><strong>{totalBudget ? money(totalBudget - summary.projectCost) : 'Not set'}</strong><span className="metricHint">Against plot + phase budget</span></div>
    </section>

    <section className="moduleSection">
      <div className="dashSectionTitle"><div><h2>Manage your project</h2><p>Everything you need, organized by workstream.</p></div></div>
      <div className="moduleGrid">
        {menu.map(({ label, desc, Icon, tint, section, feature, detail }) => (
          <button key={label} type="button" className="moduleTile" onClick={() => openSection(section, 'feature' in {feature} ? feature : undefined)}>
            <span className={'moduleIcon ' + tint}><Icon size={23} strokeWidth={2} /></span>
            <b>{label}</b>
            <small>{desc}</small>
            <span className="moduleDetail">{detail} <ChevronRight size={14} /></span>
          </button>
        ))}
      </div>
    </section>

    <div className="dashboardColumns">
      <section className="panel graphPanel">
        <div className="sectionHead"><div><h2>Financial overview</h2><p>Actual funding versus recognized costs · last 6 months</p></div>
          <button className="textLink" type="button" onClick={() => openSection('build', 'reports')}>Reports <ArrowRight size={15} /></button>
        </div>
        {hasChartData ? <div className="chartBlock" role="img" aria-label="Six-month comparison of monthly funding and recognized project costs">
          <div className="chartGridLines"><span>{money(chartMax)}</span><span>{money(chartMax / 2)}</span><span>₹0</span></div>
          <div className="chartColumns">
            {monthlyData.map(m => <div className="chartColumn" key={m.key}>
              <div className="chartBarPair">
                <div className="barFunding" style={{ height: Math.max(2, m.funding / chartMax * 100) + '%' }} title={m.label + ' funding: ' + money(m.funding)} />
                <div className="barSpending" style={{ height: Math.max(2, m.expense / chartMax * 100) + '%' }} title={m.label + ' cost: ' + money(m.expense)} />
              </div><span>{m.label}</span>
            </div>)}
          </div>
        </div> : <div className="emptyChart"><TrendingUp size={29} /><b>Your chart will appear here</b><p>Record funding and expenses to compare your monthly cash movement.</p></div>}
        <div className="chartLegend"><span><i className="legendFunding" /> Funding</span><span><i className="legendSpending" /> Project costs</span></div>
      </section>

      <section className="panel overviewPanel">
        <div className="sectionHead"><div><h2>Project progress</h2><p>Milestones and construction planning</p></div>
          <button className="textLink" type="button" onClick={() => openSection('journey')}>Journey <ArrowRight size={15} /></button>
        </div>
        <div className="progressOverview">
          <div className="progressRing" style={{ '--value': (milestonesCount ? (completedMilestones / milestonesCount) * 100 : 0) + '%' } as React.CSSProperties}>
            <div><strong>{milestonesCount ? Math.round(completedMilestones / milestonesCount * 100) : 0}%</strong><small>milestones</small></div>
          </div>
          <div className="progressSummary"><strong>{completedMilestones} of {milestonesCount}</strong><span>Milestones complete</span><small>Next: {nextMilestone?.name || 'All milestones completed'}</small></div>
        </div>
        <div className="budgetStrip"><div className="row"><span>Budget utilization</span><strong>{totalBudget ? Math.round(spentRatio) + '%' : 'Set budget'}</strong></div><progress max={100} value={spentRatio} /><small>{money(summary.projectCost)} spent {totalBudget ? 'of ' + money(totalBudget) : '· no complete budget yet'}</small></div>
        <div className="overviewStats"><span><CheckCircle2 size={16} /> {state.construction.schedule.filter(t => t.status === 'COMPLETED').length} tasks complete</span><span><Wrench size={16} /> {activeSchedules} ongoing</span></div>
      </section>
    </div>

    <section className="panel floorPreviewPanel">
      <div className="sectionHead"><div><h2>Floor-wise planning</h2><p>Track each floor separately, just like the construction plan.</p></div><button className="textLink" type="button" onClick={() => openSection('build', 'floors')}>Manage floors <ArrowRight size={15} /></button></div>
      <div className="floorPreviewGrid">
        {state.construction.floors.map((floor, i) => {
          const progress = floorCompletion(floor.id);
          return <button key={floor.id} className="floorPreview" type="button" onClick={() => openSection('build', 'floors')}>
            <span className={'floorMiniArt floorArt' + (i % 3)} aria-hidden="true"><Building2 size={49} strokeWidth={1.3} /></span>
            <span className="floorPreviewText"><b>{floor.name}</b><small>{floor.areaSqFt ? floor.areaSqFt.toLocaleString('en-IN') + ' sq ft' : 'Area not entered'}</small><span>Budget: {floor.budgetAmount ? money(floor.budgetAmount) : 'Not set'}</span>
              {progress !== null ? <><progress max={100} value={progress} /><small>{progress}% of linked tasks complete</small></> : <small>No scheduled tasks linked yet</small>}
            </span>
            <ChevronRight size={18} className="floorChevron" />
          </button>;
        })}
      </div>
    </section>

    <div className="dashboardColumns">
      <section className="panel">
        <div className="sectionHead"><div><h2>Upcoming reminders</h2><p>Site work, payments and deliveries</p></div><button className="textLink" type="button" onClick={() => openSection('build', 'reminders')}>View all <ArrowRight size={15} /></button></div>
        {upcoming.length ? upcoming.map(reminder => <button type="button" key={reminder.id} className="reminderListItem" onClick={() => openSection('build', 'reminders')}>
          <span className="reminderGlyph"><Bell size={18} /></span><span><b>{reminder.title}</b><small>{reminder.dueDate} · {reminder.category}</small></span>
          {due.some(d => d.id === reminder.id) && <span className="overduePill">Due</span>}
        </button>) : <div className="emptySection"><Bell size={24} /><span>No pending reminders.</span><button type="button" className="textLink" onClick={() => openSection('build', 'reminders')}>Create reminder <ArrowRight size={14} /></button></div>}
      </section>
      <section className="panel">
        <div className="sectionHead"><div><h2>Recent activity</h2><p>Transactions from your actual ledger</p></div><button className="textLink" type="button" onClick={() => openSection('ledger')}>All entries <ArrowRight size={15} /></button></div>
        {recent.length ? recent.map(tx => <button type="button" key={tx.id} className="activityListItem" onClick={() => openSection('ledger')}>
          <span className="activityGlyph"><Receipt size={17} /></span><span><b>{tx.payee || tx.category || statusLabel(tx.type)}</b><small>{new Date(tx.transactionDate).toLocaleDateString('en-IN')} · {statusLabel(tx.type)}</small></span><strong>{money(tx.amount)}</strong>
        </button>) : <div className="emptySection"><Receipt size={24} /><span>No transactions yet.</span><button type="button" className="textLink" onClick={() => openSection('add')}>Record first entry <Plus size={14} /></button></div>}
      </section>
    </div>

    <section className={'integrityPanel ' + (issues.length ? 'needsReview' : '')}>
      <span className="integrityIcon">{issues.length ? <CircleAlert size={20} /> : <ShieldCheck size={20} />}</span>
      <div><b>{issues.length ? 'Financial records need review' : 'Financial integrity checks are clear'}</b><p>{issues.length ? issues.filter(x => x.severity === 'CRITICAL').length + ' critical · ' + issues.filter(x => x.severity === 'WARNING').length + ' warnings. History stays append-only; investigate before correcting.' : 'No problems detected by the automated audit. Reconcile against bank statements periodically.'}</p>
      {issues.length ? <small>{issues[0].message}</small> : null}</div>
      <button type="button" onClick={() => openSection('build', 'reports')}>View audit <ChevronRight size={16} /></button>
    </section>
  </div>;
}
