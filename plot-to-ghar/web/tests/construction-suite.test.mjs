import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs/promises';

async function load(source) {
  const code = await fs.readFile(new URL(source, import.meta.url), 'utf8');
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
}
const { emi, loanProjection, stockBalances, materialEstimate, hasScheduleCycle, dueReminders } = await load('../lib/construction-calcs.ts');

test('EMI reduces correctly with zero interest', () => assert.equal(emi(120000, 0, 12), 10000));
test('repayment with extra principal reduces tenure and interest', () => {
  const normal=loanProjection(4600000,10.35,240,0);
  const extra=loanProjection(4600000,10.35,240,50000);
  assert.ok(extra.schedule.length < normal.schedule.length);
  assert.ok(extra.totalInterest < normal.totalInterest);
  assert.equal(extra.remainingAfterHorizon,0);
});
test('inventory stock issues cannot create ledger expenses', () => {
  const item=[{id:'cement'}];
  const moves=[{itemId:'cement',type:'RECEIPT',quantity:100},{itemId:'cement',type:'CONSUMPTION',quantity:30},{itemId:'cement',type:'WASTAGE',quantity:5},{itemId:'cement',type:'RETURN',quantity:10}];
  assert.equal(stockBalances(item,moves).cement,55);
});
test('concrete and brick estimate are finite and monotonic',()=>{
  const a=materialEstimate('concrete',5,3,.15), b=materialEstimate('concrete',10,3,.15);
  assert.ok(a.cementBags>0 && b.cementBags>a.cementBags);
  assert.equal(materialEstimate('brickwork',1,1,1).bricks,500);
  assert.equal(materialEstimate('brickwork',0,1,1).bricks,0);
});
test('schedule cycle detection supports acyclic dependencies',()=>{
  const tasks=[{id:'a',dependsOnId:'b'},{id:'b',dependsOnId:undefined}];
  assert.equal(hasScheduleCycle(tasks,'a','b'),false);
  assert.equal(hasScheduleCycle(tasks,'b','a'),true);
});
test('notifications ignore future events and include overdue tasks',()=>{
  const now=new Date(2026,9,30);
  const rows=[{id:'due',dueDate:'2026-10-28',repeat:'NONE',completed:false},{id:'future',dueDate:'2026-11-01',repeat:'NONE',completed:false}];
  assert.deepEqual(dueReminders(rows,now).map(x=>x.id),['due']);
});
