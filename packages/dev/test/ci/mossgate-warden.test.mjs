// TEMPLATE-E2E TC-SHIP, moved to Mossgate by TR-11 (J434 retired the Template): the Barrow Warden can die to the
// sword. CI only, after `wildshard build src/shards/mossgate out/mossgate`. On the built cell's server, with the product's
// sections as the grid cell server reads them, the boss decision runs (intro, fight, the phase beat, the second phase),
// its guard opens to melee between strikes, and sword hits 1.8 m off its spawn kill it and file `mossgate.warden`.
// WS_MOSSGATE_OUT points it at another build.
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

/** The built Mossgate's cell server, with every quest fact it files kept in `facts`. */
async function mossgateSim() {
  const directory = resolve(process.env.WS_MOSSGATE_OUT ?? 'out/mossgate'), product = await loadHeadlessFolder(directory), shard = product.shardfile;
  const descriptor = outputDescriptor(shard);
  assert.ok(descriptor, 'The built Mossgate must pass admission');
  // Direct sim fixtures supply the admitted skin meshes used by the engine's creature height checks.
  const assets = new Map(descriptor.index.files.filter(file => file.kind === 'glb'
    || serverReadsFile(file, shard.terrain?.collider) && (file.name === undefined || file.kind === 'wasm' || file.kind === 'tile'))
    .map(file => [file.commons === true ? `commons:${file.hash}` : file.hash, Uint8Array.from(readFileSync(join(directory, file.path)))]));
  const rapier = await loadRapier(Uint8Array.from(readFileSync(engineRequire.resolve('@dimforge/rapier3d-simd/rapier_wasm3d_bg.wasm'))));
  const facts = [];
  const sim = createShardfileSim(shard, assets, { rapier, sections: folderHeadlessSections(product), quest: { fact: name => { facts.push(name); }, coins: () => undefined } });
  return { shard, sim, facts };
}

test('the Barrow Warden runs its decision, opens to the sword and dies to it, filing mossgate.warden', { timeout: 120_000 }, async () => {
  const { shard, sim, facts } = await mossgateSim();
  try {
    const host = sim.host, player = host.players.get(PLAYER), warden = host.entities.get('barrow-warden');
    const fight = shard.encounters.find(row => row.entity === 'barrow-warden');
    assert.ok(player && warden && fight, 'Mossgate has a player, the Warden and its encounter');
    const view = encounterRows(host).get(`encounter:${fight.id}`);
    assert.ok(view, 'The Warden encounter publishes its view');
    // 1.8 m off the Warden's spawn, where the Template's staging probe stood off its own
    const spot = { x: warden.position.x + 1.8, z: warden.position.z };
    const stand = () => { player.position.set(spot.x, player.position.y, spot.z); player.motor.resetAt(player.position); };
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
    assert.ok(facts.includes('mossgate.warden'), `The Warden's fall files mossgate.warden (${facts.join(', ')})`);
  } finally { sim.dispose(); }
});

// The coordinator's TC-SHIP-b: a real swing, not a hit put on the body. The player takes the iron sword off its rack and
// presses it along its own look from where the probe stood; the server's kit strikes the nearest body whose aim point
// (feet + bodyY x scale) lies within the sword's range and half its width of that look. At bodyY 1.0 the Warden's sat 3 m
// up, 2.23 m from the eye, past the sword's 2.2 m reach, so every swing missed.
test('a sword swing from the player\'s reach hits the Barrow Warden and kills it', { timeout: 180_000 }, async () => {
  const { shard, sim, facts } = await mossgateSim();
  try {
    const host = sim.host, player = host.players.get(PLAYER), warden = host.entities.get('barrow-warden');
    assert.ok(player && warden, 'Mossgate has a player and the Warden');
    const kit = installDeclaredKitItems(host, shard, sim.itemHooks);
    assert.ok(kit, 'Mossgate installs its declared kit');
    const put = (x, z) => { player.position.set(x, host.groundHeightAt(x, z) + 0.05, z); player.motor.resetAt(player.position); };
    // the iron sword is Mossgate's loadout primary: the player starts holding it
    const sword = shard.items.rows.find(row => row.id === shard.items.loadout.primary);
    assert.ok(sword, 'The loadout sword row');
    const full = player.health.attributes.health;
    let seq = 0, swings = 0, landed = 0;
    host.events.on('damage.dealt', ({ req }) => { if (req.target === warden.combatActor() && req.weaponId === sword.id) landed++; }, host.scope);
    // 1.8 m off its spawn, facing the Warden, looking at its drawn middle (the skin is about 5.3 m tall at scale 3)
    const at = { x: warden.position.x + 1.8, z: warden.position.z }, drawnMiddle = 2.65;
    for (let tick = 0; tick < 180 * TICKS && warden.alive; tick++) {
      player.health.attributes.health = full; put(at.x, at.z);
      const dx = warden.position.x - at.x, dz = warden.position.z - at.z;
      player.yaw = Math.atan2(-dx, -dz);
      if (tick % 30 === 0) {
        const eye = { x: at.x, y: player.position.y + 1.68, z: at.z }, to = { x: dx, y: warden.position.y + drawnMiddle - eye.y, z: dz };
        const length = Math.hypot(to.x, to.y, to.z), direction = { x: to.x / length, y: to.y / length, z: to.z / length };
        swings++; seq++;
        kit.command(PLAYER, { seq, buttons: 0, pitch: Math.asin(direction.y), attack: { aim: { origin: eye, direction } } });
      }
      host.step();
    }
    assert.ok(landed > 0, `Real swings land on the Warden (${String(landed)} of ${String(swings)})`);
    assert.equal(warden.alive, false, `The Warden dies to real swings (${String(landed)} of ${String(swings)} landed)`);
    for (let i = 0; i < 10; i++) host.step();
    assert.ok(facts.includes('mossgate.warden'), `The Warden's fall files mossgate.warden (${facts.join(', ')})`);
  } finally { sim.dispose(); }
});
