import { useEffect, useMemo, useState } from 'react';
import type { Tab, Data } from './appData';
import { EMPTY, loadData } from './appData';
import { calculateFinance } from './finance';
import { getSavedSyncKey, saveSyncKey, clearSyncKey, syncNow } from './cloud';
import Setup from './screens/Setup';
import Home from './screens/Home';
import Journey from './screens/Journey';
import AddTransaction from './screens/AddTransaction';
import Ledger from './screens/Ledger';
import More from './screens/More';

export default function App(){
  const [tab,setTab]=useState<Tab>('home');
  const [data,setData]=useState<Data>(EMPTY);
  const [loading,setLoading]=useState(true);
  const [toast,setToast]=useState('');
  const [syncKey,setSyncKeyState]=useState('');
  const [syncing,setSyncing]=useState(false);

  const reload=async()=>{setData(await loadData());setLoading(false);};
  useEffect(()=>{reload();getSavedSyncKey().then(setSyncKeyState);},[]);
  const finance=useMemo(()=>calculateFinance(data.accounts,data.transactions),[data.accounts,data.transactions]);
  const notify=(message:string)=>{setToast(message);window.setTimeout(()=>setToast(''),2800);};

  const doSync=async(key=syncKey)=>{
    if(!key)return notify('Create or enter a cloud sync key first.');
    setSyncing(true);
    try{await syncNow(key);await reload();notify('Cloud sync complete.');}
    catch(e){notify(e instanceof Error?e.message:'Cloud sync failed.');}
    finally{setSyncing(false);}
  };

  if(loading)return <div className="splash"><div className="logoMark">🏠</div><b>Plot to Ghar</b></div>;
  if(!data.project)return <Setup onCreated={async()=>{await reload();notify('Project created.');}}/>;

  return <div className="app">
    <header className="topbar"><div><div className="eyebrow">{data.project.status.replaceAll('_',' ')}</div><h1>{data.project.name}</h1></div>
      <button className={'syncPill '+(navigator.onLine?'online':'offline')} onClick={()=>doSync()} disabled={syncing}>{syncing?'Syncing…':syncKey?(navigator.onLine?'☁ Sync':'Offline'):'Local'}</button></header>
    <main className="content">
      {tab==='home'&&<Home data={data} finance={finance} setTab={setTab}/>}
      {tab==='journey'&&<Journey data={data} reload={reload} notify={notify}/>}
      {tab==='add'&&<AddTransaction data={data} reload={reload} notify={notify} syncKey={syncKey}/>}
      {tab==='ledger'&&<Ledger data={data} finance={finance} reload={reload} notify={notify}/>}
      {tab==='more'&&<More data={data} finance={finance} reload={reload} notify={notify} syncKey={syncKey}
        setSyncKey={async key=>{if(key)await saveSyncKey(key);else await clearSyncKey();setSyncKeyState(key);}}
        doSync={doSync} syncing={syncing}/>}
    </main>
    <nav className="bottomNav">
      <Nav active={tab==='home'} onClick={()=>setTab('home')} icon="⌂" label="Home"/>
      <Nav active={tab==='journey'} onClick={()=>setTab('journey')} icon="◇" label="Journey"/>
      <button className="addFab" onClick={()=>setTab('add')} aria-label="Add transaction">＋</button>
      <Nav active={tab==='ledger'} onClick={()=>setTab('ledger')} icon="≡" label="Ledger"/>
      <Nav active={tab==='more'} onClick={()=>setTab('more')} icon="•••" label="More"/>
    </nav>
    {toast&&<div className="toast">{toast}</div>}
  </div>;
}

function Nav({active,onClick,icon,label}:{active:boolean;onClick:()=>void;icon:string;label:string}){
  return <button className={active?'navBtn active':'navBtn'} onClick={onClick}><span>{icon}</span><small>{label}</small></button>;
}
