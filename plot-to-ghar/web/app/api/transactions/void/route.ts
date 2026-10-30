import { NextResponse } from 'next/server';
import { requireAuth, err } from '@/lib/api';
import { findReversalFor, getTransaction, getState, listTransactions, putTransaction } from '@/lib/store';
import { validateTx } from '@/lib/ledger';
import type { Transaction } from '@/lib/types';

export async function POST(req: Request) {
  const no = await requireAuth();
  if (no) return no;
  try {
    const { id } = await req.json();
    const old = await getTransaction(String(id || ''));
    if (!old) return err(new Error('Transaction not found'), 404);
    if (old.type === 'REVERSAL' || old.reversalOf) {
      return err(new Error('Reversal records cannot be reversed. Create an explicit correction.'), 400);
    }
    const previous = await findReversalFor(old.id);
    if (previous) return NextResponse.json({ transaction: previous, idempotent: true }, { headers: { 'Cache-Control': 'no-store' } });
    const [state, transactions] = await Promise.all([getState(), listTransactions()]);
    const t: Transaction = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      transactionDate: new Date().toISOString(),
      type: 'REVERSAL',
      amount: old.amount,
      reversalOf: old.id,
      description: 'Ledger reversal of ' + old.id + '. Original transaction retained.',
      category: old.category,
    };
    validateTx(t, { state, transactions });
    await putTransaction(t);
    return NextResponse.json({ transaction: t }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return err(e);
  }
}
