import { NextResponse } from 'next/server';
import { requireAuth, err } from '@/lib/api';
import { findReversalFor, getTransaction, getState, listTransactions, putTransaction } from '@/lib/store';
import { validateTx } from '@/lib/ledger';
import type { Transaction, TxType } from '@/lib/types';

function reversalType(type: TxType): TxType {
  if (type === 'EXPENSE') return 'REFUND';
  if (type === 'TRANSFER') return 'TRANSFER';
  if (type === 'ADVANCE') return 'ADVANCE_REFUND';
  throw new Error('This transaction cannot be auto-voided. Add a correcting entry instead.');
}

export async function POST(req: Request) {
  const no = await requireAuth();
  if (no) return no;
  try {
    const { id } = await req.json();
    const old = await getTransaction(String(id || ''));
    if (!old) return err(new Error('Transaction not found'), 404);

    const existingReversal = await findReversalFor(old.id);
    if (existingReversal) {
      return NextResponse.json(
        { transaction: existingReversal, idempotent: true },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const type = reversalType(old.type);
    const t: Transaction = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      transactionDate: new Date().toISOString(),
      type,
      amount: old.amount,
      sourceAccountId: type === 'TRANSFER' ? old.destinationAccountId : undefined,
      destinationAccountId:
        type === 'TRANSFER'
          ? old.sourceAccountId
          : type === 'REFUND' || type === 'ADVANCE_REFUND'
            ? old.sourceAccountId
            : undefined,
      fundingSourceId: old.fundingSourceId,
      milestoneId: old.milestoneId,
      phaseId: old.phaseId,
      vendorId: old.vendorId,
      contractorId: old.contractorId,
      costBucket: old.costBucket,
      category: `Reversal: ${old.category || old.type}`,
      payee: old.payee,
      description: `Void/reversal of ${old.id}`,
      reversalOf: old.id,
      linkedTransactionId: old.type === 'ADVANCE' ? old.id : undefined,
    };

    const [state, transactions] = await Promise.all([getState(), listTransactions()]);
    validateTx(t, { state, transactions });
    await putTransaction(t);
    return NextResponse.json({ transaction: t }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return err(e);
  }
}
