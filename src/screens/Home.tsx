import type { Data, Tab } from '../appData';
import type { FinanceSummary } from '../types';
import { formatINR } from '../finance';
import { Metric, TransactionRow, Empty } from '../components';

export default function Home({data,finance,setTab}:{data:Data;finance:FinanceSummary;setTab:(t:Tab)=>void}) {
  const project=data.project!;
  const next=data.milestones.find(m=>m.status!=='COMPLETED'&&m.status!=='SKIPPED');
  const completed=data.milestones.filter(m=>m.status==='COMPLETED').length;
  const budget=Number(project.totalBudget||0);
  const recent=data.transactions.slice(0,5);
  const committed=data.fundingSources.reduce((s,x)=>s+Number(x.committedAmount||0),0);
  const pct=Math.round(completed/Math.max(data.milestones.length,1)*100);
  return <>
    <section className="heroCard"><div><div className="eyebrow">TOTAL PROJECT COST</div>
      <div className="heroAmount">{formatINR(finance.totalCost)}</div>
      <div className="subtle">{budget?formatINR(budget-finance.totalCost)+' remaining from budget':'Set a total budget in More → Project'}</div>
    </div><div className="progressRing" style={{background:'conic-gradient(var(--accent) '+pct+'%, #e2e8f0 0)'}}><div><b>{completed}/{data.milestones.length}</b><small>milestones</small></div></div></section>
    <div className="metricGrid">
      <Metric label="Available project money" value={formatINR(finance.totalAvailable)} note="Bank + cash wallets"/>
      <Metric label="Funding received" value={formatINR(finance.totalFundingReceived)} note={formatINR(committed)+' committed'}/>
      <Metric label="Advance outstanding" value={formatINR(finance.advancesOutstanding)} note="Not yet recognised as cost"/>
      <Metric label="Transactions" value={String(data.transactions.length)} note={String(data.attachments.length)+' evidence files'}/>
    </div>
    <section className="card nextMilestone"><div><div className="eyebrow">NEXT MILESTONE</div><h2>{next?.name||'Project completed'}</h2>
      <p>{next?'Keep payments, documents and progress tied to this milestone.':'All milestones are complete.'}</p></div>
      <button className="secondary" onClick={()=>setTab('journey')}>Open journey</button></section>
    <section className="card"><div className="sectionTitle"><h2>Accounts</h2><button className="linkBtn" onClick={()=>setTab('more')}>Manage</button></div>
      {data.accounts.map(a=><div className="accountRow" key={a.id}><span className={'accountIcon '+a.kind.toLowerCase()}>{a.kind==='BANK'?'▣':a.kind==='CASH'?'₹':'◈'}</span>
        <div><b>{a.name}</b><small>{a.bankName||a.kind}</small></div><strong>{formatINR(finance.accountBalances[a.id]||0)}</strong></div>)}</section>
    <section className="card"><div className="sectionTitle"><h2>Recent activity</h2><button className="linkBtn" onClick={()=>setTab('ledger')}>All</button></div>
      {recent.length?recent.map(tx=><TransactionRow key={tx.id} tx={tx} data={data}/>):<Empty text="No transactions yet. Use + to record the first payment or funding."/>}</section>
  </>;
}
