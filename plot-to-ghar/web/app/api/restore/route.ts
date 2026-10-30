import { NextResponse } from 'next/server';
import { requireAuth, err } from '@/lib/api';
import { replaceAll } from '@/lib/store';
import { normalizeState, validateProjectState } from '@/lib/defaults';
import { validateTx } from '@/lib/ledger';
import type { Transaction } from '@/lib/types';

export async function POST(req: Request) {
  const no = await requireAuth();
  if (no) return no;
  try {
    if (req.headers.get('x-confirm-restore') !== 'RESTORE') throw new Error('Restore confirmation missing');
    const backup = await req.json();
    if (!['plot-to-ghar-backup-v1', 'plot-to-ghar-backup-v2'].includes(backup.format)) {
      throw new Error('Unsupported backup format');
    }
    if (!backup.state || !Array.isArray(backup.transactions)) throw new Error('Invalid backup');
    if (backup.transactions.length > 100000) throw new Error('Backup is too large');

    const state = validateProjectState(normalizeState(backup.state));
    const validated: Transaction[] = [];
    for (const raw of backup.transactions) {
      validateTx(raw, { state, transactions: validated });
      validated.push(raw as Transaction);
    }

    await replaceAll(state, validated);
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return err(e);
  }
}
