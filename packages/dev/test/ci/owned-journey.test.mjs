// J186: actual built products, real player input and authored route data.
// Explicit CI proof only; no teleports, forced quest flags or fake host.
import '@wildshard/engine/scripts/sim-node-loader.mjs';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
const { questSource, SCENE_TRIGGERS } = await import('./quest-source.mjs');

const { loadHeadlessFolder } = await import('@wildshard/engine/host/headlessFolder');
const { createTrustedHeadlessAdapter } = await import('@wildshard/engine/host/headlessRuntime');
const { HeadlessSimulation } = await import('@wildshard/engine/host/headless');
const { folderHeadlessSections } = await import('@wildshard/engine/host/headlessSections');
const { outputDescriptor, serverReadsFile } = await import('@wildshard/engine/game/shardfile/outputDescriptor');
const { loadRapier } = await import('@wildshard/engine/physics/rapier');
const { manifestFolders, builtShardFolders } = await import('@wildshard/build/scripts/shard-outputs.mjs');
const engineRequire = createRequire(import.meta.resolve('@wildshard/engine/package.json'));
const routes = JSON.parse(readFileSync(new URL('./walk-routes.json', import.meta.url), 'utf8'));
const products = builtShardFolders(process.cwd(), manifestFolders(process.cwd())).map(row => row.slug).sort();
assert.ok(products.length);
assert.deepEqual(readdirSync('out', {withFileTypes:true}).filter(row => row.isDirectory() && !row.name.startsWith('.') && row.name !== 'tars').map(row=>row.name).sort(), products);
// TEMPLATE-E2E TR-11 (J434): Mossgate, the starter, is a source shard built on its own (`wildshard build
// src/shards/mossgate <dir>`), so it sits outside `out`; WS_MOSSGATE_OUT adds it to the walk.
const walked = [...products.map(slug => ({ slug, directory: resolve('out', slug) })),
  ...process.env.WS_MOSSGATE_OUT ? [{ slug: 'mossgate', directory: resolve(process.env.WS_MOSSGATE_OUT) }] : []];

function routeFor(slug, spawn) {
  if (routes[slug] === 'spawn-square') return {name:'spawn-square',points:[{x:spawn.x,z:spawn.z},{x:spawn.x+5,z:spawn.z},{x:spawn.x+5,z:spawn.z+5},{x:spawn.x,z:spawn.z+5}]};
  const candidates = routes[slug].filter(row => row.inside === undefined && row.start.hover !== true);
  candidates.sort((a,b)=>Math.hypot(a.start.x-spawn.x,a.start.z-spawn.z)-Math.hypot(b.start.x-spawn.x,b.start.z-spawn.z));
  const nearest = candidates[0]; assert.ok(nearest, `No authored spawn route for ${slug}`);
  return {name:nearest.name,points:[{x:nearest.start.x,z:nearest.start.z},...nearest.waypoints]};
}

for (const { slug, directory } of walked) test(`${slug}: enters and walks 1800 actual authored-route ticks`, {timeout:9500}, async () => {
  const started = performance.now(), product = await loadHeadlessFolder(directory), shard = product.shardfile, authored = await questSource(slug);
  if (SCENE_TRIGGERS.has(slug)) {
    const kept = (rows, own) => rows.filter(row => own.some(mine => JSON.stringify(mine) === JSON.stringify(row)));
    assert.deepEqual([shard.quests.quests, shard.quests.dialogue], [authored.quests, authored.dialogue], 'The real product must preserve its authored quests and talks');
    assert.deepEqual(kept(shard.quests.triggers, authored.triggers), authored.triggers, 'The real product must keep every authored trigger');
    assert.deepEqual(kept(shard.quests.flags, authored.flags), authored.flags, 'The real product must keep every authored flag');
  } else assert.deepEqual(shard.quests,authored,'The real product must preserve its authored quest inventory');
  const descriptor = outputDescriptor(shard); assert.ok(descriptor);
  const declared = shard.runtime === null && !product.has('sim/runtime-plan');
  const assets = new Map(descriptor.index.files.filter(file => declared || serverReadsFile(file,shard.terrain?.collider) && (file.name === undefined || file.kind === 'wasm' || file.kind === 'tile'))
    .map(file=>[file.commons === true ? `commons:${file.hash}` : file.hash,readFileSync(join(directory,file.path))]));
  const rapier = declared ? undefined : await loadRapier(readFileSync(engineRequire.resolve('@dimforge/rapier3d-simd/rapier_wasm3d_bg.wasm')));
  const runtime = declared
    ? await HeadlessSimulation.create(shard,assets,undefined,{deadline:'advisory',sections:folderHeadlessSections(product)})
    : await createTrustedHeadlessAdapter({shard,assets,product,rapier});
  try {
    const route = routeFor(slug,shard.spawn), report = await runtime.journey({ticks:1800,points:route.points});
    assert.equal(report.ticks,1800); assert.equal(report.settledTicks,60);
    assert.ok(report.distance>0); assert.ok(report.visited>1, `The real journey must reach multiple route points: ${JSON.stringify(report)}`);
    assert.equal(report.final.grounded,true); assert.ok(report.final.position.every(Number.isFinite));
    if (declared) assert.equal(runtime.quarantined,false);
    console.log(`owned-journey ${slug} ${JSON.stringify({route:route.name,...report,elapsedMs:performance.now()-started})}`);
  } finally { await runtime.dispose(); }
  await assert.rejects(async () => runtime.step([]));
  assert.ok(performance.now()-started<9500,'The complete journey must remain under the quick proof budget');
});
