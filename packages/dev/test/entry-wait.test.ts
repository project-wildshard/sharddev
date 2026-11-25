// FAST-RELEASE FR-A13: the recorder's entry wait names what the page waited on and stops early on a failed page.
import { expect, test } from 'vitest';
import { waitForEntry } from '../scripts/entry-wait.mjs';

type State = { entered: boolean, error: string | null, loading: string | null };
function fixture(states: State[], { crashAt = -1, goneAt = -1 } = {}) {
  let clock = 0, at = 0;
  const seen = { errors: ['uncaught no weapon declared.weapon.sword'], failed: ['net::ERR_ABORTED /assets/x.bin'], crashed: () => crashAt >= 0 && at > crashAt };
  const page = { evaluate: async () => {
    if (goneAt >= 0 && at >= goneAt) throw new Error('Target page, context or browser has been closed');
    return states[Math.min(at++, states.length - 1)]!;
  } };
  const options = { timeout: 240_000, poll: 1000, now: () => clock, sleep: async (ms: number) => { clock += ms; } };
  return { page, seen, options, elapsed: () => clock };
}
const loading = (line: string): State => ({ entered: false, error: null, loading: line });

test('a healthy entry returns as soon as the world is in', async () => {
  const { page, seen, options, elapsed } = fixture([loading('Shaders'), loading('Joining the world'), { entered: true, error: null, loading: null }]);
  await expect(waitForEntry(page, seen, options)).resolves.toMatchObject({ entered: true });
  expect(elapsed()).toBe(2000);
});

test('the engine error card stops the wait at once and is named', async () => {
  const { page, seen, options, elapsed } = fixture([loading('Joining the world'), { entered: false, error: 'Something went wrong', loading: 'Joining the world' }]);
  const error = await waitForEntry(page, seen, options).catch((caught: unknown) => caught as Error);
  expect(elapsed()).toBe(1000);
  expect(error.message).toMatch(/engine showed its error card after 1 s/u);
  expect(error.message).toMatch(/engine error card: Something went wrong/u);
  expect(error.message).toMatch(/page uncaught no weapon declared/u);
});

test('a stuck page times out naming its loading line, errors and failed requests', async () => {
  const { page, seen, options, elapsed } = fixture([loading('Joining the world')]);
  const error = await waitForEntry(page, seen, options).catch((caught: unknown) => caught as Error);
  expect(elapsed()).toBe(240_000);
  expect(error.message.split('\n')).toEqual([
    'Phone WebKit entry timed out (240 s) after 240 s', '  loading card: Joining the world',
    '  page uncaught no weapon declared.weapon.sword', '  request net::ERR_ABORTED /assets/x.bin']);
});

test('a crashed or closed page stops the wait', async () => {
  const crashed = fixture([loading('Shaders')], { crashAt: 2 });
  await expect(waitForEntry(crashed.page, crashed.seen, crashed.options)).rejects.toThrow(/page crashed after 3 s/u);
  const gone = fixture([loading('Shaders')], { goneAt: 1 });
  await expect(waitForEntry(gone.page, gone.seen, gone.options)).rejects.toThrow(/page went away .*closed/u);
});
