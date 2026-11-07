#!/usr/bin/env node
// bake-navmesh.mjs — every shard's navmesh, baked offline (project/archive/2026-09-23-physics.md P6b).
//
// Runs each manifest's normalized world hook with the engine level context, using a render-free host. It reads
// static ColliderDescs from the same WorldRegistry the game fills, and the terrain grid the world cuts through
// the physics service. Declared water bodies remove submerged ground; moving/disabled pieces are excluded.
// Structure-first shards bake their registered floors without inventing a terrain plane.
//
// Output: public/assets/baked/<slug>/navmesh.bin (format below; src/shared/engine/physics/navmesh.ts reads it) + navmesh.json (the
// output hash and stats). Every run bakes in memory and writes only differing bytes. Offline: run it after a builder / terrain change and commit the output.
//
//   node --experimental-transform-types --import ./scripts/bake-loader.mjs scripts/bake-navmesh.mjs [--check] [slug…]
//
// Format (little-endian): 'WSNM' u32 version=1 · u32 layers · then per layer:
//   f32 radius · f32 height · f32 climb · f32 cellSize · f32 cellHeight · f32 origin[3] · f32 tileSize · u32 tiles · per tile:
//     i32 tileX · i32 tileY · f32 bounds[6] · u32 nVerts · u32 nPolys · u32 nDetailVerts · u32 nDetailTris ·
//     u16[nVerts·3] vertices (1 cm steps above bounds.min) · per poly: u8 nv · u8 area · u16 flags · u16[nv] vertex · u16[nv] neis ·
//     per poly: u32 detail verticesBase · u16 verticesCount · u32 trianglesBase · u16 trianglesCount ·
//     u16[nDetailVerts·3] detail vertices (1 cm, same frame) · u8[nDetailTris·4] detail triangles (3 local indices + edge flags)
import { existsSync, readFileSync } from 'node:fs';
import { byteWriter, outputHash, jsonBytes } from '@wildshard/engine/scripts/bake-output.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { visitAuthoredWorld } from './bake/worldHost.mjs';
import { prepareNativeScalarBlocks } from './bake/nativeWorld.mjs';
import { installBakeEnvironment } from './bake/environment.mjs';
import { bakeNavigation } from '@wildshard/sharddev/bake/navigation';
import { navmeshGroundExclusion } from './bake/navmeshGround.ts';

const ROOT = resolve(import.meta.dirname, '..');
const check = process.argv.includes('--check');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const VERSION = 1;

/**
 * The agent classes per shard: a creature paths on the smallest layer whose radius covers its own (src/shared/engine/physics/navmesh.ts;
 * the largest when none does). Motor capsule radii (src/shared/engine/physics/creatures.ts: min(bodyRadius, bodyHalfLen) × scale): crab
 * 0.22, monkey 0.16, sailor 0.26, captain 0.3, deer / boar 0.33, bear 0.36, elk 0.52. The erosion is whole voxels
 * (cellSize 0.25): round(radius / cellSize) — 0.3 erodes 0.25 m, 0.5 erodes 0.5 m; the motor absorbs the rest. Climb and slope are the motor's (step 0.3 m, the plan's 40°); height is
 * the clearance a creature needs under a deck or a hold's beams. Pine Hollow's herds are all big: one layer — a second
 * would double its ~110 KB (the plan's budget: ≤ 150 KB per shard on the wire); its 1 770 trunks are most of its polys.
 */
const SHARD_LAYERS = {
  'driftwood-isle': [
    { name: 'small', radius: 0.3, height: 1.8, climb: 0.3, slope: 40 }, // crabs, monkeys, sailors, the captain
    { name: 'large', radius: 0.5, height: 1.8, climb: 0.3, slope: 40 }, // boar, deer, bear
  ],
  // Nalati (NALATI-MERGE P3): one layer — wolves 0.16–0.22, sheep, the dog, the leopards 0.17–0.26, the mares 0.29–0.31;
  // the stallion (0.32) and Kokbori (0.49) path on it too (a second 0.5 m layer is +88 KB brotli: 216 KB, past the
  // budget). Climb 0.4: recast calls a cell a ledge when its neighbours' floors span more than the climb, and across two
  // 0.25 m cells that caps the slope at atan(climb / 0.5) — 31° at 0.3, where Nalati's roads and knolls run 32–39°
  // (the bridge's own north approach is 34°); 0.4 walks to ~38.7°, 5 cm over the motors' step
  'nalati-grasslands': [{ name: 'small', radius: 0.3, height: 1.8, climb: 0.4, slope: 40 }],
  default: [{ name: 'large', radius: 0.5, height: 1.8, climb: 0.3, slope: 40 }],
};
const layersFor = (slug) => JSON.parse(process.env.NAVMESH_LAYERS ?? 'null') ?? SHARD_LAYERS[slug] ?? SHARD_LAYERS.default;
/** recast's knobs (navcat README's table); simplification and detail error are loose — the ground's height comes from
 *  heightAt / the motor, the navmesh only has to say where a creature can go */
