import type { Account, CostBucket, LedgerSummary, ProjectState, Transaction, TxType } from './types';

// Use integral paise for all ledger additions/subtractions to avoid JS float drift.
const paise = (n: number) => Math.round(Number(n) * 100);
const rupees = (n: number) => n / 100;
const isMoney = (n: number) => Number.isFinite(n) && n > 0 && n <= 1_000_000_000 && Math.abs(n * 100 - Math.round(n * 100)) < 0.00001;
const types: TxType[] = ['FUNDING_IN', 'TRANSFER', 'EXPENSE', 'ADVANCE', 'ADVANCE_ADJUSTMENT', 'ADVANCE_REFUND', 'REFUND', 'DIRECT_FUNDED_EXPENSE', 'LOAN_REPAYMENT', 'REVERSAL', 'BALANCE_ADJUSTMENT'];

function accumulate(map: Record<string, number>, key: string | undefined, value: number) {
  if (key) map[key] = (map[key] || 0) + value;
}
function moneyBucket(t: Transaction, lookup: Map<string, Transaction>): CostBucket {
  if (t.type === 'REFUND' && t.linkedTransactionId) {
    return lookup.get(t.linkedTransactionId)?.costBucket || t.costBucket || 'OTHER';
  }
  return t.costBucket || 'OTHER';
}
function costDelta(t: Transaction, sign: number) {
  return (t.type === 'EXPENSE' || t.type === 'DIRECT_FUNDED_EXPENSE' || t.type === 'ADVANCE_ADJUSTMENT' ? 1 : t.type === 'REFUND' ? -1 : 0) * sign * paise(t.amount);
}

