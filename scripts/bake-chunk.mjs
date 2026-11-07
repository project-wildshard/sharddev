#!/usr/bin/env node
// bake-chunk.mjs — pre-bake every registered shard's terrain at build time (project/archive/2026-09-22-load-perf.md §P2.1).
//
// Runs the chunk's pure terrain functions (src/chunks/<slug>.ts → buildTerrain: seeded Noise2D / Rng)
// in Node and writes public/assets/baked/<slug>/terrain.bin — the height and splat weights at every
// vertex of the terrain mesh grid (TERRAIN_RES² over CHUNK_SIZE, the exact PlaneGeometry order), so
// the phone builds the mesh, plants the forest and walks the ground from a lookup instead of ~200 k
// noise evaluations at launch. src/shared/engine/world/BakedTerrain.ts reads it and swaps Heightfield's bindings.
//
// Every run bakes in memory and writes only differing output bytes. Source-only edits write nothing.
//
//   node --import ./scripts/bake-loader.mjs scripts/bake-chunk.mjs [--check]
//
// Format (little-endian): 'WSTR' u32 version=1 · u32 res · f32 size · u32 seed · u32 landscapeHash (0 = unhashed legacy) ·
//   f32[res²] height · u8[res²·4] splat weights (each row sums to ≈ 255) — vertex i = iz·res + ix at
//   (x, z) = (−half + ix·d, −half + iz·d), d = size / (res − 1).
//   Then, for a shard that grows undergrowth, the placement decision log (src/shared/engine/world/forest/placement.ts — the forest
//   planted on this grid, then every undergrowth candidate's kept / skipped bit, ~17 KB): 'WSPL' u32 version=1 ·
//   u32 decisions · u32 kinds · u32[kinds] counts · f64 checksum sum · u8[⌈decisions/8⌉] bits.
import { byteWriter, outputHash, jsonBytes } from '@wildshard/engine/scripts/bake-output.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, 'public/assets/baked');
const check = process.argv.includes('--check');
const VERSION = 1;
// before any game module loads: the settings (and the defs that read them) take the page's query at import


const { CHUNK_SIZE, CHUNK_HALF, TERRAIN_RES } = await import(pathToFileURL(resolve(ROOT, 'src/shared/engine/core/config.ts')).href);
const { landscapeHash } = await import(pathToFileURL(resolve(ROOT, 'src/shared/engine/world/terrainField.ts')).href);

// every chunk module that exports a ShardManifest (has slug + terrain); the registry itself needs `location`
const { SHARDS } = await import(pathToFileURL(resolve(ROOT, 'src/shards.generated.ts')).href);

const registry = await import(pathToFileURL(resolve(ROOT, 'src/client/game/shard/registry.ts')).href);
const heightfield = await import(pathToFileURL(resolve(ROOT, 'src/shared/engine/world/Heightfield.ts')).href);
const bakedTerrain = await import(pathToFileURL(resolve(ROOT, 'src/shared/engine/world/BakedTerrain.ts')).href);
const placement = await import(pathToFileURL(resolve(ROOT, 'src/shared/engine/world/forest/placement.ts')).href);
const { bakesTerrain } = await import(pathToFileURL(resolve(ROOT, 'src/shared/game/shard/terrainBake.ts')).href);

// G384: a shard whose retained WSTR alias is its shardfile's admitted query terrain (shard.config `terrain.form: 'query'`)
// ships the bare lattice. The content gate admits no placement tail, and no runtime of these shards replays one.
const QUERY_TERRAIN = new Set(['nalati-grasslands']);

/** The undergrowth decision log for `def` planted on the grid in `gridBuf` — null for a shard that grows none (main.ts: no forest carpet at sea). */
function placementSection(def, gridBuf) {
  if (def.ocean || QUERY_TERRAIN.has(def.slug) || !registry.findChunk(def.slug)) return null;
  registry.setActiveChunk(def.slug);
  heightfield._installBakedTerrain(bakedTerrain.bakedSamplers(bakedTerrain.parseBakedTerrain(gridBuf))); // as loadBakedTerrain does at launch
  const variants = placement.plantSpecs(def.trees); // the species set when the shard has one (PH-B4), else the runtime pines
  const { trees, grid } = placement.placeForest(variants);
  if (trees.length === 0) return null;
  const log = placement.DecisionLog.record();
  const run = placement.placeUndergrowth(trees, grid, log);
  let r = run.next(); while (!r.done) r = run.next();
  const { counts, sum } = placement.placementChecksum(r.value);
  const bits = log.bits();
  const out = new ArrayBuffer(16 + counts.length * 4 + 8 + bits.length);
  const dv = new DataView(out);
  dv.setUint8(0, 0x57); dv.setUint8(1, 0x53); dv.setUint8(2, 0x50); dv.setUint8(3, 0x4c); // 'WSPL'
  dv.setUint32(4, 1, true); dv.setUint32(8, log.count, true); dv.setUint32(12, counts.length, true);
  counts.forEach((c, k) => dv.setUint32(16 + k * 4, c, true));
  dv.setFloat64(16 + counts.length * 4, sum, true);
  new Uint8Array(out, 16 + counts.length * 4 + 8).set(bits);
  return { bytes: new Uint8Array(out), decisions: log.count, counts, trees: trees.length };
}

