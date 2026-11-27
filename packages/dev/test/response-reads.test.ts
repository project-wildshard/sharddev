// SF7c (11-27): a body read cut short by a closed page killed `wildshard prepare` on Nine Dragon with an unhandled
// rejection. Each read is settled, so a late one can never reject unawaited, and only a closed target is forgiven.
import { expect, test } from 'vitest';
import { closedTarget, settle, settledValues } from '../scripts/response-reads.mjs';

const closed = new Error('response.body: Target page, context or browser has been closed');

test('a read cut short by a closed target settles and is dropped', async () => {
  const late = settle(Promise.reject(closed));
  await new Promise((done) => setTimeout(done, 0));
  expect(settledValues(await Promise.all([settle(Promise.resolve('abc')), late]))).toEqual(['abc']);
  expect(closedTarget(new Error('Target closed'))).toBe(true);
});

test('any other failed read still fails where the recorder awaits it', async () => {
  const broken = new Error('Unexpected token < in JSON');
  expect(closedTarget(broken)).toBe(false);
  expect(() => settledValues([{ value: 1 }, { error: broken }])).toThrow(broken);
  expect(await settle(Promise.reject(broken))).toEqual({ error: broken });
});
