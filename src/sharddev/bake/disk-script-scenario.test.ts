import { afterAll, beforeAll, expect, test } from 'vitest';
// oxlint-disable-next-line import/no-nodejs-modules -- Own only this generated, tiny product fixture.
import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Keep all fixture bytes under the repository scratch root.
import { resolve } from 'node:path';
import { emptyShardfile } from '@wildshard/sharddev/author';
import { compileDecisionScripts } from '@wildshard/sharddev/buildDecisionScripts';
import { buildDecisionRegistries } from '@wildshard/format/decisionBindings';
import { readCreatureStrikes } from '@wildshard/format/creatures';
import { emitPlatformSections } from '@wildshard/sharddev/platformSections';
import { mergeProjectBlobs } from '@wildshard/sharddev/projectOutput';
import { writeOutputProduct } from '@wildshard/sharddev/outputProduct';
import { scenario } from '../test/scriptScenario';
import { encodeCanonicalJson, hashImmutableBytes } from '@wildshard/engine/host/immutable';

let root = '', modulePath = '', moduleBytes: Uint8Array = new Uint8Array();
beforeAll(async () => {
  mkdirSync('tmp', { recursive: true }); root = mkdtempSync(resolve('tmp/disk-scenario-'));
  const shard = emptyShardfile({ slug: 'disk-test', name: 'Disk', author: 'Test', revision: 1, seed: 5 });
  shard.budgets.sim.resident = 1_000_000;
  const native = readCreatureStrikes([{ id: 'native.wave', shape: { kind: 'lane', length: 26, width: 6 },
    windup: 1.5, active: 0.6, recover: 1.4, cooldown: 3.5, range: 30, damage: 12, tags: ['native.wave'],
    units: 'world', weight: { kind: 'constant', value: 1 } }]);
  const rows = [{ id: 'disk.main', abi: '1.0', side: 'sim', module: `blobs/wasm/${'0'.repeat(64)}.wasm`,
    source: 'behaviour/main.as', binding: { shard: true }, on: ['start', 'timer'], onFail: 'reset', reads: [],
    commands: ['timer'], strikes: { heavy: 'native.wave' }, timers: ['beat'], stateVersion: 1,
    state: [{ name: 'count', type: 'i32', default: 0, min: 0, max: 10, scope: 'binding' }], params: {} }];
  const built = await compileDecisionScripts(rows, buildDecisionRegistries(shard, [], undefined, native), new Map([['behaviour/main.as',
    "import {Do,Timer,State,Strike} from './generated/diskMain';\nexport function onStart():void {State.count=Strike.heavy;Do.timer(Timer.beat,1);}\nexport function onTimer(timer:i32):void {if(timer==Timer.beat)State.count++;}"]]), { asLineCeiling: 3 });
  const merged = mergeProjectBlobs(shard, new Map(), built.blobs), destination = resolve(root, 'published');
  const platform = emitPlatformSections(new Map([['sim/scripts', built.rows]])), path = 'sections/actors/strikes.json';
  const bytes = new TextEncoder().encode(encodeCanonicalJson(native));
  writeOutputProduct(merged.shard, merged.assets, destination, { namedFiles: merged.namedFiles,
    platform: { sections: [...platform.sections, { name: 'actors/strikes', path, schema: 'wildshard:actors/strikes@1', hash: hashImmutableBytes(bytes), bytes: bytes.length }],
      files: new Map([...platform.files, [path, bytes]]) } });
  const blob = built.blobs[0]; if (blob === undefined) throw new Error('Missing test decision');
  modulePath = resolve(destination, blob.file.path); moduleBytes = blob.bytes;
});
afterAll(() => { if (root !== '') rmSync(root, { recursive: true, force: true }); });

test('the disk wrapper resolves real rows and resumes the real host without author files', async () => {
  const first = await scenario('published', 'disk.main', { products: root, seed: 5 });
  first.send('start'); expect(first.commands()).toEqual([['timer', 'beat', 1]]);
  first.advance(0.5); const saved = first.save(); first.advance(0.5);
  const resumed = await scenario('published', 'disk.main', { products: root, seed: 5 });
  resumed.restore(saved); resumed.advance(0.5);
  expect(resumed.state()).toEqual({ count: 2 }); expect(resumed.save()).toEqual(first.save());
  expect(resumed.maxFuel()).toBeLessThan(400_000);
  expect(first.product).toMatchObject({ slug: 'published', script: 'disk.main' });
  expect(first.product.sectionHash).toMatch(/^[a-f0-9]{64}$/u);
});
test('missing output, missing scripts and escaping folders refuse without a build fallback', async () => {
  await expect(scenario('absent', 'disk.main', { products: root, seed: 5 })).rejects.toThrow('run wildshard build');
  await expect(scenario('published', 'absent', { products: root, seed: 5 })).rejects.toThrow('Missing simulation scenario script');
  await expect(scenario('../published', 'disk.main', { products: root, seed: 5 })).rejects.toThrow('Invalid scenario output folder');
  await expect(scenario('published', 'disk.main', { products: root, seed: 5,
    actors: [{ id: 'unregistered', at: [0, 0, 0] }] })).rejects.toThrow('Unknown or duplicate scenario actor override');
});
test('changed built Wasm refuses rather than compiling or looking up an author module', async () => {
  writeFileSync(modulePath, new Uint8Array([0]));
  try { await expect(scenario('published', 'disk.main', { products: root, seed: 5 })).rejects.toThrow('Native product blob hash or size mismatch'); }
  finally { writeFileSync(modulePath, moduleBytes); }
});

test('an explicit immutable cache directory preserves the same product and host admission', async () => {
  const original = resolve(root, 'published'), cached = resolve(root, 'cache-key');
  const before = await scenario('published', 'disk.main', { products: root, seed: 5 });
  renameSync(original, cached);
  try {
    const loaded = await scenario('published', 'disk.main', { productDirectory: cached, seed: 5 });
    before.send('start'); loaded.send('start');
    expect(loaded.save()).toEqual(before.save());
    expect(loaded.product).toEqual(before.product);
    await expect(scenario('published', 'disk.main', { productDirectory: cached, products: root, seed: 5 })).rejects.toThrow('one product location');
    const alias = resolve(root, 'cache-alias'); symlinkSync(cached, alias, 'dir');
    await expect(scenario('published', 'disk.main', { productDirectory: alias, seed: 5 })).rejects.toThrow('cannot be a symlink');
    writeFileSync(resolve(cached, modulePath.slice(original.length + 1)), new Uint8Array([0]));
    await expect(scenario('published', 'disk.main', { productDirectory: cached, seed: 5 })).rejects.toThrow('Native product blob hash or size mismatch');
  } finally {
    writeFileSync(resolve(cached, modulePath.slice(original.length + 1)), moduleBytes);
    renameSync(cached, original);
  }
});
