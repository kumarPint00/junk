import { describe, expect, it } from 'vitest';
import { calculateFinance } from './finance';
import type { Account, Transaction } from './types';

const ts = '2026-10-30T00:00:00.000Z';
const accounts: Account[] = [
  { id:'bank', projectId:'p', name:'Bank', kind:'BANK', openingBalance:0, active:true, createdAt:ts, updatedAt:ts },
  { id:'cash', projectId:'p', name:'Cash', kind:'CASH', openingBalance:0, active:true, createdAt:ts, updatedAt:ts }
];
const tx = (partial: Partial<Transaction> & Pick<Transaction,'id'|'type'|'amount'>): Transaction => ({
  projectId:'p', date:ts, description:'x', createdAt:ts, updatedAt:ts, ...partial
});

describe('financial integrity', () => {
  it('does not count bank-to-cash transfer as expense', () => {
    const rows = [
      tx({id:'f',type:'FUNDING_IN',amount:500000,destinationAccountId:'bank'}),
      tx({id:'t',type:'TRANSFER',amount:300000,sourceAccountId:'bank',destinationAccountId:'cash'})
    ];
    const s = calculateFinance(accounts, rows);
    expect(s.totalCost).toBe(0);
    expect(s.accountBalances.bank).toBe(200000);
    expect(s.accountBalances.cash).toBe(300000);
  });

  it('recognises only actual expense', () => {
    const rows = [
      tx({id:'f',type:'FUNDING_IN',amount:500000,destinationAccountId:'bank'}),
      tx({id:'e',type:'EXPENSE',amount:50000,sourceAccountId:'bank',category:'Steel'})
    ];
    const s = calculateFinance(accounts, rows);
    expect(s.totalCost).toBe(50000);
    expect(s.categoryTotals.Steel).toBe(50000);
  });

  it('keeps contractor advance out of cost until adjusted', () => {
    const rows = [
      tx({id:'f',type:'FUNDING_IN',amount:500000,destinationAccountId:'bank'}),
      tx({id:'a',type:'ADVANCE',amount:100000,sourceAccountId:'bank'}),
      tx({id:'x',type:'ADVANCE_ADJUSTMENT',amount:60000,category:'RCC labour'})
    ];
    const s = calculateFinance(accounts, rows);
    expect(s.totalCost).toBe(60000);
    expect(s.advancesOutstanding).toBe(40000);
    expect(s.accountBalances.bank).toBe(400000);
  });

  it('refund reduces cost', () => {
    const rows = [
      tx({id:'f',type:'FUNDING_IN',amount:500000,destinationAccountId:'bank'}),
      tx({id:'e',type:'EXPENSE',amount:50000,sourceAccountId:'bank',category:'Cement'}),
      tx({id:'r',type:'REFUND',amount:10000,destinationAccountId:'bank',category:'Cement'})
    ];
    const s = calculateFinance(accounts, rows);
    expect(s.totalCost).toBe(40000);
    expect(s.accountBalances.bank).toBe(460000);
  });
});
