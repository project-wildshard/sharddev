import { BufferAttribute, BufferGeometry, Float32BufferAttribute, Matrix3, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { parseShardfile, type Shardfile } from '@wildshard/format/shardSchema';
import { emptyShardfile } from '../author';
import { parseGlb, parseKtx2 } from '../assets';
import { hashImmutableBytes } from '../immutable';
import type { GeneratedProject, ProjectGenerationContext } from '../projectGeneration';
import { staticGlb, type GlbPrimitive } from '../bake/glb';
import { bakeTerrain, groundLattice } from '../bake/terrain';
import { encodeTerrainTile } from '@wildshard/format/terrainTileBytes';
import { bakeRawColourPixels } from '../bake/rawTexture';
import type { Rgb, SceneCollider, SceneDraw, SceneGeometry, SceneLight, SceneMaterial, ScenePart, ShardScene } from './description';

/**
 * AUTHORING-PARITY AP2, AP3, AP4: the shardfile back end. It reads only the scene description and writes the sections an
 * author types by hand today:
 *
 * - **static parts** (AP2): every `Mesh` and `InstancedMesh`, merged per material per 62.5 m tile (instances expanded, their
 *   colours in the vertex colours, the map's repeat and offset in the uvs), one named GLB material per scene material, a
 *   generated `look.materials` entry and `props.materials` binding for each, painted textures as RGBA8 KTX2 slots;
 * - **light and look** (AP3): `PointLight`s to `look.light.lamps` (the 16 brightest), the brightest `DirectionalLight` to
 *   the sun key, a `HemisphereLight` to the ambient key, `scene.fog`, `world.post`;
 * - **ground, colliders, water** (AP4): `world.ground(heightAt)` to the terrain bake, `solid(mesh)` to collider boxes, each
 *   `Water` to a `water[]` pool row whose outline is its own geometry's.
 *
 * Phone tile caps are reported, not enforced (J338: this shard may use up to 50 MB): AP9 turns them into a per-part table.
 * Sprites have no shardfile lowering until AP11 and are reported, never silently dropped.
 */

export interface ShardfileOptions {
  /** extra rows merged into the generated shardfile (manifest, card, quests...) */
  readonly extend?: (shard: Shardfile) => Shardfile;
}

const TILE = 62.5, HALF = 250;
const glbName = (material: SceneMaterial, taken: Map<string, string>): string => {
  const wanted = material.name.replaceAll(/[^\w.-]/gu, '-').slice(0, 96) || material.key;
  const owner = taken.get(wanted);
  const name = owner === undefined || owner === material.key ? wanted : `${wanted}-${material.key}`;
  taken.set(name, material.key); return name;
};
const lookId = (material: SceneMaterial): string => `scene.${material.key}`;
const luminance = ([r, g, b]: Rgb): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const round = (value: number, digits = 4): number => { const k = 10 ** digits; const out = Math.round(value * k) / k; return out === 0 ? 0 : out; };
const rgb01 = (colour: Rgb): [number, number, number] => [round(clamp01(colour[0])), round(clamp01(colour[1])), round(clamp01(colour[2]))];

/** One tile's growing merge for one material: world-space vertices and an index (a copy inside one tile keeps its
 *  own index; a triangle cut at a tile seam adds its clipped corners). */
interface Merge { position: number[]; normal: number[]; uv: number[]; colour: number[]; index: number[] }

/** The tiles a world box touches, by L0 address. */
const tileOf = (value: number): number => Math.min(7, Math.max(0, Math.floor((value + HALF) / TILE)));

interface Vertex { p: Vector3; n: Vector3; u: number; v: number; c: Vector3 }
function clipToTile(triangle: readonly Vertex[], x: number, z: number): Vertex[] {
  const x0 = -HALF + x * TILE, z0 = -HALF + z * TILE;
  let polygon = [...triangle];
  for (const [axis, limit, direction] of [['x', x0, 1], ['x', x0 + TILE, -1], ['z', z0, 1], ['z', z0 + TILE, -1]] as const) {
    const input = polygon; polygon = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[i], b = input[(i + 1) % input.length]; if (a === undefined || b === undefined) continue;
      const da = (a.p[axis] - limit) * direction, db = (b.p[axis] - limit) * direction;
      if (da >= 0) polygon.push(a);
      if ((da < 0) !== (db < 0)) { const t = da / (da - db); polygon.push({ p: a.p.clone().lerp(b.p, t), n: a.n.clone().lerp(b.n, t).normalize(), u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t, c: a.c.clone().lerp(b.c, t) }); }
    }
  }
  return polygon;
}

