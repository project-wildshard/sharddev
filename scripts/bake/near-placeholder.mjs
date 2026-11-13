#!/usr/bin/env node
import { shardManifestPath } from '@wildshard/engine/scripts/authored-manifest.mjs';
import { decisionLegacyLines } from '@wildshard/engine/scripts/decision-legacy-lines.mjs';
// G342: bake one shard's near placeholder (public/assets/baked/<slug>/near.glb + near.json). Its drawn static world is
// built in Node from the shard's own authored world through the bake world host, as the physics bakes build it (no
// browser, no game page), harvested as prototypes with their placed copies, reduced by the SDK producer
// (`@wildshard/sdk/bake/nearPlaceholder`) to a low-LOD budget, and merged over its terrain at L1 density (17 × 17 per
// 125 m region) in its own far look: one draw, regions in TEXCOORD_0.x, no colliders.
// node --experimental-transform-types --import ./scripts/bake-loader.mjs scripts/bake/near-placeholder.mjs <slug> [--report]
//
// G348: why this runner stays beside `wildshard build` (which bakes any shardfile's near row from its own terrain
// collider and its L1 tiles' meshes, `projectPlaceholders`): the first-party hybrids (Driftwood, Nalati, Pine) have no
// world in their shardfiles yet (no terrain, no tiles; `public/shardfiles/<slug>/shard.json`). Their props and forests
// exist only when their TypeScript builders run, so the SDK build has nothing to harvest, and no shardfile input can
// reproduce these bytes (the coarsest built LOD of every placement, Pine's per-tree placements, the colour maps' mean
// texels). Nothing here is per shard (each declares its ground and tree stand-ins in data/placeholder.json); the grid
// prefers a shardfile's own `near` row and reads this runner's near.json only for a shard whose shardfile has none. It
// retires per shard as each one's world moves into its shardfile tiles.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installBakeEnvironment } from './environment.mjs';
import { visitAuthoredWorld } from './worldHost.mjs';
import { prepareNativeScalarBlocks } from './nativeWorld.mjs';
import { placeholderGridBytes, placeholderOf } from './placeholderShards.mjs';

const slug = process.argv.slice(2).find(value => !value.startsWith('--'));
if (typeof slug !== 'string') throw new Error('usage: near-placeholder.mjs <slug> [--report] [--ground-error=<m>] [--resident=<bytes>]');
const report = process.argv.includes('--report');
const root = resolve(import.meta.dirname, '../..');
const at = path => import(pathToFileURL(resolve(root, path)).href);
// a shardfile project (its shard.config.ts): what `wildshard build` reads, for its tiles, its look and its terrain; read
// before the bake environment's browser stand-ins exist (its behaviour compiler takes them for a browser)
// (its generation input roots as the author CLI declares them, scripts/wildshard.mjs: a generator listing its own files needs them)
const folder = resolve(root, 'src/shards', slug), manifestSource = { folder: slug, ...(existsSync(resolve(folder, 'manifest.json')) ? { file: resolve(folder, 'manifest.json') } : {}),
  imageRoots: [{ prefix: `/src/shards/${slug}/`, directory: folder }, { prefix: '/assets/', directory: resolve(root, 'public/assets') }] };
