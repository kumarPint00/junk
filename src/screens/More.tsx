import { useState } from 'react';
import type { Data } from '../appData';
import type { FinanceSummary, Account, FundingSource, Party, AppSnapshot } from '../types';
import { db, id, nowIso, bumpRevision, exportSnapshot, importSnapshot } from '../db';
import { formatINR } from '../finance';
import { num } from '../appData';
import { Metric, Bar, Empty } from '../components';
import { generateSyncKey, downloadJsonFile } from '../cloud';

type Section='project'|'accounts'|'funding'|'parties'|'materials'|'reports'|'backup'|'cloud';

export default function More({data,finance,reload,notify,syncKey,setSyncKey,doSync,syncing}:{data:Data;finance:FinanceSummary;reload:()=>Promise<void>;notify:(s:string)=>void;syncKey:string;setSyncKey:(k:string)=>Promise<void>;doSync:(k?:string)=>Promise<void>;syncing:boolean}) {
  const [section,setSection]=useState<Section>('project');
  const items:[Section,string][]=[['project','Project'],['accounts','Accounts'],['funding','Funding'],['parties','People'],['materials','Materials'],['reports','Reports'],['backup','Backup'],['cloud','Cloud sync']];
  return <div className="moreLayout"><div className="chips">{items.map(([key,label])=><button key={key} className={section===key?'chip active':'chip'} onClick={()=>setSection(key)}>{label}</button>)}</div>
    {section==='project'&&<ProjectSettings data={data} reload={reload} notify={notify}/>}
    {section==='accounts'&&<Accounts data={data} finance={finance} reload={reload} notify={notify}/>}
    {section==='funding'&&<Funding data={data} finance={finance} reload={reload} notify={notify}/>}
    {section==='parties'&&<Parties data={data} reload={reload} notify={notify}/>}
    {section==='materials'&&<Materials data={data} reload={reload} notify={notify}/>}
    {section==='reports'&&<Reports data={data} finance={finance}/>}
    {section==='backup'&&<Backup reload={reload} notify={notify}/>}
    {section==='cloud'&&<CloudSync syncKey={syncKey} setSyncKey={setSyncKey} doSync={doSync} syncing={syncing} notify={notify}/>}
  </div>;
}

function ProjectSettings({data,reload,notify}:{data:Data;reload:()=>Promise<void>;notify:(s:string)=>void}) {
  const p=data.project!;
  const save=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);
    await db.projects.update(p.id,{name:String(f.get('name')),plotAddress:String(f.get('address')),plotAreaSqYard:num(f.get('area'))||undefined,agreedPurchasePrice:num(f.get('price'))||undefined,ownerName:String(f.get('owner')),sellerName:String(f.get('seller')),totalBudget:num(f.get('budget'))||undefined,notes:String(f.get('notes')||''),updatedAt:nowIso()});
    await bumpRevision();await reload();notify('Project updated.');};
  return <form className="card formGrid" onSubmit={save}><h2>Project</h2>
    <label>Project name<input name="name" defaultValue={p.name}/></label><label>Plot address<textarea name="address" defaultValue={p.plotAddress}/></label>
    <div className="twoCol"><label>Area (sq yd)<input name="area" type="number" step=".01" defaultValue={p.plotAreaSqYard}/></label><label>Agreed purchase price<input name="price" type="number" defaultValue={p.agreedPurchasePrice}/></label></div>
    <div className="twoCol"><label>Owner / buyer<input name="owner" defaultValue={p.ownerName}/></label><label>Seller<input name="seller" defaultValue={p.sellerName}/></label></div>
    <label>Total project budget<input name="budget" type="number" defaultValue={p.totalBudget}/></label><label>Notes<textarea name="notes" rows={3} defaultValue={p.notes}/></label><button className="primary">Save project</button>
  </form>;
}

