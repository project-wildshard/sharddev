#!/usr/bin/env node
// bake-voxel-ao.mjs — the voxel AO of the code-built worlds (Nalati's, Driftwood's), at build time (SF67 fix 3, E461).
//
// Both worlds marched voxel AO for every painted model on the main thread at load (the audit's voxelAO.ts:62 owner, in
// Driftwood's lowpolyKit models and Nalati's camps, outcrops, dressing and Kurgan). The AO is a pure function of each
// geometry's inputs, so this builds the shard's real world in Node (scripts/bake/worldHost.mjs, the navmesh baker's host;
// once per tier, a child process each, the tier set before the modules load) while src/client/engine/world/voxelAO.ts records
// every result under a hash of its inputs, and writes one table (both tiers' entries) to the shard's own asset folder. At load the shard adds
// the table before it builds (`addVoxelAOBake`); a geometry whose inputs hash differently (a miss) marches as before.
// Every run bakes in memory and writes only differing bytes; --check (bake-check.mjs) fails when a source changed
// without a rebake.
//
//   node --experimental-transform-types --import ./scripts/bake-loader.mjs scripts/bake-voxel-ao.mjs [--check | --verify] [slug…]
//   (--verify: build as the page does, with the committed table, and fail unless every AO call is answered by it)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { brotliCompressSync } from 'node:zlib';
import { byteWriter } from '@wildshard/engine/scripts/bake-output.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const TIERS = ['phone', 'desktop'];
/** where each shard keeps its table, one for every tier (the keys are the inputs): a folder the shard owns (its manifest's
 *  assetGlobs; the shard sandbox) */
const OUTPUT = {
  'nalati-grasslands': 'public/assets/nalati/baked/voxel-ao.bin',
  // beside the Blender island's other build outputs; the page's G164 boot hits every kit (the key drops the trig last bits
  // that differ between Node and the browsers, SF67 part 3)
  'driftwood-isle': 'public/assets/models/driftwood-blender/voxel-ao.bin',
};
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const tierArg = arg('tier'), slugArg = arg('slug'), recordTo = arg('record-to');

