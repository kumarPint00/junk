import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const get = async (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('all four home financial summary cards are accessible controls with real routes', async () => {
  const home = await get('components/views/Home.tsx');
  assert.equal((home.match(/className="metricCard metricAction"/g) || []).length, 4);
  assert.match(home, /openSection\('more', 'accounts'\)/);
  assert.match(home, /openSection\('journey', 'budgets'\)/);
  assert.match(home, /openSection\('build', 'reports'\)/);
  assert.match(home, /onClick=\{\(\) => openSection\('ledger', tx\.id\)\}/);
  assert.match(home, /className="progressOverview progressAction"/);
  assert.match(home, /className="chartBlock chartAction"/);
});
test('navigation sends card selections to the correct focused editors', async () => {
  const shell = await get('components/AppShell.tsx');
  assert.match(shell, /setJourneyFocus\(feature === 'budgets'/);
  assert.match(shell, /setControlFocus\(feature as typeof controlFocus\)/);
  assert.match(shell, /focusSection=\{controlFocus\}/);
  assert.match(shell, /focusSection=\{journeyFocus\}/);
  assert.match(shell, /focusTransactionId=\{ledgerFocus\}/);
});
test('form validation failures propagate instead of reporting successful writes', async () => {
  const shell = await get('components/AppShell.tsx');
  const save = shell.slice(shell.indexOf('async function saveState'), shell.indexOf('async function postTx'));
  assert.match(save, /throw e;/);
  assert.match(save, /validateProjectState/);
  assert.match(save, /PENDING_STATE/);
});
test('project settings and phase budgets offer explicit save, discard and unsaved state', async () => {
  const more = await get('components/views/More.tsx');
  const journey = await get('components/views/Journey.tsx');
  for (const source of [more, journey]) {
    assert.match(source, /controlSaveBar/);
    assert.match(source, /Unsaved/);
    assert.match(source, /Discard/);
  }
  assert.match(more, /id="ptg-control-accounts"/);
  assert.match(more, /id="ptg-control-funding"/);
  assert.match(journey, /id="ptg-journey-budgets"/);
  assert.match(journey, /Exact progress %/);
});
test('ledger drilldowns preserve audit-only corrections, with no direct amount edit', async () => {
  const ledger = await get('components/views/Ledger.tsx');
  assert.match(ledger, /Transaction details/);
  assert.match(ledger, /selected\.id/);
  assert.match(ledger, /Reverse this entry/);
  assert.match(ledger, /Direct editing is disabled/);
  assert.match(ledger, /Add correcting transaction/);
});
test('reminders have edit and delete controls, loan settings are linked', async () => {
  const tools = await get('components/views/ConstructionTools.tsx');
  assert.match(tools, /function editReminder\(/);
  assert.match(tools, /function removeReminder\(/);
  assert.match(tools, /Edit saved loan terms/);
  assert.match(tools, /Save reminder changes/);
});