const legacy = decisionLegacyLines(root, slug);
const project = existsSync(resolve(folder, 'shard.config.ts')) ? await (await at('src/sharddev/project.ts')).readProjectAssets(folder, undefined, manifestSource, legacy === undefined ? {} : { decisionLegacyLines: legacy }) : null;
const environment = installBakeEnvironment(root);
// G342: a colour map's mean colour, decoded from its encoded bytes (PNG / JPEG / WebP) by Pillow, so a textured prop keeps
// its own paint (Pine's cabins, Driftwood's huts) instead of a guessed wood tint; the bitmap is that one mean texel
const means = new Map();
const meanTexel = (bytes) => {
  const key = createHash('sha256').update(bytes).digest('hex');
  let rgb = means.get(key);
  if (rgb === undefined) {
    const out = spawnSync('python3', ['-I', '-c', 'import sys, io\nfrom PIL import Image\nim = Image.open(io.BytesIO(sys.stdin.buffer.read())).convert("RGBA").resize((1, 1), Image.Resampling.BOX)\nprint(*im.getpixel((0, 0)))'], { input: bytes });
    rgb = out.status === 0 ? String(out.stdout).trim().split(/\s+/u).map(Number) : null;
    if (rgb !== null && (rgb.length !== 4 || rgb.some(v => !Number.isFinite(v)))) rgb = null;
    means.set(key, rgb);
  }
  return rgb;
};
Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: async (source) => {
  const bytes = source instanceof Blob ? Buffer.from(await source.arrayBuffer()) : null, rgb = bytes === null ? null : meanTexel(bytes);
  return rgb === null ? { width: 1, height: 1, close: () => undefined } : { width: 1, height: 1, data: Uint8ClampedArray.from(rgb), close: () => undefined };
} });
const element = () => Object.assign(environment.element(), { prepend: () => undefined, replaceChildren: () => undefined, contains: () => false, blur: () => undefined });
Object.defineProperty(document, 'createElement', { value: element, configurable: true });
Object.defineProperty(document, 'createElementNS', { value: (_ns, tag) => element(tag), configurable: true });
const noop = () => undefined;
const THREE = await import('three');
const sky = new Proxy({ setupMaterial: noop, csm: { lights: [new THREE.DirectionalLight()], update: noop },
  hemi: new THREE.HemisphereLight(), sunDisc: new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial()),
  planet: new THREE.Group(), clouds: null, dayNight: { dusk: 0, night: 0 }, viewCamera: new THREE.PerspectiveCamera(), sunDir: new THREE.Vector3(0, 1, 0) },
{ get: (target, key) => key in target ? target[key] : typeof key === 'string' && key.endsWith('Color')
  ? new THREE.Color(1, 1, 1) : typeof key === 'string' && key.endsWith('Dir') ? new THREE.Vector3(0, 1, 0) : undefined });
(await at('src/client/engine/core/tier.ts')).initializeTier('phone');
const { default: manifest } = await at(shardManifestPath(root, slug));
prepareNativeScalarBlocks(manifest, root);
(await at('src/client/game/shard/list.ts')).installShards([manifest]);
(await at('src/client/game/shard/registry.ts')).setActiveChunk(manifest.slug);
const { Terrain, terrainChunkGeometry } = await at('src/client/engine/world/Terrain.ts');
const terrainBin = resolve(root, 'public/assets/baked', slug, 'terrain.bin');
// G348: the shard's own data says where its ground comes from (its data/placeholder.json row); no slug branch here
const source = await placeholderOf(root, slug);
const groundFrom = source.ground;
// a shardfile-terrain shard (no terrain.bin, no ground row) builds its world on its own collider grid
const nativeTerrain = groundFrom === undefined ? existsSync(terrainBin) ? readFileSync(terrainBin) : undefined : (await at(`src/shards/${slug}/${groundFrom.generator}`))[groundFrom.export]();
if (nativeTerrain !== undefined && !(nativeTerrain instanceof Uint8Array)) throw new Error(`${slug}: placeholder ground ${JSON.stringify(groundFrom)} returned no bytes`);

// a manifest ground declared by key (`createBakedTerrainField`, Signal's) is its shardfile's own terrain collider: the bake
// installs it into the declared field as the session's required-ground loader would (`installProductGround`)
if (nativeTerrain === undefined && manifest.ground?.terrain !== undefined) {
  const { bakedTerrainSource, installDeclaredBakedTerrain } = await at('src/shared/engine/world/bakedTerrainField.ts');
  const declared = bakedTerrainSource(manifest.ground.terrain), collider = declared === null ? null : placeholderGridBytes(root, resolve(root, 'src/shards', slug), slug);
  if (collider?.kind === 'collider') {
    const { clientGround } = await at('src/shared/game/shardfile/clientGround.ts');
    const ground = clientGround({ terrain: { collider: 'collider' }, meshCollision: null }, new Map([['collider', collider.bytes]]));
    installDeclaredBakedTerrain(manifest.ground.terrain, { seed: declared.seed, heightAt: ground.heightAt, normalAt: ground.normalAt, splatAt: ground.splatAt });
  }
}

