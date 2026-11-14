import { BufferAttribute, BufferGeometry, Color, Float32BufferAttribute, Matrix3, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { parseShardfile, type Shardfile } from '@wildshard/format/shardSchema';
import { emptyShardfile } from '../author';
import { parseGlb, parseKtx2 } from '../assets';
import { hashImmutableBytes } from '../immutable';
import type { GeneratedProject, ProjectGenerationContext } from '../projectGeneration';
import { staticGlb, type GlbPrimitive } from '../bake/glb';
import { bakeTerrain, groundLattice } from '../bake/terrain';
import { encodeTerrainTile } from '@wildshard/format/terrainTileBytes';
import { bakeRawColourPixels } from '../bake/rawTexture';
import type { Rgb, SceneCollider, SceneDraw, SceneGeometry, SceneLight, SceneMaterial, SceneMotion, ScenePart, ShardScene } from './description';
import { hashOf } from './hash';

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
 * - **cards** (AP11): every `Sprite` and every point of a `Points` cloud as a camera-facing quad (its seat in `position`, its
 *   corner in the `_CORNER` channel), merged per material and motion per tile: one draw a tile, an emissive `card` entry;
 * - **declared motion** (AP12): a light's `flicker` to its lamp row, a card's `pulse` / `drift` / `rise` to its entry's
 *   `motion`, a mesh's `sway` to its entry's `sway` plus a `_SWAY` channel (metres, growing with the square of the height
 *   over the mesh's own bounds), a mesh's `uvScroll` to its entry's `uvScroll`.
 *
 * Phone tile caps are reported, not enforced (J338: this shard may use up to 50 MB): AP9 turns them into a per-part table.
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
const lookId = (key: string): string => `scene.${key}`;
/** A point's card width per metre of `PointsMaterial.size` (three's size attenuation at the cleanrooms' 72° view: tan 36°). */
const POINT_CARD = 0.7265;
/** One merge's material: the scene material, the motion its draws declare, and whether it is a card. */
interface Entry { readonly material: SceneMaterial; readonly motion: SceneMotion | null; readonly card: boolean }
const entryKey = (material: string, motion: SceneMotion | null, card = false): string =>
  motion === null && !card ? material : `${material}${card ? '.card' : ''}${motion === null ? '' : `.${hashOf((h) => h.json(motion))}`}`;
const luminance = ([r, g, b]: Rgb): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const round = (value: number, digits = 4): number => { const k = 10 ** digits; const out = Math.round(value * k) / k; return out === 0 ? 0 : out; };
const rgb01 = (colour: Rgb): [number, number, number] => [round(clamp01(colour[0])), round(clamp01(colour[1])), round(clamp01(colour[2]))];

/** One tile's growing merge for one material: world-space vertices and an index (a copy inside one tile keeps its
 *  own index; a triangle cut at a tile seam adds its clipped corners). */
interface Merge { position: number[]; normal: number[]; uv: number[]; colour: number[]; index: number[]; sway: number[]; corner: number[] }
const emptyMerge = (): Merge => ({ position: [], normal: [], uv: [], colour: [], index: [], sway: [], corner: [] });

/** The tiles a world box touches, by L0 address. */
const tileOf = (value: number): number => Math.min(7, Math.max(0, Math.floor((value + HALF) / TILE)));

interface Vertex { p: Vector3; n: Vector3; u: number; v: number; c: Vector3; s: number }
function clipToTile(triangle: readonly Vertex[], x: number, z: number): Vertex[] {
  const x0 = -HALF + x * TILE, z0 = -HALF + z * TILE;
  let polygon = [...triangle];
  for (const [axis, limit, direction] of [['x', x0, 1], ['x', x0 + TILE, -1], ['z', z0, 1], ['z', z0 + TILE, -1]] as const) {
    const input = polygon; polygon = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[i], b = input[(i + 1) % input.length]; if (a === undefined || b === undefined) continue;
      const da = (a.p[axis] - limit) * direction, db = (b.p[axis] - limit) * direction;
      if (da >= 0) polygon.push(a);
      if ((da < 0) !== (db < 0)) { const t = da / (da - db); polygon.push({ p: a.p.clone().lerp(b.p, t), n: a.n.clone().lerp(b.n, t).normalize(), u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t, c: a.c.clone().lerp(b.c, t), s: a.s + (b.s - a.s) * t }); }
    }
  }
  return polygon;
}

/** Expand every draw of one entry into per-tile world triangles. */
function mergeDraws(key: string, draws: readonly SceneDraw[], scene: ShardScene, tiles: Map<string, Map<string, Merge>>): void {
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
      appendCopy(geometry, material, world, normalMatrix, flip, tint, key, tiles, p, n, draw.motion?.kind === 'sway' ? draw.motion.amount : 0);
    }
  }
}

