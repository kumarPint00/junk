import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs/promises';

async function importTypescript(path) {
  const source = await fs.readFile(new URL(path, import.meta.url), 'utf8');
  const out = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  return import('data:text/javascript;base64,'+Buffer.from(out).toString('base64'));
}
const { computeLedger, validateTx, refundableExpenses, unsettledAdvances } = await importTypescript('../lib/ledger.ts');
const { defaultState, normalizeState, validateStateTransition, validateProjectState } = await importTypescript('../lib/defaults.ts');
const state = defaultState();
const bank = 'bank-main', cash = 'cash-main';
function tx(type,amount,attrs={}) {
  return { id: crypto.randomUUID(), createdAt:'2026-10-30T11:00:00Z', transactionDate:'2026-10-30T11:00:00Z',type,amount,...attrs };
}
const accounting = (rows) => computeLedger(state.accounts,rows);
const expectValid = (t,rows) => assert.equal(validateTx(t,{state,transactions:rows}),true);
const expectInvalid = (t,rows,pattern) => assert.throws(()=>validateTx(t,{state,transactions:rows}),pattern);

test('purchase loan is funding, withdrawal is transfer, direct seller cheque is acquisition cost',()=>{
  const drawn=tx('FUNDING_IN',2100000,{destinationAccountId:bank,fundingSourceId:'loan-construction'});
  const moved=tx('TRANSFER',500000,{sourceAccountId:bank,destinationAccountId:cash});
  const seller=tx('DIRECT_FUNDED_EXPENSE',2500000,{fundingSourceId:'loan-purchase',costBucket:'ACQUISITION',category:'Seller cheque'});
  for(const [i,t] of [drawn,moved,seller].entries())expectValid(t,[drawn,moved,seller].slice(0,i));
  const r=accounting([drawn,moved,seller]);
  assert.equal(r.projectCost,2500000);
  assert.equal(r.acquisitionCost,2500000);
  assert.equal(r.constructionCost,0);
  assert.equal(r.fundingReceived,4600000);
  assert.equal(r.accountBalances[bank],1600000);
  assert.equal(r.accountBalances[cash],500000);
  assert.equal(r.receivedBySource['loan-purchase'],2500000);
  assert.equal(r.receivedBySource['loan-construction'],2100000);
});

