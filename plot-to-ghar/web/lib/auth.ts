import crypto from 'node:crypto';
import { cookies } from 'next/headers';
const COOKIE='ptg_session';
function secret(){ const s=process.env.SESSION_SECRET; if(!s) throw new Error('SESSION_SECRET is not configured'); return s; }
function sig(payload:string){ return crypto.createHmac('sha256',secret()).update(payload).digest('base64url'); }
export function issueSession(){ const payload=Buffer.from(JSON.stringify({exp:Date.now()+30*24*3600*1000})).toString('base64url'); return `${payload}.${sig(payload)}`; }
export function verifySessionToken(v?:string){ if(!v) return false; const [p,s]=v.split('.'); if(!p||!s) return false; const expected=sig(p); if(s.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(s),Buffer.from(expected))) return false; try{return JSON.parse(Buffer.from(p,'base64url').toString()).exp>Date.now();}catch{return false;} }
export async function isAuthed(){ const c=await cookies(); return verifySessionToken(c.get(COOKIE)?.value); }
export function verifyPin(pin:string){ const expected=process.env.APP_PIN||''; if(!expected) throw new Error('APP_PIN is not configured'); const a=Buffer.from(pin); const b=Buffer.from(expected); return a.length===b.length&&crypto.timingSafeEqual(a,b); }
export const sessionCookieName=COOKIE;
