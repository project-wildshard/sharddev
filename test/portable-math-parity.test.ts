import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { portableMath as engine } from '@wildshard/engine/core/portableMath';
import { portableMath as authored } from '../src/commons/bake/portableMath';

const points = Float64Array.from({ length: 10_000 }, (_, index) => (index - 5_000) / 250);
const digest = (fn: (x: number, y: number) => number): string => createHash('sha256')
  .update(new Uint8Array(points.map((x, index) => fn(x, points[index + 1] ?? 0)).buffer)).digest('hex');
const table = (math: typeof authored): Record<string, string> => ({
  sin: digest(math.sin), cos: digest(math.cos), tan: digest(math.tan), exp: digest((x) => math.exp(x / 2)),
  log: digest((x) => math.log(Math.abs(x) + .001)), atan: digest(math.atan), atan2: digest(math.atan2),
  asin: digest((x) => math.asin(x / 21)), acos: digest((x) => math.acos(x / 21)),
  pow: digest((x, y) => math.pow(Math.abs(x), y)), powInt: digest((x, y) => math.pow(x, Math.round(y))),
});
const body = (file: string, end: string): string => {
  const text = readFileSync(file, 'utf8');
  return text.slice(text.indexOf('// captured before any install'), text.indexOf(end));
};

test('author portable math stays equal to the public engine table', () => {
  expect(table(authored)).toEqual(table(engine));
  const engineFile = resolve(import.meta.dirname, '../node_modules/@wildshard/engine/src/shared/engine/core/portableMath.ts');
  expect(body('src/commons/bake/portableMath.ts', '/** Install the platform-stable')).toBe(body(engineFile, 'const SIM_MATH'));
});
