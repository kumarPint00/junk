import { NextResponse } from 'next/server';
import { requireAuth, err } from '@/lib/api';
import { getState, listTransactions, saveState } from '@/lib/store';
import { computeLedger } from '@/lib/ledger';
import { normalizeState, validateProjectState, validateStateTransition } from '@/lib/defaults';
import type { ProjectState } from '@/lib/types';

export async function GET() {
  const no = await requireAuth();
  if (no) return no;
  const state = await getState();
  const txs = await listTransactions();
  return NextResponse.json(
    { state, summary: computeLedger(state.accounts, txs) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function PUT(req: Request) {
  const no = await requireAuth();
  if (no) return no;
  try {
    const raw = (await req.json()) as ProjectState;
    const state = validateProjectState(normalizeState(raw));
    const [previous, transactions] = await Promise.all([getState(), listTransactions()]);
    validateStateTransition(previous, state, transactions);
    return NextResponse.json(
      { state: await saveState(state) },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    return err(e);
  }
}