/** Weathered wood (linear RGB): the stand-in for a colour map or a texture-only material Node does not decode. */
const WOOD = new THREE.Color(0.3, 0.21, 0.13);
/** A drawn thing's colour: its material colour times the mean of its colour map when the host decoded one. */
const colourOf = (material) => {
  const m = Array.isArray(material) ? material[0] : material;
  const c = m?.color instanceof THREE.Color ? m.color.clone() : new THREE.Color(0.6, 0.6, 0.6);
  const img = m?.map?.image;
  if (img?.data !== undefined && img.width > 0) {
    let r = 0, g = 0, b = 0, n = 0; const d = img.data, stride = Math.max(4, Math.floor(d.length / 4 / 4096) * 4);
    for (let i = 0; i + 3 < d.length; i += stride) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    if (n > 0) c.multiply(new THREE.Color(r / n / 255, g / n / 255, b / n / 255).convertSRGBToLinear());
  } else if (m?.map !== null && m?.map !== undefined) c.multiply(WOOD); // a colour map Node did not decode: the weathered wood most props are
  return c;
};

const parts = [], rows = [];
let forestTrees = [];
/** One drawn mesh (model-space geometry, its material and its placed copies' matrices) as a producer prototype. */
const harvest = (label, geometry, materials, transforms, instanced) => {
  const position = geometry?.getAttribute('position');
  if (position === undefined || position.itemSize !== 3 || transforms.length === 0) return;
  const material = Array.isArray(materials) ? materials[0] : materials;
  if (material === undefined || material.transparent === true && material.opacity < 0.5 || material.visible === false) return;
  const index = geometry.index, tri = index === null ? position.count / 3 : index.count / 3;
  const colour = colourOf(materials), vc = geometry.getAttribute('color');
  const base = new Float32Array(position.count * 3), colours = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    base.set([position.getX(i), position.getY(i), position.getZ(i)], i * 3);
    const k = vc !== undefined && vc.itemSize >= 3 ? [vc.getX(i), vc.getY(i), vc.getZ(i)] : [1, 1, 1];
    colours.set([colour.r * k[0], colour.g * k[1], colour.b * k[2]], i * 3);
  }
  const idx = index === null ? Uint32Array.from({ length: position.count }, (_, i) => i) : Uint32Array.from(index.array);
  rows.push({ name: label, instanced, count: transforms.length, tri, total: tri * transforms.length, colour: colour.toArray().map(x => Number(x.toFixed(2))), map: material.map !== null && material.map !== undefined });
  parts.push({ name: label, positions: base, colours, index: idx, transforms });
};
// Placed models (E315: huts, piers, lookouts …) are harvested where they are built, every copy, whatever their culler
// shows from one bake camera: each placement call keeps its coarsest non-empty level. Scene meshes drawing those
// models' materials are then skipped, so no copy is taken twice.
const modelMaterials = new Set(), modelBuilds = [];
const poseMatrix = (pl) => {
  if (pl.matrix !== undefined) return pl.matrix.clone();
  const s = pl.scale ?? 1, r = new THREE.Matrix4(), out = new THREE.Matrix4().makeScale(s, s, s);
  if (pl.yaw !== undefined) out.premultiply(r.makeRotationY(pl.yaw));
  if (pl.leanX !== undefined) out.premultiply(r.makeRotationX(pl.leanX));
  if (pl.leanZ !== undefined) out.premultiply(r.makeRotationZ(pl.leanZ));
  return out.premultiply(r.makeTranslation(pl.x, pl.y, pl.z));
};
const visitPlacement = (call) => {
  if (call.drawnInto !== undefined || call.moving) return undefined;
  const levels = new Map();
  modelBuilds.push({ model: call.model, levels });
  return (build) => {
    const meshes = [];
    if (Array.isArray(build.built)) for (const part of build.built) meshes.push({ geometry: part.geometry, material: part.material, local: null });
    else if (build.built?.isObject3D === true) { build.built.updateMatrixWorld(true); build.built.traverse(n => { if (n.isMesh && !n.isSkinnedMesh) meshes.push({ geometry: n.geometry, material: n.material, local: n.matrixWorld.clone() }); }); }
    for (const mesh of meshes) for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) modelMaterials.add(mat);
    if (meshes.length === 0 || build.kind !== 'model') return;
    // copy now: a builder's geometry may be transformed or merged after this callback
    const copies = meshes.map(mesh => ({ geometry: mesh.geometry.clone(), material: mesh.material, local: mesh.local }));
    const byGroup = levels.get(build.placements) ?? new Map(); byGroup.set(build.level, copies); levels.set(build.placements, byGroup);
  };
};
/** Harvest the placed models (their coarsest non-empty level, every copy); returns each copy's world box. */
const harvestModels = () => {
  const boxes = [], b = new THREE.Box3();
  if (report) console.log(`  models: ${JSON.stringify(Object.entries(Object.groupBy(modelBuilds, x => x.model)).map(([k, v]) => `${k}:${v.length}/${v.reduce((n, x) => n + x.levels.size, 0)}`))}`);
  for (const { model, levels } of modelBuilds) for (const [placements, byLevel] of levels) {
    const level = Math.max(...[...byLevel.keys()].filter(l => (byLevel.get(l) ?? []).length > 0));
    const poses = placements.map(poseMatrix);
    for (const mesh of byLevel.get(level) ?? []) {
      const transforms = poses.map(pose => mesh.local === null ? pose.clone() : pose.clone().multiply(mesh.local));
      mesh.geometry.computeBoundingBox();
      for (const t of transforms) if (mesh.geometry.boundingBox !== null) boxes.push(b.copy(mesh.geometry.boundingBox).applyMatrix4(t).expandByScalar(0.5).clone());
      harvest(model, mesh.geometry, mesh.material, transforms.map(t => Array.from(t.elements)), false);
    }
  }
  return boxes;
};
// a pure shardfile project has no authored plugin to build: its near placeholder is its terrain alone; a shard whose world
// is its shardfile tiles (`near.world: 'tiles'`, a world built from its product) has no authored host to visit either
if (typeof manifest.load === 'function' && source.near?.world !== 'tiles') await visitAuthoredWorld(manifest, { root, sky, element: environment.element, tier: 'phone', nativeTerrain, collectLate: true, visitPlacement,
  createTerrain: async () => {
    const field = await at('src/shared/engine/world/Heightfield.ts');
    const terrain = new Terrain(); terrain.mesh = new THREE.Mesh(terrainChunkGeometry(field), new THREE.MeshBasicMaterial()); terrain.mesh.name = 'near-harvest-terrain';
    return terrain;
  },
  visit: ({ scene, camera, late, forest }) => {
    // a forest its shard's own tree model draws (Pine's, E315) has no meshes in Node: its placements are the trees
    if (forest.drawer !== 'self') forestTrees = forest.trees.map(t => ({ x: t.x, y: t.y, z: t.z, rot: t.rot, height: t.height, scale: t.scale,
      species: t.species ?? forest.factory.variants[t.variant]?.species ?? 'tree', tint: t.tint.getHSL({ h: 0, s: 0, l: 0 }).l }));
    // pose the view over the whole cell from a neighbour's distance, so view-dependent repacks keep their far copies
    camera.fov = 100; camera.near = 1; camera.far = 6000; camera.position.set(0, 650, 1); camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true); scene.updateMatrixWorld(true);
    for (let pass = 0; pass < 3; pass++) for (const fn of late) fn(1 / 30);
    scene.updateMatrixWorld(true);
    const m = new THREE.Matrix4(), modelBoxes = harvestModels(), centre = new THREE.Vector3(), cb = new THREE.Box3();
    scene.traverse((node) => {
      if (!node.isMesh || node.isSkinnedMesh || node.name === 'near-harvest-terrain' || !node.visible) return;
      let hidden = false; for (let p = node.parent; p !== null; p = p.parent) if (!p.visible) hidden = true;
      if (hidden) return;
      // a copy drawing a placed model's material inside one of its harvested copies is that copy (taken above)
      const shared = (Array.isArray(node.material) ? node.material : [node.material]).some(mat => modelMaterials.has(mat)), transforms = [];
      if (shared) node.geometry.computeBoundingBox();
      for (let k = 0; k < (node.isInstancedMesh ? node.count : 1); k++) {
        if (node.isInstancedMesh) { node.getMatrixAt(k, m); m.premultiply(node.matrixWorld); } else m.copy(node.matrixWorld);
        if (shared && node.geometry.boundingBox !== null && modelBoxes.some(box => box.containsPoint(cb.copy(node.geometry.boundingBox).applyMatrix4(m).getCenter(centre)))) continue;
        transforms.push(Array.from(m.elements));
      }
      let label = node.name; for (let p = node.parent; label.length === 0 && p !== null; p = p.parent) label = p.name; // the nearest named ancestor
      harvest(label, node.geometry, node.material, transforms, node.isInstancedMesh === true);
    });
  },
});
rows.sort((a, b) => b.total - a.total);
if (report) for (const r of rows.slice(0, 40)) console.log(JSON.stringify(r));
console.log(`${slug}: harvested ${rows.length} meshes, ${rows.reduce((sum, r) => sum + r.total, 0)} triangles`);