/** Expand every draw of one material into per-tile world triangles. */
function mergeDraws(draws: readonly SceneDraw[], scene: ShardScene, tiles: Map<string, Map<string, Merge>>): void {
  const p = new Vector3(), n = new Vector3(), world = new Matrix4(), local = new Matrix4(), normalMatrix = new Matrix3();
  for (const draw of draws) {
    const geometry = scene.geometries[draw.geometry], material = scene.materials[draw.material];
    if (geometry === undefined || material === undefined) continue;
    const base = new Matrix4().fromArray(draw.matrix), copies = draw.instances?.count ?? 1;
    for (let copy = 0; copy < copies; copy++) {
      world.copy(base); if (draw.instances !== null) world.multiply(local.fromArray(draw.instances.matrices, copy * 16));
      normalMatrix.getNormalMatrix(world);
      const flip = world.determinant() < 0;
      const tint = draw.instances?.colours ? new Vector3(draw.instances.colours[copy * 3] ?? 1, draw.instances.colours[copy * 3 + 1] ?? 1, draw.instances.colours[copy * 3 + 2] ?? 1) : new Vector3(1, 1, 1);
      appendCopy(geometry, material, world, normalMatrix, flip, tint, draw.material, tiles, p, n);
    }
  }
}

function appendCopy(geometry: SceneGeometry, material: SceneMaterial, world: Matrix4, normalMatrix: Matrix3, flip: boolean, tint: Vector3, key: string, tiles: Map<string, Map<string, Merge>>, p: Vector3, n: Vector3): void {
  const count = geometry.index?.length ?? geometry.position.length / 3;
  const vertex = (at: number): Vertex => ({  // world-space corner
    p: p.fromArray(geometry.position, at * 3).applyMatrix4(world).clone(),
    n: n.fromArray(geometry.normal, at * 3).applyMatrix3(normalMatrix).normalize().clone(),
    u: (geometry.uv?.[at * 2] ?? 0) * material.repeat[0] + material.offset[0], v: (geometry.uv?.[at * 2 + 1] ?? 0) * material.repeat[1] + material.offset[1],
    c: (material.vertexColours && geometry.colour !== null ? new Vector3().fromArray(geometry.colour, at * 3) : new Vector3(1, 1, 1)).multiply(tint),
  });
  const mergeOf = (tile: string): Merge => {
    const merges = tiles.get(tile) ?? new Map<string, Merge>(); tiles.set(tile, merges);
    const merge = merges.get(key) ?? { position: [], normal: [], uv: [], colour: [], index: [] }; merges.set(key, merge);
    return merge;
  };
  const push = (merge: Merge, corner: Vertex): number => {
    merge.position.push(corner.p.x, corner.p.y, corner.p.z); merge.normal.push(corner.n.x, corner.n.y, corner.n.z);
    merge.uv.push(corner.u, corner.v); merge.colour.push(corner.c.x, corner.c.y, corner.c.z);
    return merge.position.length / 3 - 1;
  };
  const vertexCount = geometry.position.length / 3, corners = Array.from({ length: vertexCount }, (_, at) => vertex(at));
  const xs = corners.map((c) => tileOf(c.p.x)), zs = corners.map((c) => tileOf(c.p.z));
  const order = (i: number): [number, number, number] => {
    const a = geometry.index?.[i] ?? i, b = geometry.index?.[i + 1] ?? i + 1, c = geometry.index?.[i + 2] ?? i + 2;
    return flip ? [a, c, b] : [a, b, c];
  };
  if (xs.every((x) => x === xs[0]) && zs.every((z) => z === zs[0])) {
    // the whole copy is in one tile: its vertices once, its index offset
    const merge = mergeOf(`${xs[0] ?? 0}/${zs[0] ?? 0}`), base = merge.position.length / 3;
    for (const corner of corners) push(merge, corner);
    for (let i = 0; i < count; i += 3) merge.index.push(...order(i).map((at) => at + base));
    return;
  }
  for (let i = 0; i < count; i += 3) {
    const ids = order(i), triangle = ids.map((at) => corners[at]).filter((c) => c !== undefined);
    const txs = ids.map((at) => xs[at] ?? 0), tzs = ids.map((at) => zs[at] ?? 0);
    for (let x = Math.min(...txs); x <= Math.max(...txs); x++) for (let z = Math.min(...tzs); z <= Math.max(...tzs); z++) {
      const polygon = txs.every((value) => value === x) && tzs.every((value) => value === z) ? triangle : clipToTile(triangle, x, z);
      if (polygon.length < 3) continue;
      const merge = mergeOf(`${x}/${z}`), at = polygon.map((corner) => push(merge, corner));
      for (let k = 1; k + 1 < at.length; k++) merge.index.push(at[0] ?? 0, at[k] ?? 0, at[k + 1] ?? 0);
    }
  }
}

