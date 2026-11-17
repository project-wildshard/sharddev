#!/usr/bin/env node
// export-scene.mjs — step 1 of the Blender island pipeline (DRIFTWOOD-REMASTER X2, E52; any shard since PH-0.3).
//
// Runs the game's own terrain + layout code in Node (as scripts/bake-chunk.mjs does) and writes what Blender needs
// to author a shard's area on the SAME ground the player walks:
//
//   <cache>/scene.json       the area, the sea level (null on a dry shard), the chunk, then the shard's own layout specs
//                             (scripts/blender/<slug>/export.mjs: Driftwood's palms / boulders / bushes / trailside / pier,
//                             Pine Hollow's trees / cabins / pond / trails)
//   <cache>/area.bin          f32 grid over the area at STEP m: height · r · g · b (the shard's ground colour, linear) · slope ·
//                             trail distance  (6 floats per vertex, row-major iz·nx + ix, x = x0 + ix·STEP, z = z0 + iz·STEP)
//   <cache>/context.bin       f32 grid over the whole chunk at the game's own 256² resolution (height only): the GI bake's
//                             surroundings (the plateau beyond the area occludes the sky, the far beach bounces light)
//   <cache>/structures.bin    the procedural structures the shard keeps in blender mode (Driftwood: pier, hut, trailside
//                             stair / fences) as triangle soup: u32 tris · f32[tris·9] positions · f32[tris·9] colours —
//                             bake occluders only (0 tris when the shard lists none)
//   + whatever extra grids the shard module writes (Pine Hollow: splat.bin, u8×4 ground-layer weights per area vertex)
//
// Heights come from the BAKED grid (public/assets/baked/<slug>/terrain.bin → Heightfield's bilinear lookups), i.e.
// exactly the surface Player.groundAt() walks, so the Blender terrain never floats or sinks against collision. The area
// is the shard manifest's `blender.area` (blenderAreaFor in src/client/engine/world/blenderArea.ts).
//
//   node --import ./scripts/bake-loader.mjs scripts/blender/lib/export-scene.mjs [--chunk <slug>] [cacheDir]
//   (--chunk defaults to driftwood-isle; cacheDir to ~/.cache/wildshard-blender/<slug>)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prepareNativeScalarBlocks } from '../../bake/nativeWorld.mjs';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '../../..');
const args = process.argv.slice(2);
const ci = args.indexOf('--chunk');
const SLUG = ci !== -1 ? args[ci + 1] : 'driftwood-isle';
if (!SLUG || SLUG.startsWith('-')) throw new Error('export-scene: --chunk needs a shard slug');
const cacheArg = args.find((a, i) => !a.startsWith('--') && !(ci !== -1 && i === ci + 1));
const CACHE = resolve(cacheArg ??`${homedir()}/.cache/wildshard-blender/${SLUG}`);
mkdirSync(CACHE, { recursive: true });
if (!('location' in globalThis)) Object.assign(globalThis, { location: new URL('http://localhost/?tier=desktop') });

const imp = (p) => import(pathToFileURL(resolve(ROOT, p)).href);
const shardModule = resolve(ROOT, `src/shards/${SLUG}/blender/export.mjs`);
if (!existsSync(shardModule)) throw new Error(`export-scene: no src/shards/${SLUG}/blender/export.mjs (the shard's ground colour + layout)`);
const { CHUNK_SIZE, CHUNK_HALF, TERRAIN_RES, ROAD_LENGTH } = await imp('src/shared/engine/core/config.ts');
const registry = await imp('src/client/game/shard/registry.ts');
if (!registry.findChunk(SLUG)) throw new Error(`export-scene: unknown shard "${SLUG}"`);
registry.setActiveChunk(SLUG);
const hf = await imp('src/shared/engine/world/Heightfield.ts');
const baked = await imp('src/shared/engine/world/BakedTerrain.ts');
const def = registry.getActiveChunk();
prepareNativeScalarBlocks(def, ROOT);
const grid = baked.parseBakedTerrain(readFileSync(resolve(ROOT, `public/assets/baked/${SLUG}/terrain.bin`)).buffer.slice(0));
if (!grid) throw new Error('no baked terrain');
// the scene is exported in the raw bake's authored frame: a level shifted at runtime (its field's `datum`, Driftwood's G164
// drop) would install the bake shifted, so it binds the raw bake and the authored waterline instead; the game shifts the
// exported island by the same datum as it loads (BlenderIsland.ts)
const field = def.ground.terrain, datum = field?.datum ?? 0, samplers = baked.bakedSamplers(grid);
if (datum === 0) hf._installBakedTerrain(samplers);
else hf.overrideTerrain({ heightAt: samplers.heightAt, normalAt: samplers.normalAt, splatAt: samplers.splatAt, waterLevel: () => field.waterLevel() - datum });
const THREE = await import('three');
const shard = await import(pathToFileURL(shardModule).href);
const { blenderAreaFor, STEP } = await imp('src/client/engine/world/blenderArea.ts');
const AREA = blenderAreaFor(def);
if (!AREA) throw new Error(`export-scene: the manifest has no Blender area for "${SLUG}"`);
const ctx = { ROOT, CACHE, SLUG, THREE, imp, hf, def, CHUNK_SIZE, CHUNK_HALF, ROAD_LENGTH };

