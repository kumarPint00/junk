import { NextResponse } from 'next/server';
import { issueSession, sessionCookieName, verifyPin } from '@/lib/auth';
export async function POST(req:Request){
  try{ const {pin}=await req.json(); if(!verifyPin(String(pin||''))) return NextResponse.json({error:'Invalid PIN'},{status:401}); const r=NextResponse.json({ok:true}); r.cookies.set(sessionCookieName,issueSession(),{httpOnly:true,secure:true,sameSite:'strict',path:'/',maxAge:30*24*3600}); return r; }
  catch(e){ return NextResponse.json({error:e instanceof Error?e.message:'Login failed'},{status:500}); }
}
