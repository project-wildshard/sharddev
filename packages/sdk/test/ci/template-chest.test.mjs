// TEMPLATE-E2E TC-E7 (meta TEMPLATE-E2E-PLAN): the Template's old chest pays on E, not on walk-up. CI only, after
// `pnpm build:shards`. The chest's prompt is an item action (E refills the lantern); its `setsFlag` raises
// `template.chest.opened` for the player whose use the kit accepts (engine 0.1.32), so the region trigger that paid
// on walk-up is gone. WS_TEMPLATE_OUT points it at another build.
import '@wildshard/engine/scripts/sim-node-loader.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { Vector3 } from 'three';

const { loadHeadlessFolder } = await import('@wildshard/engine/host/headlessFolder');
const { folderHeadlessSections } = await import('@wildshard/engine/host/headlessSections');
const { outputDescriptor, serverReadsFile } = await import('@wildshard/engine/game/shardfile/outputDescriptor');
const { createShardfileSim } = await import('@wildshard/engine/game/plugin/simulation');
const { encounterRows } = await import('@wildshard/engine/sim/encounterRows');
const { loadRapier } = await import('@wildshard/engine/physics/rapier');
const { installDeclaredKitItems } = await import('@wildshard/engine/game/shardfile/declaredKitItems');
const engineRequire = createRequire(import.meta.resolve('@wildshard/engine/package.json'));
const PLAYER = 'actor.player', TICKS = 60;

/** The built Template's cell server, with every quest fact it files kept in `facts`. */
async function templateSim() {
  const directory = resolve(process.env.WS_TEMPLATE_OUT ?? 'out/_template'), product = await loadHeadlessFolder(directory), shard = product.shardfile;
  const descriptor = outputDescriptor(shard);
  assert.ok(descriptor, 'The built Template must pass admission');
  const assets = new Map(descriptor.index.files.filter(file => serverReadsFile(file, shard.terrain?.collider) && (file.name === undefined || file.kind === 'wasm' || file.kind === 'tile'))
    .map(file => [file.commons === true ? `commons:${file.hash}` : file.hash, Uint8Array.from(readFileSync(join(directory, file.path)))]));
  const rapier = await loadRapier(Uint8Array.from(readFileSync(engineRequire.resolve('@dimforge/rapier3d-simd/rapier_wasm3d_bg.wasm'))));
  const facts = [], paid = [];
  const sim = createShardfileSim(shard, assets, { rapier, sections: folderHeadlessSections(product), quest: { fact: name => { facts.push(name); }, coins: (amount, player) => { paid.push([player, amount]); } } });
  return { shard, sim, facts, paid };
}

test('the old chest pays 10 coins on E at the chest, not on walk-up', { timeout: 120_000 }, async () => {
  const { shard, sim, facts, paid } = await templateSim();
  try {
    const host = sim.host, player = host.players.get(PLAYER);
    const kit = installDeclaredKitItems(host, shard, sim.itemHooks);
    assert.ok(player && kit, 'The Template has a player and its declared kit');
    const prompt = shard.targets.interactions.find(row => row.scene === 'template.chest.open');
    assert.ok(prompt, 'The Template has its chest prompt');
    assert.ok(!shard.quests.triggers.some(row => row.flag === 'template.chest.opened'), 'No walk-up trigger raises the chest flag');
    const put = (x, z) => { player.position.set(x, host.groundHeightAt(x, z) + 0.05, z); player.motor.resetAt(player.position); };
    const settle = () => { for (let i = 0; i < TICKS; i++) host.step(); };
    // walking up to the chest and standing on it pays nothing
    put(prompt.at[0], prompt.at[2]); settle();
    assert.deepEqual([facts.includes('template.chest'), paid.length], [false, 0], 'Walk-up pays nothing');
    // E away from the chest pays nothing either
    put(prompt.at[0] + prompt.radius * 4, prompt.at[2]); settle();
    kit.scene(PLAYER, prompt.scene); settle();
    assert.deepEqual([facts.includes('template.chest'), paid.length], [false, 0], 'E away from the chest pays nothing');
    // E at the chest opens it: the quest files its fact and pays 10, once
    put(prompt.at[0], prompt.at[2]); settle();
    assert.ok(kit.scene(PLAYER, prompt.scene), 'The chest prompt takes E');
    settle();
    assert.ok(facts.includes('template.chest'), `E at the chest files template.chest (${facts.join(', ')})`);
    assert.deepEqual(paid, [[PLAYER, 10]], 'The chest pays 10 coins once');
    kit.scene(PLAYER, prompt.scene); settle();
    assert.deepEqual(paid, [[PLAYER, 10]], 'A second E pays nothing more');
  } finally { sim.dispose(); }
});
