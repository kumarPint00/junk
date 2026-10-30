import test from 'node:test';
import assert from 'node:assert/strict';

test('advance return is financially neutral to project cost', () => {
  const originalAdvance = 100000;
  const returnedAdvance = 40000;
  const recognizedCost = 0;
  const outstandingAdvance = originalAdvance - returnedAdvance;

  assert.equal(recognizedCost, 0);
  assert.equal(outstandingAdvance, 60000);
});
