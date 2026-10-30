import type { ProjectState, Transaction } from './types';
import { computeLedger } from './ledger';

export type IntegrityIssue = { code: string; severity: 'WARNING'|'CRITICAL'; message: string; transactionId?: string };

export function auditIntegrity(state: ProjectState, txs: Transaction[]): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const ledger = computeLedger(state.accounts, txs);
  for (const a of state.accounts) {
    if ((ledger.accountBalances[a.id] ?? 0) < -0.01) issues.push({ code:'NEGATIVE_BALANCE',severity:'CRITICAL',message:a.name + ' shows a negative calculated balance. Reconcile bank/cash history.' });
  }
  for (const t of txs) {
    if (t.type === 'REFUND') {
      const original=txs.find(x=>x.id===t.linkedTransactionId && ['EXPENSE','DIRECT_FUNDED_EXPENSE','ADVANCE_ADJUSTMENT'].includes(x.type));
      if (!original) issues.push({ code:'UNLINKED_REFUND',severity:'CRITICAL',transactionId:t.id,message:'Expense refund has no valid original expense. Historical cost figures need review.' });
      else if (t.category!==original.category || t.phaseId!==original.phaseId || t.costBucket!==original.costBucket) {
        issues.push({code:'REFUND_MISMATCH',severity:'WARNING',transactionId:t.id,message:'Refund classification differs from the original expense.'});
      }
    }
    if (t.type==='ADVANCE_ADJUSTMENT'||t.type==='ADVANCE_REFUND') {
      if (!txs.some(x=>x.id===t.linkedTransactionId && x.type==='ADVANCE')) issues.push({code:'ORPHAN_SETTLEMENT',severity:'CRITICAL',transactionId:t.id,message:'Advance settlement has no valid originating advance.'});
    }
  }
  const origins=txs.filter(x=>x.type==='ADVANCE' || ['EXPENSE','DIRECT_FUNDED_EXPENSE','ADVANCE_ADJUSTMENT'].includes(x.type));
  for(const origin of origins) {
    const types=origin.type==='ADVANCE'?['ADVANCE_REFUND','ADVANCE_ADJUSTMENT']:['REFUND'];
    const consumed=txs.filter(x=>x.linkedTransactionId===origin.id && types.includes(x.type)).reduce((s,x)=>s+x.amount,0);
    if(consumed>origin.amount+0.01) issues.push({code:'OVER_SETTLEMENT',severity:'CRITICAL',transactionId:origin.id,message:'Linked refunds/settlements exceed original amount.'});
  }
  const reversed = new Set(txs.filter(x=>x.reversalOf).map(x=>x.reversalOf));
  const keys = new Map<string, string>();
  for (const t of txs) {
    if (t.reversalOf || reversed.has(t.id)) continue;
    const key = [t.type,String(t.transactionDate).slice(0,10),Number(t.amount || 0).toFixed(2),(t.payee||'').trim().toLowerCase(),(t.referenceNumber||'').trim().toLowerCase()].join('|');
    if(keys.has(key)) issues.push({code:'POSSIBLE_DUPLICATE',severity:'WARNING',transactionId:t.id,message:'Possible duplicate ledger entry. Compare the invoice and earlier transaction.'});
    else keys.set(key,t.id);
  }
  return issues;
}