function Accounts({data,finance,reload,notify}:{data:Data;finance:FinanceSummary;reload:()=>Promise<void>;notify:(s:string)=>void}) {
  const add=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget),ts=nowIso();
    await db.accounts.add({id:id(),projectId:data.project!.id,name:String(f.get('name')),kind:String(f.get('kind')) as Account['kind'],openingBalance:num(f.get('opening')),bankName:String(f.get('bank')||''),active:true,createdAt:ts,updatedAt:ts});
    await bumpRevision();e.currentTarget.reset();await reload();notify('Account added.');};
  return <section className="card"><h2>Accounts & cash wallets</h2>{data.accounts.map(a=><div className="manageRow" key={a.id}><div><b>{a.name}</b><small>{a.kind} · Opening {formatINR(a.openingBalance)}</small></div><strong>{formatINR(finance.accountBalances[a.id]||0)}</strong></div>)}
    <form className="inlineForm" onSubmit={add}><input name="name" placeholder="Account / cash wallet" required/><select name="kind"><option>BANK</option><option>CASH</option><option>OTHER</option></select><input name="bank" placeholder="Bank (optional)"/><input name="opening" type="number" placeholder="Opening balance"/><button className="secondary">Add</button></form>
  </section>;
}

function Funding({data,finance,reload,notify}:{data:Data;finance:FinanceSummary;reload:()=>Promise<void>;notify:(s:string)=>void}) {
  const add=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget),ts=nowIso();
    await db.fundingSources.add({id:id(),projectId:data.project!.id,name:String(f.get('name')),type:String(f.get('type')) as FundingSource['type'],committedAmount:num(f.get('amount')),createdAt:ts,updatedAt:ts});
    await bumpRevision();e.currentTarget.reset();await reload();notify('Funding source added.');};
  return <section className="card"><h2>Funding sources</h2>{data.fundingSources.map(s=><div className="manageRow" key={s.id}><div><b>{s.name}</b><small>{s.type.replaceAll('_',' ')}</small></div><div className="right"><strong>{formatINR(s.committedAmount)}</strong><small>{formatINR(finance.fundingReceivedBySource[s.id]||0)} received</small></div></div>)}
    <form className="inlineForm" onSubmit={add}><input name="name" placeholder="Funding source" required/><select name="type"><option>OWN_FUNDS</option><option>PURCHASE_LOAN</option><option>CONSTRUCTION_LOAN</option><option>FAMILY</option><option>OTHER</option></select><input name="amount" type="number" min="0" placeholder="Committed amount"/><button className="secondary">Add</button></form>
  </section>;
}

function Parties({data,reload,notify}:{data:Data;reload:()=>Promise<void>;notify:(s:string)=>void}) {
  const add=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget),ts=nowIso();
    await db.parties.add({id:id(),projectId:data.project!.id,name:String(f.get('name')),kind:String(f.get('kind')) as Party['kind'],phone:String(f.get('phone')||''),notes:String(f.get('notes')||''),createdAt:ts,updatedAt:ts});
    await bumpRevision();e.currentTarget.reset();await reload();notify('Person/vendor added.');};
  return <section className="card"><h2>People, vendors & contractors</h2>{data.parties.map(p=><div className="manageRow" key={p.id}><div><b>{p.name}</b><small>{p.kind}{p.phone?' · '+p.phone:''}</small></div></div>)}
    <form className="inlineForm" onSubmit={add}><input name="name" placeholder="Name / shop" required/><select name="kind"><option>CONTRACTOR</option><option>VENDOR</option><option>SELLER</option><option>ENGINEER</option><option>ADVOCATE</option><option>OTHER</option></select><input name="phone" placeholder="Phone"/><input name="notes" placeholder="Work / notes"/><button className="secondary">Add</button></form>
  </section>;
}

function Materials({data,reload,notify}:{data:Data;reload:()=>Promise<void>;notify:(s:string)=>void}) {
  const add=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget),ts=nowIso();
    await db.materials.add({id:id(),projectId:data.project!.id,name:String(f.get('name')),unit:String(f.get('unit')),category:String(f.get('category')||'Material'),createdAt:ts,updatedAt:ts});
    await bumpRevision();e.currentTarget.reset();await reload();notify('Material added.');};
  return <section className="card"><h2>Material catalogue</h2>{data.materials.map(m=><div className="manageRow" key={m.id}><div><b>{m.name}</b><small>{m.category} · {m.unit}</small></div></div>)}
    <form className="inlineForm" onSubmit={add}><input name="name" placeholder="Cement / steel / bricks" required/><input name="unit" placeholder="bag / kg / piece" required/><input name="category" placeholder="Category"/><button className="secondary">Add</button></form>
  </section>;
}