/** A merge cut into primitives of at most 200,000 vertices, each with its own compact vertex list. */
function chunks(merge: Merge, limit = 200_000): Merge[] {
  if (merge.position.length / 3 <= limit) return [merge];
  const out: Merge[] = []; let current: Merge | null = null, remap = new Map<number, number>();
  for (let i = 0; i < merge.index.length; i += 3) {
    if (current === null || current.position.length / 3 + 3 > limit) { current = { position: [], normal: [], uv: [], colour: [], index: [] }; out.push(current); remap = new Map(); }
    for (let k = 0; k < 3; k++) {
      const from = merge.index[i + k] ?? 0; let to = remap.get(from);
      if (to === undefined) {
        to = current.position.length / 3; remap.set(from, to);
        current.position.push(...merge.position.slice(from * 3, from * 3 + 3)); current.normal.push(...merge.normal.slice(from * 3, from * 3 + 3));
        current.uv.push(...merge.uv.slice(from * 2, from * 2 + 2)); current.colour.push(...merge.colour.slice(from * 3, from * 3 + 3));
      }
      current.index.push(to);
    }
  }
  return out;
}

/** A collider box row: yaw-only rotations keep their yaw; any other tilt becomes its world bounding box. */
function boxRow(collider: SceneCollider): { kind: 'box'; x: number; y: number; z: number; hx: number; hy: number; hz: number; yaw?: number } {
  const q = new Quaternion(...collider.rotation), up = new Vector3(0, 1, 0).applyQuaternion(q);
  const [x, y, z] = collider.centre.map((value) => round(value, 3)) as [number, number, number];
  if (up.y > 0.9999) {
    const forward = new Vector3(1, 0, 0).applyQuaternion(q), yaw = round(Math.atan2(-forward.z, forward.x), 4);
    return { kind: 'box', x, y, z, hx: round(collider.half[0], 3), hy: round(collider.half[1], 3), hz: round(collider.half[2], 3), ...(yaw === 0 ? {} : { yaw }) };
  }
  const half = new Vector3(...collider.half), extent = new Vector3();
  // world AABB of the oriented box: sum of |R| * half per axis
  const m = new Matrix4().makeRotationFromQuaternion(q).elements;
  extent.set(
    Math.abs(m[0] ?? 0) * half.x + Math.abs(m[4] ?? 0) * half.y + Math.abs(m[8] ?? 0) * half.z,
    Math.abs(m[1] ?? 0) * half.x + Math.abs(m[5] ?? 0) * half.y + Math.abs(m[9] ?? 0) * half.z,
    Math.abs(m[2] ?? 0) * half.x + Math.abs(m[6] ?? 0) * half.y + Math.abs(m[10] ?? 0) * half.z);
  return { kind: 'box', x, y, z, hx: round(extent.x, 3), hy: round(extent.y, 3), hz: round(extent.z, 3) };
}

/** Point lights as the look's lamp rows (`look.light.lamps`): what a baked shard and a watched part (the dev hook) both draw. */
export function lampRows(lights: readonly SceneLight[]): { at: [number, number, number]; colour: [number, number, number]; intensity: number; distance: number }[] {
  return lights.filter((l) => l.kind === 'point').map((l) => ({ at: l.position.map((v) => round(v, 3)) as [number, number, number], colour: rgb01(l.colour), intensity: round(Math.min(100, l.intensity), 3), distance: round(Math.min(50, Math.max(0.1, l.distance === 0 ? 50 : l.distance)), 3) }));
}

