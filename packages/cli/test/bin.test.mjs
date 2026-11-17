// SDK-SPLIT SP10: the `wildshard` bin dispatches every verb, and `build` never loads the engine.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { buildBin, inPackage, route } from '../bin/route.mjs';

const BIN = resolve(import.meta.dirname, '../bin/wildshard.mjs');
const GUARD = resolve(import.meta.dirname, 'engine-guard.mjs');
const TMP = resolve(import.meta.dirname, '../tmp');
const DEV_BIN = inPackage('@wildshard/dev', 'bin/wildshard.mjs');
const BUILD_BIN = inPackage('@wildshard/build', 'dist/build.mjs');
const TEMPLATE = inPackage('@wildshard/sdk', 'src/shards/_template');
const run = (args, options = {}) => spawnSync(process.execPath, [...(options.node ?? []), BIN, ...args], { encoding: 'utf8', cwd: options.cwd, timeout: 120_000 });

// An installed build always has its compiled bin (prepack); a checkout compiles it here, as CI's products job does.
if (!existsSync(BUILD_BIN)) execFileSync(process.execPath, [inPackage('@wildshard/build', 'scripts/compile.mjs')], { stdio: 'ignore' });

test('every verb in help.ts prints its help through the cli bin', async () => {
  const { HELP_VERBS } = await import(pathToFileURL(inPackage('@wildshard/dev', 'src/cli/help.ts')).href);
  assert.ok(HELP_VERBS.length > 20);
  for (const verb of HELP_VERBS) {
    const result = run([verb, '--help']);
    assert.equal(result.status, 0, `${verb}: ${result.stderr}`);
    assert.match(result.stdout, /Usage: wildshard /u, verb);
  }
  const usage = run(['--help']);
  assert.equal(usage.status, 0, usage.stderr);
  assert.match(usage.stdout, /^Usage: wildshard <command>/u);
});

test('build of a source goes to build\'s compiled bin; everything else to dev', () => {
  mkdirSync(TMP, { recursive: true });
  const dir = mkdtempSync(join(TMP, 'route-'));
  try {
    const built = join(dir, 'built');
    mkdirSync(built);
    writeFileSync(join(built, 'shard.json'), '{}');
    assert.equal(buildBin(['build', TEMPLATE]), BUILD_BIN);
    assert.equal(buildBin(['build', TEMPLATE, 'out', '--shardfile-only']), BUILD_BIN);
    assert.equal(route(['build', TEMPLATE]), BUILD_BIN);
    for (const args of [['build', built], ['build', TEMPLATE, '--behaviour-only'], ['build', TEMPLATE, '--input-receipt=x.json'],
      ['build', TEMPLATE, '--help'], ['build'], ['check', TEMPLATE], ['dev', TEMPLATE], ['upload', 'x.shardfile'], ['--version'], []])
      assert.equal(route(args), DEV_BIN, args.join(' '));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('wildshard build builds the template without loading the engine', () => {
  mkdirSync(TMP, { recursive: true });
  const dir = mkdtempSync(join(TMP, 'build-'));
  try {
    const result = run(['build', TEMPLATE, join(dir, 'out')], { node: ['--import', pathToFileURL(GUARD).href] });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.doesNotMatch(result.stderr, /engine loaded/u);
    assert.ok(existsSync(join(dir, 'out', 'shard.json')), 'build wrote the folder');
    assert.ok(existsSync(join(dir, 'template.shardfile')), 'build wrote the shard file');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the guard refuses the engine, so the build test proves something', () => {
  const result = spawnSync(process.execPath, ['--import', pathToFileURL(GUARD).href, '--input-type=module', '-e', 'await import("@wildshard/engine/package.json", { with: { type: "json" } })'],
    { encoding: 'utf8', cwd: inPackage('@wildshard/dev', '.') });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /engine loaded/u);
});
