// Meta QA 11-25 row 75: this fork of repo-kit's gate reports a failed job through gate-report.mjs, so a red push ends
// with its failing step and the hatch, not thousands of passing lines (repo-kit test/tooling/gate-report.test.mjs has
// the full cases).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TAIL, failureReport } from './gate-report.mjs';

test('a long passing head and a failing tail: the X line names the failure, the head is not shown', () => {
  const output = [...Array.from({ length: 1500 }, (_, i) => `✔ case ${i} passes`), "src/a.ts(3,1): error TS2304: Cannot find name 'x'.", 'Found 1 error'].join('\n');
  const report = failureReport({ name: 'check', output, write: () => undefined });
  assert.match(report.split('\n')[0], /^ {2}X pnpm check failed: src\/a\.ts\(3,1\): error TS2304/u);
  assert.equal(report.split('\n').length, 2 + TAIL);
  assert.ok(!report.includes('case 0 passes'));
});

test('the fork reports through it, with the hatch after', () => {
  const source = readFileSync(join(import.meta.dirname, 'run-checks.mjs'), 'utf8');
  assert.match(source, /failureReport\(\{ name, output, logPath: logOf\(name\) \}\)/u);
  assert.ok(source.indexOf('failureReport({ name') < source.indexOf('SKIP_CHECK=1 is a last resort'));
});