function appendCopy(geometry: SceneGeometry, material: SceneMaterial, world: Matrix4, normalMatrix: Matrix3, flip: boolean, tint: Vector3, key: string, tiles: Map<string, Map<string, Merge>>, p: Vector3, n: Vector3, sway = 0): void {
  const count = geometry.index?.length ?? geometry.position.length / 3;
  // AP12: sway grows with the square of the height over the geometry's own bounds (0 at its root)
  let low = Infinity, high = -Infinity;
  if (sway > 0) for (let i = 1; i < geometry.position.length; i += 3) { const y = geometry.position[i] ?? 0; low = Math.min(low, y); high = Math.max(high, y); }
  const swayAt = (at: number): number => (sway > 0 && high > low ? sway * (((geometry.position[at * 3 + 1] ?? low) - low) / (high - low)) ** 2 : 0);
  const vertex = (at: number): Vertex => ({  // world-space corner
    p: p.fromArray(geometry.position, at * 3).applyMatrix4(world).clone(),
    n: n.fromArray(geometry.normal, at * 3).applyMatrix3(normalMatrix).normalize().clone(),
    u: (geometry.uv?.[at * 2] ?? 0) * material.repeat[0] + material.offset[0], v: (geometry.uv?.[at * 2 + 1] ?? 0) * material.repeat[1] + material.offset[1],
    c: (material.vertexColours && geometry.colour !== null ? new Vector3().fromArray(geometry.colour, at * 3) : new Vector3(1, 1, 1)).multiply(tint),
    s: swayAt(at),
  });
  const mergeOf = (tile: string): Merge => {
    const merges = tiles.get(tile) ?? new Map<string, Merge>(); tiles.set(tile, merges);
    const merge = merges.get(key) ?? emptyMerge(); merges.set(key, merge);
    return merge;
  };
  const push = (merge: Merge, corner: Vertex): number => {
    merge.position.push(corner.p.x, corner.p.y, corner.p.z); merge.normal.push(corner.n.x, corner.n.y, corner.n.z);
    merge.uv.push(corner.u, corner.v); merge.colour.push(corner.c.x, corner.c.y, corner.c.z); merge.sway.push(corner.s);
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

/** AP11: one camera-facing quad per card, into its seat's tile: `position` the seat, `_CORNER` the view-space offset. */
function appendCard(key: string, seat: readonly [number, number, number], size: readonly [number, number], centre: readonly [number, number], tiles: Map<string, Map<string, Merge>>): void {
  const tile = `${tileOf(seat[0])}/${tileOf(seat[2])}`, merges = tiles.get(tile) ?? new Map<string, Merge>(); tiles.set(tile, merges);
  const merge = merges.get(key) ?? emptyMerge(); merges.set(key, merge);
  const base = merge.position.length / 3;
  for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]] as const) {
    merge.position.push(seat[0], seat[1], seat[2]); merge.normal.push(0, 0, 1); merge.uv.push(u, v); merge.colour.push(1, 1, 1); merge.sway.push(0);
    merge.corner.push((u - centre[0]) * size[0], (v - centre[1]) * size[1]);
  }
  merge.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/** A merge cut into primitives of at most 200,000 vertices, each with its own compact vertex list. */