/** A part's `Water` surfaces as the shardfile's water rows (AP4): the outline is the Water's own geometry. */
export function waterRows(part: ScenePart): { id: string; kind: 'pool'; level: number; shape: { kind: 'polygon'; points: [number, number][] } }[] {
  return part.water.map((w, i) => ({
    id: `scene.${part.name}.water${i === 0 ? '' : `-${i}`}`, kind: 'pool', level: round(w.level, 3),
    shape: { kind: 'polygon', points: w.outline.map(([px, pz]) => [round(px, 3), round(pz, 3)]) },
    // shard-format 0.4.10 has no water surface fields; tint and planar reflection ride TEMPLATES-CLEANROOM M4.6's format
  }));
}

/** The look a scene declares (AP3), over the format's day-key model fixed at one time of day. */
export function sceneLook(scene: ShardScene, lights: readonly SceneLight[], materials: Record<string, unknown>): Shardfile['look'] {
  const directional = lights.filter((l) => l.kind === 'directional').sort((a, b) => b.intensity - a.intensity);
  const sun = directional[0], hemisphere = lights.find((l) => l.kind === 'hemisphere'), ambient = lights.find((l) => l.kind === 'ambient');
  const lamps = lights.filter((l) => l.kind === 'point').sort((a, b) => b.intensity - a.intensity).slice(0, 16);
  // the sun's heading and height from its position over its target
  const toSun = sun === undefined ? new Vector3(0.3, 1, 0.4) : new Vector3(...sun.position).sub(new Vector3(...sun.target ?? [0, 0, 0]));
  toSun.normalize();
  const elevation = Math.asin(clamp01(toSun.y)) * 180 / Math.PI, azimuth = Math.atan2(toSun.x, -toSun.z) * 180 / Math.PI;
  const fog = scene.look.fog, post = scene.look.post;
  const skyColour: Rgb = hemisphere?.colour ?? ambient?.colour ?? [0.5, 0.5, 0.6], groundColour: Rgb = hemisphere?.groundColour ?? skyColour;
  const fogColour: Rgb = fog?.colour ?? scene.look.background ?? skyColour;
  return {
    families: ['pbr', 'emissive'], materials: materials as Shardfile['look']['materials'],
    grade: { exposure: round(Math.log2(post?.exposure ?? 1), 3), saturation: 1, contrast: 1, lut: null,
      ...(post?.bloom === null || post?.bloom === undefined ? {} : { bloom: { intensity: round(Math.min(4, post.bloom.strength * 1.5), 3), threshold: round(post.bloom.threshold, 3) } }),
      ...(post?.tone === 'neutral' ? { tone: 'neutral' } : {}) },
    clock: 'engine', day: { minutes: 12, start: 0.5, maxElevation: round(Math.max(5, elevation), 2), azimuth: round(azimuth, 2) }, dayOverride: 0.5,
    keys: [{ time: 0, sky: { zenith: rgb01(skyColour), horizon: rgb01(fogColour) },
      fog: fog?.kind === 'linear' ? { colour: rgb01(fog.colour), density: 0, near: fog.near, far: fog.far } : { colour: rgb01(fogColour), density: round(fog?.kind === 'exp2' ? fog.density : 0, 5) },
      sun: { colour: rgb01(sun?.colour ?? [1, 1, 1]), intensity: round(sun?.intensity ?? 0, 3) },
      ambient: { sky: rgb01(skyColour), ground: rgb01(groundColour), intensity: round((hemisphere?.intensity ?? ambient?.intensity ?? 0.5) * Math.PI, 3) } }],
    light: lamps.length === 0 ? {} : { lamps: lampRows(lamps) },
  } as Shardfile['look'];
}