const GEN = { cellSize: 0.25, cellHeight: 0.1, tileSizeVoxels: 128, minRegionArea: 24, mergeRegionArea: 64, maxSimplificationError: 2.0, maxEdgeLength: 24, maxVerticesPerPoly: 6, detailSampleDistance: 3, detailSampleMaxError: 0.8, ...JSON.parse(process.env.NAVMESH_GEN ?? '{}') };

// ── the game's modules in Node: a DOM that draws nothing, /assets read from public/ ──────────────────────────────────
const noop = () => undefined;
const environment = installBakeEnvironment(ROOT), el = environment.element;
const src = (p) => import(pathToFileURL(resolve(ROOT, 'src', p)).href);

const THREE = await import('three');
const { ConvexHull } = await import('three/examples/jsm/math/ConvexHull.js');
const registry = await src('game/client/shard/registry.ts');
const { SHARDS } = await src('shards.generated.ts');
const HF = await src('engine/shared/world/Heightfield.ts');
const BT = await src('engine/shared/world/BakedTerrain.ts');
const { bakedTerrainSource } = await src('engine/shared/world/bakedTerrainField.ts');
const { TERRAIN_RES, CHUNK_SIZE } = await src('engine/shared/core/config.ts');
const { treadBoxes } = await src('engine/shared/physics/pieces.ts');

const sky = new Proxy({ setupMaterial: noop, csm: { lights: [new THREE.DirectionalLight()], update: noop }, hemi: new THREE.HemisphereLight(), sunDisc: new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial()), planet: new THREE.Group(), clouds: null, dayNight: null, viewCamera: new THREE.PerspectiveCamera(), sunDir: new THREE.Vector3(0, 1, 0) },
  { get: (t, k) => k in t ? t[k] : typeof k === 'string' && k.endsWith('Color') ? new THREE.Color(1, 1, 1) : typeof k === 'string' && k.endsWith('Dir') ? new THREE.Vector3(0, 1, 0) : undefined });

// The shared owned world seam is also used by authored-world extraction.
const shardColliders = (def) => visitAuthoredWorld(def, { root: ROOT, sky, element: el });

// ── triangles ────────────────────────────────────────────────────────────────────────────────────────────────────────
class Soup {
  positions = []; indices = [];
  vert(x, y, z) { this.positions.push(x, y, z); return this.positions.length / 3 - 1; }
  /** a triangle facing up (+Y normal) — recast's walkable test is the normal's y */
  tri(a, b, c) { this.indices.push(a, b, c); }
  /** a face of a convex solid, wound to face away from `centre` */
  solidTri(a, b, c, centre) {
    const P = this.positions, ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az, vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (ax + P[b * 3] + P[c * 3]) / 3 - centre.x, my = (ay + P[b * 3 + 1] + P[c * 3 + 1]) / 3 - centre.y, mz = (az + P[b * 3 + 2] + P[c * 3 + 2]) / 3 - centre.z;
    if (nx * mx + ny * my + nz * mz >= 0) this.indices.push(a, b, c); else this.indices.push(a, c, b);
  }
  /** a convex solid from its points (world space): the hull's faces */
  convex(points) {
    if (points.length < 4) return;
    const hull = new ConvexHull().setFromPoints(points);
    const centre = new THREE.Vector3();
    for (const p of points) centre.add(p);
    centre.divideScalar(points.length);
    for (const f of hull.faces) {
      const vs = []; let e = f.edge;
      do { vs.push(e.head().point); e = e.next; } while (e !== f.edge);
      const ids = vs.map((p) => this.vert(p.x, p.y, p.z));
      for (let i = 1; i + 1 < ids.length; i++) this.solidTri(ids[0], ids[i], ids[i + 1], centre);
    }
  }
}

const _q = new THREE.Quaternion();
function orient(d) {
  if (d.rot) return _q.set(d.rot.x, d.rot.y, d.rot.z, d.rot.w);
  return _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.yaw ?? 0);
}