test('advance is a cash outflow, but becomes cost only on adjustment; return is not expense',()=>{
  const funding=tx('FUNDING_IN',100000,{destinationAccountId:bank,fundingSourceId:'own-funds'});
  const advance=tx('ADVANCE',60000,{sourceAccountId:bank,contractorId:undefined});
  const adjustment=tx('ADVANCE_ADJUSTMENT',30000,{linkedTransactionId:advance.id,costBucket:'CONSTRUCTION',category:'Labour',floorId:'floor-ground'});
  const returned=tx('ADVANCE_REFUND',20000,{linkedTransactionId:advance.id,destinationAccountId:bank});
  expectValid(advance,[funding]);
  expectValid(adjustment,[funding,advance]);
  expectValid(returned,[funding,advance,adjustment]);
  const sum=accounting([funding,advance,adjustment,returned]);
  assert.equal(sum.projectCost,30000);
  assert.equal(sum.floorSpend['floor-ground'],30000);
  assert.equal(sum.advancesOutstanding,10000);
  assert.equal(sum.accountBalances[bank],60000);
  assert.equal(unsettledAdvances([funding,advance,adjustment,returned])[0].remaining,10000);
  expectInvalid(tx('ADVANCE_REFUND',11000,{linkedTransactionId:advance.id,destinationAccountId:bank}),[funding,advance,adjustment,returned],/exceeds/);
});
test('refund is tied to original expense; remaining amount and original bucket/floor are enforced',()=>{
  const expense=tx('EXPENSE',50000,{sourceAccountId:bank,costBucket:'CONSTRUCTION',floorId:'floor-ground',phaseId:'phase-9',category:'Cement'});
  const refund=tx('REFUND',12000,{linkedTransactionId:expense.id,destinationAccountId:bank,costBucket:'CONSTRUCTION',floorId:'floor-ground',phaseId:'phase-9'});
  expectInvalid(tx('REFUND',1000,{destinationAccountId:bank,costBucket:'CONSTRUCTION'}),[expense],/Link/);
  expectValid(refund,[expense]);
  const r=accounting([expense,refund]);
  assert.equal(r.projectCost,38000);
  assert.equal(r.floorSpend['floor-ground'],38000);
  assert.equal(r.categorySpend['Cement'],38000);
  assert.equal(refundableExpenses([expense,refund])[0].remaining,38000);
  expectInvalid(tx('REFUND',40000,{linkedTransactionId:expense.id,destinationAccountId:bank,costBucket:'CONSTRUCTION',floorId:'floor-ground'}),[expense,refund],/exceeds/);
  expectInvalid(tx('REFUND',1000,{linkedTransactionId:expense.id,destinationAccountId:bank,costBucket:'ACQUISITION'}),[expense],/bucket/);
});
test('universal reversal restores funding, cash transfers, expenses and account balances without deletion',()=>{
  const original=[
    tx('FUNDING_IN',200000,{destinationAccountId:bank,fundingSourceId:'own-funds'}),
    tx('TRANSFER',80000,{sourceAccountId:bank,destinationAccountId:cash}),
    tx('EXPENSE',32000,{sourceAccountId:cash,costBucket:'CONSTRUCTION',floorId:'floor-first'}),
  ];
  const corrections=original.map(x=>tx('REVERSAL',x.amount,{reversalOf:x.id}));
  const existing=[...original];
  for(const correction of [...corrections].reverse()){
    expectValid(correction,existing);
    existing.push(correction);
  }
  const s=accounting(existing);
  assert.equal(s.fundingReceived,0);
  assert.equal(s.projectCost,0);
  assert.equal(s.accountBalances[bank],0);
  assert.equal(s.accountBalances[cash],0);
  assert.equal(s.reversedCount,3);
  expectInvalid(tx('REVERSAL',original[0].amount,{reversalOf:original[0].id}),existing,/already/);
});
test('cannot reverse settled advance or an expense that has linked refund',()=>{
  const a=tx('ADVANCE',20000,{sourceAccountId:bank});
  const settled=tx('ADVANCE_ADJUSTMENT',5000,{linkedTransactionId:a.id,costBucket:'CONSTRUCTION'});
  expectInvalid(tx('REVERSAL',20000,{reversalOf:a.id}),[a,settled],/Reverse advance settlements/);
  const e=tx('EXPENSE',20000,{sourceAccountId:bank,costBucket:'CONSTRUCTION'});
  const refund=tx('REFUND',1000,{linkedTransactionId:e.id,destinationAccountId:bank,costBucket:'CONSTRUCTION'});
  expectInvalid(tx('REVERSAL',20000,{reversalOf:e.id}),[e,refund],/Reverse linked expense refunds/);
});
test('reconciliation adjustment changes cash but neither funding nor project cost',()=>{
  const entry=tx('BALANCE_ADJUSTMENT',375,{destinationAccountId:cash,description:'Counted cash was 375 higher than ledger, witness present'});
  expectValid(entry,[]);
  const r=accounting([entry]);
  assert.equal(r.accountBalances[cash],375);
  assert.equal(r.fundingReceived,0);
  assert.equal(r.projectCost,0);
  expectInvalid(tx('BALANCE_ADJUSTMENT',375,{destinationAccountId:cash}),[],/Explain/);
});
test('loan EMI distinguishes principal interest and fees; unknown split is flagged',()=>{
  const emi=tx('LOAN_REPAYMENT',15000,{sourceAccountId:bank,loanFacilityId:'loan-piramal',loanPrincipalAmount:3500,loanInterestAmount:11500,loanFeeAmount:0});
  expectValid(emi,[]);
  const r=accounting([emi]);
  assert.equal(r.loanRepayments,15000);
  assert.equal(r.loanPrincipalPaid,3500);
  assert.equal(r.loanInterestPaid,11500);
  assert.equal(r.projectCost,0);
  expectInvalid(tx('LOAN_REPAYMENT',15000,{sourceAccountId:bank,loanPrincipalAmount:12000,loanInterestAmount:4000}),[],/must equal/);
  const legacy=accounting([tx('LOAN_REPAYMENT',15000,{sourceAccountId:bank})]);
  assert.equal(legacy.unallocatedLoanRepayments,15000);
  assert.ok(legacy.integrityWarnings.some(w=>w.includes('principal/interest')));
});
test('hundreds of paise do not drift over multiple additions',()=>{
  const purchases=Array.from({length:100},()=>tx('EXPENSE',0.01,{sourceAccountId:bank,costBucket:'OTHER'}));
  assert.equal(accounting(purchases).projectCost,1);
  expectInvalid(tx('EXPENSE',0.001,{sourceAccountId:bank,costBucket:'OTHER'}),[],/two decimal/);
});
test('used account opening balances cannot be rewritten; untouched setup remains editable',()=>{
  const old=defaultState(), next=normalizeState(old);
  next.accounts[0].openingBalance=500;
  validateStateTransition(old,next,[]);
  const recorded=tx('FUNDING_IN',12000,{fundingSourceId:'own-funds',destinationAccountId:bank});
  assert.throws(()=>validateStateTransition(old,next,[recorded]),/Opening balance/);
  assert.ok(validateProjectState(next));
});
test('legacy unlinked refund remains visible and flagged instead of silently deleting user data',()=>{
  const old=tx('REFUND',1000,{destinationAccountId:bank,costBucket:'CONSTRUCTION'});
  const s=accounting([old]);
  assert.equal(s.projectCost,-1000);
  assert.ok(s.integrityWarnings.some(w=>w.includes('Refund without linked')));
});
