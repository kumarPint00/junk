import type { Account, LedgerSummary, ProjectState, Transaction, TxType } from './types';

const txTypes: TxType[] = [
  'FUNDING_IN',
  'TRANSFER',
  'EXPENSE',
  'ADVANCE',
  'ADVANCE_ADJUSTMENT',
  'ADVANCE_REFUND',
  'REFUND',
  'DIRECT_FUNDED_EXPENSE',
  'LOAN_REPAYMENT',
];

function add(map: Record<string, number>, key: string | undefined, amount: number) {
  if (!key) return;
  map[key] = (map[key] || 0) + amount;
}

function costDelta(t: Transaction) {
  if (t.type === 'EXPENSE' || t.type === 'DIRECT_FUNDED_EXPENSE' || t.type === 'ADVANCE_ADJUSTMENT') return t.amount;
  if (t.type === 'REFUND') return -t.amount;
  return 0;
}

export function computeLedger(accounts: Account[], txs: Transaction[]): LedgerSummary {
  const balances: Record<string, number> = {};
  for (const a of accounts) balances[a.id] = Number(a.openingBalance || 0);

  let projectCost = 0;
  let acquisitionCost = 0;
  let constructionCost = 0;
  let otherCost = 0;
  let fundingReceived = 0;
  let advancesOutstanding = 0;
  let loanRepayments = 0;
  const phaseSpend: Record<string, number> = {};
  const categorySpend: Record<string, number> = {};
  const monthlySpend: Record<string, number> = {};

  for (const t of txs) {
    const n = Number(t.amount || 0);
    switch (t.type) {
      case 'FUNDING_IN':
        if (t.destinationAccountId) balances[t.destinationAccountId] = (balances[t.destinationAccountId] || 0) + n;
        fundingReceived += n;
        break;
      case 'TRANSFER':
        if (t.sourceAccountId) balances[t.sourceAccountId] = (balances[t.sourceAccountId] || 0) - n;
        if (t.destinationAccountId) balances[t.destinationAccountId] = (balances[t.destinationAccountId] || 0) + n;
        break;
      case 'EXPENSE':
        if (t.sourceAccountId) balances[t.sourceAccountId] = (balances[t.sourceAccountId] || 0) - n;
        break;
      case 'DIRECT_FUNDED_EXPENSE':
        fundingReceived += n;
        break;
      case 'ADVANCE':
        if (t.sourceAccountId) balances[t.sourceAccountId] = (balances[t.sourceAccountId] || 0) - n;
        advancesOutstanding += n;
        break;
      case 'ADVANCE_ADJUSTMENT':
        advancesOutstanding -= n;
        break;
      case 'ADVANCE_REFUND':
        if (t.destinationAccountId) balances[t.destinationAccountId] = (balances[t.destinationAccountId] || 0) + n;
        advancesOutstanding -= n;
        break;
      case 'REFUND':
        if (t.destinationAccountId) balances[t.destinationAccountId] = (balances[t.destinationAccountId] || 0) + n;
        break;
      case 'LOAN_REPAYMENT':
        if (t.sourceAccountId) balances[t.sourceAccountId] = (balances[t.sourceAccountId] || 0) - n;
        loanRepayments += n;
        break;
    }

    const delta = costDelta(t);
    if (delta) {
      projectCost += delta;
      if (t.costBucket === 'ACQUISITION') acquisitionCost += delta;
      else if (t.costBucket === 'CONSTRUCTION') constructionCost += delta;
      else otherCost += delta;
      add(phaseSpend, t.phaseId, delta);
      add(categorySpend, t.category || 'Uncategorized', delta);
      const month = String(t.transactionDate || '').slice(0, 7);
      add(monthlySpend, month || 'Unknown', delta);
    }
  }

  return {
    projectCost,
    acquisitionCost,
    constructionCost,
    otherCost,
    fundingReceived,
    advancesOutstanding: Math.max(0, advancesOutstanding),
    loanRepayments,
    accountBalances: balances,
    phaseSpend,
    categorySpend,
    monthlySpend,
    txCount: txs.length,
  };
}

export type ValidationContext = {
  state?: ProjectState;
  transactions?: Transaction[];
};

function checkId(list: { id: string }[] | undefined, id: string | undefined, label: string) {
  if (id && list && !list.some((x) => x.id === id)) throw new Error(`${label} no longer exists.`);
}