export function computeLedger(accounts: Account[], txs: Transaction[]): LedgerSummary {
  const balances: Record<string, number> = {};
  for (const a of accounts) balances[a.id] = paise(Number(a.openingBalance || 0));
  let projectCost = 0, acquisitionCost = 0, constructionCost = 0, otherCost = 0;
  let fundingReceived = 0, advancesOutstanding = 0, loanRepayments = 0;
  let loanPrincipalPaid = 0, loanInterestPaid = 0, loanFeesPaid = 0, unallocatedLoanRepayments = 0;
  const phaseSpend: Record<string, number> = {}, floorSpend: Record<string, number> = {}, categorySpend: Record<string, number> = {}, monthlySpend: Record<string, number> = {};
  let unallocatedConstructionCost = 0;
  const receivedBySource: Record<string, number> = {}, advanceById: Record<string, number> = {};
  const integrityWarnings: string[] = [];
  const lookup = new Map(txs.map((t) => [t.id, t]));
  const reversed = new Set(txs.filter((t) => t.reversalOf).map((t) => t.reversalOf));
  const seen = new Set<string>();

  const apply = (t: Transaction, sign: number) => {
    const n = paise(t.amount) * sign;
    const debit = () => accumulate(balances, t.sourceAccountId, -n);
    const credit = () => accumulate(balances, t.destinationAccountId, n);
    switch (t.type) {
      case 'FUNDING_IN': credit(); fundingReceived += n; accumulate(receivedBySource, t.fundingSourceId, n); break;
      case 'TRANSFER': debit(); credit(); break;
      case 'EXPENSE': debit(); break;
      case 'DIRECT_FUNDED_EXPENSE': fundingReceived += n; accumulate(receivedBySource, t.fundingSourceId, n); break;
      case 'ADVANCE': debit(); advancesOutstanding += n; accumulate(advanceById, t.id, n); break;
      case 'ADVANCE_ADJUSTMENT': advancesOutstanding -= n; accumulate(advanceById, t.linkedTransactionId, -n); break;
      case 'ADVANCE_REFUND': credit(); advancesOutstanding -= n; accumulate(advanceById, t.linkedTransactionId, -n); break;
      case 'REFUND': credit(); break;
      case 'LOAN_REPAYMENT':
        debit();
        loanRepayments += n;
        if (t.loanPrincipalAmount === undefined && t.loanInterestAmount === undefined && t.loanFeeAmount === undefined) {
          unallocatedLoanRepayments += n;
        } else {
          loanPrincipalPaid += paise(t.loanPrincipalAmount || 0) * sign;
          loanInterestPaid += paise(t.loanInterestAmount || 0) * sign;
          loanFeesPaid += paise(t.loanFeeAmount || 0) * sign;
        }
        break;
      case 'BALANCE_ADJUSTMENT': debit(); credit(); break;
      case 'REVERSAL': return;
    }
    const delta = costDelta(t, sign);
    if (!delta) return;
    projectCost += delta;
    const bucket = moneyBucket(t, lookup);
    if (bucket === 'ACQUISITION') acquisitionCost += delta;
    else if (bucket === 'CONSTRUCTION') constructionCost += delta;
    else otherCost += delta;
    const linked = t.type === 'REFUND' ? lookup.get(t.linkedTransactionId || '') : null;
    accumulate(phaseSpend, linked?.phaseId || t.phaseId, delta);
    const floorId = linked?.floorId || t.floorId;
    if (bucket === 'CONSTRUCTION' && !floorId) unallocatedConstructionCost += delta;
    accumulate(floorSpend, floorId, delta);
    accumulate(categorySpend, linked?.category || t.category || 'Uncategorized', delta);
    accumulate(monthlySpend, String(t.transactionDate || '').slice(0, 7) || 'Unknown', delta);
  };

  for (const t of txs) {
    if (seen.has(t.id)) { integrityWarnings.push('Duplicate transaction ID: ' + t.id); continue; }
    seen.add(t.id);
  if (t.type === 'REVERSAL') {
      const original = lookup.get(t.reversalOf || '');
      if (original && original.type !== 'REVERSAL') apply(original, -1);
      else integrityWarnings.push('Reversal has missing original: ' + t.id);
    } else {
      apply(t, 1);
      if (t.type === 'REFUND' && !t.linkedTransactionId && !t.reversalOf) {
        integrityWarnings.push('Refund without linked expense: ' + t.id);
      }
    }
  }
  if (unallocatedConstructionCost > 0) {
    integrityWarnings.push('Construction expenses not assigned to a floor: ' + rupees(unallocatedConstructionCost).toFixed(2) + ' rupees');
  }
  if (unallocatedLoanRepayments > 0) {
    integrityWarnings.push('Loan repayments without principal/interest breakdown: ' + rupees(unallocatedLoanRepayments).toFixed(2) + ' rupees');
  }
  for (const [id, amount] of Object.entries(advanceById)) {
    if (amount < -1) integrityWarnings.push('Over-settled contractor advance: ' + id);
  }
  for (const t of txs) {
    if (t.type === 'BALANCE_ADJUSTMENT' && !reversed.has(t.id)) {
      integrityWarnings.push('Audited balance correction exists: ' + t.id);
    }
  }
  for (const a of accounts) {
    if ((balances[a.id] || 0) < -1) integrityWarnings.push('Negative account balance: ' + a.name);
  }
  const convert = (m: Record<string, number>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, rupees(v)]));
  return {
    projectCost: rupees(projectCost),
    acquisitionCost: rupees(acquisitionCost),
    constructionCost: rupees(constructionCost),
    otherCost: rupees(otherCost),
    fundingReceived: rupees(fundingReceived),
    advancesOutstanding: rupees(advancesOutstanding),
    loanRepayments: rupees(loanRepayments),
    loanPrincipalPaid: rupees(loanPrincipalPaid),
    loanInterestPaid: rupees(loanInterestPaid),
    loanFeesPaid: rupees(loanFeesPaid),
    unallocatedLoanRepayments: rupees(unallocatedLoanRepayments),
    accountBalances: convert(balances),
    phaseSpend: convert(phaseSpend),
    floorSpend: convert(floorSpend),
    unallocatedConstructionCost: rupees(unallocatedConstructionCost),
    categorySpend: convert(categorySpend),
    monthlySpend: convert(monthlySpend),
    txCount: txs.length,
    receivedBySource: convert(receivedBySource),
    advanceById: convert(advanceById),
    integrityWarnings,
    reversedCount: reversed.size,
  };
}