// ── the area grid ──
const x0 = AREA.x0, z0 = AREA.z0;
const nx = Math.round((AREA.x1 - AREA.x0) / STEP) + 1, nz = Math.round((AREA.z1 - AREA.z0) / STEP) + 1;
const areaInfo = { x0, z0, x1: AREA.x1, z1: AREA.z1, step: STEP, nx, nz };
const groundColor = await shard.groundColor({ ...ctx, area: areaInfo });   // (c, x, z, y, ny, td) → c = the shard's ground colour there
const g = new Float32Array(nx * nz * 6);
const c = new THREE.Color();
for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
  const x = x0 + ix * STEP, z = z0 + iz * STEP, y = hf.heightAt(x, z);
  const [, ny] = hf.normalAt(x, z, 0.98);
  const td = hf.trailDistance(x, z);
  groundColor(c, x, z, y, ny, td);
  g.set([y, c.r, c.g, c.b, 1 - ny, td], (iz * nx + ix) * 6);
}
writeFileSync(`${CACHE}/area.bin`, Buffer.from(g.buffer));

// ── the whole chunk, coarse (the bake's surroundings) ──
const res = TERRAIN_RES, d = CHUNK_SIZE / (res - 1);
const ctxGrid = new Float32Array(res * res);
for (let iz = 0; iz < res; iz++) for (let ix = 0; ix < res; ix++) ctxGrid[iz * res + ix] = hf.heightAt(-CHUNK_HALF + ix * d, -CHUNK_HALF + iz * d);
writeFileSync(`${CACHE}/context.bin`, Buffer.from(ctxGrid.buffer));

// ── structures kept in blender mode, as bake occluders ──
const soupPos = [], soupCol = [];
const addObject = (obj) => {
  obj.updateMatrixWorld(true);
  obj.traverse((m) => {
    if (!m.isMesh || !m.geometry) return;
    const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    const p = geo.getAttribute('position'), col = geo.getAttribute('color');
    if (!p) return;
    const v = new THREE.Vector3();
    const count = m.isInstancedMesh ? m.count : 1;
    const im = new THREE.Matrix4();
    for (let k = 0; k < count; k++) {
      const mw = m.matrixWorld.clone();
      if (m.isInstancedMesh) { m.getMatrixAt(k, im); mw.multiply(im); }
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(mw);
        soupPos.push(v.x, v.y, v.z);
        soupCol.push(col ? col.getX(i) : 0.6, col ? col.getY(i) : 0.5, col ? col.getZ(i) : 0.4);
      }
    }
  });
};
const tryBuild = (name, f) => { try { addObject(f()); } catch (e) { console.warn(`[export] ${name} skipped: ${e.message}`); } };

// ── the shard's layout specs (desktop tier, as the bake's reference) + its structures (via addObject) ──
const layout = await shard.layout({ ...ctx, area: areaInfo, addObject, tryBuild });

const tris = soupPos.length / 9;
const soup = new Float32Array(1 + soupPos.length * 2);
new Uint32Array(soup.buffer, 0, 1)[0] = tris;
soup.set(soupPos, 1); soup.set(soupCol, 1 + soupPos.length);
writeFileSync(`${CACHE}/structures.bin`, Buffer.from(soup.buffer));

const scene = {
  area: areaInfo, sea: def.ocean ? def.ocean.level - datum : null,
  chunk: { size: CHUNK_SIZE, res },
  ...layout.scene,
};
writeFileSync(`${CACHE}/scene.json`, JSON.stringify(scene));
console.log(`[export] ${SLUG} → ${CACHE}: area ${nx}×${nz} @ ${STEP} m, ${layout.summary}, structure tris ${tris}`);
