import { normalizeState, validateProjectState } from './defaults';
import type { ProjectState, Transaction, TxType } from './types';

const allowed = new Set<TxType>([
  'FUNDING_IN','TRANSFER','EXPENSE','ADVANCE','ADVANCE_ADJUSTMENT',
  'ADVANCE_REFUND','REFUND','DIRECT_FUNDED_EXPENSE','LOAN_REPAYMENT',
  'BALANCE_ADJUSTMENT','REVERSAL',
]);

/**
 * Non-destructive format/shape check for backups from earlier versions.
 * Legacy unlinked refunds and unallocated EMIs are preserved and flagged by
 * computeLedger after restore, rather than invalidating years-old backups.
 */
export function validateBackupData(input: unknown): { state: ProjectState; transactions: Transaction[] } {
  if (!input || typeof input !== 'object') throw new Error('Backup must be a JSON object.');
  const data = input as Record<string, unknown>;
  if (!data.state || !Array.isArray(data.transactions) || data.transactions.length > 100000) {
    throw new Error('Backup must contain a project state and transaction list.');
  }
  const state = validateProjectState(normalizeState(data.state as Partial<ProjectState>));
  const ids = new Set<string>();
  for (const raw of data.transactions) {
    if (!raw || typeof raw !== 'object') throw new Error('Transaction in backup is not an object.');
    const t = raw as Transaction;
    if (typeof t.id !== 'string' || !t.id || t.id.length > 120 || ids.has(t.id)) throw new Error('Duplicate/missing transaction ID in backup.');
    ids.add(t.id);
    if (!allowed.has(t.type)) throw new Error('Unsupported transaction type in backup.');
    if (typeof t.transactionDate !== 'string' || Number.isNaN(Date.parse(t.transactionDate)) ||
        typeof t.createdAt !== 'string' || Number.isNaN(Date.parse(t.createdAt))) {
      throw new Error('Invalid transaction dates in backup.');
    }
    if (typeof t.amount !== 'number' || !Number.isFinite(t.amount) || t.amount <= 0 || t.amount > 1_000_000_000 ||
        Math.abs(t.amount * 100 - Math.round(t.amount * 100)) > 0.00001) {
      throw new Error('Invalid amount in backup transaction.');
    }
    if (t.attachments && (!Array.isArray(t.attachments) || t.attachments.length > 100)) {
      throw new Error('Invalid attachment references in backup.');
    }
  }
  // Ledger entries can be listed in arbitrary date order. Build the ID set
  // before checking references so old offline backups remain importable.
  for (const raw of data.transactions as Transaction[]) {
    if (raw.reversalOf && !ids.has(raw.reversalOf)) {
      throw new Error('Backup includes an orphaned correcting reversal.');
    }
    if (raw.linkedTransactionId && !ids.has(raw.linkedTransactionId)) {
      throw new Error('Backup includes an orphaned linked financial transaction.');
    }
  }
  return { state, transactions: data.transactions as Transaction[] };
}