export type ValidationContext = { state?: ProjectState; transactions?: Transaction[] };
function checkId(rows: { id: string }[] | undefined, id: string | undefined, label: string) {
  if (id && rows && !rows.some((x) => x.id === id)) throw new Error(label + ' does not exist.');
}
function notReversed(originalId: string, transactions: Transaction[]) {
  return !transactions.some((x) => x.reversalOf === originalId);
}
function remainingAdvance(id: string, txs: Transaction[]) {
  const a = txs.find((t) => t.id === id && t.type === 'ADVANCE');
  if (!a || !notReversed(id, txs)) throw new Error('Linked advance is missing or reversed.');
  const used = txs.filter((t) => (t.type === 'ADVANCE_ADJUSTMENT' || t.type === 'ADVANCE_REFUND') && t.linkedTransactionId === id && notReversed(t.id, txs))
    .reduce((sum, t) => sum + paise(t.amount), 0);
  return { a, available: paise(a.amount) - used };
}
function remainingRefundable(id: string, txs: Transaction[]) {
  const original = txs.find((t) => t.id === id && ['EXPENSE', 'DIRECT_FUNDED_EXPENSE', 'ADVANCE_ADJUSTMENT'].includes(t.type));
  if (!original || !notReversed(id, txs)) throw new Error('Choose a valid, active expense to refund.');
  const refunded = txs.filter((t) => t.type === 'REFUND' && t.linkedTransactionId === id && notReversed(t.id, txs))
    .reduce((sum, t) => sum + paise(t.amount), 0);
  return { original, available: paise(original.amount) - refunded };
}