if (tierArg === undefined) {
  // the parent: one child per shard and tier (TIER is read once, as each module loads); the children record, the parent
  // merges the tiers' entries into the shard's one table
  const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const verify = process.argv.includes('--verify'), check = process.argv.includes('--check');
  const ao = await import(pathToFileURL(resolve(ROOT, 'src/client/engine/world/voxelAO.ts')).href);
  const output = byteWriter(check, 'bake-voxel-ao');
  const scratch = mkdtempSync(join(tmpdir(), 'bake-voxel-ao-'));
  let failed = false;
  try {
    for (const [slug, out] of Object.entries(OUTPUT)) {
      if (only.length > 0 && !only.includes(slug)) continue;
      const merged = new Map();
      for (const tier of TIERS) {
        const file = join(scratch, `${slug}.${tier}.bin`);
        const r = spawnSync(process.execPath, [...process.execArgv, import.meta.filename, `--tier=${tier}`, `--slug=${slug}`, ...(verify ? ['--verify'] : [`--record-to=${file}`])], { cwd: ROOT, stdio: 'inherit' });
        if (r.status !== 0) { failed = true; continue; }
        if (verify) continue;
        const b = readFileSync(file);
        const table = ao.decodeVoxelAOBake(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
        if (table === null) throw new Error(`bake-voxel-ao: ${slug} ${tier} recorded no table`);
        for (const [key, k] of table) merged.set(key, k);
      }
      if (verify || failed) continue;
      const bytes = ao.encodeVoxelAOBake(merged);
      output.put(resolve(ROOT, out), bytes);
      console.log(`[voxel-ao] ${slug}: ${merged.size} geometries (both tiers), ${(bytes.length / 1024).toFixed(1)} KB (${(brotliCompressSync(bytes).length / 1024).toFixed(1)} KB brotli)`);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  if (!verify) output.finish();
  if (failed) process.exitCode = 1;
} else {
  if (!TIERS.includes(tierArg)) throw new Error(`bake-voxel-ao: unknown tier ${tierArg}`);
  if (slugArg === undefined || !(slugArg in OUTPUT)) throw new Error(`bake-voxel-ao: unknown shard ${slugArg}`);
  const { installBakeEnvironment } = await import('./bake/environment.mjs');
  const environment = installBakeEnvironment(ROOT);
  try {
    const src = (p) => import(pathToFileURL(resolve(ROOT, 'src', p)).href);
    if (tierArg !== 'desktop') (await src('engine/client/core/tier.ts')).initializeTier(tierArg); // desktop is Node's own tier (navigator 'node')
    const THREE = await import('three');
    const { visitAuthoredWorld } = await import('./bake/worldHost.mjs');
    const registry = await src('game/client/shard/registry.ts');
    const { SHARDS } = await src('shards.generated.ts');
    const HF = await src('engine/shared/world/Heightfield.ts');
    const BT = await src('engine/shared/world/BakedTerrain.ts');
    const ao = await src('engine/client/world/voxelAO.ts');
    const def = SHARDS.find((s) => s.slug === slugArg);
    if (def === undefined) throw new Error(`bake-voxel-ao: no shard ${slugArg}`);
    registry.setActiveChunk(def.slug);
    const terrain = resolve(ROOT, 'public/assets/baked', def.slug, 'terrain.bin');
    if (existsSync(terrain)) {
      const buf = readFileSync(terrain);
      const grid = BT.parseBakedTerrain(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      if (!grid) throw new Error(`bake-voxel-ao: ${def.slug}/terrain.bin does not parse`);
      HF._installBakedTerrain(BT.bakedSamplers(grid));
    }
    const noop = () => undefined;
    const sky = new Proxy({ setupMaterial: noop, csm: { lights: [new THREE.DirectionalLight()], update: noop }, hemi: new THREE.HemisphereLight(), sunDisc: new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial()), planet: new THREE.Group(), clouds: null, dayNight: null, viewCamera: new THREE.PerspectiveCamera(), sunDir: new THREE.Vector3(0, 1, 0) },
      { get: (t, k) => k in t ? t[k] : typeof k === 'string' && k.endsWith('Color') ? new THREE.Color(1, 1, 1) : typeof k === 'string' && k.endsWith('Dir') ? new THREE.Vector3(0, 1, 0) : undefined });
    const t0 = performance.now();
    if (process.argv.includes('--verify')) {
      // the page's path: the shard adds its committed table and builds; every AO call must be answered by it
      await visitAuthoredWorld(def, { root: ROOT, sky, element: environment.element });
      const s = ao.voxelAOBakeStats();
      console.log(`[voxel-ao] ${def.slug} ${tierArg} verify: ${s.hits} answered by the bake, ${s.misses} marched, in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
      if (s.hits === 0 || s.misses > 0) process.exitCode = 1;
      process.exit(process.exitCode ?? 0);
    }
    const rec = ao.recordVoxelAO();
    try { await visitAuthoredWorld(def, { root: ROOT, sky, element: environment.element }); } finally { rec.stop(); }
    let vertices = 0;
    for (const k of rec.entries.values()) vertices += k.length;
    if (recordTo === undefined) throw new Error('bake-voxel-ao: a tier child records to --record-to=<file>');
    const bytes = ao.encodeVoxelAOBake(rec.entries);
    writeFileSync(recordTo, bytes);
    console.log(`[voxel-ao] ${def.slug} ${tierArg}: ${rec.entries.size} geometries, ${vertices} vertices in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  } finally {
    environment.dispose();
  }
  // the built level leaves timers behind (its systems, the physics host); the bake is done, so the child ends here
  process.exit(process.exitCode ?? 0);
}
