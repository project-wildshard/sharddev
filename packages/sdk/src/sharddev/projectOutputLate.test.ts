import { expect, test } from 'vitest';
import type { OutputFile } from '@wildshard/format/outputIndex';
import { lateHullFiles } from './projectOutput';

const hash = (n: number): string => String(n).repeat(64).slice(0, 64);
const file = (n: number, name: string, options: { critical?: boolean; dependencies?: string[] } = {}) => ({
  hash: hash(n), path: `blobs/ktx2/${hash(n)}.ktx2`, name, kind: 'ktx2', compressed: 1, decoded: 0, gpu: 1, triangles: 0, draws: 0,
  critical: options.critical ?? false, dependencies: options.dependencies ?? [],
}) as unknown as OutputFile;

test('ONE-FORMAT OF23a: a hull map loads late unless it is critical or held as another file\'s dependency', () => {
  const names = new Set(['models/creatures/deer.base.ktx2', 'models/creatures/deer.normal.ktx2', 'models/creatures/boar.base.ktx2']);
  const files = [file(1, 'models/creatures/deer.base.ktx2'), file(2, 'models/creatures/deer.normal.ktx2'),
    file(3, 'models/creatures/boar.base.ktx2', { critical: true }), file(4, 'models/other.ktx2')];
  expect(lateHullFiles(names, files, new Set()).map(row => row.hash)).toEqual([hash(1), hash(2)]);
  // a species skin that shares the normal map's bytes depends on it: it must arrive with the skin, before the world
  expect(lateHullFiles(names, files, new Set([hash(2)])).map(row => row.hash)).toEqual([hash(1)]);
});