const output = byteWriter(check, 'bake-chunk');
for (const def of SHARDS) {
  // one rule with the grid's edge reader (src/shared/game/shard/terrainBake.ts): a structures world ships no bake, and the reader
  // never fetches one for it (C4-R1-C13)
  if (!bakesTerrain(def.ground)) continue;
  // A required manifest ground is its shardfile's own terrain collider (compiled by its tiles job, loaded through the
  // session's required-ground loader): it ships no WSTR bake, so never sample an unready field here.
  const { bakedTerrainSource } = await import(pathToFileURL(resolve(ROOT, 'src/shared/engine/world/bakedTerrainField.ts')).href);
  if (bakedTerrainSource(def.ground.terrain) !== null) continue;
    // the bake holds the authored (unshifted) heights: a field shifted at runtime (its `datum`, Driftwood's G164 drop)
    // installs this bake shifted by it (src/shared/engine/world/Heightfield.ts)
    const terrain = def.ground.terrain, datum = terrain.datum ?? 0, authored = { heightAt: (x, z) => terrain.heightAt(x, z) - datum };
    const res = TERRAIN_RES;
    const dir = resolve(OUT, def.slug);
    const meta = resolve(dir, 'terrain.json');
    const bin = resolve(dir, 'terrain.bin');
    const tag = def.slug;
    const t0 = performance.now();
    const n = res * res;
    const header = 24;
    const buf = new ArrayBuffer(header + n * 4 + n * 4);
    const dv = new DataView(buf);
    dv.setUint8(0, 0x57); dv.setUint8(1, 0x53); dv.setUint8(2, 0x54); dv.setUint8(3, 0x52); // 'WSTR'
    const lhash = landscapeHash(authored, CHUNK_SIZE); // retained header field; staleness is checked by comparing the full bake
    dv.setUint32(4, VERSION, true); dv.setUint32(8, res, true); dv.setFloat32(12, CHUNK_SIZE, true); dv.setUint32(16, def.seed >>> 0, true); dv.setUint32(20, lhash, true);
    const heights = new Float32Array(buf, header, n);
    const splat = new Uint8Array(buf, header + n * 4, n * 4);
    const d = CHUNK_SIZE / (res - 1);
    let min = Infinity, max = -Infinity;
    for (let iz = 0; iz < res; iz++) {
      const z = -CHUNK_HALF + iz * d;
      for (let ix = 0; ix < res; ix++) {
        const x = -CHUNK_HALF + ix * d;
        const i = iz * res + ix;
        const h = authored.heightAt(x, z);
        heights[i] = h; if (h < min) min = h; if (h > max) max = h;
        const s = def.ground.terrain.splatAt(x, z);
        // quantise so the four bytes sum to exactly 255 (largest weight absorbs the rounding)
        const q = s.map((w) => Math.round(w * 255));
        const sum = q[0] + q[1] + q[2] + q[3];
        let k = 0; for (let j = 1; j < 4; j++) if (q[j] > q[k]) k = j;
        q[k] += 255 - sum;
        splat[i * 4] = q[0]; splat[i * 4 + 1] = q[1]; splat[i * 4 + 2] = q[2]; splat[i * 4 + 3] = q[3];
      }
    }
    const tp = performance.now();
    const section = placementSection(def, buf);
    const bytes = section ? Buffer.concat([Buffer.from(buf), section.bytes]) : Buffer.from(buf);
    if (section) console.log(`bake: ${tag} placement: ${section.trees} trees, ${section.decisions} undergrowth candidates → ${section.counts.join(' / ')} kept, ${section.bytes.length} B in ${Math.round(performance.now() - tp)} ms`);
    const digest = outputHash(bytes);
    output.put(bin, bytes);
    output.put(meta, jsonBytes({ hash: digest, version: VERSION, res, size: CHUNK_SIZE, seed: def.seed, landscapeHash: lhash, bytes: bytes.byteLength, placement: section ? { decisions: section.decisions, counts: section.counts } : null, heightRange: [min, max] }));
    console.log(`bake: ${tag} terrain ${res}² → ${(buf.byteLength / 1024).toFixed(0)} KB in ${Math.round(performance.now() - t0)} ms (h ${min.toFixed(1)}…${max.toFixed(1)} m, ${digest})`);
}
output.finish();
