import { db, bumpRevision, nowIso } from '../db';
import { fmtDate, type Data } from '../appData';
import type { Milestone } from '../types';

export default function Journey({data,reload,notify}:{data:Data;reload:()=>Promise<void>;notify:(s:string)=>void}) {
  const toggle=async(m:Milestone)=>{
    const next=m.status==='COMPLETED'?'PENDING':'COMPLETED';
    await db.milestones.update(m.id,{status:next,completedDate:next==='COMPLETED'?new Date().toISOString().slice(0,10):undefined,updatedAt:nowIso()});
    if(data.project&&m.code==='REGISTRY'&&next==='COMPLETED') await db.projects.update(data.project.id,{status:'REGISTRY_COMPLETED',updatedAt:nowIso()});
    if(data.project&&m.code==='POSSESSION'&&next==='COMPLETED') await db.projects.update(data.project.id,{status:'POSSESSION_RECEIVED',updatedAt:nowIso()});
    await bumpRevision();await reload();notify(next==='COMPLETED'?'Milestone completed.':'Milestone reopened.');
  };
  return <section className="card journeyCard"><div className="eyebrow">PROPERTY → BUILDING</div><h2>Project journey</h2>
    <div className="timeline">{data.milestones.map((m,i)=><button key={m.id} className={'milestone '+m.status.toLowerCase()} onClick={()=>toggle(m)}>
      <span className="milestoneDot">{m.status==='COMPLETED'?'✓':i+1}</span><div><b>{m.name}</b><small>{m.completedDate?'Completed '+fmtDate(m.completedDate):m.status.replaceAll('_',' ')}</small></div><span className="chev">›</span>
    </button>)}</div>
    <div className="infoBox">Tap a milestone to mark it complete/reopen it. Every expense can be linked to the exact project stage.</div>
  </section>;
}
