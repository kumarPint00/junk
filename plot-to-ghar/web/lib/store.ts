import { del, get, list, put } from '@vercel/blob';
import { defaultState } from './defaults';
import type { ProjectState, Transaction } from './types';
const STATE='data/state.json'; const TX='data/tx/';
async function readJson<T>(pathname:string):Promise<T|null>{ try{ const r=await get(pathname,{access:'private'}); if(!r?.stream) return null; return JSON.parse(await new Response(r.stream).text()) as T; }catch{return null;} }
export async function getState(){ return (await readJson<ProjectState>(STATE))||defaultState(); }
export async function saveState(s:ProjectState){ s.updatedAt=new Date().toISOString(); await put(STATE,JSON.stringify(s),{access:'private',contentType:'application/json',allowOverwrite:true}); return s; }
export async function listTransactions(){ const out:Transaction[]=[]; let cursor: string|undefined; do { const r=await list({prefix:TX,cursor,limit:1000}); for(const b of r.blobs){ const t=await readJson<Transaction>(b.pathname); if(t) out.push(t); } cursor=r.hasMore?r.cursor:undefined; }while(cursor); return out.sort((a,b)=>a.transactionDate.localeCompare(b.transactionDate)||a.createdAt.localeCompare(b.createdAt)); }
export async function putTransaction(t:Transaction){ await put(`${TX}${t.id}.json`,JSON.stringify(t),{access:'private',contentType:'application/json',addRandomSuffix:false}); await put(`data/audit/${Date.now()}-${t.id}.json`,JSON.stringify({at:new Date().toISOString(),action:'CREATE_TRANSACTION',transactionId:t.id,type:t.type,amount:t.amount}),{access:'private',contentType:'application/json',addRandomSuffix:false}); return t; }
export async function getTransaction(id:string){ return readJson<Transaction>(`${TX}${id}.json`); }
export async function replaceAll(state:ProjectState,txs:Transaction[]){ const current=await list({prefix:'data/'}); if(current.blobs.length) await del(current.blobs.map(b=>b.url)); await saveState(state); for(const t of txs) await putTransaction(t); }