// the terrain and its water come from the far look's lattice; harvested ground, sea and sky meshes stay out
const SKIP = /terrain|seabed|ocean|water|\bsea\b|sky|cloud|horizon|backdrop|shadow|decal|fog|haze|sun|moon|star|grass-blades|splat/iu;
const mean = (c) => { let r = 0, g = 0, b = 0; const n = c.length / 3; for (let i = 0; i < c.length; i += 3) { r += c[i]; g += c[i + 1]; b += c[i + 2]; } return [r / n, g / n, b / n]; };
const box = (p) => {
  const mm = new THREE.Matrix4().fromArray(p.transforms[0]), v = new THREE.Vector3(), b = new THREE.Box3();
  for (let i = 0; i < p.positions.length; i += 3) b.expandByPoint(v.set(p.positions[i], p.positions[i + 1], p.positions[i + 2]).applyMatrix4(mm));
  return `[${b.min.toArray().map(x => x.toFixed(0))}]..[${b.max.toArray().map(x => x.toFixed(0))}]`;
};
const prototypes = parts.filter((p) => {
  const [r, g, b] = mean(p.colours), white = r > 0.97 && g > 0.97 && b > 0.97;
  // a texture-only white mesh (Pine's cabins) is painted wood; a white sheet as wide as the world is a sea or sky plane
  const giant = white && p.positions.length > 0 && (() => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < p.positions.length; i += 3) { lo = Math.min(lo, p.positions[i]); hi = Math.max(hi, p.positions[i]); } return hi - lo > 400; })();
  if (white && !giant) for (let i = 0; i < p.colours.length; i += 3) { p.colours[i] *= WOOD.r; p.colours[i + 1] *= WOOD.g; p.colours[i + 2] *= WOOD.b; }
  const skip = SKIP.test(p.name) ? 'name' : giant ? 'white' : (r > 2 || g > 2 || b > 2) ? 'glow' : null;
  if (report && p.transforms.length > 0) console.log(`  ${skip === null ? "take" : "skip"} ${p.name} (${skip}) ${p.index.length / 3} tris x ${p.transforms.length} ${box(p)}`);
  return skip === null; // ground / sea / sky come from the lattice; an unlit white or an emissive glow is not paint
});
// the far look, the grid and the bake are the generic ones (`@wildshard/sdk/bake/placeholders`, as `wildshard build`)
const sdk = await at('src/sharddev/bake/placeholders.ts');
const exported = async (ref) => { const value = (await at(`src/shards/${slug}/${ref.module}`))[ref.export]; if (value === undefined) throw new Error(`${slug}: ${ref.module} has no export ${ref.export}`); return value; };
// G380: a shard that declares no far look takes the generic one `wildshard build` gives any shardfile (`shardfileLook`)
if (source.far === undefined && project === null) throw new Error(`${slug}: no far row in its data/placeholder.json and no shardfile project`);
const look = source.far === undefined ? sdk.shardfileLook(project.shard) : await exported(source.far.look);
// a shard whose world lives in its shardfile tiles (Signal's sand and tower, a template's props, the Blender template's
// authored mesh world) has nothing the authored host builds: its coarse (L1) tiles' meshes are its world, harvested as
// `wildshard build` harvests them (`shardfileWorld`), in their own catalogue's colours; those tiles keep refining over it, so it never owns its cell (as `wildshard build`'s
// shardfile near row never does, `loadShardfileNear`)
const fromTiles = prototypes.length === 0 && project !== null;
if (fromTiles) {
  // its coarse (L1) tiles, else its L0 tiles when it ships none (Nine Dragon's 64 L0 tiles: the bake reduces them to budget)
  const coarse = await sdk.shardfileWorld(project.shard, project.assets), level = coarse.length > 0 ? 1 : 0;
  prototypes.push(...(level === 1 ? coarse : await sdk.shardfileWorld(project.shard, project.assets, undefined, 0)));
  console.log(`${slug}: ${prototypes.length} shardfile L${level} tile meshes`);
}
/**
 * A tiles world raised off its declared floor (`near.base`, Nine Dragon's city at +125 m) stands on a stack: a column
 * under every `cell`-metre square its content covers, from the floor up a metre into that square's lowest content (the
 * footprint's enclosed gaps filled from their neighbours), its sides only where a neighbour stands lower, coloured from
 * `foot` at the floor to `lip` at the stack's top. One prototype a 125 m region, each kept whole (a floor of its own).
 */
