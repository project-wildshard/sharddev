// Meta QA 11-25 row 126: the Blender build and the model-source check read the repo's manifest at
// src/blender/targets.json, run from the repo root (a shard runs the installed copy). A shard's old
// scripts/blender/targets.json is read with a warning for one SDK minor; the SDK's own fixture stays beside build.sh.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execPath } from 'node:process';
import { expect, test } from 'vitest';

const SDK = resolve(import.meta.dirname, '..');
const BUILD = resolve(SDK, 'scripts/blender/build.sh');
const CHECK = resolve(SDK, 'scripts/check-model-sources.mjs');
const MANIFEST = JSON.stringify({ blender: { version: '0', path: 'blender-absent' }, lock: '~/.model.lock', cache: '~/.cache/wildshard-blender',
  targets: { 'shard/body': { about: 'the body', script: 'src/blender/body.py', outputs: ['src/static/models/body.glb'] } } });

function repo(manifestAt: string | undefined, check: (root: string) => void): void {
  mkdirSync(resolve(SDK, 'tmp'), { recursive: true });
  const root = mkdtempSync(resolve(SDK, 'tmp/blender-manifest-'));
  const put = (path: string, bytes: string): void => {
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    writeFileSync(resolve(root, path), bytes);
  };
  put('src/blender/body.py', '# the source');
  put('src/static/models/body.glb', 'built model');
  if (manifestAt !== undefined) put(manifestAt, MANIFEST);
  try { check(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
const build = (root: string, ...args: string[]) => spawnSync('bash', [BUILD, ...args], { cwd: root, encoding: 'utf8' });
const sources = (root: string) => spawnSync(execPath, [CHECK, root], { encoding: 'utf8' });

test('a shard repo\'s src/blender/targets.json is the manifest, read from the repo root', () => repo('src/blender/targets.json', root => {
  const list = build(root, '--list');
  expect(list.status).toBe(0);
  expect(list.stdout).toContain('shard/body');
  expect(list.stderr).toBe('');
  const run = sources(root);
  expect(run.stderr).toBe('');
  expect(run.status).toBe(0);
  expect(run.stdout).toContain('(src/blender/targets.json)');
}));

test('the old scripts/blender/targets.json is still read, with a warning, for one SDK minor', () => repo('scripts/blender/targets.json', root => {
  const list = build(root, '--list');
  expect(list.status).toBe(0);
  expect(list.stdout).toContain('shard/body');
  expect(list.stderr).toContain('move scripts/blender/ to src/blender/');
  const run = sources(root);
  expect(run.status).toBe(0);
  expect(run.stdout).toContain('move scripts/blender/ to src/blender/');
}));

test('a repo with no manifest is refused by name', () => repo(undefined, root => {
  const list = build(root, '--list');
  expect(list.status).toBe(2);
  expect(list.stderr).toContain('no src/blender/targets.json');
}));

test('the SDK\'s own inspection fixture keeps its manifest beside build.sh, with no warning', () => {
  const list = spawnSync('bash', [BUILD, '--list'], { cwd: SDK, encoding: 'utf8' });
  expect(list.status).toBe(0);
  expect(list.stdout).toContain('sdk-world-fixture');
  expect(list.stderr).toBe('');
});
