#!/usr/bin/env node
// bake-geometry.mjs — finished Driftwood scene draws and Nalati's recorded geometry.
// Driftwood delegates to its registered rock-scene producer; no runtime table remains.
// Nalati retains the existing two-tier recorder and verification path.
//
// node --experimental-transform-types --import ./scripts/bake-loader.mjs scripts/bake-geometry.mjs [--check | --verify] [slug…]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { brotliCompressSync } from 'node:zlib';
import { byteWriter } from '@wildshard/engine/scripts/bake-output.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const TIERS = ['phone', 'desktop'];
/** where each shard keeps its table (one for every tier: the keys are the inputs), a folder the shard owns (the shard
 *  sandbox), beside its voxel AO table; the runtime fetches the same literal path */
const OUTPUT = {
  'nalati-grasslands': 'public/assets/nalati/baked/geometry.bin',
};
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const tierArg = arg('tier'), slugArg = arg('slug'), recordTo = arg('record-to');

if (tierArg === undefined) {
  const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const verify = process.argv.includes('--verify'), check = process.argv.includes('--check');
  const gb = await import(pathToFileURL(resolve(ROOT, 'src/client/engine/world/geometryBake.ts')).href);
  const output = byteWriter(check, 'bake-geometry');
  const scratch = mkdtempSync(join(tmpdir(), 'bake-geometry-'));
  let failed = false;
  try {
    // Driftwood's rocks are built in its product (generators/rockBank.ts, GR7), not baked here.
    for (const [slug, out] of Object.entries(OUTPUT)) {
      if (only.length > 0 && !only.includes(slug)) continue;
      const merged = new Map();
      for (const tier of TIERS) {
        const file = join(scratch, `${slug}.${tier}.bin`);
        const r = spawnSync(process.execPath, [...process.execArgv, import.meta.filename, `--tier=${tier}`, `--slug=${slug}`, ...(verify ? ['--verify'] : [`--record-to=${file}`])], { cwd: ROOT, stdio: 'inherit' });
        if (r.status !== 0) { failed = true; continue; }
        if (verify) continue;
        const b = readFileSync(file);
        const table = gb.decodeGeometryBake(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
        if (table === null) throw new Error(`bake-geometry: ${slug} ${tier} recorded no table`);
        for (const [key, g] of table) merged.set(key, g);
      }
      if (verify || failed) continue;
      const bytes = gb.encodeGeometryBake(merged);
      output.put(resolve(ROOT, out), bytes);
      console.log(`[geometry] ${slug}: ${merged.size} geometries (both tiers), ${(bytes.length / 1024).toFixed(1)} KB (${(brotliCompressSync(bytes).length / 1024).toFixed(1)} KB brotli)`);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  if (!verify) output.finish();
  if (failed) process.exitCode = 1;
} else {
  if (!TIERS.includes(tierArg)) throw new Error(`bake-geometry: unknown tier ${tierArg}`);
  if (slugArg === undefined || !(slugArg in OUTPUT)) throw new Error(`bake-geometry: unknown shard ${slugArg}`);
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
    const gb = await src('engine/client/world/geometryBake.ts');
    const def = SHARDS.find((s) => s.slug === slugArg);
    if (def === undefined) throw new Error(`bake-geometry: no shard ${slugArg}`);
    registry.setActiveChunk(def.slug);
    const terrain = resolve(ROOT, 'public/assets/baked', def.slug, 'terrain.bin');
    if (existsSync(terrain)) {
      const buf = readFileSync(terrain);
      const grid = BT.parseBakedTerrain(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      if (!grid) throw new Error(`bake-geometry: ${def.slug}/terrain.bin does not parse`);
      HF._installBakedTerrain(BT.bakedSamplers(grid));
    }
    const noop = () => undefined;
    const sky = new Proxy({ setupMaterial: noop, csm: { lights: [new THREE.DirectionalLight()], update: noop }, hemi: new THREE.HemisphereLight(), sunDisc: new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial()), planet: new THREE.Group(), clouds: null, dayNight: null, viewCamera: new THREE.PerspectiveCamera(), sunDir: new THREE.Vector3(0, 1, 0) },
      { get: (t, k) => k in t ? t[k] : typeof k === 'string' && k.endsWith('Color') ? new THREE.Color(1, 1, 1) : typeof k === 'string' && k.endsWith('Dir') ? new THREE.Vector3(0, 1, 0) : undefined });
    const t0 = performance.now();
    if (process.argv.includes('--verify')) {
      // the page's path: the shard adds its committed table and builds; every wrapped call must be answered by it
      await visitAuthoredWorld(def, { root: ROOT, sky, element: environment.element });
      const s = gb.geometryBakeStats();
      console.log(`[geometry] ${def.slug} ${tierArg} verify: ${s.hits} answered by the bake, ${s.misses} built, in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
      if (s.hits === 0 || s.misses > 0) process.exitCode = 1;
      process.exit(process.exitCode ?? 0);
    }
    const rec = gb.recordGeometryBake();
    try { await visitAuthoredWorld(def, { root: ROOT, sky, element: environment.element }); } finally { rec.stop(); }
    let vertices = 0;
    for (const g of rec.entries.values()) vertices += (g.attributes[0]?.array.length ?? 0) / (g.attributes[0]?.itemSize ?? 1);
    if (recordTo === undefined) throw new Error('bake-geometry: a tier child records to --record-to=<file>');
    writeFileSync(recordTo, gb.encodeGeometryBake(rec.entries));
    console.log(`[geometry] ${def.slug} ${tierArg}: ${rec.entries.size} geometries, ${vertices} vertices in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  } finally {
    environment.dispose();
  }
  // the built level leaves timers behind (its systems, the physics host); the bake is done, so the child ends here
  process.exit(process.exitCode ?? 0);
}