const stackBase = (content, floorY, { cell, lip, foot }) => {
  const n = Math.ceil(500 / cell), low = new Float32Array(n * n).fill(Infinity), cellOf = (v) => Math.min(n - 1, Math.max(0, Math.floor((v + 250) / cell)));
  for (const p of content) for (const m of p.transforms) {
    const world = (k) => [0, 1, 2].map(r => (m[r] ?? 0) * p.positions[k * 3] + (m[4 + r] ?? 0) * p.positions[k * 3 + 1] + (m[8 + r] ?? 0) * p.positions[k * 3 + 2] + (m[12 + r] ?? 0));
    for (let t = 0; t < p.index.length; t += 3) {
      const [a, b, c] = [p.index[t], p.index[t + 1], p.index[t + 2]].map(world), y = Math.min(a[1], b[1], c[1]);
      for (let i = cellOf(Math.min(a[0], b[0], c[0])); i <= cellOf(Math.max(a[0], b[0], c[0])); i++) for (let j = cellOf(Math.min(a[2], b[2], c[2])); j <= cellOf(Math.max(a[2], b[2], c[2])); j++) low[j * n + i] = Math.min(low[j * n + i], y);
    }
  }
  // the gaps the footprint encloses (streets between towers, courts) take their neighbours' lowest content
  const outside = new Uint8Array(n * n), queue = [];
  for (let k = 0; k < n; k++) for (const c of [k, (n - 1) * n + k, k * n, k * n + n - 1]) if (low[c] === Infinity && outside[c] === 0) { outside[c] = 1; queue.push(c); }
  while (queue.length > 0) {
    const c = queue.pop(), i = c % n, j = (c - i) / n;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = i + di, z = j + dj, d = z * n + x; if (x >= 0 && z >= 0 && x < n && z < n && low[d] === Infinity && outside[d] === 0) { outside[d] = 1; queue.push(d); } }
  }
  for (let pass = 0; pass < n; pass++) {
    let open = 0;
    for (let c = 0; c < n * n; c++) if (low[c] === Infinity && outside[c] === 0) {
      const i = c % n, j = (c - i) / n, around = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([di, dj]) => (i + di >= 0 && j + dj >= 0 && i + di < n && j + dj < n ? low[(j + dj) * n + i + di] : Infinity)).filter(Number.isFinite);
      if (around.length > 0) low[c] = Math.min(...around); else open++;
    }
    if (open === 0) break;
  }
  const top = (i, j) => (i < 0 || j < 0 || i >= n || j >= n || !Number.isFinite(low[j * n + i]) || low[j * n + i] < floorY + 1 ? floorY : low[j * n + i] + 1);
  let peak = floorY; for (let c = 0; c < n * n; c++) peak = Math.max(peak, top(c % n, (c - (c % n)) / n));
  const tint = (y) => { const k = peak > floorY ? (y - floorY) / (peak - floorY) : 1; return [0, 1, 2].map(r => foot[r] + (lip[r] - foot[r]) * k); };
  const regions = new Map();
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const h = top(i, j);
    if (h <= floorY) continue;
    const x0 = -250 + i * cell, z0 = -250 + j * cell, x1 = Math.min(250, x0 + cell), z1 = Math.min(250, z0 + cell), key = `${Math.floor((x0 + 250) / 125)}-${Math.floor((z0 + 250) / 125)}`;
    const region = regions.get(key) ?? { positions: [], colours: [], index: [], cx: -250 + Math.floor((x0 + 250) / 125) * 125 + 62.5, cz: -250 + Math.floor((z0 + 250) / 125) * 125 + 62.5 };
    regions.set(key, region);
    // the four sides, each outward (+x, -x, +z, -z), from the neighbour's top (or the floor) up to this column's
    for (const { di, dj, ax, az, bx, bz } of [{ di: 1, dj: 0, ax: x1, az: z1, bx: x1, bz: z0 }, { di: -1, dj: 0, ax: x0, az: z0, bx: x0, bz: z1 },
      { di: 0, dj: 1, ax: x0, az: z1, bx: x1, bz: z1 }, { di: 0, dj: -1, ax: x1, az: z0, bx: x0, bz: z0 }]) {
      const from = Math.max(floorY, top(i + di, j + dj));
      if (from >= h) continue;
      const v = region.positions.length / 3;
      for (const [x, y, z] of [[ax, from, az], [bx, from, bz], [bx, h, bz], [ax, h, az]]) { region.positions.push(x - region.cx, y, z - region.cz); region.colours.push(...tint(y)); }
      region.index.push(v, v + 1, v + 2, v, v + 2, v + 3);
    }
  }
  return [...regions.entries()].map(([key, r]) => ({ name: `stack-base-${key}`, positions: Float32Array.from(r.positions), colours: Float32Array.from(r.colours), index: Uint32Array.from(r.index), transforms: [[1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, r.cx, 0, r.cz, 1]] }));
};
const base = source.near?.base === undefined || source.near.floor === undefined ? [] : stackBase(prototypes, source.near.floor.y, source.near.base);
if (base.length > 0) {
  prototypes.push(...base);
  console.log(`${slug}: stack base ${base.reduce((sum, p) => sum + p.index.length / 3, 0)} triangles in ${base.length} regions`);
}
// G380: a land of models (Sky Reach's islands, its far row's `parts`) is built with the SDK's shared model tools, at
// `NEAR_BAKE.modelScale` times the far share, and reduced to the near bake's land budget
const land = source.far?.parts === undefined ? [] : await (await exported(source.far.parts))(await sdk.placeholderModelTools(root, sdk.NEAR_BAKE.modelScale));
// the ground: a declared grid, else the baked terrain.bin or the shardfile's terrain collider; a world with no height
// field (a shardfile whose terrain is null, an authored mesh world) stands on the bake's flat floor (grid null)
// (a world that is its tiles, `near.world: 'tiles'`, stands on the flat floor too: its tiles carry its ground, so a far
// grid under them would only repeat their skyline as a crude height field)
const flat = source.near?.world === 'tiles' || source.far?.grid === undefined && project?.shard.terrain === null && !existsSync(terrainBin);
const ground = source.far?.grid !== undefined || flat ? null : placeholderGridBytes(root, resolve(root, 'src/shards', slug), slug);
// G630: a declared floor (near.floor) is that flat floor at its own height, in its own colour (the bake's floor stands under
// the lowest placed point, a well shaft's bottom, in the far look's colour there)
const floor = source.near?.floor;
const grid = floor !== undefined ? { res: 2, size: 500, heights: new Float32Array(4).fill(floor.y), splat: null }
  : flat ? null : ground === null ? (await exported(source.far.grid))() : ground.kind === 'baked' ? sdk.bakedTerrainGrid(ground.bytes) : sdk.colliderGrid(ground.bytes);
