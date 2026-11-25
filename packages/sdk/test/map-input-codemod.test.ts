// oxlint-disable-next-line import/no-nodejs-modules -- Exercise a real temporary shard repo.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Keep fixtures inside the test's owned scratch folder.
import { dirname, join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import codemod, { guide, pending, title } from '../codemods/0.6.0.mjs';

// SDK 0.6.0 (sdk-migrate F3, ask A7): build-shards refuses a map input that names no file; the migration drops them.
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function repo(files: Record<string, string>): string {
  const parent = resolve(process.env['VITEST_TMP_ROOT'] ?? 'tmp/vitest');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'map-input-codemod-'));
  roots.push(root);
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
}
const read = (root: string, path: string): string => readFileSync(join(root, path), 'utf8');
const run = (root: string): { lines: string[]; manual: string[] } => codemod({ project: root });

test('the migration names itself and its guide anchor', () => {
  expect(title).toMatch(/map input must name a file/u);
  expect(guide).toBe('migrate-0-6-0');
});

test('a single-shard map drops each input naming no file, keeping every other byte', () => {
  const map = '{\n  "why": "w",\n  "inputs": [\n    "generators",\n    "../../../public/assets/x/well.glb",\n    "data/rows.json",\n    "layout.ts"\n  ],\n  "style": {}\n}\n';
  const root = repo({ 'src/data/map.json': map, 'src/generators/a.ts': '', 'src/data/rows.json': '[]' });
  expect(pending({ project: root })).toMatch(/src\/data\/map\.json lists \.\.\/\.\.\/\.\.\/public\/assets\/x\/well\.glb, layout\.ts/u);
  const { lines, manual } = run(root);
  expect(read(root, 'src/data/map.json')).toBe('{\n  "why": "w",\n  "inputs": [\n    "generators",\n    "data/rows.json"\n  ],\n  "style": {}\n}\n');
  expect(lines).toEqual(['src/data/map.json: dropped map input(s) naming no file: ../../../public/assets/x/well.glb, layout.ts']);
  expect(manual).toEqual([expect.stringMatching(/^src\/data\/map\.json: its bytes changed, so the map's tilesHash moves/u)]);
  expect(pending({ project: root })).toBeUndefined();
  // Idempotent: a second run reports nothing.
  expect(run(root)).toEqual({ lines: [], manual: [] });
});

test('a multi-shard repo reads data/map.json over look/map.json, and one-line lists keep their shape', () => {
  const root = repo({
    'src/shards/a/data/map.json': '{ "inputs": ["generators", "gone.glb"] }\n',
    'src/shards/a/look/map.json': '{ "inputs": ["never-read.json"] }\n',
    'src/shards/a/generators/x.ts': '',
    'src/shards/b/look/map.json': '{ "inputs": ["gone.json", "rows.json"] }\n',
    'src/shards/b/rows.json': '[]',
  });
  run(root);
  expect(read(root, 'src/shards/a/data/map.json')).toBe('{ "inputs": ["generators"] }\n');
  expect(read(root, 'src/shards/a/look/map.json')).toBe('{ "inputs": ["never-read.json"] }\n');
  expect(read(root, 'src/shards/b/look/map.json')).toBe('{ "inputs": ["rows.json"] }\n');
});

test('an input "from" names stays, as a manual step; a repo with no map has nothing pending', () => {
  const map = '{ "from": "world.glb", "inputs": ["world.glb"] }\n';
  const root = repo({ 'src/data/map.json': map });
  const { lines, manual } = run(root);
  expect(read(root, 'src/data/map.json')).toBe(map);
  expect(lines).toEqual([]);
  expect(manual).toEqual(['src/data/map.json: "from" names map input world.glb, which names no file; point both at the world GLB']);
  const empty = repo({ 'package.json': '{}' });
  expect(pending({ project: empty })).toBeUndefined();
  expect(existsSync(join(empty, 'src'))).toBe(false);
});
