// oxlint-disable-next-line import/no-nodejs-modules -- The test reads the Template's behaviour sources.
import { readFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- The Template's source path.
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { compileScript } from '../bake/compileScript';

// SHARD-SOURCE AP27: the Template's door is written on the sdk's ABI-v0 prelude, with no literal address.
// the Template's sources, read as text from the checkout (the test runs at the repo root)
const template = (name: string): string => readFileSync(join(process.cwd(), 'src', 'shards', '_template', 'behaviour', name), 'utf8');
const IN = 16384 / 8, OUT = 24576 / 8;

async function door(): Promise<(shared: readonly number[], events: readonly number[]) => number[][]> {
  const bytes = await compileScript(template('door.as'), { maximumPages: 2 });
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 2 }), pass = (value: number): number => value;
  const env = { memory, enter: () => undefined, leave: () => undefined, fuel: () => undefined, finite32: pass, finite64: pass, abort: () => { throw new Error('Script abort'); } };
  const exports = new WebAssembly.Instance(new WebAssembly.Module(bytes), { env }).exports as Record<string, (...args: number[]) => number>;
  exports['__start']?.();
  return (shared, events) => {
    const slots = new Float64Array(memory.buffer);
    slots.fill(0, IN, IN + 512);
    // the lane's input row: tick, dt, command, entity, actor token, role, then the state counts and the shared values
    [1, 1 / 60, 0, 1, 1, 0, shared.length, 0, ...shared].forEach((value, i) => { slots[IN + i] = value; });
    slots[IN + 32] = events.length;
    events.forEach((type, i) => { slots[IN + 33 + i * 6] = type; slots[IN + 34 + i * 6] = 1; slots[IN + 35 + i * 6] = 1; });
    exports['on_tick']?.();
    const count = exports['out_count']?.() ?? 0;
    return Array.from({ length: count }, (_, i) => Array.from(slots.subarray(OUT + i * 5, OUT + i * 5 + 5)));
  };
}

test('the Template door reads and writes by name, not by address', () => {
  const source = template('door.as');
  expect(source).toContain("from './wildshard'");
  expect(source).not.toMatch(/\b(?:load|store)<[a-z0-9]+>\(/u);
});

test('the door and the gate toggle on their scene events and each brazier lights once', async () => {
  const tick = await door();
  // shared fields in declared order: door.open (101), brazier-a, -b, -c (102 to 104), the south gate (105, TC-M4); op 5
  // sets a shared field
  expect(tick([0, 0, 0, 0, 0], [201])).toEqual([[5, 101, 1, 0, 0]]);
  expect(tick([1, 0, 0, 0, 0], [201])).toEqual([[5, 101, 0, 0, 0]]);
  expect(tick([0, 0, 0, 0, 0], [201, 201])).toEqual([]);
  expect(tick([0, 0, 0, 0, 0], [203, 204])).toEqual([[5, 103, 1, 0, 0], [5, 104, 1, 0, 0]]);
  expect(tick([0, 0, 1, 0, 0], [203])).toEqual([]);
  expect(tick([0, 0, 0, 0, 0], [201, 202, 203, 204])).toHaveLength(4);
  expect(tick([0, 0, 0, 0, 0], [])).toEqual([]);
  // TC-M4: the lever (event 205) swings the south gate both ways
  expect(tick([0, 0, 0, 0, 0], [205])).toEqual([[5, 105, 1, 0, 0]]);
  expect(tick([0, 0, 0, 0, 1], [205])).toEqual([[5, 105, 0, 0, 0]]);
});

test('a script that never imports the prelude compiles to the same bytes', async () => {
  const items = template('items.as');
  expect(await compileScript(items, { maximumPages: 64 })).toEqual(await compileScript(items, { maximumPages: 64, sources: { 'wildshard.ts': 'export const unused: i32 = 1;' } }));
});