export function validateTx(t: Partial<Transaction>, { state, transactions = [] }: ValidationContext = {}) {
  const n = Number(t.amount);
  if (!t.type || !types.includes(t.type)) throw new Error('Invalid transaction type.');
  if (!isMoney(n)) throw new Error('Amount must be positive and have at most two decimal places.');
  if (t.id && (typeof t.id !== 'string' || t.id.length > 120)) throw new Error('Invalid transaction ID.');
  const date = t.transactionDate;
  if (!date || Number.isNaN(Date.parse(date))) throw new Error('Valid transaction date required.');
  const sources = ['TRANSFER', 'EXPENSE', 'ADVANCE', 'LOAN_REPAYMENT'];
  const dests = ['TRANSFER', 'FUNDING_IN', 'REFUND', 'ADVANCE_REFUND'];
  if (sources.includes(t.type) && !t.sourceAccountId) throw new Error('Source account is required.');
  if (dests.includes(t.type) && !t.destinationAccountId) throw new Error('Destination account is required.');
  if (t.type === 'TRANSFER' && t.sourceAccountId === t.destinationAccountId) throw new Error('Transfer needs two different accounts.');
  if (t.type === 'BALANCE_ADJUSTMENT') {
    if (Boolean(t.sourceAccountId) === Boolean(t.destinationAccountId)) throw new Error('Choose exactly one account direction for balance correction.');
    if (!t.description?.trim() || t.description.trim().length < 8) throw new Error('Explain the cash/bank balance adjustment (at least 8 characters).');
  }
  if (['FUNDING_IN', 'DIRECT_FUNDED_EXPENSE'].includes(t.type) && !t.fundingSourceId) throw new Error('Funding source is required.');
  if (['EXPENSE','DIRECT_FUNDED_EXPENSE','ADVANCE_ADJUSTMENT','REFUND'].includes(t.type) && !['ACQUISITION','CONSTRUCTION','OTHER'].includes(t.costBucket || '')) {
    throw new Error('Choose an acquisition, construction or other cost bucket.');
  }
  checkId(state?.accounts, t.sourceAccountId, 'Source account');
  checkId(state?.accounts, t.destinationAccountId, 'Destination account');
  checkId(state?.fundingSources, t.fundingSourceId, 'Funding source');
  checkId(state?.milestones, t.milestoneId, 'Milestone');
  checkId(state?.phases, t.phaseId, 'Construction phase');
  checkId(state?.construction.floors, t.floorId, 'Floor / zone');
  checkId(state?.vendors, t.vendorId, 'Vendor');
  checkId(state?.contractors, t.contractorId, 'Contractor');
  checkId(state?.construction.agreements, t.agreementId, 'Contractor agreement');
  if (t.agreementId && state) {
    const agreement = state.construction.agreements.find((a) => a.id === t.agreementId);
    if (agreement && t.contractorId && agreement.contractorId !== t.contractorId) {
      throw new Error('The agreement belongs to a different contractor.');
    }
  }

  if (t.type === 'LOAN_REPAYMENT') {
    const splits = [t.loanPrincipalAmount, t.loanInterestAmount, t.loanFeeAmount];
    if (splits.some((x) => x !== undefined)) {
      if (splits.some((x) => x !== undefined && (!Number.isFinite(x) || x < 0))) throw new Error('Loan split amounts must be non-negative.');
      if (splits.reduce<number>((total, x) => total + paise(x || 0), 0) !== paise(n)) {
        throw new Error('Loan principal + interest + fees must equal the repayment.');
      }
    }
    if (t.loanFacilityId) checkId(state?.loans, t.loanFacilityId, 'Loan facility');
  }
  if (t.type === 'REVERSAL') {
    const original = transactions.find((x) => x.id === t.reversalOf);
    if (!original || original.type === 'REVERSAL') throw new Error('A reversal must refer to an existing original transaction.');
    if (!notReversed(original.id, transactions)) throw new Error('Transaction has already been reversed.');
    if (paise(original.amount) !== paise(n)) throw new Error('Reversal amount must equal original amount.');
    if (original.type === 'ADVANCE') {
      const linked = transactions.some((x) => ['ADVANCE_ADJUSTMENT','ADVANCE_REFUND'].includes(x.type) && x.linkedTransactionId === original.id && notReversed(x.id, transactions));
      if (linked) throw new Error('Reverse advance settlements before reversing the advance.');
    }
    if (['EXPENSE','DIRECT_FUNDED_EXPENSE','ADVANCE_ADJUSTMENT'].includes(original.type)) {
      const hasRefund = transactions.some((x) => x.type === 'REFUND' && x.linkedTransactionId === original.id && notReversed(x.id, transactions));
      if (hasRefund) throw new Error('Reverse linked expense refunds before reversing this expense.');
    }
    if (state?.construction.stockMovements.some((m) => m.transactionId === original.id)) {
      throw new Error('The transaction is linked to stock movements. Reconcile the stock before reversal.');
    }
    return true;
  }
  if (t.reversalOf && transactions.some((x) => x.reversalOf === t.reversalOf)) {
    throw new Error('Transaction has already been reversed.');
  }

  if (t.type === 'ADVANCE_ADJUSTMENT' || t.type === 'ADVANCE_REFUND') {
    if (!t.linkedTransactionId) throw new Error('Choose the contractor advance to settle.');
    const { a, available } = remainingAdvance(t.linkedTransactionId, transactions);
    if (paise(n) > available) throw new Error('Settlement exceeds the remaining advance.');
    if (t.contractorId && a.contractorId && t.contractorId !== a.contractorId) throw new Error('Advance belongs to a different contractor.');
    if (t.agreementId && a.agreementId && t.agreementId !== a.agreementId) throw new Error('Advance belongs to a different agreement.');
    if (t.type === 'ADVANCE_REFUND' && a.sourceAccountId !== t.destinationAccountId) {
      throw new Error('Return the advance to the original payment account.');
    }
  }
  if (t.type === 'REFUND' && !t.reversalOf) {
    if (!t.linkedTransactionId) throw new Error('Link the expense being refunded.');
    const { original, available } = remainingRefundable(t.linkedTransactionId, transactions);
    if (paise(n) > available) throw new Error('Refund exceeds the original expense balance.');
    if (original.costBucket && t.costBucket !== original.costBucket) throw new Error('Refund cost bucket must match the original expense.');
    if (t.phaseId && original.phaseId && t.phaseId !== original.phaseId) throw new Error('Refund must use the original phase.');
    if (t.agreementId && original.agreementId && t.agreementId !== original.agreementId) throw new Error('Refund must use the original agreement.');
    if (t.floorId && original.floorId && t.floorId !== original.floorId) throw new Error('Refund must use the original floor.');
  }
  if (t.type === 'REFUND' && t.reversalOf) {
    // Backward-compatible historic reversals: previous versions used REFUND as
    // a credit for an EXPENSE. New corrections always use REVERSAL.
    if (!transactions.some((x) => x.id === t.reversalOf)) throw new Error('Original entry not found.');
  }

  if (t.lineItems?.length) {
    if (t.lineItems.length > 100) throw new Error('Too many item lines.');
    let sum = 0;
    for (const item of t.lineItems) {
      if (!item.description?.trim() || !isMoney(Number(item.amount))) throw new Error('Invalid material line or amount.');
      if (item.quantity !== undefined && (!Number.isFinite(item.quantity) || item.quantity <= 0)) throw new Error('Quantity must be positive.');
      if (item.rate !== undefined && (!Number.isFinite(item.rate) || item.rate < 0)) throw new Error('Rate must be non-negative.');
      if (item.quantity !== undefined && item.rate !== undefined && Math.abs(paise(item.quantity * item.rate) - paise(item.amount)) > 1) throw new Error('Quantity × rate differs from line amount.');
      sum += paise(item.amount);
    }
    if (sum !== paise(n)) throw new Error('Item line totals must match the transaction amount.');
  }

  for (const v of [t.category, t.payee, t.referenceNumber, t.description, t.notes]) {
    if (typeof v === 'string' && v.length > 1000) throw new Error('Transaction text is too long.');
  }
  return true;
}