/** A look.materials entry for one scene material (AP2): pbr for lit surfaces, emissive for glowing or unlit ones. */
function materialEntry(material: SceneMaterial): Record<string, unknown> {
  const glow = luminance(material.emissive) * material.emissiveIntensity;
  if (material.kind === 'basic' || glow > 0.5) {
    const colour = material.kind === 'basic' ? material.colour : material.emissive;
    return { family: 'emissive', colour: rgb01(colour), intensity: round(Math.min(10, material.kind === 'basic' ? 1 : material.emissiveIntensity), 3), vertexColours: true, ...(material.side === 'double' ? { doubleSided: true } : {}) };
  }
  // AP10 adds sorted transparency; until then a transparent surface is cut at a low alpha, as a decal mostly is
  const cutoff = material.alphaTest > 0 ? material.alphaTest : material.transparent && material.map !== null ? 0.3 : 0;
  return { family: 'pbr', colour: rgb01(material.colour), roughness: round(clamp01(material.roughness), 3), metalness: round(clamp01(material.metalness), 3), vertexColours: true,
    ...(material.side === 'double' ? { doubleSided: true } : {}), ...(cutoff > 0 ? { alphaCutoff: round(cutoff, 3) } : {}) };
}

/** What the shardfile back end did not write, for the build log (never silent). */
export interface ShardfileReport { readonly sprites: number; readonly lampsDropped: number; readonly tiles: readonly { tile: string; triangles: number; draws: number; bytes: number }[] }

/** The shardfile back end: the description in, a generated project out. Runs at compile time. */
export function compileShardfile(scene: ShardScene, ctx: ProjectGenerationContext, options: ShardfileOptions = {}): Promise<GeneratedProject> {
  const { shard, assets, report } = sceneShardfile(scene, options);
  for (const [hash, bytes] of assets) if (ctx.asset(bytes) !== hash) throw new Error('scene: an asset hash differs from the product store');
  if (report.sprites > 0) console.info(`scene: ${report.sprites} sprites are drawn by watch only until AP11 (billboards)`);
  if (report.lampsDropped > 0) console.info(`scene: ${report.lampsDropped} point lights past the 16 brightest are not in the shardfile (AP28)`);
  const over = report.tiles.filter((t) => t.triangles > 40_000 || t.draws > 8);
  if (over.length > 0) console.info(`scene: ${over.length} tiles are over the phone tile caps (J338; AP9 turns this into a per-part table): ${over.map((t) => `${t.tile} ${t.triangles} tris ${t.draws} draws`).join(', ')}`);
  return Promise.resolve({ shard, output: {} });
}