function chunks(merge: Merge, limit = 200_000): Merge[] {
  if (merge.position.length / 3 <= limit) return [merge];
  const out: Merge[] = []; let current: Merge | null = null, remap = new Map<number, number>();
  for (let i = 0; i < merge.index.length; i += 3) {
    if (current === null || current.position.length / 3 + 3 > limit) { current = emptyMerge(); out.push(current); remap = new Map(); }
    for (let k = 0; k < 3; k++) {
      const from = merge.index[i + k] ?? 0; let to = remap.get(from);
      if (to === undefined) {
        to = current.position.length / 3; remap.set(from, to);
        current.position.push(...merge.position.slice(from * 3, from * 3 + 3)); current.normal.push(...merge.normal.slice(from * 3, from * 3 + 3));
        current.uv.push(...merge.uv.slice(from * 2, from * 2 + 2)); current.colour.push(...merge.colour.slice(from * 3, from * 3 + 3));
        current.sway.push(merge.sway[from] ?? 0); current.corner.push(...merge.corner.slice(from * 2, from * 2 + 2));
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
export function lampRows(lights: readonly SceneLight[]): { at: [number, number, number]; colour: [number, number, number]; intensity: number; distance: number; decay?: number; flicker?: { rate: number; amount: number } }[] {
  type LampRow = ReturnType<typeof lampRows>[number];
  const rows: LampRow[] = [];
  for (const l of lights) {
    if (l.kind !== 'point') continue;
    const row: LampRow = { at: [round(l.position[0], 3), round(l.position[1], 3), round(l.position[2], 3)], colour: rgb01(l.colour), intensity: round(Math.min(100, l.intensity), 3),
      distance: round(Math.min(50, Math.max(0.1, l.distance === 0 ? 50 : l.distance)), 3) };
    if (l.decay !== 2) row.decay = round(clamp01(l.decay / 2) * 2, 3);
    // AP12: the light's declared flicker, played by the engine's lamps (format `lamps[].flicker`)
    if (l.motion?.kind === 'flicker') row.flicker = { rate: round(Math.min(30, l.motion.rate), 3), amount: round(clamp01(l.motion.amount), 3) };
    rows.push(row);
  }
  return rows;
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
    ...(post?.passes === undefined || post.passes.length === 0 ? {} : { post: post.passes.map((graph) => ({ graph })) }),
    grade: { exposure: round(Math.log2(post?.exposure ?? 1), 3), saturation: 1, contrast: 1, lut: null,
      ...(post?.bloom === null || post?.bloom === undefined ? {} : { bloom: { intensity: round(Math.min(4, post.bloom.strength * 1.5), 3), threshold: round(post.bloom.threshold, 3), radius: round(clamp01(post.bloom.radius), 3) } }),
      ...(post?.tone === 'neutral' || post?.tone === 'aces' ? { tone: post.tone } : {}) },
    clock: 'engine', day: { minutes: 12, start: 0.5, maxElevation: round(Math.max(5, elevation), 2), azimuth: round(azimuth, 2) }, dayOverride: 0.5,
    keys: [{ time: 0, sky: { zenith: rgb01(skyColour), horizon: rgb01(fogColour) },
      fog: fog?.kind === 'linear' ? { colour: rgb01(fog.colour), density: 0, near: fog.near, far: fog.far } : { colour: rgb01(fogColour), density: round(fog?.kind === 'exp2' ? fog.density : 0, 5) },
      sun: { colour: rgb01(sun?.colour ?? [1, 1, 1]), intensity: round(sun?.intensity ?? 0, 3) },
      ambient: { sky: rgb01(skyColour), ground: rgb01(groundColour), intensity: round((hemisphere?.intensity ?? ambient?.intensity ?? 0.5) * Math.PI, 3) } }],
    light: lamps.length === 0 ? {} : { lamps: lampRows(lamps) },
  } as Shardfile['look'];
}

/** A linear HDR colour as an sRGB tint (0..1) and the gain that restores it. */
function tintAndGain(colour: Rgb): { tint: [number, number, number]; gain: number } {
  const peak = Math.max(colour[0], colour[1], colour[2], 1e-6), c = new Color().setRGB(colour[0] / peak, colour[1] / peak, colour[2] / peak);
  return { tint: [round(clamp01(c.r <= 0.0031308 ? c.r * 12.92 : 1.055 * c.r ** (1 / 2.4) - 0.055)), round(clamp01(c.g <= 0.0031308 ? c.g * 12.92 : 1.055 * c.g ** (1 / 2.4) - 0.055)), round(clamp01(c.b <= 0.0031308 ? c.b * 12.92 : 1.055 * c.b ** (1 / 2.4) - 0.055))], gain: peak };
}

/** A card's motion as the format's (AP12): only a card's kinds reach here. */
function cardMotion(motion: SceneMotion | null): Record<string, unknown> {
  if (motion === null) return {};
  if (motion.kind === 'pulse') return { motion: { kind: 'pulse', rate: round(Math.min(30, motion.rate), 3), amount: round(clamp01(motion.amount), 3) } };
  if (motion.kind === 'drift') return { motion: { kind: 'drift', rate: round(Math.min(30, motion.rate), 3), radius: round(Math.min(10, motion.radius), 3) } };
  if (motion.kind === 'rise') return { motion: { kind: 'rise', rate: round(Math.min(30, motion.rate), 3), height: round(Math.min(50, motion.height), 3), spread: round(Math.min(10, motion.spread), 3) } };
  return {};
}

/**
 * A look.materials entry for one scene material (AP2, AP10 to AP12): pbr for lit surfaces (with their own glow, alpha,
 * decal offset, sway and uv scroll), emissive for unlit ones, an emissive card for a sprite or a point.
 */
function materialEntry({ material, motion, card }: Entry): Record<string, unknown> {
  const doubleSided = material.side === 'double' ? { doubleSided: true } : {};
  if (material.entry !== null) return { ...material.entry };
  if (card) {
    const { tint, gain } = tintAndGain(material.colour);
    return { family: 'emissive', card: true, colour: tint, intensity: round(Math.min(64, gain * material.opacity), 3), blend: material.blending === 'additive' ? 'additive' : 'alpha',
      fog: material.fog ? 1 : 0, ...cardMotion(motion) };
  }
  if (material.kind === 'basic') {
    const { tint, gain } = tintAndGain(material.colour);
    return { family: 'emissive', colour: tint, intensity: round(Math.min(64, gain * (material.blending === 'additive' ? material.opacity : 1)), 3), vertexColours: true, ...doubleSided,
      ...(material.blending === 'additive' ? { blend: 'additive' } : material.transparent ? { blend: 'alpha' } : {}), ...(material.fog ? {} : { fog: 0 }) };
  }
  const glow = luminance(material.emissive) * material.emissiveIntensity, emissive = glow > 0 ? tintAndGain(material.emissive) : null;
  const alpha = material.transparent && material.blending === 'normal';
  return { family: 'pbr', colour: rgb01(material.colour), roughness: round(clamp01(material.roughness), 3), metalness: round(clamp01(material.metalness), 3), vertexColours: true, ...doubleSided,
    ...(material.alphaTest > 0 ? { alphaCutoff: round(clamp01(material.alphaTest), 3) } : {}),
    // M4.3: a lit surface's own glow (lamp glass, candles) stays lit by the sun and lamps
    ...(emissive === null ? {} : { emissive: emissive.tint, emissiveIntensity: round(Math.min(64, emissive.gain * material.emissiveIntensity), 3) }),
    // AP10: a see-through surface sorts after the opaque world; a polygon offset pulls a decal off its wall
    ...(alpha ? { blend: 'alpha', ...(material.opacity < 1 ? { opacity: round(clamp01(material.opacity), 3) } : {}) } : {}),
    ...(material.polygonOffset === 0 ? {} : { depthOffset: round(Math.min(16, Math.max(-16, material.polygonOffset)), 3) }),
    // AP12: wind sway (its amplitude rides the _SWAY channel) and a scrolling map
    ...(motion?.kind === 'sway' ? { sway: { rate: round(Math.min(8, motion.rate), 3), direction: [round(Math.max(-1, Math.min(1, motion.direction[0])), 3), round(Math.max(-1, Math.min(1, motion.direction[1])), 3)] } } : {}),
    ...(motion?.kind === 'uvScroll' ? { uvScroll: [round(Math.max(-10, Math.min(10, motion.u)), 4), round(Math.max(-10, Math.min(10, motion.v)), 4)] } : {}) };
}

/** What the shardfile back end did not write, for the build log (never silent). */
export interface ShardfileReport { readonly cards: number; readonly lampsDropped: number; readonly tiles: readonly { tile: string; triangles: number; draws: number; bytes: number }[] }

/** The shardfile back end: the description in, a generated project out. Runs at compile time. */
export function compileShardfile(scene: ShardScene, ctx: ProjectGenerationContext, options: ShardfileOptions = {}): Promise<GeneratedProject> {
  const { shard, assets, report } = sceneShardfile(scene, options);
  for (const [hash, bytes] of assets) if (ctx.asset(bytes) !== hash) throw new Error('scene: an asset hash differs from the product store');
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
  // only the textures a drawn material or a card samples
  const sampled = new Set(scene.parts.flatMap((part) => [...part.draws.map((d) => d.material), ...part.sprites.map((c) => c.material), ...part.points.map((c) => c.material)].map((key) => scene.materials[key]?.map)).filter((key) => typeof key === 'string'));
  for (const texture of Object.values(scene.textures).filter((t) => sampled.has(t.key))) {
    const bytes = bakeRawColourPixels({ width: texture.width, height: texture.height, pixels: new Uint8ClampedArray(texture.rgba) }, { colourSpace: texture.colourSpace });
    textureFiles.set(texture.key, store(bytes, 'ktx2'));
  }
  // static parts (AP2): merged per entry (a material and the motion its draws declare) per tile
  const draws = scene.parts.flatMap((part) => part.draws), byEntry = new Map<string, SceneDraw[]>(), entries = new Map<string, Entry>();
  const entryOf = (material: string, motion: SceneMotion | null, card = false): string | null => {
    const found = scene.materials[material]; if (found === undefined) return null;
    const key = entryKey(material, motion, card); if (!entries.has(key)) entries.set(key, { material: found, motion, card }); return key;
  };
  for (const draw of draws) { const key = entryOf(draw.material, draw.motion); if (key === null) continue; const list = byEntry.get(key) ?? []; list.push(draw); byEntry.set(key, list); }
  const tiles = new Map<string, Map<string, Merge>>();
  for (const [key, list] of byEntry) mergeDraws(key, list, scene, tiles);
  // cards (AP11): every sprite and every point a camera-facing quad in its seat's tile
  let cards = 0;
  for (const part of scene.parts) {
    for (const sprite of part.sprites) { const key = entryOf(sprite.material, sprite.motion, true); if (key === null) continue; appendCard(key, sprite.position, sprite.scale, sprite.center, tiles); cards++; }
    for (const cloud of part.points) {
      const key = entryOf(cloud.material, cloud.motion, true), size = (scene.materials[cloud.material]?.pointSize ?? 0) * POINT_CARD; if (key === null) continue;
      for (let i = 0; i < cloud.positions.length; i += 3) { appendCard(key, [cloud.positions[i] ?? 0, cloud.positions[i + 1] ?? 0, cloud.positions[i + 2] ?? 0], [size, size], [0.5, 0.5], tiles); cards++; }
    }
  }
  const names = new Map<string, string>(), glbNames = new Map([...entries].map(([key, entry]) => [key, glbName({ ...entry.material, key, name: entry.card || entry.motion !== null ? `${entry.material.name}-${key.slice(entry.material.key.length + 1)}` : entry.material.name }, names)]));
  const casts = new Map<string, boolean>(); for (const draw of draws) { const key = entryKey(draw.material, draw.motion); casts.set(key, (casts.get(key) ?? false) || draw.castShadow); }
  const lookMaterials: Record<string, unknown> = {}, propMaterials: Record<string, unknown> = {};
  for (const [key, entry] of entries) {
    const name = glbNames.get(key) ?? key, file = entry.material.map === null ? undefined : textureFiles.get(entry.material.map);
    lookMaterials[lookId(key)] = materialEntry(entry);
    propMaterials[name] = { id: lookId(key), ...(file === undefined ? {} : { colour: { file: file.hash, wrapS: 10497, wrapT: 10497, minFilter: 9987, magFilter: 9729, anisotropy: 4 } }) };
  }
  const shardTiles = terrain.tiles.map((t) => ({ ...t, files: [...t.files], bounds: { min: [...t.bounds.min] as [number, number, number], max: [...t.bounds.max] as [number, number, number] } }));
  const propTiles: { lod: 0; x: number; z: number; file: string }[] = [], tileReport: { tile: string; triangles: number; draws: number; bytes: number }[] = [];
  for (const [address, merges] of [...tiles].sort(([a], [b]) => a.localeCompare(b))) {
    const [x = 0, z = 0] = address.split('/').map(Number);
    const primitives: GlbPrimitive[] = [], dependencies = new Set<string>();
    for (const [key, merge] of [...merges].sort(([p], [q]) => p.localeCompare(q))) {
      const entry = entries.get(key), material = entry?.material; if (entry === undefined || material === undefined || merge.position.length === 0) continue;
      const swaying = entry.motion?.kind === 'sway';
      for (const chunk of chunks(merge)) {
        const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(chunk.position, 3)).setAttribute('normal', new Float32BufferAttribute(chunk.normal, 3))
          .setAttribute('uv', new Float32BufferAttribute(chunk.uv, 2)).setAttribute('color', new BufferAttribute(new Float32Array(chunk.colour), 3)).setIndex(chunk.index);
        // AP11 and AP12: a card's corners and a swaying surface's amplitude ride their own GLB channels
        if (entry.card) geometry.setAttribute('corner', new Float32BufferAttribute(chunk.corner, 2));
        if (swaying) geometry.setAttribute('sway', new Float32BufferAttribute(chunk.sway, 1));
        const glbMaterial = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true }); glbMaterial.name = glbNames.get(key) ?? key;
        primitives.push({ geometry, material: glbMaterial, castShadow: entry.card ? false : casts.get(key) ?? true,
          ...(entry.card ? { customAttributes: { _CORNER: 'corner' } } : swaying ? { customAttributes: { _SWAY: 'sway' } } : {}) });
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
  return { shard, assets, report: { cards, lampsDropped: Math.max(0, lights.filter((l) => l.kind === 'point').length - 16), tiles: tileReport } };
}

/**
 * SHARD-SOURCE AP19: the shardfile sections a watched page restarts its simulation for (engine's dev hook v4,
 * `DEV_GAMEPLAY_SECTIONS` in engine `src/shared/game/devGameplay.ts`: keep the two lists the same).
 */
// `questNpcs` and `clientScripts` are the page's alone (the hook rebuilds only the quest views): a change there is a new shell.
export const GAMEPLAY_SECTIONS = ['quests', 'questHost', 'encounters', 'directors', 'creatures', 'crowds', 'hooks', 'ledger', 'sim'] as const;

/**
 * AP19: what `options.extend` adds to a scene shard, split for `wildshard watch`: the gameplay sections (a soft restart takes
 * them live) and the rest (a change there needs a new shell). Cheap: `extend` runs over an empty shardfile of the scene's
 * identity, never the baked one, so it must not read the scene's rows (none of today's do).
 */
export function sceneGameplay(identity: ShardScene['identity'], options: ShardfileOptions = {}): { gameplay: Record<string, unknown>; rest: Record<string, unknown> } {
  const base = parseShardfile(emptyShardfile({ slug: identity.slug, name: identity.name, author: identity.author ?? 'Wildshard', revision: identity.revision ?? 1, seed: identity.seed ?? 1 }));
  // the base as it was, before an `extend` that edits its input in place can change it
  const before = structuredClone(base) as unknown as Record<string, unknown>;
  const shard = options.extend === undefined ? base : options.extend(base) as unknown as Record<string, unknown>;
  const gameplay: Record<string, unknown> = {}, rest: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(shard)])) {
    const value = (shard as Record<string, unknown>)[key];
    if ((GAMEPLAY_SECTIONS as readonly string[]).includes(key)) { if (value !== undefined) gameplay[key] = value; }
    else if (JSON.stringify(value) !== JSON.stringify(before[key])) rest[key] = value ?? null;
  }
  return { gameplay, rest };
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
