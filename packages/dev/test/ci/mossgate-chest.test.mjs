// TEMPLATE-E2E TC-E7, moved to Mossgate by TR-11 (J434 retired the Template): the old chest pays on E, not on
// walk-up. CI only, after `wildshard build src/shards/mossgate out/mossgate`. The chest's prompt sets its shared field;
// the quest's script trigger reads the prompt's spent condition, so only a use the server accepts pays.
// WS_MOSSGATE_OUT points it at another build.
import '@wildshard/engine/scripts/sim-node-loader.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const { loadHeadlessFolder } = await import('@wildshard/engine/host/headlessFolder');
const { folderHeadlessSections } = await import('@wildshard/engine/host/headlessSections');
const { outputDescriptor, serverReadsFile } = await import('@wildshard/engine/game/shardfile/outputDescriptor');
const { createShardfileSim } = await import('@wildshard/engine/game/plugin/simulation');
const { encounterRows } = await import('@wildshard/engine/sim/encounterRows');
const { loadRapier } = await import('@wildshard/engine/physics/rapier');
const { installDeclaredKitItems } = await import('@wildshard/engine/game/shardfile/declaredKitItems');
const engineRequire = createRequire(import.meta.resolve('@wildshard/engine/package.json'));
const PLAYER = 'actor.player', TICKS = 60;

/** The built Mossgate's cell server, with every quest fact it files kept in `facts` and every payment in `paid`. */
async function mossgateSim() {
  const directory = resolve(process.env.WS_MOSSGATE_OUT ?? 'out/mossgate'), product = await loadHeadlessFolder(directory), shard = product.shardfile;
  const descriptor = outputDescriptor(shard);
  assert.ok(descriptor, 'The built Mossgate must pass admission');
  // Direct sim fixtures supply the admitted skin meshes used by the engine's creature height checks.
  const assets = new Map(descriptor.index.files.filter(file => file.kind === 'glb'
    || serverReadsFile(file, shard.terrain?.collider) && (file.name === undefined || file.kind === 'wasm' || file.kind === 'tile'))
    .map(file => [file.commons === true ? `commons:${file.hash}` : file.hash, Uint8Array.from(readFileSync(join(directory, file.path)))]));
  const rapier = await loadRapier(Uint8Array.from(readFileSync(engineRequire.resolve('@dimforge/rapier3d-simd/rapier_wasm3d_bg.wasm'))));
  const facts = [], paid = [];
  const sim = createShardfileSim(shard, assets, { rapier, sections: folderHeadlessSections(product), quest: { fact: name => { facts.push(name); }, coins: (amount, player) => { paid.push([player, amount]); } } });
  return { shard, sim, facts, paid };
}

test('the old chest pays 10 coins on E at the chest, not on walk-up', { timeout: 120_000 }, async () => {
  const { shard, sim, facts, paid } = await mossgateSim();
  try {
    const host = sim.host, player = host.players.get(PLAYER);
    assert.ok(player, 'Mossgate has a player');
    const prompt = shard.targets.interactions.find(row => row.id === 'mossgate.chest.use');
    assert.ok(prompt, 'Mossgate has its chest prompt');
    assert.ok(!shard.quests.triggers.some(row => row.kind === 'region' && row.flag === 'mossgate.chest.opened'), 'No walk-up trigger raises the chest flag');
    const put = (x, z) => { player.position.set(x, host.groundHeightAt(x, z) + 0.05, z); player.motor.resetAt(player.position); };
    const settle = () => { for (let i = 0; i < TICKS; i++) host.step(); };
    // walking up to the chest and standing on it pays nothing
    put(prompt.at[0], prompt.at[2]); settle();
    assert.deepEqual([facts.includes('mossgate.chest'), paid.length], [false, 0], 'Walk-up pays nothing');
    // E away from the chest pays nothing either
    put(prompt.at[0] + prompt.radius * 4, prompt.at[2]); settle();
    sim.interact(prompt.id); settle();
    assert.deepEqual([facts.includes('mossgate.chest'), paid.length], [false, 0], 'E away from the chest pays nothing');
    // MZ4 (J454): the chest wants its key first, searched from the ledge cache on top of the south wall's ledge
    const cache = shard.targets.interactions.find(row => row.id === 'mossgate.ledge-cache.use');
    assert.ok(cache, 'Mossgate has its ledge cache prompt');
    player.position.set(cache.at[0], cache.at[1] - 0.75, cache.at[2]); player.motor.resetAt(player.position); settle();
    assert.equal(sim.interact(cache.id), true, 'The ledge cache takes E');
    settle();
    assert.equal(facts.includes('mossgate.chest'), false, 'The key alone does not open the chest quest');
    const before = paid.length; // the ledge cache's own quest may pay
    // E at the chest opens it: the quest files its fact and pays 10, once
    put(prompt.at[0], prompt.at[2]); settle();
    assert.equal(sim.interact(prompt.id), true, 'The chest prompt takes E');
    settle();
    assert.ok(facts.includes('mossgate.chest'), `E at the chest files mossgate.chest (${facts.join(', ')})`);
    assert.deepEqual(paid.slice(before), [[PLAYER, 10]], 'The chest pays 10 coins once');
    sim.interact(prompt.id); settle();
    assert.deepEqual(paid.slice(before), [[PLAYER, 10]], 'A second E pays nothing more');
  } finally { sim.dispose(); }
});
