import test from 'node:test';
import assert from 'node:assert/strict';

function ledger(txs) {
  let cost = 0;
  let acquisition = 0;
  let construction = 0;
  let funding = 0;
  let advance = 0;
  let repayment = 0;
  let bank = 0;
  let cash = 0;

  for (const t of txs) {
    const n = t.amount;
    switch (t.type) {
      case 'FUNDING_IN':
        t.dest === 'bank' ? bank += n : cash += n;
        funding += n;
        break;
      case 'TRANSFER':
        t.source === 'bank' ? bank -= n : cash -= n;
        t.dest === 'bank' ? bank += n : cash += n;
        break;
      case 'EXPENSE':
        t.source === 'bank' ? bank -= n : cash -= n;
        cost += n;
        t.bucket === 'ACQUISITION' ? acquisition += n : construction += n;
        break;
      case 'DIRECT_FUNDED_EXPENSE':
        funding += n;
        cost += n;
        t.bucket === 'ACQUISITION' ? acquisition += n : construction += n;
        break;
      case 'ADVANCE':
        t.source === 'bank' ? bank -= n : cash -= n;
        advance += n;
        break;
      case 'ADVANCE_ADJUSTMENT':
        advance -= n;
        cost += n;
        construction += n;
        break;
      case 'REFUND':
        t.dest === 'bank' ? bank += n : cash += n;
        cost -= n;
        t.bucket === 'ACQUISITION' ? acquisition -= n : construction -= n;
        break;
      case 'LOAN_REPAYMENT':
        t.source === 'bank' ? bank -= n : cash -= n;
        repayment += n;
        break;
    }
  }
  return { cost, acquisition, construction, funding, advance, repayment, bank, cash };
}

test('loan then cash transfer does not inflate cost', () => {
  const r = ledger([
    { type: 'FUNDING_IN', amount: 2100000, dest: 'bank' },
    { type: 'TRANSFER', amount: 500000, source: 'bank', dest: 'cash' },
  ]);
  assert.equal(r.cost, 0);
  assert.equal(r.funding, 2100000);
  assert.equal(r.bank, 1600000);
  assert.equal(r.cash, 500000);
});

test('advance is recognized only after adjustment', () => {
  const r = ledger([
    { type: 'FUNDING_IN', amount: 200000, dest: 'bank' },
    { type: 'ADVANCE', amount: 100000, source: 'bank' },
    { type: 'ADVANCE_ADJUSTMENT', amount: 60000 },
  ]);
  assert.equal(r.cost, 60000);
  assert.equal(r.advance, 40000);
  assert.equal(r.bank, 100000);
});

test('refund reduces recognized cost and returns money', () => {
  const r = ledger([
    { type: 'FUNDING_IN', amount: 100000, dest: 'bank' },
    { type: 'EXPENSE', amount: 50000, source: 'bank', bucket: 'CONSTRUCTION' },
    { type: 'REFUND', amount: 10000, dest: 'bank', bucket: 'CONSTRUCTION' },
  ]);
  assert.equal(r.cost, 40000);
  assert.equal(r.construction, 40000);
  assert.equal(r.bank, 60000);
});

test('lender payment can be funding and acquisition cost without touching bank', () => {
  const r = ledger([
    { type: 'DIRECT_FUNDED_EXPENSE', amount: 2500000, bucket: 'ACQUISITION' },
  ]);
  assert.equal(r.funding, 2500000);
  assert.equal(r.cost, 2500000);
  assert.equal(r.acquisition, 2500000);
  assert.equal(r.bank, 0);
});

test('loan repayment is cash outflow but not project construction cost', () => {
  const r = ledger([
    { type: 'FUNDING_IN', amount: 500000, dest: 'bank' },
    { type: 'LOAN_REPAYMENT', amount: 45000, source: 'bank' },
  ]);
  assert.equal(r.bank, 455000);
  assert.equal(r.repayment, 45000);
  assert.equal(r.cost, 0);
});
