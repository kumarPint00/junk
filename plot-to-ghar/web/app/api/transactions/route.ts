import { NextResponse } from 'next/server';
import { requireAuth, err } from '@/lib/api';
import { getTransaction, listTransactions, putTransaction } from '@/lib/store';
import { validateTx } from '@/lib/ledger';
import type { Transaction } from '@/lib/types';
export async function GET(){ const no=await requireAuth(); if(no)return no; return NextResponse.json({transactions:await listTransactions()}); }
export async function POST(req:Request){ const no=await requireAuth(); if(no)return no; try{ const body=await req.json(); if(body.id){ const existing=await getTransaction(body.id); if(existing) return NextResponse.json({transaction:existing,idempotent:true},{status:200}); } validateTx(body); const t:Transaction={...body,id:body.id||crypto.randomUUID(),createdAt:new Date().toISOString(),transactionDate:body.transactionDate||new Date().toISOString(),amount:Number(body.amount)}; await putTransaction(t); return NextResponse.json({transaction:t},{status:201}); }catch(e){return err(e);} }
