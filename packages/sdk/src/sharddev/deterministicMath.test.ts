// QA-FEEDBACK-2026-11-23-b row 14 (meta): a build's Math gives the same bits on x86-64 and arm64.
// oxlint-disable-next-line import/no-nodejs-modules -- the check hashes every result
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { DETERMINISTIC_MATH, deterministicMath, installDeterministicMath } from './deterministicMath';

/** sha256 of every function's float64 results over `inputs()`, recorded on arm64 macOS and x86-64 and arm64 Linux. */
const GOLDEN = 'e97b5db21b7ecaa4a55dd0ea15ee5b17ab0034c64b81c0673c43894979e13601';
type Name = keyof typeof deterministicMath;
const NAMES = Object.keys(deterministicMath) as Name[];
const SPECIAL = [0, -0, 1, -1, 0.5, -0.5, Infinity, -Infinity, Number.NaN, Math.PI, -Math.PI, Math.PI / 2, 709.78, -745.1, 5e-324, 1e-310, 22, 710, 2 ** 52, 2 ** 1023];

/** Every (x, y) the checks feed each function: specials, a seeded spread from 1e-9 to 1e300, and multiples of pi. */
function inputs(): readonly (readonly [number, number])[] {
  const rows: [number, number][] = [];
  for (const x of SPECIAL) for (const y of SPECIAL) rows.push([x, y]);
  let seed = 0x2545f491;
  const random = (): number => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
  for (const range of [1e-9, 1e-3, 0.5, 1, 1.5, 4, 20, 100, 700, 1e5, 1e9, 1e300]) {
    for (let i = 0; i < 500; i++) rows.push([(random() * 2 - 1) * range, (random() * 2 - 1) * range]);
  }
  for (let k = -64; k <= 64; k++) for (const d of [2, 3, 4, 6, 8, 12, 180]) rows.push([(k * Math.PI) / d, (k + 0.5) / d]);
  return rows;
}
const call = (fn: (x: number, y: number) => number, name: Name, x: number, y: number): number =>
  name === 'atan2' ? fn(x, y) : fn(name === 'acosh' ? Math.abs(x) + 1 : x, y);

it('gives the recorded bits on every CPU (an arch, Node or port change shows here first)', () => {
  const hash = createHash('sha256'), f64 = new Float64Array(1);
  for (const name of NAMES) for (const [x, y] of inputs()) {
    const value = call(deterministicMath[name] as (x: number, y: number) => number, name, x, y);
    f64[0] = Number.isNaN(value) ? 0.123 : value;
    hash.update(new Uint8Array(f64.buffer));
  }
  expect(DETERMINISTIC_MATH).toBe('v8-13.6-fdlibm-js/1');
  expect(hash.digest('hex')).toBe(GOLDEN);
});

// x86-64 V8 runs the same fdlibm source with no fused multiply-add, so there the port must match Math bit for bit.
it.runIf(process.arch === 'x64')('matches V8 Math exactly on x86-64', () => {
  const misses: string[] = [];
  for (const name of NAMES) for (const [x, y] of inputs()) {
    const native = Math[name] as (x: number, y: number) => number;
    const ours = call(deterministicMath[name] as (x: number, y: number) => number, name, x, y), theirs = call(native, name, x, y);
    if (!Object.is(ours, theirs) && !(Number.isNaN(ours) && Number.isNaN(theirs))) misses.push(`${name}(${String(x)}, ${String(y)})`);
  }
  expect(misses.slice(0, 5)).toEqual([]);
});

it('puts itself on the global Math, once', () => {
  installDeterministicMath();
  installDeterministicMath();
  for (const name of NAMES) expect(Math[name]).toBe(deterministicMath[name]);
  expect(Math.sin(Math.PI / 6)).toBe(0.49999999999999994);
});
