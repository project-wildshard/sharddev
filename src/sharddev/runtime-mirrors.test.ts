import { expect, test } from 'vitest';
import { defineMirror, runtimeMirrorIssues } from './runtimeMirrors';

// data/layout.ts computes; runtime/const.ts copies the evaluated values (P2a spec §2.3).
const CROWN = { x: 0, z: -190, r: 20 };
const mirrors = [defineMirror('CROWN', CROWN), defineMirror('DAIS', { x: 0, z: CROWN.z - 6, r: 5 })];

test('a faithful copy passes, key order and runtime-only exports ignored', () => {
  expect(runtimeMirrorIssues(mirrors, { DAIS: { r: 5, z: -196, x: 0 }, CROWN: { x: 0, z: -190, r: 20 }, GUST_SECONDS: 0.4 })).toEqual([]);
});

test('drift, a missing export and a duplicate mirror are each reported', () => {
  const issues = runtimeMirrorIssues([...mirrors, defineMirror('CROWN', CROWN)], { CROWN: { x: 0, z: -190, r: 21 } });
  expect(issues).toHaveLength(3);
  expect(issues[0]).toContain('CROWN: runtime/const.ts has');
  expect(issues[1]).toBe('DAIS: runtime/const.ts does not export it');
  expect(issues[2]).toBe('CROWN: declared twice in data/');
});

test('a mirror must be a plain JSON value under an export name', () => {
  expect(() => defineMirror('not-a-name', 1)).toThrow(/export identifier/u);
  expect(() => defineMirror('FN', () => 1)).toThrow(/plain JSON/u);
});