/** One ColliderDesc into the soup, as a closed solid. */
function addDesc(soup, d) {
  if (d.kind === 'treads') { for (const b of treadBoxes(d)) addDesc(soup, b); return; }
  const q = orient(d).clone(), c = new THREE.Vector3(d.x, d.y, d.z);
  const at = (x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(q).add(c);
  switch (d.kind) {
    case 'box': {
      const pts = [];
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) pts.push(at(sx * d.hx, sy * d.hy, sz * d.hz));
      soup.convex(pts);
      return;
    }
    case 'capsule': case 'ball': {
      // an octagonal prism round the axis, capped a radius past each end (a ball: the same, zero length)
      const hh = d.kind === 'capsule' ? d.halfHeight : 0, r = d.radius, pts = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
        pts.push(at(x, hh, z), at(x, -hh, z));
      }
      pts.push(at(0, hh + r, 0), at(0, -hh - r, 0));
      soup.convex(pts);
      return;
    }
    case 'hull': {
      const pts = [];
      for (let i = 0; i < d.points.length; i += 3) pts.push(at(d.points[i], d.points[i + 1], d.points[i + 2]));
      soup.convex(pts);
      return;
    }
    case 'trimesh': {
      // a floor you walk inside or over: every triangle faces up
      const base = soup.positions.length / 3;
      for (let i = 0; i < d.vertices.length; i += 3) { const p = at(d.vertices[i], d.vertices[i + 1], d.vertices[i + 2]); soup.vert(p.x, p.y, p.z); }
      for (let i = 0; i < d.indices.length; i += 3) {
        const a = base + d.indices[i], b = base + d.indices[i + 1], cc = base + d.indices[i + 2];
        const P = soup.positions;
        const ny = (P[cc * 3] - P[a * 3]) * (P[b * 3 + 2] - P[a * 3 + 2]) - (P[b * 3] - P[a * 3]) * (P[cc * 3 + 2] - P[a * 3 + 2]);
        if (ny >= 0) soup.tri(a, b, cc); else soup.tri(a, cc, b);
      }
      return;
    }
    default: throw new Error(`bake-navmesh: unknown collider kind ${d.kind}`);
  }
}

/**
 * Where the ground is under water: the sea (an ocean shard) or the pond — inside the square src/client/engine/world/pondGrid.ts draws
 * (2r + 30 m across) and below its surface; 0.25 m of margin, as AnimalManager's `isDry`. (A pond shard's valleys lower
 * than the pond elsewhere are dry land: no water is drawn there, though `isDry` still calls them wet.)
 */
function wetTest(def, exclusion) {
  if (exclusion !== undefined) return exclusion;
  const wl = HF.waterLevel() + 0.25;
  if (def.ocean) return (_x, _z, y) => y <= wl;
  if (!HF.hasPond()) return () => false;
  const P = HF.POND, half = P.r + 15;
  return (x, z, y) => y <= wl && Math.abs(x - P.x) <= half && Math.abs(z - P.z) <= half;
}

/** The physics ground's triangles (src/shared/engine/physics/terrain.ts: the mesh's vertices, the (x0,z1)–(x1,z0) diagonal), dry ones only. */
function addTerrain(soup, grid, wet) {
  const res = TERRAIN_RES, size = CHUNK_SIZE, d = size / (res - 1), half = size / 2;
  if (grid === null) return 0;
  const base = soup.positions.length / 3;
  for (let iz = 0; iz < res; iz++) for (let ix = 0; ix < res; ix++) soup.vert(ix * d - half, grid[iz * res + ix], iz * d - half);
  let dropped = 0;
  const tri = (a, b, c) => {
    const P = soup.positions, m = (k) => (P[(base + a) * 3 + k] + P[(base + b) * 3 + k] + P[(base + c) * 3 + k]) / 3;
    if (wet(m(0), m(2), m(1))) { dropped++; return; }
    soup.tri(base + a, base + b, base + c);
  };
  for (let iz = 0; iz < res - 1; iz++) for (let ix = 0; ix < res - 1; ix++) {
    const i00 = iz * res + ix, i10 = i00 + 1, i01 = i00 + res, i11 = i01 + 1;
    tri(i00, i01, i10); // up-facing: (x0,z0) → (x0,z1) → (x1,z0)
    tri(i10, i01, i11);
  }
  return dropped;
}

