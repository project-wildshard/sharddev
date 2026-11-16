// TEMPLATE-E2E TC-SHIP (meta TEMPLATE-E2E-PLAN): the Template's Barrow Warden can die to the sword. CI only, after
// `pnpm build:shards`. On staging a probe swung 325 times from 1.8 m off its spawn and landed 2 (it aimed 0.9 m over the
// feet of a scale-3 body). On the built cell's server, with the product's sections as the grid cell server reads them,
// the boss decision runs (intro, fight, the phase beat, the second phase), its guard opens to melee between strikes, and
// sword hits from where the probe stood kill it and file `template.warden`. WS_TEMPLATE_OUT points it at another build.
import '@wildshard/engine/scripts/sim-node-loader.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { Vector3 } from 'three';

const { loadHeadlessProduct } = await import('@wildshard/engine/host/headlessProduct');
const { productHeadlessSections } = await import('@wildshard/engine/host/headlessSections');
const { outputDescriptor, serverReadsFile } = await import('@wildshard/engine/game/shardfile/outputDescriptor');
const { createShardfileSim } = await import('@wildshard/engine/game/plugin/simulation');
const { encounterRows } = await import('@wildshard/engine/sim/encounterRows');
const { loadRapier } = await import('@wildshard/engine/physics/rapier');
const engineRequire = createRequire(import.meta.resolve('@wildshard/engine/package.json'));
const PLAYER = 'actor.player', TICKS = 60;

test('the Barrow Warden runs its decision, opens to the sword and dies to it, filing template.warden', { timeout: 120_000 }, async () => {
  const directory = resolve(process.env.WS_TEMPLATE_OUT ?? 'out/_template'), product = await loadHeadlessProduct(directory), shard = product.shardfile;
  const descriptor = outputDescriptor(shard);
  assert.ok(descriptor, 'The built Template must pass admission');
  const assets = new Map(descriptor.index.files.filter(file => serverReadsFile(file, shard.terrain?.collider) && (file.name === undefined || file.kind === 'wasm' || file.kind === 'tile'))
    .map(file => [file.commons === true ? `commons:${file.hash}` : file.hash, Uint8Array.from(readFileSync(join(directory, file.path)))]));
  const rapier = await loadRapier(Uint8Array.from(readFileSync(engineRequire.resolve('@dimforge/rapier3d-simd/rapier_wasm3d_bg.wasm'))));
  const facts = [];
  const sim = createShardfileSim(shard, assets, { rapier, sections: productHeadlessSections(product), quest: { fact: name => { facts.push(name); }, coins: () => undefined } });
  try {
    const host = sim.host, player = host.players.get(PLAYER), warden = host.entities.get('barrow-warden');
    const fight = shard.encounters.find(row => row.entity === 'barrow-warden');
    assert.ok(player && warden && fight, 'The Template has a player, the Warden and its encounter');
    const view = encounterRows(host).get(`encounter:${fight.id}`);
    assert.ok(view, 'The Warden encounter publishes its view');
    // where the staging probe stood, 1.8 m off the Warden's spawn
    const stand = () => { player.position.set(22.7, player.position.y, -1.5); player.motor.resetAt(player.position); };
    stand();
    const full = player.health.attributes.health, seen = new Set();
    let swings = 0, landed = 0;
    host.events.on('damage.dealt', ({ req }) => { if (req.target === warden.combatActor()) landed++; }, host.scope);
    for (let tick = 0; tick < 120 * TICKS && warden.alive; tick++) {
      // the player is kept whole and in place: this proves the Warden can die to the sword, not the fight's balance
      player.health.attributes.health = full; stand();
      if (tick % 45 === 0) {
        swings++;
        host.combat.hit({ source: 'env', sourceTags: [PLAYER, 'dmg.melee'], target: warden.combatActor(), amount: 25, point: warden.position.clone(), dir: new Vector3(1, 0, 0) });
      }
      seen.add(`${view().state}/${String(view().phase)}`);
      host.step();
    }
    assert.equal(warden.alive, false, `The Warden died (${String(landed)} of ${String(swings)} swings landed)`);
    // the decision ran: the fight reached its second phase through the phase beat
    for (const state of ['intro/0', 'fight/0', 'beat/1', 'fight/1']) assert.ok(seen.has(state), `The fight passed ${state} (${[...seen].join(', ')})`);
    // the guard shuts between strikes: some swings land and some do not
    assert.ok(landed > 0 && landed < swings, `The guard opens and shuts (${String(landed)} of ${String(swings)})`);
    for (let i = 0; i < 10; i++) host.step();
    assert.ok(facts.includes('template.warden'), `The Warden's fall files template.warden (${facts.join(', ')})`);
  } finally { sim.dispose(); }
});