// round 3: the ground at the height field's own density, reduced by geometric error (--ground-error=<m> to measure)
const arg = (name) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const { bytes, manifest: baked, reduced } = await sdk.bakeNearPlaceholder({ grid, look: floor === undefined ? look : { ...look, quads: 1, colourAt: () => [...floor.colour] }, prototypes, parts: land, trees: forestTrees, stands: source.trees,
  floors: base.length === 0 ? source.near?.floors : [...source.near?.floors ?? [], ...base.map(p => ({ prototype: p.name, triangles: p.index.length / 3 }))],
  groundError: Number(arg('ground-error') ?? sdk.NEAR_BAKE.groundError), residentBytes: Number(arg('resident') ?? sdk.NEAR_BAKE.residentBytes), log: line => console.log(`${slug}: ${line}`) });
// G630: a shard that declares `near.owns` (its tiles draw lit only inside its world) keeps its near view over its tiles
const row = fromTiles && prototypes.length > 0 && source.near?.owns !== true ? { ...baked, near: { ...baked.near, tiles: true } } : baked;
const { file } = row, resident = file.decoded + file.gpu;
if (report) { console.log(`  error ${reduced.error === undefined ? 'none (common ratio)' : `${reduced.error.toFixed(3)} m`}`); for (const k of reduced.kept) console.log(`  keep ${k.name}: ${k.copies} x ${k.triangles}/${k.source}`); for (const d of reduced.dropped) console.log(`  drop ${d.name}: ${d.why}`); }
const dir = resolve(root, 'public/assets/baked', slug);
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, 'near.glb'), bytes); writeFileSync(resolve(dir, 'near.json'), sdk.placeholderJson(row));
console.log(`${slug.padEnd(18)} near resident ${(resident / 1e6).toFixed(3)} MB  wire ${(file.compressed / 1e3).toFixed(0)} KB  ${file.triangles} tris (${reduced.triangles} content)  ${file.draws} draw`);
process.exit(0);