// ── main ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const output = byteWriter(check, 'bake-navmesh');
for (const def of SHARDS.filter(registry.playable)) {
  if (only.length > 0 && !only.includes(def.slug)) continue;
  prepareNativeScalarBlocks(def, ROOT);
  const exclusion = navmeshGroundExclusion(def.navmesh,def.ground.terrain,def.scalarBlocks);
  const bakedFile = resolve(ROOT, 'public/assets/baked', def.slug, 'terrain.bin');
  const required = def.ground.terrain === undefined ? null : bakedTerrainSource(def.ground.terrain);
  if (!existsSync(bakedFile) && required === null && def.ground.structures === undefined) throw new Error(`bake-navmesh: ${def.slug}/terrain.bin missing — run scripts/bake-chunk.mjs`);
  const t0 = performance.now();
  registry.setActiveChunk(def.slug);
  if (existsSync(bakedFile)) {
    const buf = readFileSync(bakedFile);
    const grid = BT.parseBakedTerrain(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    if (!grid) throw new Error(`bake-navmesh: ${def.slug}/terrain.bin does not parse`);
    BT.installBakedGrid(grid); // Admit required manifest ground as well as the selected Heightfield.
  } else if (required !== null) {
    const file = resolve(ROOT, 'src/shards', def.slug, 'data/nativeGround.generated.json');
    const row = JSON.parse(readFileSync(file,'utf8'));
    if (row.version !== 1 || row.res !== 256 || row.size !== 500 || row.seed !== required.seed
      || !Array.isArray(row.heights) || row.heights.length !== 256 ** 2
      || row.heights.some(value => !Number.isFinite(value) || Math.abs(value) > 250 || Math.fround(value) !== value)) {
      throw new Error(`Required navigation ground ${def.slug} has invalid recipe samples`);
    }
    const splat = new Uint8Array(256 ** 2 * 4);
    for (let i = 0; i < 256 ** 2; i++) splat[i * 4] = 255;
    BT.installBakedGrid({res:256,size:500,seed:row.seed,landscapeHash:0,heights:Float32Array.from(row.heights),splat,undergrowth:null});
  }
  const { colliders, ground, counts } = await shardColliders(def);
  if (process.env.NAVMESH_DUMP) { // debugging: NAVMESH_DUMP=x,z,r prints the colliders centred within r m of (x, z)
    const [dx, dz, dr] = process.env.NAVMESH_DUMP.split(',').map(Number);
    for (const d of colliders) { const c = d.kind === 'treads' ? d.from : d; if (Math.hypot(c.x - dx, c.z - dz) < dr) console.log(JSON.stringify(d, (k, v) => (v instanceof Float32Array ? `[${v.length / 3} points]` : typeof v === 'number' ? Math.round(v * 100) / 100 : v))); }
  }
  const soup = new Soup();
  const dropped = addTerrain(soup, ground, wetTest(def, exclusion));
  for (const d of colliders) addDesc(soup, d);
  // the navmesh is baked in the authored frame (src/shared/engine/physics/navmesh.ts queries `y − datum`): a level shifted at
  // runtime (its terrain field's `datum`, Driftwood's G164 drop) builds shifted, so its soup is raised back by the datum
  const datum = def.ground.terrain?.datum ?? 0;
  if (datum !== 0) for (let i = 1; i < soup.positions.length; i += 3) soup.positions[i] -= datum;
  const LAYERS = layersFor(def.slug);
  const dir = resolve(ROOT, 'public/assets/baked', def.slug), jsonFile = resolve(dir, 'navmesh.json'), binFile = resolve(dir, 'navmesh.bin');
  const tIn = performance.now() - t0;
  console.log(`[navmesh] ${def.slug}: ${colliders.length} colliders (${Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ')}), ${soup.indices.length / 3} triangles (${dropped} wet terrain triangles left out) in ${tIn.toFixed(0)} ms`);
  const t1 = performance.now();
  const { bytes, layers } = bakeNavigation(soup, LAYERS, GEN);
  for (const layer of layers) console.log(`[navmesh] ${def.slug} ${layer.name} r=${layer.radius}: ${layer.tiles} tiles, ${layer.polys} polys, ${layer.detailTris} detail tris`);
  console.log(`[navmesh] ${def.slug}: all layers in ${((performance.now() - t1) / 1000).toFixed(1)} s`);
  const gz = gzipSync(bytes, { level: 9 }).byteLength, br = brotliCompressSync(bytes).byteLength;
  output.put(binFile, bytes);
  output.put(jsonFile, jsonBytes({ version: VERSION, hash: outputHash(bytes), bytes: bytes.byteLength, layers }, 1));
  console.log(`[navmesh] ${def.slug}: baked navmesh.bin ${(bytes.byteLength / 1024).toFixed(1)} KB (${(gz / 1024).toFixed(1)} KB gzip, ${(br / 1024).toFixed(1)} KB brotli)`);
}
output.finish();

// Runtime imports install page-lifetime services (for example the reload heartbeat). A CLI has no page.
const { app: bakeApp } = await src('engine/client/app/runtime.ts');
bakeApp.engineScope.dispose();
const { pageScope } = await src('engine/shared/app/resources.ts');
pageScope.dispose();

environment.dispose();
