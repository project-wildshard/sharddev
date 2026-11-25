// FAST-RELEASE FR-A13: the recorder's entry wait names what the page waited on and stops early on a failed page.
import { expect, test } from 'vitest';
import { slowestSpans, slowestSteps, waitForEntry } from '../scripts/entry-wait.mjs';

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

// FR-A18: Nalati's phone WebKit entry took 210 to 260 s on Linux runners against 40 on macOS, and no log said where. The
// wait keeps the last step rows the card showed (each with its ms) and names the slowest on entry and on a refusal.
const steps = (rows: [string, number][]): State => ({ entered: false, error: null, loading: 'Shaders', steps: rows.map(([label, ms]) => ({ key: label.toLowerCase(), label, ms })) } as State);
test('an entry returns its slowest steps from every row the card showed, as last seen, and its seconds', async () => {
  // the card shows only the running phase's rows: Region world's row is gone by the time Shaders runs
  const { page, seen, options } = fixture([steps([['Region world', 2_000]]), steps([['Region world', 3_100]]), steps([['Shaders', 150_200], ['Joining', 400]]),
    { entered: true, error: null, loading: null }]);
  const entry = await waitForEntry(page, seen, options);
  expect(entry.seconds).toBe(3);
  expect(slowestSteps(entry.steps, 2)).toBe('Shaders 150.2 s, Region world 3.1 s');
});

test('a timeout names the slowest steps too', async () => {
  const { page, seen, options } = fixture([steps([['Shaders', 239_000], ['Region world', 1_000]])]);
  const error = await waitForEntry(page, seen, options).catch((caught: unknown) => caught as Error);
  expect(error.message).toMatch(/slowest steps: Shaders 239\.0 s, Region world 1\.0 s/u);
});

// FR-A18: Nalati's Linux entry spent 114 s in one step row, Application modules, which is many engine operations. The wait
// keeps each boot operation's longest time across polls and documents, and names the longest on entry and on a refusal.
const spans = (rows: [string, number][]): State => ({ entered: false, error: null, loading: 'Application modules', spans: rows.map(([operation, ms]) => ({ operation, ms })) } as State);
test('an entry names its longest boot operations, each at its longest seen', async () => {
  const { page, seen, options } = fixture([spans([['app:script-memory-reservation (running)', 40_000]]), spans([['app:script-memory-reservation', 90_200], ['app:product-admission', 3_100]]),
    { entered: true, error: null, loading: null }]);
  const entry = await waitForEntry(page, seen, options);
  expect(slowestSpans(entry.spans, 2)).toBe('app:script-memory-reservation 90.2 s, app:script-memory-reservation (running) 40.0 s');
});

test('a timeout names the longest boot operations too', async () => {
  const { page, seen, options } = fixture([spans([['app:product-admission (running)', 239_000]])]);
  const error = await waitForEntry(page, seen, options).catch((caught: unknown) => caught as Error);
  expect(error.message).toMatch(/longest boot operations: app:product-admission \(running\) 239\.0 s/u);
});
