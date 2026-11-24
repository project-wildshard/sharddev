// oxlint-disable-next-line import/no-nodejs-modules -- Reads the repository's own CI workflow.
import { readFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolves the workflow from the package root.
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

/** The product proofs run 11 min on a normal runner; two slow runners cancelled them past 15 with nothing red
 * (45439889036, 45489963164), which held SDK 0.4.31's exact-SHA release ci (opus-wave, J505). */
const PRODUCTS_PUSH_MINUTES = 25;

test('a push gives the product proofs room past a slow runner', () => {
  const workflow = readFileSync(resolve('../../.github/workflows/ci.yml'), 'utf8');
  const job = workflow.slice(workflow.indexOf('\n  products:\n'), workflow.indexOf('\n  packed-install:\n'));
  const minutes = /timeout-minutes: .*\|\| (\d+) \}\}/u.exec(job)?.[1];
  expect(Number(minutes)).toBe(PRODUCTS_PUSH_MINUTES);
});
