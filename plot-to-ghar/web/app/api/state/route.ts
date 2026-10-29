import { NextResponse } from 'next/server';
import { requireAuth, err } from '@/lib/api';
import { getState, listTransactions, saveState } from '@/lib/store';
import { computeLedger } from '@/lib/ledger';
import type { ProjectState } from '@/lib/types';
export async function GET(){ const no=await requireAuth(); if(no)return no; const state=await getState(); const txs=await listTransactions(); return NextResponse.json({state,summary:computeLedger(state.accounts,txs)}); }
export async function PUT(req:Request){ const no=await requireAuth(); if(no)return no; try{ const s=await req.json() as ProjectState; if(!s?.project?.name||!Array.isArray(s.accounts)||!Array.isArray(s.milestones)) return err(new Error('Invalid project state')); s.version=1; return NextResponse.json({state:await saveState(s)}); }catch(e){return err(e);} }
