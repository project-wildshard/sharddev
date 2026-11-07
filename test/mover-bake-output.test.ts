import { expect, test } from 'vitest';
import { moverBake, parseMovers } from '@wildshard/format/movers';
import { captureDriftwoodMovers } from '../src/shards/driftwood-isle/generators/movers';
import { MOVER_BAKE as driftwood } from '../src/shards/driftwood-isle/generators/moverBake';
import { MOVER_BAKE as sky } from '../src/shards/far-reach/generators/moverBake';
import { originalSkyMovers, originalSkyMoverTransport } from './fixtures/sky-movers';
import { captureSkyMovers } from '../src/shards/far-reach/generators/movers';
import { originalDriftwoodMovers, originalDriftwoodMoverTransport } from './fixtures/driftwood-movers';

const rows = originalDriftwoodMovers();

const skyRows = originalSkyMovers();

// Retain exact fields/integers and compare libm-derived transforms to 1e-12.
const numeric = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (_key, item: unknown) => typeof item === 'number' && !Number.isInteger(item) ? Math.round(item * 1e12) / 1e12 : item));
/** every original transport row explicitly selects native execution */
function expectNative(data: unknown): void {
  if (!Array.isArray(data)) throw new Error('Missing original mover transport');
  const entries: readonly unknown[] = data;
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null || !('execution' in entry)) throw new Error('Missing original execution');
    expect(entry.execution).toBe('native');
  }
}
test('keeps every original mover value while explicitly selecting native execution', () => {
  expectNative(originalDriftwoodMoverTransport()); expectNative(originalSkyMoverTransport());
  const [boat, bridge] = rows;
  if (boat === undefined || bridge === undefined) throw new Error('Missing mover output');
  const captured = captureDriftwoodMovers(boat.module, bridge.module);
  expect(numeric(rows)).toEqual(numeric(captured));
  expect(numeric(captureDriftwoodMovers())).toEqual(numeric(captured));
  expect(numeric(parseMovers(rows))).toEqual(numeric(parseMovers(captured)));
  const [skyBridge, lift] = [...new Set(skyRows.map(row => row.module))];
  if (skyBridge === undefined || lift === undefined) throw new Error('Missing Sky drivers');
  expect(numeric(skyRows)).toEqual(numeric(captureSkyMovers(skyBridge, lift)));
});

test('keeps TypeScript as the default and refuses unsupported mover output formats', () => {
  expect(moverBake('driftwood-isle', driftwood).output).toBe('json');
  expect(moverBake('far-reach', sky).output).toBe('json');
  expect(moverBake('test', { capture: sky.capture, modules: sky.modules }).output).toBe('typescript');
  expect(() => moverBake('test', { ...driftwood, output: 'javascript' })).toThrow();
});
