import type { Account, FinanceSummary, Transaction } from './types';

export function calculateFinance(accounts: Account[], txs: Transaction[]): FinanceSummary {
  const accountBalances: Record<string, number> = {};
  accounts.filter(a => !a.deletedAt).forEach(a => {
    accountBalances[a.id] = Number(a.openingBalance || 0);
  });

  let totalCost = 0;
  let totalFundingReceived = 0;
  let advancesPaid = 0;
  let advancesAdjusted = 0;
  const categoryTotals: Record<string, number> = {};
  const milestoneTotals: Record<string, number> = {};
  const fundingReceivedBySource: Record<string, number> = {};

  const addAccount = (id: string | undefined, amount: number) => {
    if (!id) return;
    accountBalances[id] = (accountBalances[id] || 0) + amount;
  };
  const addCost = (tx: Transaction, amount: number) => {
    totalCost += amount;
    const category = tx.category || 'Uncategorised';
    categoryTotals[category] = (categoryTotals[category] || 0) + amount;
    if (tx.milestoneId) {
      milestoneTotals[tx.milestoneId] = (milestoneTotals[tx.milestoneId] || 0) + amount;
    }
  };

  txs
    .filter(tx => !tx.deletedAt)
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach(tx => {
      const amount = Number(tx.amount || 0);
      switch (tx.type) {
        case 'FUNDING_IN':
          addAccount(tx.destinationAccountId, amount);
          totalFundingReceived += amount;
          if (tx.fundingSourceId) {
            fundingReceivedBySource[tx.fundingSourceId] =
              (fundingReceivedBySource[tx.fundingSourceId] || 0) + amount;
          }
          break;
        case 'TRANSFER':
          addAccount(tx.sourceAccountId, -amount);
          addAccount(tx.destinationAccountId, amount);
          break;
        case 'EXPENSE':
          addAccount(tx.sourceAccountId, -amount);
          addCost(tx, amount);
          break;
        case 'DIRECT_FUNDED_EXPENSE':
          totalFundingReceived += amount;
          addCost(tx, amount);
          if (tx.fundingSourceId) {
            fundingReceivedBySource[tx.fundingSourceId] =
              (fundingReceivedBySource[tx.fundingSourceId] || 0) + amount;
          }
          break;
        case 'ADVANCE':
          addAccount(tx.sourceAccountId, -amount);
          advancesPaid += amount;
          break;
        case 'ADVANCE_ADJUSTMENT':
          advancesAdjusted += amount;
          addCost(tx, amount);
          break;
        case 'REFUND':
          addAccount(tx.destinationAccountId, amount);
          addCost(tx, -amount);
          break;
        case 'LOAN_REPAYMENT':
          addAccount(tx.sourceAccountId, -amount);
          break;
        case 'ADJUSTMENT':
          if (tx.sourceAccountId) addAccount(tx.sourceAccountId, -amount);
          if (tx.destinationAccountId) addAccount(tx.destinationAccountId, amount);
          break;
      }
    });

  const totalAvailable = Object.values(accountBalances).reduce((sum, value) => sum + value, 0);

  return {
    accountBalances,
    totalAvailable,
    totalCost,
    totalFundingReceived,
    advancesPaid,
    advancesAdjusted,
    advancesOutstanding: advancesPaid - advancesAdjusted,
    categoryTotals,
    milestoneTotals,
    fundingReceivedBySource
  };
}

export function formatINR(value: number | undefined) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}
