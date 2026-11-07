// oxlint-disable-next-line import/no-nodejs-modules -- Each test owns and removes only its isolated author/input/cache directories.
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the exact root supplied to the real build context.
import { resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { createProjectGeneration } from './projectGeneration';

const owned: string[] = [];
function fixture() {
  mkdirSync('tmp', { recursive: true }); const root = mkdtempSync(resolve('tmp', 'project-input-files-')); owned.push(root);
  const assets = resolve(root, 'assets'); mkdirSync(resolve(assets, 'images'), { recursive: true });
  const ctx = createProjectGeneration(root, 'e'.repeat(64), new Map(), resolve(root, '.cache'), [{ prefix: '/assets/', directory: assets }]);
  const list = ctx.inputFiles; if (list === undefined) throw new Error('Current SDK must supply inputFiles');
  return { root, assets, list };
}
afterEach(() => { for (const root of owned.splice(0)) rmSync(root, { recursive: true, force: true }); });

test('fresh sorted names reflect additions, removals and nested files without retaining caller arrays', () => {
  const { assets, list } = fixture(); mkdirSync(resolve(assets, 'images/nested'));
  writeFileSync(resolve(assets, 'images/z.webp'), new Uint8Array([1]));
  writeFileSync(resolve(assets, 'images/A.webp'), new Uint8Array([2]));
  writeFileSync(resolve(assets, 'images/nested/b.webp'), new Uint8Array([3]));
  const before = list(['/assets/images/']);
  expect(before).toEqual(['/assets/images/A.webp', '/assets/images/nested/b.webp', '/assets/images/z.webp']);
  expect(list(['/assets/images/'])).not.toBe(before);
  writeFileSync(resolve(assets, 'images/new.webp'), new Uint8Array([4]));
  rmSync(resolve(assets, 'images/z.webp'));
  expect(list(['/assets/images/'])).toEqual(['/assets/images/A.webp', '/assets/images/nested/b.webp', '/assets/images/new.webp']);
  expect(before).toHaveLength(3); expect(before).toContain('/assets/images/z.webp');
});

test('undeclared, escaped, encoded, overlapping and unbounded prefixes refuse', () => {
  const { list } = fixture();
  expect(() => list(['/outside/'])).toThrow('exactly one declared root');
  for (const prefix of ['/assets/../', '/assets/%2e%2e/', '/assets/images?x/', '/assets/images', '/assets/./']) expect(() => list([prefix])).toThrow('inventory prefix');
  expect(() => list([])).toThrow('prefix count');
  expect(() => list(Array.from({ length: 9 }, (_, index) => `/assets/p${index}/`))).toThrow('prefix count');
  expect(() => list(['/assets/', '/assets/images/'])).toThrow('Overlapping');
  expect(() => list(['/assets/images/', '/assets/images/'])).toThrow('Overlapping');
});

test('directory and file links refuse, including links used inside the selected prefix', () => {
  const { root, assets, list } = fixture();
  mkdirSync(resolve(root, 'outside')); writeFileSync(resolve(root, 'outside/body'), 'body');
  symlinkSync(resolve(root, 'outside'), resolve(assets, 'linked'));
  expect(() => list(['/assets/linked/'])).toThrow('Linked');
  expect(() => list(['/assets/'])).toThrow('Linked');
  rmSync(resolve(assets, 'linked'));
  symlinkSync(resolve(root, 'outside/body'), resolve(assets, 'images/body'));
  expect(() => list(['/assets/images/'])).toThrow('Linked');
});

test('file count and directory depth limits refuse before returning partial presence facts', () => {
  const { assets, list } = fixture();
  for (let index = 0; index < 4097; index++) writeFileSync(resolve(assets, `images/f${index}`), '');
  expect(() => list(['/assets/images/'])).toThrow('file bound');
  rmSync(resolve(assets, 'images'), { recursive: true }); mkdirSync(resolve(assets, 'images'));
  mkdirSync(resolve(assets, 'images', ...Array.from({ length: 33 }, () => 'd')), { recursive: true });
  expect(() => list(['/assets/images/'])).toThrow('directory bound');
});