/** The pure half of the back end: shardfile rows and asset bytes by hash. */
export function sceneShardfile(scene: ShardScene, options: ShardfileOptions = {}): { shard: Shardfile; assets: Map<string, Uint8Array>; report: ShardfileReport } {
  const assets = new Map<string, Uint8Array>(), files: Shardfile['files'] = [];
  const store = (bytes: Uint8Array, kind: 'glb' | 'ktx2', dependencies: string[] = []): Shardfile['files'][number] => {
    const hash = hashImmutableBytes(bytes), cost = kind === 'glb' ? parseGlb(bytes) : parseKtx2(bytes);
    const row = { hash, kind, compressed: bytes.length, ...cost, dependencies, critical: false };
    if (!assets.has(hash)) { assets.set(hash, bytes); files.push(row); }
    return files.find((f) => f.hash === hash) ?? row;
  };
  // ground (AP4): the declared height field, or a flat cell
  const ground = scene.ground;
  const terrain = bakeTerrain(groundSource(scene));
  for (const [hash, bytes] of terrain.assets) assets.set(hash, bytes);
  files.push(...terrain.files);

  // textures (AP2): RGBA8 KTX2, one file per painted raster
  const textureFiles = new Map<string, Shardfile['files'][number]>();
  // only the textures a drawn material samples: a sprite's (AP11) would be an orphan file
  const sampled = new Set(scene.parts.flatMap((part) => part.draws.map((d) => scene.materials[d.material]?.map)).filter((key) => typeof key === 'string'));
  for (const texture of Object.values(scene.textures).filter((t) => sampled.has(t.key))) {
    const bytes = bakeRawColourPixels({ width: texture.width, height: texture.height, pixels: new Uint8ClampedArray(texture.rgba) }, { colourSpace: texture.colourSpace });
    textureFiles.set(texture.key, store(bytes, 'ktx2'));
  }
  // static parts (AP2): merged per material per tile
  const draws = scene.parts.flatMap((part) => part.draws), byMaterial = new Map<string, SceneDraw[]>();
  for (const draw of draws) { const list = byMaterial.get(draw.material) ?? []; list.push(draw); byMaterial.set(draw.material, list); }
  const tiles = new Map<string, Map<string, Merge>>();
  for (const list of byMaterial.values()) mergeDraws(list, scene, tiles);
  const names = new Map<string, string>(), used = [...byMaterial.keys()].flatMap((key) => { const m = scene.materials[key]; return m === undefined ? [] : [m]; });
  const glbNames = new Map(used.map((m) => [m.key, glbName(m, names)]));
  const casts = new Map<string, boolean>(); for (const draw of draws) casts.set(draw.material, (casts.get(draw.material) ?? false) || draw.castShadow);
  const lookMaterials: Record<string, unknown> = {}, propMaterials: Record<string, unknown> = {};
  for (const material of used) {
    const name = glbNames.get(material.key) ?? material.key, file = material.map === null ? undefined : textureFiles.get(material.map);
    lookMaterials[lookId(material)] = materialEntry(material);
    propMaterials[name] = { id: lookId(material), ...(file === undefined ? {} : { colour: { file: file.hash, wrapS: 10497, wrapT: 10497, minFilter: 9987, magFilter: 9729, anisotropy: 4 } }) };
  }
  const shardTiles = terrain.tiles.map((t) => ({ ...t, files: [...t.files], bounds: { min: [...t.bounds.min] as [number, number, number], max: [...t.bounds.max] as [number, number, number] } }));
  const propTiles: { lod: 0; x: number; z: number; file: string }[] = [], tileReport: { tile: string; triangles: number; draws: number; bytes: number }[] = [];
  for (const [address, merges] of [...tiles].sort(([a], [b]) => a.localeCompare(b))) {
    const [x = 0, z = 0] = address.split('/').map(Number);
    const primitives: GlbPrimitive[] = [], dependencies = new Set<string>();
    for (const [key, merge] of [...merges].sort(([p], [q]) => p.localeCompare(q))) {
      const material = scene.materials[key]; if (material === undefined || merge.position.length === 0) continue;
      for (const chunk of chunks(merge)) {
        const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(chunk.position, 3)).setAttribute('normal', new Float32BufferAttribute(chunk.normal, 3))
          .setAttribute('uv', new Float32BufferAttribute(chunk.uv, 2)).setAttribute('color', new BufferAttribute(new Float32Array(chunk.colour), 3)).setIndex(chunk.index);
        const glbMaterial = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true }); glbMaterial.name = glbNames.get(key) ?? key;
        primitives.push({ geometry, material: glbMaterial, castShadow: casts.get(key) ?? true });
      }
      const file = material.map === null ? undefined : textureFiles.get(material.map); if (file !== undefined) dependencies.add(file.hash);
    }
    if (primitives.length === 0) continue;
    // a GLB holds at most 25 MB (shard-format glbCost): batch the primitives into as many files as the tile needs
    const batches: GlbPrimitive[][] = []; let batch: GlbPrimitive[] = [], bytes = 0;
    for (const primitive of primitives) {
      const size = primitive.geometry.getAttribute('position').count * 44 + (primitive.geometry.getIndex()?.count ?? 0) * 4;
      if (batch.length > 0 && bytes + size > 18_000_000) { batches.push(batch); batch = []; bytes = 0; }
      batch.push(primitive); bytes += size;
    }
    batches.push(batch);
    const rows = batches.map((list, i) => store(staticGlb(list, batches.length === 1 ? `scene.${x}.${z}` : `scene.${x}.${z}.${i}`), 'glb', [...dependencies].sort()));
    const [first, ...more] = rows; if (first === undefined) continue;
    propTiles.push({ lod: 0, x, z, file: first.hash, ...(more.length === 0 ? {} : { additionalFiles: more.map((r) => r.hash) }) });
    const tile = shardTiles.find((t) => t.lod === 0 && t.x === x && t.z === z);
    if (tile === undefined) throw new Error(`scene: no terrain tile 0/${x}/${z}`);
    const textures = [...dependencies].map((hash) => files.find((f) => f.hash === hash)).filter((f) => f !== undefined);
    tile.files.push(...rows.map((r) => r.hash), ...textures.map((f) => f.hash).filter((hash) => !tile.files.includes(hash)));
    const sum = (pick: (f: Shardfile['files'][number]) => number): number => rows.reduce((n, f) => n + pick(f), 0) + textures.reduce((n, f) => n + pick(f), 0);
    tile.compressed += sum((f) => f.compressed); tile.decoded += sum((f) => f.decoded); tile.gpu += sum((f) => f.gpu);
    tile.triangles += rows.reduce((n, f) => n + f.triangles, 0); tile.draws += rows.reduce((n, f) => n + f.draws, 0);
    for (const primitive of primitives) { primitive.geometry.computeBoundingBox(); const box = primitive.geometry.boundingBox; if (box === null) continue; tile.bounds.min[1] = Math.min(tile.bounds.min[1], box.min.y); tile.bounds.max[1] = Math.max(tile.bounds.max[1], box.max.y); }
    const row = { triangles: rows.reduce((n, f) => n + f.triangles, 0), draws: rows.reduce((n, f) => n + f.draws, 0), compressed: rows.reduce((n, f) => n + f.compressed, 0) };
    tileReport.push({ tile: `0/${x}/${z}`, triangles: row.triangles, draws: row.draws, bytes: row.compressed });
  }
  // colliders (AP4)
  const colliders = scene.parts.filter((part) => part.colliders.length > 0).map((part) => ({ id: `scene.${part.name}`, panel: null, initialActive: true, shapes: part.colliders.map(boxRow) }));
  // water (AP4)
  const water = scene.parts.flatMap(waterRows);
  const lights = scene.parts.flatMap((part) => part.lights);
  const base = emptyShardfile({ slug: scene.identity.slug, name: scene.identity.name, author: scene.identity.author ?? 'Wildshard', revision: scene.identity.revision ?? 1, seed: scene.identity.seed ?? 1 });
  const [sx, sy, sz] = scene.spawn.position;
  const spawnY = Math.max(sy, (ground?.heightAt(sx, sz) ?? 0) + 1);
  const product = {
    ...base, budgets: { ...base.budgets, sim: { resident: 16_000_000, compressed: 1_000_000 } }, serverBudget: { ...base.serverBudget, tickMicros: 5_000, memory: 16_000_000 },
    look: sceneLook(scene, lights, lookMaterials), spawn: { x: round(sx, 3), y: round(spawnY, 3), z: round(sz, 3), yaw: round(scene.spawn.yaw, 4) },
    terrain: { ...terrain.terrain, shadow: { cast: true, receive: true }, follow: 5 }, tiles: shardTiles, files: files.sort((a, b) => a.hash.localeCompare(b.hash)), edge: terrain.edge,
    critical: [...terrain.critical], far: null,
    props: { version: 1, family: 'pbr', tiles: propTiles, panels: [], models: [], far: null, textures: [], colliders, ...(Object.keys(propMaterials).length === 0 ? {} : { materials: propMaterials }) },
    ...(water.length === 0 ? {} : { water }),
  };
  // oxlint-disable-next-line unicorn/prefer-structured-clone -- JSON wire normalization (signed zero), as product.ts does
  let shard = parseShardfile(JSON.parse(JSON.stringify(product)));
  if (options.extend !== undefined) shard = options.extend(shard);
  return { shard, assets, report: { sprites: scene.parts.reduce((n, p) => n + p.sprites.length, 0), lampsDropped: Math.max(0, lights.filter((l) => l.kind === 'point').length - 16), tiles: tileReport } };
}

/** The scene's ground as the terrain bake reads it: the declared height field, or a flat cell. */
function groundSource(scene: ShardScene): Parameters<typeof bakeTerrain>[0] {
  const ground = scene.ground;
  return { heightAt: ground?.heightAt ?? (() => 0), colourAt: (x, z) => ground?.colourAt?.(x, z) ?? [0.3, 0.36, 0.2] };
}

/** AP18: the scene's whole ground as one terrain tile's wire bytes (heights and colours), what a watched page's hook swaps in. */
export function sceneGroundBytes(scene: ShardScene): Uint8Array {
  return encodeTerrainTile(groundLattice(groundSource(scene)));
}
