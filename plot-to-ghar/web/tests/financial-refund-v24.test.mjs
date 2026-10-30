import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs/promises';
async function load(filename) {
 const source=await fs.readFile(new URL(filename,import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
}
const {validateTx, computeLedger}=await load('../lib/ledger.ts');
const state={accounts:[{id:'bank',openingBalance:1000}],fundingSources:[],milestones:[],phases:[{id:'phase1'}],vendors:[],contractors:[]};
const expense={id:'exp1',type:'EXPENSE',amount:100,sourceAccountId:'bank',costBucket:'CONSTRUCTION',category:'cement',phaseId:'phase1',transactionDate:'2026-10-20'};
const refund={id:'refund1',type:'REFUND',amount:50,destinationAccountId:'bank',costBucket:'CONSTRUCTION',category:'cement',phaseId:'phase1',linkedTransactionId:'exp1',transactionDate:'2026-10-21'};
test('refund without original expense is rejected',()=>assert.throws(()=>validateTx({...refund,linkedTransactionId:undefined},{state,transactions:[expense]}),/original expense/));
test('partial refund reduces original project cost and restores account cash',()=>{
 validateTx(refund,{state,transactions:[expense]});
 const r=computeLedger(state.accounts,[expense,refund]);
 assert.equal(r.projectCost,50);
 assert.equal(r.accountBalances.bank,950);
});
test('refund cannot exceed linked unrefunded amount',()=>{
 assert.throws(()=>validateTx({...refund,id:'refund2',amount:51},{state,transactions:[expense,refund]}),/exceeds/);
});
test('refund cannot change cost bucket or category',()=>{
 assert.throws(()=>validateTx({...refund,category:'other'},{state,transactions:[expense]}),/match/);
});
test('advance settlement cannot exceed remaining balance',()=>{
 const a={id:'a1',type:'ADVANCE',amount:100,sourceAccountId:'bank',transactionDate:'2026-10-20'};
 const adj={id:'adj1',type:'ADVANCE_ADJUSTMENT',amount:70,linkedTransactionId:'a1',transactionDate:'2026-10-21'};
 const candidate={...adj,id:'adj2',amount:31};
 assert.throws(()=>validateTx(candidate,{state,transactions:[a,adj]}),/exceeds/);
});
test('reversal cannot happen twice',()=>{
 const reversed={...refund,reversalOf:'exp1'};
 assert.throws(()=>validateTx({...refund,reversalOf:'exp1'},{state,transactions:[expense,reversed]}),/already reversed/);
});
