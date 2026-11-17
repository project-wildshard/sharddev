// CI21 G498/DB1: the original eviction and generic-module contracts, owned
// by each producer and run only after its ordinary build in CI.
import '@wildshard/engine/scripts/sim-node-loader.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
const { loadHeadlessProduct } = await import('@wildshard/engine/host/headlessProduct');
const { outputDescriptor } = await import('@wildshard/engine/game/shardfile/outputDescriptor');
const { loadRapier } = await import('@wildshard/engine/physics/rapier');
const { snapshotSimHost, serializeSimSnapshot, decodeSimSnapshot } = await import('@wildshard/engine/sim/snapshot');
const { restoreSimHost } = await import('@wildshard/engine/sim/restore');
const { createShardfileSim, bindShardfileSim, prepareShardfileSimRestore } = await import('@wildshard/engine/game/plugin/simulation');
const { createTrustedHeadlessResident } = await import('@wildshard/engine/host/headlessRuntime');
const { hasDeclaredClientPage } = await import('@wildshard/format/runtimeBinds');
const { productHeadlessSections } = await import('@wildshard/engine/host/headlessSections');
const { ScriptHost } = await import('@wildshard/engine/script/host');
const { leadPlayer } = await import('@wildshard/engine/sim/leadPlayer');
const require = createRequire(import.meta.resolve('@wildshard/engine/package.json'));
const owner = JSON.parse(readFileSync('test/ci21-grid-owner.json', 'utf8'));
const quest = { fact: () => undefined, coins: () => undefined };
async function supplied(row) {
  const directory = process.env.CI21_GRID_PRODUCTS_ROOT === undefined ? row.directory : `${process.env.CI21_GRID_PRODUCTS_ROOT}/${row.slug}`;
  const product = await loadHeadlessProduct(directory), shard = product.shardfile;
  const descriptor = outputDescriptor(shard); assert.ok(descriptor, 'Missing admitted product inventory');
  const assets = new Map(descriptor.index.files.map(file => [file.commons === true ? `commons:${file.hash}` : file.hash,
    Uint8Array.from(readFileSync(`${directory}/${file.path}`))]));
  const rapier = await loadRapier(readFileSync(require.resolve('@dimforge/rapier3d-simd/rapier_wasm3d_bg.wasm')));
  return { product, shard, assets, rapier };
}
for (const row of owner.products) test(`${row.slug}: evict and re-enter with kit, held items and quest progress`, { timeout: 30_000 }, async () => {
  const preparation = await supplied(row), { product, shard, assets, rapier } = preparation;
  const sections = productHeadlessSections(product);
  const native = shard.runtime !== null || hasDeclaredClientPage(shard) || product.has('sim/runtime-plan');
  const first = native ? await createTrustedHeadlessResident(preparation) : createShardfileSim(shard, assets, { rapier, sections, quest });
  let saved;
  try {
    for (const progress of first.host.quests) {
      for (const flag of progress.def.startWhen?.all ?? []) first.host.flags.set(flag);
      const start = progress.def.startWhen?.any?.[0]; if (start !== undefined) first.host.flags.set(start);
      const step = progress.def.steps[0];
      for (const flag of step?.done.none ?? []) first.host.flags.clear(flag);
      for (const flag of step?.done.all ?? []) first.host.flags.set(flag);
      const done = step?.done.any?.[0]; if (done !== undefined) first.host.flags.set(done);
    }
    for (const flag of shard.items.loadout.native?.ownership ?? []) if (flag !== null) first.host.flags.set(flag);
    for (const adapter of first.host.adapters.values()) {
      const state = adapter.snapshot();
      if (state !== null && typeof state === 'object' && !Array.isArray(state) && 'held' in state && 'swap' in state) {
        const held = shard.items.loadout.native?.slots?.at(-1);
        if (held !== undefined) adapter.restore({ ...state, held, swap: null });
      }
    }
    saved = decodeSimSnapshot(serializeSimSnapshot(snapshotSimHost(first.host)));
  } finally { first.dispose(); }
  const again = native ? await createTrustedHeadlessResident(preparation, saved) : {
    host: restoreSimHost(first.host.level, { rapier }, saved, host => bindShardfileSim(host, shard, assets, { rapier, sections, quest, restoring: true })),
    dispose() { this.host.dispose(); },
  };
  try {
    const restored = snapshotSimHost(again.host);
    for (const field of ['flags', 'quests', 'slots', 'adapters']) assert.deepEqual(restored[field], saved[field], field);
    again.host.step(); assert.equal(again.host.state.tick, saved.state.tick + 1);
    for (const flag of saved.flags) assert.equal(again.host.flags.has(flag), true);
  } finally { again.dispose(); }
});

if (owner.generic) test('generic grid data destinations restore exact modules with one installation', { timeout: 30_000 }, async () => {
  let dataCells = 0;
  for (const row of owner.products) {
    const { product, shard, assets, rapier } = await supplied(row);
    assert.equal(shard.runtime, null); assert.equal(hasDeclaredClientPage(shard), false);
    const sections = productHeadlessSections(product), original = ScriptHost.prototype.install;
    let installs = 0;
    ScriptHost.prototype.install = function (...args) { installs++; return original.apply(this, args); };
    try {
      const first = createShardfileSim(shard, assets, { rapier, sections, quest });
      const count = installs; first.host.step(); const saved = snapshotSimHost(first.host); first.dispose(); installs = 0;
      const prepared = prepareShardfileSimRestore(shard, assets, { rapier, sections, quest, playerBody: false });
      try {
        assert.equal(installs, count); prepared.restore(saved); assert.equal(installs, count);
        assert.deepEqual(snapshotSimHost(prepared.host), saved); prepared.host.step(); assert.equal(prepared.host.state.tick, saved.state.tick + 1);
        leadPlayer(prepared.host).detachMotor(); assert.equal(leadPlayer(prepared.host).hasMotor, false); dataCells++;
      } finally { prepared.host.dispose(); }
    } finally { ScriptHost.prototype.install = original; }
  }
  assert.ok(dataCells > 0);
});
