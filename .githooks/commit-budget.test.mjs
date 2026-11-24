// The commit lane's budget blocks a slow lane on an idle machine and only warns on a loaded one (J381).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { budgetVerdict } from './commit-budget.mjs';

const limits = { soft: 5, hard: 8 };

test('the commit budget is silent under soft and warns up to hard', () => {
  assert.equal(budgetVerdict(4, { ...limits, load: 0, cores: 8 }), 'ok');
  assert.equal(budgetVerdict(6.3, { ...limits, load: 0, cores: 8 }), 'warn');
});

test('over hard it blocks on an idle machine, warns on a loaded one, and SKIP_BUDGET still skips', () => {
  assert.equal(budgetVerdict(9.3, { ...limits, load: 4, cores: 8 }), 'block');
  assert.equal(budgetVerdict(9.3, { ...limits, load: 12, cores: 8 }), 'loaded');
  assert.equal(budgetVerdict(9.3, { ...limits, skip: true, load: 0, cores: 8 }), 'warn');
});