function linkedAdvanceBalance(id: string, txs: Transaction[]) {
  const advance = txs.find((x) => x.id === id && x.type === 'ADVANCE');
  if (!advance) throw new Error('Linked advance is invalid.');
  const settled = txs
    .filter(
      (x) =>
        (x.type === 'ADVANCE_ADJUSTMENT' || x.type === 'ADVANCE_REFUND') &&
        x.linkedTransactionId === advance.id
    )
    .reduce((sum, x) => sum + Number(x.amount || 0), 0);
  return { advance, remaining: Number(advance.amount) - settled };
}

export function validateTx(t: Partial<Transaction>, context: ValidationContext = {}) {
  const amount = Number(t.amount || 0);
  if (!t.type || !txTypes.includes(t.type as TxType)) throw new Error('Invalid transaction type.');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than zero.');
  if (amount > 1_000_000_000) throw new Error('Amount is outside the supported range.');

  if (
    t.type === 'TRANSFER' &&
    (!t.sourceAccountId || !t.destinationAccountId || t.sourceAccountId === t.destinationAccountId)
  ) {
    throw new Error('Transfer requires two different accounts.');
  }
  if (['EXPENSE', 'ADVANCE', 'LOAN_REPAYMENT'].includes(t.type) && !t.sourceAccountId) {
    throw new Error('Payment account is required.');
  }
  if (['FUNDING_IN', 'REFUND', 'ADVANCE_REFUND'].includes(t.type) && !t.destinationAccountId) {
    throw new Error('Destination account is required.');
  }
  if (['FUNDING_IN', 'DIRECT_FUNDED_EXPENSE'].includes(t.type) && !t.fundingSourceId) {
    throw new Error('Funding source is required.');
  }

  const state = context.state;
  checkId(state?.accounts, t.sourceAccountId, 'Source account');
  checkId(state?.accounts, t.destinationAccountId, 'Destination account');
  checkId(state?.fundingSources, t.fundingSourceId, 'Funding source');
  checkId(state?.milestones, t.milestoneId, 'Milestone');
  checkId(state?.phases, t.phaseId, 'Construction phase');
  checkId(state?.vendors, t.vendorId, 'Vendor');
  checkId(state?.contractors, t.contractorId, 'Contractor');

  if (Array.isArray(t.lineItems) && t.lineItems.length) {
    if (t.lineItems.length > 100) throw new Error('Too many line items.');
    let total = 0;
    for (const item of t.lineItems) {
      const itemAmount = Number(item.amount || 0);
      if (!item.description?.trim()) throw new Error('Each line item needs a description.');
      if (!Number.isFinite(itemAmount) || itemAmount < 0) throw new Error('Invalid line-item amount.');
      total += itemAmount;
    }
    if (Math.abs(total - amount) > 0.01) throw new Error('Line-item total does not match transaction amount.');
  }

  const txs = context.transactions || [];
  if (t.type === 'ADVANCE_ADJUSTMENT' || t.type === 'ADVANCE_REFUND') {
    if (!t.linkedTransactionId) throw new Error('Select the advance being settled.');
    const { remaining } = linkedAdvanceBalance(t.linkedTransactionId, txs);
    if (amount > remaining + 0.01) throw new Error('This entry exceeds the linked advance balance.');
  }
  if (t.type === 'REFUND') {
    const currentCost = computeLedger(state?.accounts || [], txs).projectCost;
    if (amount > currentCost + 0.01) throw new Error('Refund cannot exceed the currently recognized project cost.');
  }

  for (const value of [t.category, t.payee, t.referenceNumber, t.description, t.notes]) {
    if (typeof value === 'string' && value.length > 1000) throw new Error('Transaction text is too long.');
  }
}

function norm(v?: string) {
  return String(v || '').trim().toLowerCase();
}

export function findPotentialDuplicate(candidate: Partial<Transaction>, txs: Transaction[]) {
  const day = String(candidate.transactionDate || '').slice(0, 10);
  const ref = norm(candidate.referenceNumber);
  return txs.find((t) => {
    if (candidate.id && t.id === candidate.id) return false;
    if (ref && norm(t.referenceNumber) === ref) return true;
    return (
      t.type === candidate.type &&
      Math.abs(Number(t.amount) - Number(candidate.amount)) < 0.01 &&
      String(t.transactionDate).slice(0, 10) === day &&
      norm(t.payee) === norm(candidate.payee) &&
      norm(t.category) === norm(candidate.category)
    );
  });
}
