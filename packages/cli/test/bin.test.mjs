// SDK-SPLIT SP10: the `wildshard` bin dispatches every verb, and `build` never loads the engine.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { buildBin, inPackage, route } from '../bin/route.mjs';

const BIN = resolve(import.meta.dirname, '../bin/wildshard.mjs');
const GUARD = resolve(import.meta.dirname, 'engine-guard.mjs');
const TMP = resolve(import.meta.dirname, '../tmp');
const DEV_BIN = inPackage('@wildshard/dev', 'bin/wildshard.mjs');
const BUILD_BIN = inPackage('@wildshard/build', 'scripts/run-source.mjs');
// TEMPLATE-E2E TR-11 (J434): Mossgate, the starter, replaced the retired Template.
const TEMPLATE = inPackage('@wildshard/sdk', 'src/shards/mossgate');
const run = (args, options = {}) => spawnSync(process.execPath, [...(options.node ?? []), BIN, ...args], { encoding: 'utf8', cwd: options.cwd, timeout: 120_000 });

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
    assert.ok(existsSync(join(dir, 'mossgate.shardfile')), 'build wrote the shard file');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('both build entry points preserve current race rules and step feedback', () => {
  mkdirSync(TMP, { recursive: true });
  const dir = mkdtempSync(join(TMP, 'race-fields-'));
  try {
    const source = join(dir, 'src');
    mkdirSync(source);
    writeFileSync(join(source, 'shard.config.ts'), `
import { defineShard } from '@wildshard/sdk/scene/shard';
export default defineShard({ slug: 'race-fields', name: 'Race Fields' }, world => {
  world.ground(() => 0);
  world.spawn(0, 0, 0);
}, { extend: data => ({ ...data, quests: {
  flags: ['start', 'turn', 'finish', 'earned'],
  triggers: [
    { id: 'start', kind: 'region', flag: 'start', x: 0, z: 0, radius: 2 },
    { id: 'turn', kind: 'region', flag: 'turn', x: 10, z: 0, radius: 2 },
    { id: 'finish', kind: 'region', flag: 'finish', x: 20, z: 0, radius: 2 }
  ],
  dialogue: [],
  races: [{ id: 'track', start: 'start', stop: 'finish', fact: 'track', cap: 120, laps: 2, checkpoints: ['turn'], ride: 'vehicle' }],
  quests: [{ id: 'licence', title: 'Licence', completeFlag: 'earned', steps: [
    { id: 'line', objective: 'Cross the line', done: { all: ['finish'] }, feedback: { at: { x: 20, z: 0 }, sound: 'chime' } }
  ] }]
} }) });
`);
    for (const [name, bin] of [['cli', BIN], ['dev', DEV_BIN]]) {
      const out = join(dir, name);
      const result = spawnSync(process.execPath, [bin, 'build', source, out, '--folder-only', '--no-placeholders'],
        { cwd: dir, encoding: 'utf8', timeout: 120_000 });
      assert.equal(result.status, 0, `${name}: ${result.stdout}\n${result.stderr}`);
      const quest = JSON.parse(readFileSync(join(out, 'sections/quests/quests.json'), 'utf8')).quests;
      assert.deepEqual(quest.races.map(({ laps, checkpoints, ride }) => ({ laps, checkpoints, ride })),
        [{ laps: 2, checkpoints: ['turn'], ride: 'vehicle' }]);
      assert.deepEqual(quest.quests[0].steps[0].feedback, { at: { x: 20, z: 0 }, sound: 'chime' });
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the guard refuses the engine, so the build test proves something', () => {
  const result = spawnSync(process.execPath, ['--import', pathToFileURL(GUARD).href, '--input-type=module', '-e', 'await import("@wildshard/engine/package.json", { with: { type: "json" } })'],
    { encoding: 'utf8', cwd: inPackage('@wildshard/dev', '.') });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /engine loaded/u);
});
