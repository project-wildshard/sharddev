// oxlint-disable-next-line import/no-nodejs-modules -- Exercise a real temporary shard repo.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Keep fixtures inside the test's owned scratch folder.
import { dirname, join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import codemod, { guide, pending, title } from '../codemods/0.7.0.mjs';

// SDK 0.7.0 (meta QA 11-25 rows 69 and 70): Node 26; the migration moves the cap and drops the flag Node 26 refuses.
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function repo(files: Record<string, string>): string {
  const parent = resolve(process.env['VITEST_TMP_ROOT'] ?? 'tmp/vitest');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'node26-codemod-'));
  roots.push(root);
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
}
const read = (root: string, path: string): string => readFileSync(join(root, path), 'utf8');

test('the migration names itself and its guide anchor', () => {
  expect(title).toMatch(/Node 26/u);
  expect(guide).toBe('migrate-0-7-0');
});

test('a repo capped below Node 25 moves to <27 and its scripts drop the flag, keeping every other byte', () => {
  const pkg = '{\n  "engines": {\n    "node": ">=24.18.0 <25"\n  },\n  "scripts": {\n    "bake": "node --experimental-transform-types --import ./l.mjs b.mjs",\n    "test": "vitest run"\n  }\n}\n';
  const root = repo({ 'package.json': pkg, '.github/workflows/ci.yml': 'run: node --experimental-transform-types x.mjs\n',
    'test/a.test.ts': "import '@wildshard/sdk/internal/engine/game/looks/speciesBook';\n", 'src/ok.ts': 'export {};\n' });
  expect(pending({ project: root })).toMatch(/caps Node below 26.*scripts bake pass --experimental-transform-types/u);
  const { lines, manual } = codemod({ project: root });
  expect(read(root, 'package.json')).toBe(pkg.replace('<25', '<27').replace(' --experimental-transform-types', ''));
  expect(lines).toEqual(['package.json: engines.node now caps Node below 27', 'package.json: scripts stop passing --experimental-transform-types']);
  expect(manual).toEqual([
    expect.stringMatching(/^\.github\/workflows\/ci\.yml: passes --experimental-transform-types/u),
    expect.stringMatching(/^test\/a\.test\.ts: imports @wildshard\/sdk\/internal\/engine\/game\/looks\/speciesBook/u),
  ]);
  expect(pending({ project: root })).toBeUndefined();
  // Idempotent: a second run edits nothing.
  expect(codemod({ project: root }).lines).toEqual([]);
});

test('a repo already on Node 26 has nothing pending', () => {
  const root = repo({ 'package.json': '{ "engines": { "node": ">=24.18.0 <27" } }\n' });
  expect(pending({ project: root })).toBeUndefined();
  expect(codemod({ project: root })).toEqual({ lines: [], manual: [] });
});