export function refundableExpenses(txs: Transaction[]) {
  const reversed = new Set(txs.map((t) => t.reversalOf).filter(Boolean));
  return txs.filter((t) => ['EXPENSE', 'DIRECT_FUNDED_EXPENSE', 'ADVANCE_ADJUSTMENT'].includes(t.type) && !reversed.has(t.id))
    .map((original) => {
      const used = txs.filter((t) => t.type === 'REFUND' && t.linkedTransactionId === original.id && !reversed.has(t.id))
        .reduce((a, t) => a + paise(t.amount), 0);
      return { original, remaining: rupees(paise(original.amount) - used) };
    }).filter((x) => x.remaining > 0);
}

export function unsettledAdvances(txs: Transaction[]) {
  const reversed = new Set(txs.map((t) => t.reversalOf).filter(Boolean));
  return txs.filter((t) => t.type === 'ADVANCE' && !reversed.has(t.id))
    .map((advance) => {
      const used = txs.filter((t) => ['ADVANCE_ADJUSTMENT', 'ADVANCE_REFUND'].includes(t.type) && t.linkedTransactionId === advance.id && !reversed.has(t.id))
        .reduce((a, t) => a + paise(t.amount), 0);
      return { advance, remaining: rupees(paise(advance.amount) - used) };
    }).filter((x) => x.remaining > 0);
}

function normalize(v?: string) { return String(v || '').trim().toLowerCase(); }
export function findPotentialDuplicate(t: Partial<Transaction>, rows: Transaction[]) {
  if (t.type === 'REVERSAL') return undefined;
  const day = String(t.transactionDate || '').slice(0, 10);
  const ref = normalize(t.referenceNumber);
  return rows.find((x) => {
    if (x.id === t.id) return false;
    if (ref && normalize(x.referenceNumber) === ref && x.type === t.type) return true;
    return x.type === t.type && paise(x.amount) === paise(Number(t.amount || 0)) &&
      String(x.transactionDate).slice(0, 10) === day && normalize(x.payee) === normalize(t.payee) &&
      normalize(x.category) === normalize(t.category) && x.linkedTransactionId === t.linkedTransactionId;
  });
}

/** Agreement-specific paid cash and recognized work. Advances are not work
 * until adjusted; the same payment is never counted twice. */
export function agreementFinancials(txs: Transaction[], agreementId: string) {
  const byId = new Map(txs.map((t)=>[t.id,t]));
  let cashPaid = 0, recognizedWork = 0, openAdvance = 0;
  const apply = (t: Transaction, sign: number) => {
    const linked = byId.get(t.linkedTransactionId || '');
    if ((t.agreementId || linked?.agreementId) !== agreementId) return;
    const n = paise(t.amount) * sign;
    switch(t.type) {
      case 'EXPENSE': cashPaid += n; recognizedWork += n; break;
      case 'DIRECT_FUNDED_EXPENSE': cashPaid += n; recognizedWork += n; break;
      case 'ADVANCE': cashPaid += n; openAdvance += n; break;
      case 'ADVANCE_ADJUSTMENT': recognizedWork += n; openAdvance -= n; break;
      case 'ADVANCE_REFUND': cashPaid -= n; openAdvance -= n; break;
      case 'REFUND': cashPaid -= n; recognizedWork -= n; break;
      default: break;
    }
  };
  for (const t of txs) {
    if (t.type === 'REVERSAL') {
      const original = byId.get(t.reversalOf || '');
      if (original) apply(original,-1);
    } else apply(t,1);
  }
  return { cashPaid:rupees(cashPaid), recognizedWork:rupees(recognizedWork), openAdvance:rupees(openAdvance) };
}
