// J186: CI only, never a hook. The shard built by this checkout boots the
// installed engine, takes real player commands, and resumes its own save.
import '@wildshard/engine/scripts/sim-node-loader.mjs';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { test } from 'node:test';

const { loadHeadlessProduct } = await import('@wildshard/engine/host/headlessProduct');
const { createTrustedHeadlessAdapter } = await import('@wildshard/engine/host/headlessRuntime');
const { HeadlessSimulation } = await import('@wildshard/engine/host/headless');
const { productHeadlessSections } = await import('@wildshard/engine/host/headlessSections');
const { outputDescriptor, serverReadsFile } = await import('@wildshard/engine/game/shardfile/outputDescriptor');
const { loadRapier } = await import('@wildshard/engine/physics/rapier');
const { manifestFolders, shardProducts } = await import('@wildshard/engine/scripts/shard-outputs.mjs');
const engineRequire = createRequire(import.meta.resolve('@wildshard/engine/package.json'));
const products = readdirSync('out', { withFileTypes: true }).filter(row => row.isDirectory() && !row.name.startsWith('.') && row.name !== 'tars');
assert.ok(products.length, 'Build this shard before running its product proof');
assert.deepEqual(products.map(row => row.name).sort(), shardProducts(process.cwd(), manifestFolders(process.cwd())).map(row => row.slug).sort(), 'Every declared product must be built');
const tapes = existsSync('test/ci/content-tapes.json') ? JSON.parse(readFileSync('test/ci/content-tapes.json', 'utf8')) : {};

async function play(runtime, plan, declared) {
  if (!declared) return { report: await runtime.verbTape(plan), commit: runtime.commit() };
  const report = { ticks: 0, observations: [] };
  let commit;
  for (const segment of plan.segments) {
    const part = await runtime.verbTapePart({ ...plan, segments: [segment] });
    report.ticks += part.report.ticks; report.observations.push(...part.report.observations); commit = part.commit;
  }
  return { report, commit };
}

for (const { name: slug } of products) test(`${slug}: boot, walk and resume on the installed engine`, { timeout: 9_500 }, async () => {
  const directory = resolve('out', slug), product = await loadHeadlessProduct(directory), shard = product.shardfile;
  const descriptor = outputDescriptor(shard);
  assert.ok(descriptor, 'The built shard must pass admission');
  const declared = shard.runtime === null && !product.has('sim/runtime-plan');
  const assets = new Map(descriptor.index.files.filter(file => declared || serverReadsFile(file, shard.terrain?.collider) && (file.name === undefined || file.kind === 'wasm' || file.kind === 'tile'))
    .map(file => [file.commons === true ? `commons:${file.hash}` : file.hash, readFileSync(join(directory, file.path))]));
  const owned = [];
  const rapier = declared ? undefined : await loadRapier(readFileSync(engineRequire.resolve('@dimforge/rapier3d-simd/rapier_wasm3d_bg.wasm')));
  const create = async snapshot => {
    const runtime = declared
      ? await HeadlessSimulation.create(shard, assets, snapshot, { deadline: 'advisory', sections: productHeadlessSections(product) })
      : await createTrustedHeadlessAdapter({ shard, assets, product, rapier }, snapshot);
    owned.push(runtime);
    return runtime;
  };
  try {
    const runtime = await create();
    if (tapes[slug]) {
      const { plan: content, expect } = tapes[slug];
      const { report: played } = await play(runtime, content, declared);
      for (const fact of expect) {
        const at = played.observations.find(row => row.id === fact.at);
        assert.ok(at, `Missing real observation ${fact.at}`);
        for (const flag of fact.flags ?? []) assert.ok(at.flags.includes(flag), `Playing must earn ${flag}`);
        for (const flag of fact.absent ?? []) assert.ok(!at.flags.includes(flag), `Unreachable input must not earn ${flag}`);
      }
    }
    const plan = { version: 1, observe: [], segments: [
      { id: 'spawn', ticks: 1, commands: [] },
      { id: 'walk', ticks: 120, commands: [{ kind: 'player', moveX: 0, moveZ: -1, yaw: 0 }] },
      { id: 'turn', ticks: 120, commands: [{ kind: 'player', moveX: 1, moveZ: 0, yaw: Math.PI / 2 }] },
    ] };
    const { report, commit: checkpoint } = await play(runtime, plan, declared);
    assert.equal(report.ticks, 241);
    const [spawn, walk, turn] = report.observations;
    assert.ok([spawn, walk, turn].every(row => row.position.every(Number.isFinite)));
    assert.ok(Math.hypot(walk.position[0] - spawn.position[0], walk.position[2] - spawn.position[2]) > 0.25, 'Walking must move the real player');
    const resumed = await create(checkpoint.snapshot);
    for (let tick = 0; tick < 5; tick++) {
      const commands = [{ kind: 'player', moveX: 0, moveZ: -1, yaw: 0 }];
      if (declared) {
        const suffix = { version: 1, observe: [], segments: [{ id: `resume-${tick}`, ticks: 1, commands }] };
        const control = await runtime.verbTapePart(suffix), restored = await resumed.verbTapePart(suffix);
        assert.equal(restored.commit.snapshot, control.commit.snapshot, 'A saved world must continue identically');
        assert.deepEqual(restored.commit.effects, control.commit.effects);
        assert.deepEqual(restored.report, control.report);
      } else {
        runtime.step(commands); resumed.step(commands);
        assert.deepEqual(resumed.commit(), runtime.commit(), 'A saved world must continue identically');
      }
    }
  } finally { for (const runtime of owned) await runtime.dispose(); }
});
