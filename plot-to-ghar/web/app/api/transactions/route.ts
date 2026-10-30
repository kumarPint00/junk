import { NextResponse } from 'next/server';
import { requireAuth, err } from '@/lib/api';
import { getState, getTransaction, listTransactions, putTransaction } from '@/lib/store';
import { findPotentialDuplicate, validateTx } from '@/lib/ledger';
import type { Transaction } from '@/lib/types';

export async function GET() {
  const no = await requireAuth();
  if (no) return no;
  return NextResponse.json(
    { transactions: await listTransactions() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(req: Request) {
  const no = await requireAuth();
  if (no) return no;
  try {
    const body = await req.json();
    if (body.id) {
      const existing = await getTransaction(String(body.id));
      if (existing) {
        return NextResponse.json(
          { transaction: existing, idempotent: true },
          { status: 200, headers: { 'Cache-Control': 'no-store' } }
        );
      }
    }

    const [state, transactions] = await Promise.all([getState(), listTransactions()]);
    validateTx(body, { state, transactions });

    if (!body.allowDuplicate) {
      const duplicate = findPotentialDuplicate(body, transactions);
      if (duplicate) {
        return NextResponse.json(
          { error: 'Possible duplicate transaction found.', duplicate },
          { status: 409, headers: { 'Cache-Control': 'no-store' } }
        );
      }
    }

    const t: Transaction = {
      ...body,
      allowDuplicate: undefined,
      id: body.id || crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      transactionDate: body.transactionDate || new Date().toISOString(),
      amount: Number(body.amount),
    };
    await putTransaction(t);
    return NextResponse.json(
      { transaction: t },
      { status: 201, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    return err(e);
  }
}
