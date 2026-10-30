import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs/promises';

async function load(filename) {
  const code = await fs.readFile(new URL(filename, import.meta.url), 'utf8');
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
}
const { materialEstimate, plasterEstimate, flooringEstimate, stockBalances } = await load('../lib/construction-calcs.ts');
const { normalizeState, defaultState, validateProjectState } = await load('../lib/defaults.ts');

test('plaster planning estimate uses measured area and thickness, not invented cash values', () => {
  const x = plasterEstimate(30, 12);
  assert.equal(x.areaM2, 30);
  assert.ok(x.cementBags > 0 && x.sandM3 > 0);
  assert.equal(plasterEstimate(30, -1).cementBags, 0);
});
test('tile wastage increases purchase allowance while preserving base count', () => {
  const plain=flooringEstimate(12,60,60,0);
  const withWaste=flooringEstimate(12,60,60,10);
  assert.equal(plain.tilesWithoutWaste, 34);
  assert.equal(withWaste.tilesWithoutWaste, 34);
  assert.ok(withWaste.tilesWithWaste > plain.tilesWithWaste);
  assert.equal(flooringEstimate(12,0,60,10).tilesWithWaste,0);
  assert.equal(flooringEstimate(12,60,60,60).tilesWithWaste,0);
});
test('stock corrections are append-only movements with predictable direction', () => {
  const items=[{id:'cement'}];
  const moves=[
    {itemId:'cement',type:'RECEIPT',quantity:100},
    {itemId:'cement',type:'CORRECTION_OUT',quantity:5},
    {itemId:'cement',type:'CONSUMPTION',quantity:70},
    {itemId:'cement',type:'CORRECTION_IN',quantity:2},
  ];
  assert.equal(stockBalances(items,moves).cement,27);
});
test('legacy state upgrades with empty document library without changing financial accounts', () => {
  const old=defaultState();
  const copy=structuredClone(old);
  delete copy.construction.documents;
  copy.accounts[0].openingBalance=17123;
  const next=normalizeState(copy);
  assert.deepEqual(next.construction.documents,[]);
  assert.equal(next.accounts[0].openingBalance,17123);
  assert.ok(validateProjectState(next));
});
test('new document metadata is compatible with validation and remains part of state', () => {
  const state=defaultState();
  state.construction.documents=[{id:'reg1',title:'Registry copy',category:'REGISTRY',date:'2026-10-30',attachments:[
    {pathname:'local://stored',name:'registry.pdf',contentType:'application/pdf',size:123}
  ]}];
  assert.ok(validateProjectState(normalizeState(state)));
});
test('dashboard routes and construction hub include all metadata artwork feature destinations', async () => {
  const home=await fs.readFile(new URL('../components/views/Home.tsx',import.meta.url),'utf8');
  const hub=await fs.readFile(new URL('../components/views/ConstructionHub.tsx',import.meta.url),'utf8');
  const shell=await fs.readFile(new URL('../components/AppShell.tsx',import.meta.url),'utf8');
  for(const term of ['Floor plans','Materials','Schedule','Expenses','Contractors','Loans','Documents','Reports','Progress','Reminders','Receipt scanner'])assert.ok(home.includes(term),term);
  for(const feature of ['floors','estimate','schedule','materials','agreements','progress','finance','documents','reports','reminders','ocr'])assert.ok(hub.includes("id:'"+feature+"'"),feature);
  assert.ok(shell.includes('initialTab={buildTab}'));
});
test('light-theme CSS is imported and full backup includes independent document evidence', async () => {
  const layout=await fs.readFile(new URL('../app/layout.tsx',import.meta.url),'utf8');
  const backup=await fs.readFile(new URL('../lib/local-db.ts',import.meta.url),'utf8');
  assert.ok(layout.includes("import './light-theme.css'"));
  assert.ok(backup.includes('state.construction?.documents'));
});