function Reports({data,finance}:{data:Data;finance:FinanceSummary}) {
  const categories=Object.entries(finance.categoryTotals).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]));
  const phases=Object.entries(finance.milestoneTotals).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]));
  return <section className="card"><h2>Reports</h2><div className="reportSummary"><Metric label="Total project cost" value={formatINR(finance.totalCost)} note="Recognised cost only"/><Metric label="Available money" value={formatINR(finance.totalAvailable)} note="Across project accounts"/></div>
    <h3>Spend by category</h3>{categories.length?categories.map(([k,v])=><Bar key={k} label={k} value={v} max={categories[0][1]}/>):<Empty text="Add expenses to populate reports."/>}
    <h3>Spend by milestone</h3>{phases.map(([k,v])=><Bar key={k} label={data.milestones.find(m=>m.id===k)?.name||'General'} value={v} max={phases[0]?.[1]||1}/>)}</section>;
}

function Backup({reload,notify}:{reload:()=>Promise<void>;notify:(s:string)=>void}) {
  const exportBackup=async()=>downloadJsonFile('plot-to-ghar-backup-'+new Date().toISOString().slice(0,10)+'.json',await exportSnapshot());
  const restore=async(file:File)=>{try{await importSnapshot(JSON.parse(await file.text()) as AppSnapshot);await reload();notify('Backup restored.');}catch{notify('Invalid backup file.');}};
  return <section className="card"><h2>Backup & restore</h2><p>Keep periodic JSON backups in addition to encrypted cloud sync.</p><button className="primary" onClick={exportBackup}>Export full JSON backup</button>
    <label className="fileButton">Restore backup<input type="file" accept=".json,application/json" onChange={e=>e.target.files?.[0]&&restore(e.target.files[0])}/></label></section>;
}

function CloudSync({syncKey,setSyncKey,doSync,syncing,notify}:{syncKey:string;setSyncKey:(k:string)=>Promise<void>;doSync:(k?:string)=>Promise<void>;syncing:boolean;notify:(s:string)=>void}) {
  const [entry,setEntry]=useState(syncKey);
  const create=async()=>{const key=await generateSyncKey();await setSyncKey(key);setEntry(key);notify('Sync key created. Store it safely.');};
  const save=async()=>{const key=entry.trim();if(key.length<30)return notify('Sync key is too short.');await setSyncKey(key);notify('Sync key saved on this device.');};
  const copy=async()=>{await navigator.clipboard.writeText(syncKey);notify('Sync key copied.');};
  return <section className="card cloudCard"><h2>Encrypted cloud sync</h2><p>Your data is encrypted on-device before it reaches Vercel Blob. The server only stores ciphertext.</p>
    {!syncKey?<button className="primary" onClick={create}>Create private sync key</button>:<><div className="recoveryKey"><small>RECOVERY / SYNC KEY</small><code>{syncKey}</code><button className="secondary" onClick={copy}>Copy</button></div><div className="warningBox">Anyone with this key can decrypt the synced project. Keep it private. If you lose it, the cloud copy cannot be recovered.</div><button className="primary" disabled={syncing||!navigator.onLine} onClick={()=>doSync()}>{syncing?'Syncing…':'Sync now'}</button></>}
    <hr/><h3>Connect another device</h3><label>Enter the same sync key<textarea rows={3} value={entry} onChange={e=>setEntry(e.target.value)} placeholder="Paste recovery/sync key"/></label>
    <div className="buttonRow"><button className="secondary" onClick={save}>Save key</button><button className="secondary" onClick={()=>doSync(entry.trim())}>Save & download/merge</button>{syncKey&&<button className="dangerLink" onClick={async()=>{await setSyncKey('');setEntry('');}}>Disconnect this device</button>}</div></section>;
}
