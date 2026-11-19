import { Box3, BufferAttribute, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, FrontSide, Matrix3, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import type { PoolSurface } from '@wildshard/format/pool-surface';
import { parseShardfile, type Shardfile } from '@wildshard/format/shardSchema';
import { emptyShardfile } from '../author';
import { parseGlb, parseKtx2 } from '../assets';
import { parseSkinFile, skinFileDependencies } from '@wildshard/format/skinAssets';
import { hashImmutableBytes } from '../immutable';
import type { GeneratedProject, ProjectGenerationContext } from '../projectGeneration';
import { staticGlb, type GlbPrimitive } from '../bake/glb';
import { bakeTerrain, checkEntryRoad, groundLattice } from '../bake/terrain';
import { encodeTerrainTile } from '@wildshard/format/terrainTileBytes';
import { lowerMoverMotion, type MoverMotion } from '@wildshard/format/moverMotion';
import { bakeRawColourPixels } from '../bake/rawTexture';
import type { Rgb, SceneCollider, SceneDraw, SceneGeometry, SceneLight, SceneMaterial, SceneMotion, SceneMove, ScenePart, SceneSwing, SceneVehicle, ShardScene } from './description';
import { SceneRefusalError } from './refusal';
import { budgetReport, partBudgets } from './budget';
import { coarseGeometry } from '../bake/coarseCopy';
import { hashOf } from './hash';
import { detailFileFaults, detailMeshBytes } from '@wildshard/format/look-details';
import { withSceneState } from './state';

/**
 * AUTHORING-PARITY AP2, AP3, AP4: the shardfile back end. It reads only the scene description and writes the sections an
 * author types by hand today:
 *
 * - **static parts** (AP2): every `Mesh`, merged per material per 62.5 m tile (the map's repeat and offset in the uvs), one
 *   named GLB material per scene material, a generated `look.materials` entry and `props.materials` binding for each,
 *   painted textures as RGBA8 KTX2 slots; an `InstancedMesh` with no motion stays instanced (SHARD-SOURCE AP15): its
 *   geometry once per tile, its copies as `EXT_mesh_gpu_instancing` rows in the tile of their seat (a swaying or carded
 *   one is still expanded: the engine's sway reads the mesh's own frame);
 * - **light and look** (AP3): `PointLight`s to `look.light.lamps` (the 16 brightest), the brightest `DirectionalLight` to
 *   the sun key, a `HemisphereLight` to the ambient key, `scene.fog`, `world.post`;
 * - **ground, colliders, water** (AP4): `world.ground(heightAt)` to the terrain bake, `solid(mesh)` to collider boxes, each
 *   `Water` to a `water[]` pool row whose outline is its own geometry's.
 * - **panels** (AP16): a `world.part(name, build, { panel })` is one library GLB of its own (`props.panels`, every entry
 *   merged whole) and one collider bound to it, so a `targets.panels` row hides both by state (a gate that opens).
 *
 * - **cards** (AP11): every `Sprite` and every point of a `Points` cloud as a camera-facing quad (its seat in `position`, its
 *   corner in the `_CORNER` channel), merged per material and motion per tile: one draw a tile, an emissive `card` entry;
 * - **declared motion** (AP12): a light's `flicker` to its lamp row, a card's `pulse` / `drift` / `rise` to its entry's
 *   `motion`, a mesh's `sway` to its entry's `sway` plus a `_SWAY` channel (metres, growing with the square of the height
 *   over the mesh's own bounds), a mesh's `uvScroll` to its entry's `uvScroll`.
 *
 * Phone tile caps are reported, not enforced (J338: this shard may use up to 50 MB), as AP9a's per-part table (`budget.ts`).
 */

export interface ShardfileOptions {
  /** extra rows merged into the generated shardfile (manifest, card, quests...) */
  readonly extend?: (shard: Shardfile) => Shardfile;
}

/**
 * NEW-SHARD-E2E F23: the starter sword every scene shard's player holds unless `extend` writes its own `items` (a whole
 * section replaces this one). The Template's iron sword: the engine's kit melee swing (`kit.sword`), no script.
 */
type StarterItems = NonNullable<Shardfile['items']>;
export const STARTER_SWORD: StarterItems['rows'][number] = {
  id: 'weapon.sword-iron', kind: 'weapon', family: 'kit.melee', slot: 'declared.weapon.sword-iron', context: 'weapon.melee',
  ui: { name: 'Iron sword', icon: 'sword', swapIcon: '\u2694', blurb: 'The shared iron sword.' },
  view: { recipe: 'kit.sword', colour: '#888888', position: [0.2, -0.35, -0.6], rotation: [0, 0, 0] }, hook: null,
  light: { id: 'sword.light', damage: 28, cooldown: 0.08, range: 2.2, width: 1.2, tags: ['actor.player', 'weapon.sword-iron', 'dmg.melee'], effect: null },
  heavy: { id: 'sword.heavy', damage: 56, cooldown: 0.08, range: 2.2, width: 1.2, tags: ['actor.player', 'weapon.sword-iron', 'dmg.melee'], effect: null },
  charge: 0.45,
};
/** NEW-SHARD-E2E F23: a scene shard's `items` before `extend`: the starter sword in hand. */
export const STARTER_ITEMS: StarterItems = { version: 1, rows: [STARTER_SWORD], contexts: [], loadout: { primary: STARTER_SWORD.id, secondary: null, tools: [] } };

const TILE = 62.5, HALF = 250;
/** AP15: how far an instanced copy may hang past the cell's edge (format `props.overhang`, at most 1 m). */
const OVERHANG = 1;
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
interface Entry { readonly material: SceneMaterial; readonly motion: SceneMotion | null; readonly card: boolean; readonly swing?: boolean }
/** SS8d: a hung draw is its own entry (`swing: true`, the `_SWING` channel), so a still copy of its material draws as before. */
const entryKey = (material: string, motion: SceneMotion | null, card = false, swing = false): string =>
  motion === null && !card && !swing ? material : `${material}${card ? '.card' : ''}${swing ? '.swing' : ''}${motion === null ? '' : `.${hashOf((h) => h.json(motion))}`}`;
const luminance = ([r, g, b]: Rgb): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
/** SS-GF2a: scene movers' entities, clear of the scene's creatures (from 1) and a shard's hand-placed movers (9201). */
const MOVER_ENTITY_BASE = 9101;

const round = (value: number, digits = 4): number => { const k = 10 ** digits; const out = Math.round(value * k) / k; return out === 0 ? 0 : out; };
const rgb01 = (colour: Rgb): [number, number, number] => [round(clamp01(colour[0])), round(clamp01(colour[1])), round(clamp01(colour[2]))];
/** A linear channel as sRGB (three's `LinearToSRGB`). */
const toSrgb = (c: number): number => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
/**
 * ss4d: a linear colour (every scene colour, as three.js holds it) as the format's sRGB material colour (`look.materials`
 * `colour`, `emissive` and a detail layer's moss are sRGB: what an artist picks; engine `families/pbr.ts` reads them with
 * `SRGBColorSpace`). Lamps, fog, sky keys, pool tints and the environment ground stay linear, as the format says.
 */
const srgb01 = (colour: Rgb): [number, number, number] => [round(clamp01(toSrgb(clamp01(colour[0])))), round(clamp01(toSrgb(clamp01(colour[1])))), round(clamp01(toSrgb(clamp01(colour[2]))))];
/** ss4d: the ground's PBR material id (the terrain family; the format's default `toon` drew a lit scene's ground flat). */
export const GROUND_MATERIAL = 'scene.ground';

/** One tile's growing merge for one material: world-space vertices and an index (a copy inside one tile keeps its
 *  own index; a triangle cut at a tile seam adds its clipped corners). */
interface Merge { position: number[]; normal: number[]; uv: number[]; colour: number[]; index: number[]; sway: number[]; corner: number[]; swing: number[] }
const emptyMerge = (): Merge => ({ position: [], normal: [], uv: [], colour: [], index: [], sway: [], corner: [], swing: [] });

/** The tiles a world box touches, by L0 address. */
const tileOf = (value: number): number => Math.min(7, Math.max(0, Math.floor((value + HALF) / TILE)));

interface Vertex { p: Vector3; n: Vector3; u: number; v: number; c: Vector3; s: number; w: number }
function clipToTile(triangle: readonly Vertex[], x: number, z: number): Vertex[] {
  const x0 = -HALF + x * TILE, z0 = -HALF + z * TILE;
  let polygon = [...triangle];
  for (const [axis, limit, direction] of [['x', x0, 1], ['x', x0 + TILE, -1], ['z', z0, 1], ['z', z0 + TILE, -1]] as const) {
    const input = polygon; polygon = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[i], b = input[(i + 1) % input.length]; if (a === undefined || b === undefined) continue;
      const da = (a.p[axis] - limit) * direction, db = (b.p[axis] - limit) * direction;
      if (da >= 0) polygon.push(a);
      if ((da < 0) !== (db < 0)) { const t = da / (da - db); polygon.push({ p: a.p.clone().lerp(b.p, t), n: a.n.clone().lerp(b.n, t).normalize(), u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t, c: a.c.clone().lerp(b.c, t), s: a.s + (b.s - a.s) * t, w: a.w }); }
    }
  }
  return polygon;
}

/** Expand every draw of one entry into per-tile world triangles. */
function mergeDraws(key: string, draws: readonly SceneDraw[], scene: ShardScene, tiles: Map<string, Map<string, Merge>>, swingOf: (draw: SceneDraw) => number = () => 0): void {
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
      appendCopy(geometry, material, world, normalMatrix, flip, tint, key, tiles, p, n, draw.motion?.kind === 'sway' ? draw.motion.amount : 0, swingOf(draw));
    }
  }
}

/** AP15: one instanced draw's copies in one tile: its base geometry (local, uvs and vertex colours as the merge writes
 *  them) once, each copy's world matrix and its colour. */
interface InstancedGroup { key: string; geometry: BufferGeometry; matrices: Matrix4[]; colours: Color[] | null; castShadow: boolean; box: Box3 }
/** The fewest copies a draw needs to stay instanced (below it the merge is as small). */
const INSTANCE_MIN = 2, INSTANCE_CAP = 10_000;
/**
 * AP9c: the coarse (L1) copies the back end writes itself, so no author keeps a hand coarse list. An L1 tile (two by two
 * fine tiles) draws past the fine ring, from about 150 m: its still meshes are simplified toward a quarter of their
 * triangles (half a metre of error for the bounded pass; past 1.5 times the target meshopt's topology-free pass takes over,
 * with no metre bound), and an instanced shape smaller than COARSE_MIN_SIZE across in its own frame (grass, flowers) stays
 * near-only.
 */
const COARSE_RATIO = 0.25, COARSE_ERROR = 0.5, COARSE_MIN_SIZE = 2;
/** A simplified geometry with only the vertices its index still names (the simplifier keeps every vertex). */
function compacted(source: BufferGeometry): BufferGeometry {
  const index = source.getIndex(); if (index === null) return source;
  const remap = new Map<number, number>(), order: number[] = [], next: number[] = [];
  for (const at of index.array) { let to = remap.get(at); if (to === undefined) { to = order.length; remap.set(at, to); order.push(at); } next.push(to); }
  const out = new BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const size = attribute.itemSize, values = new Float32Array(order.length * size);
    order.forEach((from, i) => { for (let c = 0; c < size; c++) values[i * size + c] = attribute.getComponent(from, c); });
    out.setAttribute(name, new BufferAttribute(values, size));
  }
  out.setIndex(next);
  return out;
}

/** A copy the engine's loader can place: translation, rotation and a positive scale, no shear (the loader reads instance
 *  TRS rows; an exact `_MATRIX` row loads as the identity there). */
function isTrs(matrix: Matrix4): boolean {
  const position = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
  matrix.decompose(position, rotation, scale);
  const composed = new Matrix4().compose(position, rotation, scale);
  return scale.x > 0 && scale.y > 0 && scale.z > 0 && matrix.elements.every((n, i) => Number.isFinite(n) && Math.abs(n - (composed.elements[i] ?? Infinity)) <= 1e-6);
}

/** AP15: an `InstancedMesh` with no motion as per-tile instance groups, or null when a copy is mirrored or sheared (the
 *  merge takes it). Instance colours over 1 are folded into the base colours (glTF instance colours are 0 to 1). */
function instanceGroups(key: string, draw: SceneDraw, scene: ShardScene): Map<string, InstancedGroup> | null {
  const geometry = scene.geometries[draw.geometry], material = scene.materials[draw.material], instances = draw.instances;
  if (geometry === undefined || material === undefined || instances === null) return null;
  const base = new Matrix4().fromArray(draw.matrix), worlds: Matrix4[] = [];
  for (let copy = 0; copy < instances.count; copy++) {
    const world = base.clone().multiply(new Matrix4().fromArray(instances.matrices, copy * 16));
    if (!(world.determinant() > 0) || !isTrs(world)) return null;
    worlds.push(world);
  }
  const tints = instances.colours; let peak = 1; if (tints !== null) for (const tint of tints) peak = Math.max(peak, tint);
  const count = geometry.position.length / 3, uv = new Float32Array(count * 2), colour = new Float32Array(count * 3);
  for (let at = 0; at < count; at++) {
    uv[at * 2] = (geometry.uv?.[at * 2] ?? 0) * material.repeat[0] + material.offset[0];
    uv[at * 2 + 1] = (geometry.uv?.[at * 2 + 1] ?? 0) * material.repeat[1] + material.offset[1];
    for (let c = 0; c < 3; c++) colour[at * 3 + c] = (material.vertexColours && geometry.colour !== null ? geometry.colour[at * 3 + c] ?? 1 : 1) * peak;
  }
  const shape = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(geometry.position, 3)).setAttribute('normal', new Float32BufferAttribute(geometry.normal, 3))
    .setAttribute('uv', new Float32BufferAttribute(uv, 2)).setAttribute('color', new BufferAttribute(colour, 3));
  if (geometry.index !== null) shape.setIndex([...geometry.index]);
  shape.computeBoundingBox();
  const local = shape.boundingBox ?? new Box3(), groups = new Map<string, InstancedGroup>();
  worlds.forEach((world, copy) => {
    const tile = `${tileOf(world.elements[12] ?? 0)}/${tileOf(world.elements[14] ?? 0)}`;
    let group = groups.get(tile);
    if (group === undefined) { group = { key, geometry: shape, matrices: [], colours: tints === null ? null : [], castShadow: draw.castShadow, box: new Box3() }; groups.set(tile, group); }
    group.matrices.push(world);
    if (tints !== null) group.colours?.push(new Color((tints[copy * 3] ?? 1) / peak, (tints[copy * 3 + 1] ?? 1) / peak, (tints[copy * 3 + 2] ?? 1) / peak));
    group.box.union(local.clone().applyMatrix4(world));
  });
  return groups;
}

function appendCopy(geometry: SceneGeometry, material: SceneMaterial, world: Matrix4, normalMatrix: Matrix3, flip: boolean, tint: Vector3, key: string, tiles: Map<string, Map<string, Merge>>, p: Vector3, n: Vector3, sway = 0, swing = 0): void {
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
    s: swayAt(at), w: swing,
  });
  const mergeOf = (tile: string): Merge => {
    const merges = tiles.get(tile) ?? new Map<string, Merge>(); tiles.set(tile, merges);
    const merge = merges.get(key) ?? emptyMerge(); merges.set(key, merge);
    return merge;
  };
  const push = (merge: Merge, corner: Vertex): number => {
    merge.position.push(corner.p.x, corner.p.y, corner.p.z); merge.normal.push(corner.n.x, corner.n.y, corner.n.z);
    merge.uv.push(corner.u, corner.v); merge.colour.push(corner.c.x, corner.c.y, corner.c.z); merge.sway.push(corner.s); merge.swing.push(corner.w);
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
function appendCard(key: string, seat: readonly [number, number, number], size: readonly [number, number], centre: readonly [number, number], tiles: Map<string, Map<string, Merge>>, swing = 0): void {
  const tile = `${tileOf(seat[0])}/${tileOf(seat[2])}`, merges = tiles.get(tile) ?? new Map<string, Merge>(); tiles.set(tile, merges);
  const merge = merges.get(key) ?? emptyMerge(); merges.set(key, merge);
  const base = merge.position.length / 3;
  for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]] as const) {
    merge.position.push(seat[0], seat[1], seat[2]); merge.normal.push(0, 0, 1); merge.uv.push(u, v); merge.colour.push(1, 1, 1); merge.sway.push(0); merge.swing.push(swing);
    merge.corner.push((u - centre[0]) * size[0], (v - centre[1]) * size[1]);
  }
  merge.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/**
 * A tile GLB's material for one entry: white, vertex-coloured, and double-sided when the scene's material is (AP16w). The
 * engine draws a prop mesh with the side its GLB material says, so a crossed grass card left one-sided lost its back faces in
 * build while watch drew them.
 */
function glbMaterial(name: string, material: SceneMaterial): MeshStandardMaterial {
  const glb = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, side: material.side === 'double' ? DoubleSide : FrontSide }); glb.name = name;
  return glb;
}

/** A merge cut into primitives of at most 200,000 vertices, each with its own compact vertex list. */
/** One entry's merge as GLB primitives: a card's corners and a swaying surface's amplitude ride their own channels (AP11, AP12). */
function primitivesOf(merge: Merge, entry: Entry, name: string, castShadow: boolean): GlbPrimitive[] {
  const swaying = entry.motion?.kind === 'sway';
  return chunks(merge).map((chunk) => {
    const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(chunk.position, 3)).setAttribute('normal', new Float32BufferAttribute(chunk.normal, 3))
      .setAttribute('uv', new Float32BufferAttribute(chunk.uv, 2)).setAttribute('color', new BufferAttribute(new Float32Array(chunk.colour), 3)).setIndex(chunk.index);
    if (entry.card) geometry.setAttribute('corner', new Float32BufferAttribute(chunk.corner, 2));
    if (swaying) geometry.setAttribute('sway', new Float32BufferAttribute(chunk.sway, 1));
    if (entry.swing === true) geometry.setAttribute('swing', new Float32BufferAttribute(chunk.swing, 1));
    const material = glbMaterial(name, entry.material);
    const primitive: GlbPrimitive = { geometry, material, castShadow: entry.card ? false : castShadow };
    // SS8d: a hung surface or card's swing number + 1 rides `_SWING` beside its corner or sway
    const channels = { ...(entry.card ? { _CORNER: 'corner' } : swaying ? { _SWAY: 'sway' } : {}), ...(entry.swing === true ? { _SWING: 'swing' } : {}) };
    if (Object.keys(channels).length > 0) primitive.customAttributes = channels;
    return primitive;
  });
}

/** A primitive's GLB bytes, near enough to batch by: 44 a vertex (position, normal, uv, colour, one more channel), 4 an index, 76 an instance. */
function glbBytes(primitive: GlbPrimitive): number {
  return primitive.geometry.getAttribute('position').count * 44 + (primitive.geometry.getIndex()?.count ?? 0) * 4 + (primitive.instances?.length ?? 0) * 76;
}

/** `from`'s vertices and triangles added to `into` (AP16's panels: one merge a material across tiles). */
function appendMerge(into: Merge, from: Merge): void {
  const base = into.position.length / 3;
  // element by element: a spread of a large merge overflows the call stack
  for (const channel of ['position', 'normal', 'uv', 'colour', 'sway', 'corner', 'swing'] as const) for (const value of from[channel]) into[channel].push(value);
  for (const at of from.index) into.index.push(at + base);
}

/**
 * AP26: the two server figures a scene shard declares rather than sums. `SIM_CEILING` is the bytes the server reserves for
 * the shard's simulation in each cell it runs (engine `server/game/plugin/simulation.ts`), which shard-format reads as the
 * authoring ceiling `budgets.sim.resident` (`runtimeCost.ts`, scripts at their growth limit): a ceiling, so no sum of
 * critical bytes. It is also the server's `memory`. `SERVER_TICK_MICROS` is the server tick's time a scene shard may spend.
 * Later steps add their own critical bytes on top (behaviour scripts, platform sections, the authored world).
 */
export const SIM_CEILING = 16_000_000, SERVER_TICK_MICROS = 5_000;

/** AP16: what the library (AP26: or critical) roots cost with their dependencies (format asset admission's `budgets.library`
 *  and `budgets.sim` checks). */
function libraryCost(files: Shardfile['files'], roots: readonly string[]): { resident: number; compressed: number } {
  const byHash = new Map(files.map((f) => [f.hash, f])), seen = new Set<string>(), pending = [...roots];
  let resident = 0, compressed = 0;
  while (pending.length > 0) {
    const hash = pending.pop(); if (hash === undefined || seen.has(hash)) continue;
    seen.add(hash); const file = byHash.get(hash); if (file === undefined) continue;
    resident += file.decoded + file.gpu; compressed += file.compressed; pending.push(...file.dependencies);
  }
  return { resident, compressed };
}

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
        current.sway.push(merge.sway[from] ?? 0); current.swing.push(merge.swing[from] ?? 0); current.corner.push(...merge.corner.slice(from * 2, from * 2 + 2));
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
export function lampRows(lights: readonly SceneLight[], swings = false): { at: [number, number, number]; colour: [number, number, number]; intensity: number; distance: number; decay?: number; flicker?: { rate: number; amount: number }; swing?: number }[] {
  type LampRow = ReturnType<typeof lampRows>[number];
  const rows: LampRow[] = [];
  for (const l of lights) {
    if (l.kind !== 'point') continue;
    const row: LampRow = { at: [round(l.position[0], 3), round(l.position[1], 3), round(l.position[2], 3)], colour: rgb01(l.colour), intensity: round(Math.min(100, l.intensity), 3),
      distance: round(Math.min(50, Math.max(0.1, l.distance === 0 ? 50 : l.distance)), 3) };
    if (l.decay !== 2) row.decay = round(clamp01(l.decay / 2) * 2, 3);
    // AP12: the light's declared flicker, played by the engine's lamps (format `lamps[].flicker`)
    if (l.motion?.kind === 'flicker') row.flicker = { rate: round(Math.min(30, l.motion.rate), 3), amount: round(clamp01(l.motion.amount), 3) };
    // SS8d: a hung lamp's swing (numbered across the shard, or in its part for a watched part: SS8f)
    if (swings && l.swing !== undefined) row.swing = l.swing;
    rows.push(row);
  }
  return rows;
}

/** A part's `Water` surfaces as the shardfile's water rows (AP4): the outline is the Water's own geometry. */
export function waterRows(part: ScenePart): { id: string; kind: 'pool'; level: number; shape: { kind: 'polygon'; points: [number, number][] }; surface: PoolSurface }[] {
  return part.water.map((w, i) => ({
    id: `scene.${part.name}.water${i === 0 ? '' : `-${i}`}`, kind: 'pool', level: round(w.level, 3),
    shape: { kind: 'polygon', points: w.outline.map(([px, pz]) => [round(px, 3), round(pz, 3)]) },
    // AP14: the Water's own reflection and deep tint (format pool-surface, TEMPLATES-CLEANROOM M4.6): the cleanroom pond's
    // Fresnel 0.35 + 0.65 (1 - v.y)^3 and its 1024 mirror; a planar mirror shows the painted sky, a phone's sky reflection too
    surface: { reflect: w.reflect, tint: rgb01(w.tint), fresnel: [0.35, 3], ripple: { scale: 3, amplitude: 0.0022, speed: 1 }, resolution: 1024 },
  }));
}

/** The look a scene declares (AP3), over the format's day-key model fixed at one time of day. The engine sets its
 *  hemisphere light's intensity to the ambient key's (engine `dataLook.ts`), so the key is the HemisphereLight's own
 *  number (ss4d: it was x pi, a ground three times brighter than its cleanroom's). */
export function sceneLook(scene: ShardScene, lights: readonly SceneLight[], materials: Record<string, unknown>, swings: readonly SceneSwing[] = []): Shardfile['look'] {
  const directional = lights.filter((l) => l.kind === 'directional').sort((a, b) => b.intensity - a.intensity);
  const sun = directional[0], hemisphere = lights.find((l) => l.kind === 'hemisphere'), ambient = lights.find((l) => l.kind === 'ambient');
  const lamps = lights.filter((l) => l.kind === 'point').sort((a, b) => b.intensity - a.intensity).slice(0, 16);
  // the sun's heading and height from its position over its target
  const toSun = sun === undefined ? new Vector3(0.3, 1, 0.4) : new Vector3(...sun.position).sub(new Vector3(...sun.target ?? [0, 0, 0]));
  toSun.normalize();
  const elevation = Math.asin(clamp01(toSun.y)) * 180 / Math.PI, azimuth = Math.atan2(toSun.x, -toSun.z) * 180 / Math.PI;
  const fog = scene.look.fog, post = scene.look.post, sky = scene.look.sky ?? null;
  const skyColour: Rgb = hemisphere?.colour ?? ambient?.colour ?? [0.5, 0.5, 0.6], groundColour: Rgb = hemisphere?.groundColour ?? skyColour;
  const fogColour: Rgb = fog?.colour ?? scene.look.background ?? skyColour;
  return {
    families: ['pbr', 'emissive'], materials: materials as Shardfile['look']['materials'],
    ...(post?.passes === undefined || post.passes.length === 0 ? {} : { post: post.passes.map((graph) => ({ graph })) }),
    // AP14: the painted sky on the dome; the engine filters its environment from the same dome
    ...(sky === null ? {} : { sky: { graph: sky.graph } }),
    grade: { exposure: round(Math.log2(post?.exposure ?? 1), 3), saturation: 1, contrast: 1, lut: null,
      ...(post?.bloom === null || post?.bloom === undefined ? {} : { bloom: { intensity: round(Math.min(4, post.bloom.strength * 1.5), 3), threshold: round(post.bloom.threshold, 3), radius: round(clamp01(post.bloom.radius), 3) } }),
      ...(post?.tone === 'neutral' || post?.tone === 'aces' ? { tone: post.tone } : {}) },
    clock: 'engine', day: { minutes: 12, start: 0.5, maxElevation: round(Math.max(5, elevation), 2), azimuth: round(azimuth, 2) }, dayOverride: 0.5,
    keys: [{ time: 0, sky: { zenith: rgb01(skyColour), horizon: rgb01(fogColour) },
      fog: fog?.kind === 'linear' ? { colour: rgb01(fog.colour), density: 0, near: fog.near, far: fog.far } : { colour: rgb01(fogColour), density: round(fog?.kind === 'exp2' ? fog.density : 0, 5) },
      sun: { colour: rgb01(sun?.colour ?? [1, 1, 1]), intensity: round(sun?.intensity ?? 0, 3) },
      ambient: { sky: rgb01(skyColour), ground: rgb01(groundColour), intensity: round(hemisphere?.intensity ?? ambient?.intensity ?? 0.5, 3) } }],
    light: { ...(lamps.length === 0 ? {} : { lamps: lampRows(lamps, swings.length > 0) }),
      // SS8d: the hung bodies a swinging surface's `_SWING` and a lamp's `swing` name
      ...(swings.length === 0 ? {} : { swings: swings.map(({ pivot, length, rate, amount, reach }) => ({ pivot: [round(pivot[0], 3), round(pivot[1], 3), round(pivot[2], 3)], length: round(length, 3), rate: round(rate, 3), amount: round(amount, 3), reach: round(reach, 3) })) }),
      ...(sky?.environment === null || sky === null ? {} : { environment: { intensity: round(Math.min(4, sky.environment.intensity), 3), ground: rgb01(sky.environment.ground) } }) },
  } as Shardfile['look'];
}

/** A linear HDR colour as an sRGB tint (0..1) and the gain that restores it. */
function tintAndGain(colour: Rgb): { tint: [number, number, number]; gain: number } {
  const peak = Math.max(colour[0], colour[1], colour[2], 1e-6);
  return { tint: srgb01([colour[0] / peak, colour[1] / peak, colour[2] / peak]), gain: peak };
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
function materialEntry(entry: Entry): Record<string, unknown> {
  const base = baseMaterialEntry(entry);
  // SS8d: a hung surface or card turns round its swing's pivot, read per vertex from `_SWING`
  return entry.swing === true ? { ...base, swing: true } : base;
}

function baseMaterialEntry({ material, motion, card }: Entry): Record<string, unknown> {
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
  return { family: 'pbr', colour: srgb01(material.colour), roughness: round(clamp01(material.roughness), 3), metalness: round(clamp01(material.metalness), 3), vertexColours: true, ...doubleSided,
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

/** ss4d: the ground's PBR entry: its vertex colours (`colourAt`, linear) times the material's colour, lit as the cleanroom's
 *  ground mesh is; a flat cell is a plain rough surface. */
export function groundEntry(scene: Pick<ShardScene, 'ground'>): Record<string, unknown> {
  const surface = scene.ground?.surface ?? { colour: [1, 1, 1] as Rgb, roughness: 1, metalness: 0, detail: null };
  return { family: 'pbr', colour: srgb01(surface.colour), roughness: round(clamp01(surface.roughness), 3), metalness: round(clamp01(surface.metalness), 3), vertexColours: true,
    ...(surface.detail === null ? {} : { detail: surface.detail }) };
}

/** What the shardfile back end did not write, for the build log (never silent). */
export interface ShardfileReport { readonly cards: number; readonly lampsDropped: number; readonly tiles: readonly { tile: string; triangles: number; draws: number; bytes: number }[] }

/** The shardfile back end: the description in, a generated project out. Runs at compile time. */
export async function compileShardfile(scene: ShardScene, ctx: ProjectGenerationContext, options: ShardfileOptions = {}): Promise<GeneratedProject> {
  const { shard, assets, report } = await builtSceneShardfile(scene, ctx.compileScript, options);
  for (const [hash, bytes] of assets) if (ctx.asset(bytes) !== hash) throw new Error('scene: an asset hash differs from the product store');
  if (report.lampsDropped > 0) console.info(`scene: ${report.lampsDropped} point lights past the 16 brightest are not in the shardfile (AP28)`);
  // AP9a: the per-part budget table, each tier's overruns named by tile and part (reported, J338; AP8: draws are a view's)
  for (const line of budgetReport(partBudgets(scene), report.tiles)) console.info(`scene: ${line}`);
  return { shard, output: {} };
}

/**
 * `sceneShardfile` with the scene's state lane (SS-GF0): its `sets` prompts' generated script, compiled by `compile` (the
 * build's `ctx.compileScript`) and bound.
 */
export async function builtSceneShardfile(scene: ShardScene, compile: ProjectGenerationContext['compileScript'], options: ShardfileOptions = {}): Promise<{ shard: Shardfile; assets: Map<string, Uint8Array>; report: ShardfileReport }> {
  const built = sceneShardfile(scene, options), lane = await withSceneState(built.shard, scene, compile);
  if (lane === null) return built;
  built.assets.set(lane.module.hash, lane.module.bytes);
  return { ...built, shard: parseShardfile(lane.shard) };
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
  const terrain = bakeTerrain({ ...groundSource(scene), family: GROUND_MATERIAL });
  // NEW-SHARD-E2E F13: a scene's four roads are ground roads, flat across their width; say where one is not
  for (const side of ['north', 'east', 'south', 'west'] as const) checkEntryRoad(side, terrain.edge[side].heights, 3);
  for (const [hash, bytes] of terrain.assets) assets.set(hash, bytes);
  files.push(...terrain.files);

  // textures (AP2): RGBA8 KTX2, one file per painted raster
  const textureFiles = new Map<string, Shardfile['files'][number]>();
  // only the textures a drawn material or a card samples
  const sampled = new Set([...scene.parts.flatMap((part) => [...part.draws.map((d) => d.material), ...part.sprites.map((c) => c.material), ...part.points.map((c) => c.material)]), ...(scene.details ?? []).map((layer) => layer.material)]
    .map((key) => scene.materials[key]?.map).filter((key) => typeof key === 'string'));
  for (const texture of Object.values(scene.textures).filter((t) => sampled.has(t.key))) {
    const bytes = bakeRawColourPixels({ width: texture.width, height: texture.height, pixels: new Uint8ClampedArray(texture.rgba) }, { colourSpace: texture.colourSpace });
    textureFiles.set(texture.key, store(bytes, 'ktx2'));
  }
  // static parts (AP2): merged per entry (a material and the motion its draws declare) per tile
  const draws = scene.parts.filter((part) => part.panel === undefined).flatMap((part) => part.draws), byEntry = new Map<string, SceneDraw[]>(), entries = new Map<string, Entry>();
  const entryOf = (material: string, motion: SceneMotion | null, card = false, swing = false): string | null => {
    const found = scene.materials[material]; if (found === undefined) return null;
    const key = entryKey(material, motion, card, swing); if (!entries.has(key)) entries.set(key, { material: found, motion, card, ...(swing ? { swing } : {}) }); return key;
  };
  // SS8d: every part's hung bodies, numbered across the shard; a draw, card or lamp's channel is its number + 1
  const { swings, swingBase } = shardSwings(scene.parts);
  const swingChannel = new Map<SceneDraw, number>();
  for (const part of scene.parts) for (const draw of part.draws) if (draw.swing !== undefined) swingChannel.set(draw, (swingBase.get(part) ?? 0) + draw.swing + 1);
  const instanced = new Map<string, InstancedGroup[]>();
  for (const draw of draws) {
    const key = entryOf(draw.material, draw.motion, false, draw.swing !== undefined); if (key === null) continue;
    // AP15: a still InstancedMesh stays instanced, its copies in the tiles of their seats
    const groups = draw.motion === null && draw.swing === undefined && (draw.instances?.count ?? 0) >= INSTANCE_MIN ? instanceGroups(key, draw, scene) : null;
    if (groups !== null) { for (const [tile, group] of groups) { const list = instanced.get(tile) ?? []; list.push(group); instanced.set(tile, list); } continue; }
    const list = byEntry.get(key) ?? []; list.push(draw); byEntry.set(key, list);
  }
  const tiles = new Map<string, Map<string, Merge>>();
  for (const [key, list] of byEntry) mergeDraws(key, list, scene, tiles, (draw) => swingChannel.get(draw) ?? 0);
  // cards (AP11): every sprite and every point a camera-facing quad in its seat's tile
  let cards = 0;
  for (const part of scene.parts) {
    for (const sprite of part.sprites) {
      const key = entryOf(sprite.material, sprite.motion, true, sprite.swing !== undefined); if (key === null) continue;
      appendCard(key, sprite.position, sprite.scale, sprite.center, tiles, sprite.swing === undefined ? 0 : (swingBase.get(part) ?? 0) + sprite.swing + 1); cards++;
    }
    for (const cloud of part.points) {
      const key = entryOf(cloud.material, cloud.motion, true), size = (scene.materials[cloud.material]?.pointSize ?? 0) * POINT_CARD; if (key === null) continue;
      for (let i = 0; i < cloud.positions.length; i += 3) { appendCard(key, [cloud.positions[i] ?? 0, cloud.positions[i + 1] ?? 0, cloud.positions[i + 2] ?? 0], [size, size], [0.5, 0.5], tiles); cards++; }
    }
  }
  // AP16: each panel part's entries, merged whole (the tile split only cuts its triangles; the panel is one GLB)
  const panelParts = scene.parts.filter((part) => part.panel !== undefined).map((part) => {
    const merges = new Map<string, Map<string, Merge>>(), shadows = new Map<string, boolean>(), byKey = new Map<string, SceneDraw[]>();
    for (const draw of part.draws) {
      const key = entryOf(draw.material, draw.motion); if (key === null) continue;
      const list = byKey.get(key) ?? []; list.push(draw); byKey.set(key, list); shadows.set(key, (shadows.get(key) ?? false) || draw.castShadow);
    }
    for (const [key, list] of byKey) mergeDraws(key, list, scene, merges);
    return { id: part.panel ?? part.name, merges, shadows };
  });
  const names = new Map<string, string>(), glbNames = new Map([...entries].map(([key, entry]) => [key, glbName({ ...entry.material, key, name: entry.card || entry.motion !== null ? `${entry.material.name}-${key.slice(entry.material.key.length + 1)}` : entry.material.name }, names)]));
  const casts = new Map<string, boolean>(); for (const draw of draws) { const key = entryKey(draw.material, draw.motion, false, draw.swing !== undefined); casts.set(key, (casts.get(key) ?? false) || draw.castShadow); }
  const lookMaterials: Record<string, unknown> = {}, propMaterials: Record<string, unknown> = {};
  for (const [key, entry] of entries) {
    const name = glbNames.get(key) ?? key, file = entry.material.map === null ? undefined : textureFiles.get(entry.material.map);
    lookMaterials[lookId(key)] = materialEntry(entry);
    propMaterials[name] = { id: lookId(key), ...(file === undefined ? {} : { colour: { file: file.hash, wrapS: 10497, wrapT: 10497, minFilter: 9987, magFilter: 9729, anisotropy: 4 } }) };
  }
  lookMaterials[GROUND_MATERIAL] = groundEntry(scene);
  // AP32c: detail layers: the card, mask and heights as plain binary files (engine G649: never base64), the card's own look
  // entry (no vertex colours: the cards have none, the engine tints each clump)
  const binary = (bytes: Uint8Array, gpu: number, triangles: number): string => {
    const hash = hashImmutableBytes(bytes);
    if (!assets.has(hash)) { assets.set(hash, bytes); files.push({ hash, kind: 'binary', compressed: bytes.length, decoded: bytes.length, gpu, triangles, draws: triangles > 0 ? 1 : 0, dependencies: [], critical: false }); }
    return hash;
  };
  const detailTextures = new Set<string>();
  const details = (scene.details ?? []).map((layer) => {
    const material = scene.materials[layer.material], geometry = scene.geometries[layer.geometry];
    if (material === undefined || geometry === undefined) throw new SceneRefusalError(layer.path, 'its card did not lower', 'Give world.detail an InstancedMesh with a geometry and a MeshStandardMaterial');
    const look = lookId(`${layer.material}.detail`);
    const entry = materialEntry({ material, motion: null, card: false });
    entry['vertexColours'] = false;
    // AP32d: a textured card's map is its look entry's colour map (a library KTX2, as the tiles' own), its uvs carrying the
    // map's repeat and offset as a tile merge's do
    const map = material.map === null ? undefined : textureFiles.get(material.map);
    if (map !== undefined) { entry['maps'] = { colour: map.hash, normal: null, orm: null }; detailTextures.add(map.hash); }
    lookMaterials[look] = entry;
    const mesh = detailMeshFile(geometry, material), { region } = layer;
    const faults = detailFileFaults({ id: layer.id, mesh: { file: '', vertices: mesh.vertices, triangles: mesh.triangles }, region }, { mesh: mesh.bytes, mask: layer.mask, heights: layer.heights });
    if (faults.length > 0) throw new SceneRefusalError(layer.path, faults.join('; '), 'Report this: the sdk wrote a detail file the format refuses');
    const row: Record<string, unknown> = {
      id: layer.id, material: look, mesh: { file: binary(mesh.bytes, mesh.bytes.length, mesh.triangles), vertices: mesh.vertices, triangles: mesh.triangles },
      region: { corner: [round(region.corner[0], 3), round(region.corner[1], 3)], cell: region.cell, columns: region.columns, rows: region.rows, span: [round(region.span[0], 3), round(region.span[1], 3)] },
      mask: binary(layer.mask, 0, 0), heights: binary(layer.heights, 0, 0), clumps: layer.clumps,
      scale: [round(layer.scale[0], 3), round(layer.scale[1], 3)], tilt: round(clamp01(layer.tilt), 3), tint: [srgb01(layer.tint[0]), srgb01(layer.tint[1])],
      radius: layer.radius, shadow: layer.shadow,
    };
    if (layer.sway !== null) row['sway'] = { amount: round(clamp01(layer.sway.amount), 3), rate: round(layer.sway.rate, 3) };
    return row as { mesh: { file: string }; mask: string; heights: string };
  });
  const shardTiles = terrain.tiles.map((t) => ({ ...t, files: [...t.files], bounds: { min: [...t.bounds.min] as [number, number, number], max: [...t.bounds.max] as [number, number, number] } }));
  const propTiles: { lod: 0 | 1; x: number; z: number; file: string }[] = [], tileReport: { tile: string; triangles: number; draws: number; bytes: number }[] = [];
  const addresses = [...new Set([...tiles.keys(), ...instanced.keys()])].sort((a, b) => a.localeCompare(b));
  for (const address of addresses) {
    const merges = tiles.get(address) ?? new Map<string, Merge>();
    const [x = 0, z = 0] = address.split('/').map(Number);
    const primitives: GlbPrimitive[] = [], dependencies = new Set<string>(), drawn = new Box3();
    for (const [key, merge] of [...merges].sort(([p], [q]) => p.localeCompare(q))) {
      const entry = entries.get(key), material = entry?.material; if (entry === undefined || material === undefined || merge.position.length === 0) continue;
      for (const primitive of primitivesOf(merge, entry, glbNames.get(key) ?? key, casts.get(key) ?? true)) {
        primitives.push(primitive);
        // a card draws past its seats by its corners and its rise: the tile's drawn box holds that reach
        const corner = primitive.geometry.getAttribute('corner');
        if (entry.card && corner !== undefined) {
          const geometry = primitive.geometry; geometry.computeBoundingBox(); let reach = 0; for (const c of corner.array) reach = Math.max(reach, Math.abs(c));
          const motion = entry.motion; if (motion?.kind === 'rise') reach += motion.height + motion.spread; else if (motion?.kind === 'drift') reach += motion.radius;
          if (geometry.boundingBox !== null) drawn.union(geometry.boundingBox.clone().expandByScalar(reach));
        }
      }
      const file = material.map === null ? undefined : textureFiles.get(material.map); if (file !== undefined) dependencies.add(file.hash);
    }
    for (const primitive of primitives) { primitive.geometry.computeBoundingBox(); if (primitive.geometry.boundingBox !== null) drawn.union(primitive.geometry.boundingBox); }
    // AP15: the tile's instance groups, at most INSTANCE_CAP copies a node
    for (const group of instanced.get(address) ?? []) {
      const entry = entries.get(group.key), material = entry?.material; if (entry === undefined || material === undefined) continue;
      const groupMaterial = glbMaterial(glbNames.get(group.key) ?? group.key, material);
      for (let from = 0; from < group.matrices.length; from += INSTANCE_CAP) {
        const colours = group.colours?.slice(from, from + INSTANCE_CAP);
        primitives.push({ geometry: group.geometry, material: groupMaterial, castShadow: group.castShadow, instances: group.matrices.slice(from, from + INSTANCE_CAP), ...(colours === undefined ? {} : { instanceColours: colours }) });
      }
      drawn.union(group.box);
      const file = material.map === null ? undefined : textureFiles.get(material.map); if (file !== undefined) dependencies.add(file.hash);
    }
    if (primitives.length === 0) continue;
    // a GLB holds at most 25 MB (shard-format glbCost): batch the primitives into as many files as the tile needs
    const batches: GlbPrimitive[][] = []; let batch: GlbPrimitive[] = [], bytes = 0;
    for (const primitive of primitives) {
      const size = glbBytes(primitive);
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
    if (!drawn.isEmpty()) {
      tile.bounds.min[1] = Math.min(tile.bounds.min[1], drawn.min.y); tile.bounds.max[1] = Math.max(tile.bounds.max[1], drawn.max.y);
      // AP15: an instanced copy is whole in its seat's tile, so it may hang over the tile's edge: its draw bounds say so
      if (drawn.min.x < tile.bounds.min[0] || drawn.min.z < tile.bounds.min[2] || drawn.max.x > tile.bounds.max[0] || drawn.max.z > tile.bounds.max[2]) {
        const low = (v: number): number => Math.max(-HALF - OVERHANG, Math.floor(v * 1000) / 1000), high = (v: number): number => Math.min(HALF + OVERHANG, Math.ceil(v * 1000) / 1000);
        tile.drawBounds = { min: [low(Math.min(tile.bounds.min[0], drawn.min.x)), tile.bounds.min[1], low(Math.min(tile.bounds.min[2], drawn.min.z))],
          max: [high(Math.max(tile.bounds.max[0], drawn.max.x)), tile.bounds.max[1], high(Math.max(tile.bounds.max[2], drawn.max.z))] };
      }
    }
    const row = { triangles: rows.reduce((n, f) => n + f.triangles, 0), draws: rows.reduce((n, f) => n + f.draws, 0), compressed: rows.reduce((n, f) => n + f.compressed, 0) };
    tileReport.push({ tile: `0/${x}/${z}`, triangles: row.triangles, draws: row.draws, bytes: row.compressed });
  }
  // AP9c: each L1 tile carries a simplified copy of its four fine tiles' still meshes and of their larger instanced shapes;
  // cards and moving entries stay near-only. The engine draws an L1 tile where its fine tiles are not resident.
  const coarseShapes = new Map<BufferGeometry, BufferGeometry>(), coarseFiles = new Set<string>();
  const coarseShape = (geometry: BufferGeometry): BufferGeometry => {
    const found = coarseShapes.get(geometry); if (found !== undefined) return found;
    const simplified = compacted(coarseGeometry(geometry, COARSE_RATIO, COARSE_ERROR, { sloppy: true }));
    // a shape simplified to nothing keeps its own geometry (an empty GLB accessor is refused)
    const made = (simplified.getIndex()?.count ?? 0) === 0 ? geometry : simplified; coarseShapes.set(geometry, made); return made;
  };
  for (let x = 0; x < 4; x++) for (let z = 0; z < 4; z++) {
    const children = [[0, 0], [0, 1], [1, 0], [1, 1]].map(([dx = 0, dz = 0]) => `${String(x * 2 + dx)}/${String(z * 2 + dz)}`);
    const byKey = new Map<string, Merge>();
    for (const child of children) {
      for (const [key, merge] of [...(tiles.get(child) ?? new Map<string, Merge>())].sort(([p], [q]) => p.localeCompare(q))) {
        const entry = entries.get(key); if (entry === undefined || entry.card || entry.motion !== null || merge.position.length === 0) continue;
        const whole = byKey.get(key) ?? emptyMerge(); appendMerge(whole, merge); byKey.set(key, whole);
      }
    }
    const primitives: GlbPrimitive[] = [], dependencies = new Set<string>(), drawn = new Box3();
    for (const [key, merge] of [...byKey].sort(([p], [q]) => p.localeCompare(q))) {
      const entry = entries.get(key); if (entry === undefined) continue;
      for (const primitive of primitivesOf(merge, entry, glbNames.get(key) ?? key, false)) {
        const geometry = compacted(coarseGeometry(primitive.geometry, COARSE_RATIO, COARSE_ERROR, { sloppy: true }));
        if ((geometry.getIndex()?.count ?? 0) === 0) continue;
        primitives.push({ ...primitive, geometry });
      }
      const file = entry.material.map === null ? undefined : textureFiles.get(entry.material.map); if (file !== undefined) dependencies.add(file.hash);
    }
    for (const child of children) for (const group of instanced.get(child) ?? []) {
      const entry = entries.get(group.key); if (entry === undefined) continue;
      group.geometry.computeBoundingBox(); const box = group.geometry.boundingBox;
      if (box === null || box.max.x - box.min.x < COARSE_MIN_SIZE && box.max.y - box.min.y < COARSE_MIN_SIZE && box.max.z - box.min.z < COARSE_MIN_SIZE) continue;
      const geometry = coarseShape(group.geometry), material = glbMaterial(glbNames.get(group.key) ?? group.key, entry.material);
      for (let from = 0; from < group.matrices.length; from += INSTANCE_CAP) {
        const colours = group.colours?.slice(from, from + INSTANCE_CAP);
        primitives.push({ geometry, material, castShadow: false, instances: group.matrices.slice(from, from + INSTANCE_CAP), ...(colours === undefined ? {} : { instanceColours: colours }) });
      }
      drawn.union(group.box);
      const file = entry.material.map === null ? undefined : textureFiles.get(entry.material.map); if (file !== undefined) dependencies.add(file.hash);
    }
    if (primitives.length === 0) continue;
    for (const primitive of primitives) if (primitive.instances === undefined) { primitive.geometry.computeBoundingBox(); if (primitive.geometry.boundingBox !== null) drawn.union(primitive.geometry.boundingBox); }
    const size = primitives.reduce((n, primitive) => n + glbBytes(primitive), 0);
    if (size > 18_000_000) throw new Error(`scene: the generated L1 tile 1/${String(x)}/${String(z)} is ${(size / 1e6).toFixed(1)} MB, over the 18 MB one GLB holds (AP9c)`);
    for (const hash of dependencies) coarseFiles.add(hash);
    const row = store(staticGlb(primitives, `scene.l1.${String(x)}.${String(z)}`), 'glb', [...dependencies].sort());
    propTiles.push({ lod: 1, x, z, file: row.hash });
    const tile = shardTiles.find((t) => t.lod === 1 && t.x === x && t.z === z);
    if (tile === undefined) throw new Error(`scene: no terrain tile 1/${String(x)}/${String(z)}`);
    const textures = [...dependencies].map((hash) => files.find((f) => f.hash === hash)).filter((f) => f !== undefined);
    tile.files.push(row.hash, ...textures.map((f) => f.hash).filter((hash) => !tile.files.includes(hash)));
    tile.compressed += row.compressed + textures.reduce((n, f) => n + f.compressed, 0); tile.decoded += row.decoded + textures.reduce((n, f) => n + f.decoded, 0);
    tile.gpu += row.gpu + textures.reduce((n, f) => n + f.gpu, 0); tile.triangles += row.triangles; tile.draws += row.draws;
    if (!drawn.isEmpty()) {
      tile.bounds.min[1] = Math.min(tile.bounds.min[1], drawn.min.y); tile.bounds.max[1] = Math.max(tile.bounds.max[1], drawn.max.y);
      // an instanced copy is whole in its seat's tile, so it may hang over the L1 tile's edge: its draw bounds say so
      if (drawn.min.x < tile.bounds.min[0] || drawn.min.z < tile.bounds.min[2] || drawn.max.x > tile.bounds.max[0] || drawn.max.z > tile.bounds.max[2]) {
        const low = (v: number): number => Math.max(-HALF - OVERHANG, Math.floor(v * 1000) / 1000), high = (v: number): number => Math.min(HALF + OVERHANG, Math.ceil(v * 1000) / 1000);
        tile.drawBounds = { min: [low(Math.min(tile.bounds.min[0], drawn.min.x)), tile.bounds.min[1], low(Math.min(tile.bounds.min[2], drawn.min.z))],
          max: [high(Math.max(tile.bounds.max[0], drawn.max.x)), tile.bounds.max[1], high(Math.max(tile.bounds.max[2], drawn.max.z))] };
      }
    }
  }
  // panels (AP16): one library GLB each, its texture slots as dependencies
  const panels = panelParts.map(({ id, merges, shadows }) => {
    const primitives: GlbPrimitive[] = [], dependencies = new Set<string>();
    // the panel is one GLB: a material's triangles in every tile it crosses are one merge again, so one draw, not one a tile
    const byKey = new Map<string, Merge>();
    for (const [, tile] of [...merges].sort(([a], [b]) => a.localeCompare(b))) {
      for (const [key, merge] of [...tile].sort(([a], [b]) => a.localeCompare(b))) { const whole = byKey.get(key); if (whole === undefined) byKey.set(key, merge); else appendMerge(whole, merge); }
    }
    for (const [key, merge] of [...byKey].sort(([a], [b]) => a.localeCompare(b))) {
      const entry = entries.get(key); if (entry === undefined || merge.position.length === 0) continue;
      primitives.push(...primitivesOf(merge, entry, glbNames.get(key) ?? key, shadows.get(key) ?? true));
      const file = entry.material.map === null ? undefined : textureFiles.get(entry.material.map); if (file !== undefined) dependencies.add(file.hash);
    }
    if (primitives.length === 0) throw new SceneRefusalError(id, 'a panel part draws nothing', 'Give the panel part a visible mesh, or drop its panel option');
    // a panel loads with the shard (the library) and a far (L1) tile may not depend on the library (format asset admission's
    // `coarse dependency on library`): say which panel, not the format's bare line (SS9e: Mossgate's crate borrowed the yard's wood)
    if ([...dependencies].some((hash) => coarseFiles.has(hash))) throw new SceneRefusalError(id, 'a panel part shares a texture with the far (L1) tiles', 'Give the panel part its own textured material, or an untextured one');
    // a panel is one library file (format props `panels[].file`), and a GLB holds at most 25 MB: the tiles' 18 MB batch is
    // not open to it, so a panel past that is refused here, by name, not at admission
    const size = primitives.reduce((n, primitive) => n + glbBytes(primitive), 0);
    if (size > 18_000_000) throw new SceneRefusalError(id, `a panel part's mesh is ${(size / 1e6).toFixed(1)} MB, over the 18 MB a panel GLB holds`, 'Split it into smaller panel parts, or drop detail from its meshes');
    return { id, file: store(staticGlb(primitives, `scene.panel.${id}`), 'glb', [...dependencies].sort()).hash, visible: true };
  });
  // AP32c: a detail layer's three files load with the shard (the charged library), not per tile
  // ONE-FORMAT CC24: a world.creature's rig GLB and its skin file (the skin loads with the shard: the library)
  const creatures = scene.creatures ?? [];
  const json = (bytes: Uint8Array, dependencies: string[]): string => {
    const hash = hashImmutableBytes(bytes);
    if (!assets.has(hash)) { assets.set(hash, bytes); files.push({ hash, kind: 'json', compressed: bytes.length, decoded: bytes.length * 2, gpu: 0, triangles: 0, draws: 0, dependencies, critical: false }); }
    return hash;
  };
  // OF27b: a skin file depends on its GLB, then its material's textures (format `skinFileDependencies`)
  const skinFile = (bytes: Uint8Array): string => {
    const { row, binding } = parseSkinFile(bytes);
    return json(bytes, skinFileDependencies(row, binding));
  };
  const skins = creatures.flatMap((creature) => {
    store(creature.glb, 'glb');
    if (creature.files === undefined) return [skinFile(creature.skin)];
    for (const glb of creature.files.glbs) store(glb, 'glb');
    for (const texture of creature.files.textures) store(texture, 'ktx2');
    const variants = creature.files.skins.map(skinFile), skin = skinFile(creature.skin);
    return [skin, json(creature.files.table, [...new Set([skin, ...variants])].sort())];
  });
  const library = [...panels.map((panel) => panel.file), ...details.flatMap((row) => [row.mesh.file, row.mask, row.heights]), ...[...detailTextures].sort(), ...skins];
  // colliders (AP4); a panel part's solids are its panel's one collider (AP16)
  // SS9d: a touchable panel is its own body (format `props.bodies`): its solids are the body, never a static collider
  const bodies = scene.parts.flatMap((part) => part.touch === undefined || part.panel === undefined ? [] : [{
    id: part.panel, panel: part.panel, at: { x: part.touch.at[0], y: part.touch.at[1], z: part.touch.at[2] }, yaw: 0, shape: part.touch.shape, material: part.touch.material,
    ...(part.touch.density === undefined ? {} : { density: part.touch.density }), ...(part.touch.friction === undefined ? {} : { friction: part.touch.friction }),
    ...(part.touch.restitution === undefined ? {} : { restitution: part.touch.restitution }),
    ...(part.touch.damping === undefined ? {} : { linearDamping: part.touch.damping, angularDamping: part.touch.damping }) }]);
  // SS-GF2a: a mover panel's solids ride its track (format `movers`), never a static collider
  const tracks = scene.parts.flatMap((part) => part.move === undefined || part.panel === undefined ? [] : [{ id: part.panel, move: part.move }])
    .map(({ id, move }, i) => moverRow(id, move, MOVER_ENTITY_BASE + i));
  // SS-MS2a4: a vehicle panel is a native steer carry after the track movers, its entity next in line
  const movers = [...tracks, ...scene.parts.flatMap((part) => part.vehicle === undefined || part.panel === undefined ? [] : [{ id: part.panel, vehicle: part.vehicle }])
    .map(({ id, vehicle }, i) => vehicleRow(id, vehicle, MOVER_ENTITY_BASE + tracks.length + i))];
  // SS-GF1a2: a part a player's own field shows (their socket) has no collider: one collider stands for every player
  const playerFields = new Set((scene.anchored.writes ?? []).filter((w) => w.scope === 'player').map((w) => w.field));
  // SS-GP5: a vehicle's solids are its hull, its panel's row written inactive (a carry channel holds no boxes in the format):
  // engine 3165a100 rides it with the vehicle (`vehicleHulls`), and an engine before that leaves it off rather than stand a
  // static copy where it parks
  const colliders = scene.parts.filter((part) => part.colliders.length > 0 && part.touch === undefined && part.move === undefined && !(part.shownWhen !== undefined && playerFields.has(part.shownWhen.field))).map((part) => ({ id: part.panel ?? `scene.${part.name}`, panel: part.panel ?? null, initialActive: part.vehicle === undefined, shapes: part.colliders.map(boxRow) }));
  // water (AP4)
  const water = scene.parts.flatMap(waterRows);
  // SS8d: a hung lamp names its swing by its number across the shard
  const lights = scene.parts.flatMap((part) => part.lights.map((light) => light.swing === undefined ? light : { ...light, swing: (swingBase.get(part) ?? 0) + light.swing }));
  const base = emptyShardfile({ slug: scene.identity.slug, name: scene.identity.name, author: scene.identity.author ?? 'Wildshard', revision: scene.identity.revision ?? 1, seed: scene.identity.seed ?? 1 });
  const [sx, sy, sz] = scene.spawn.position;
  const spawnY = Math.max(sy, (ground?.heightAt(sx, sz) ?? 0) + 1);
  const product = {
    ...base, budgets: { ...base.budgets, library: libraryCost(files, library), sim: { resident: SIM_CEILING, compressed: libraryCost(files, terrain.critical).compressed } },
    serverBudget: { ...base.serverBudget, tickMicros: SERVER_TICK_MICROS, memory: SIM_CEILING },
    look: { ...sceneLook(scene, lights, lookMaterials, swings), ...(details.length === 0 ? {} : { details }) }, spawn: { x: round(sx, 3), y: round(spawnY, 3), z: round(sz, 3), yaw: round(scene.spawn.yaw, 4) },
    terrain: { ...terrain.terrain, shadow: { cast: true, receive: true }, follow: 5 }, tiles: shardTiles, files: files.sort((a, b) => a.hash.localeCompare(b.hash)), edge: terrain.edge,
    critical: [...terrain.critical], far: null, library: [...base.library, ...library],
    props: { version: 1, family: 'pbr', overhang: OVERHANG, tiles: propTiles, panels, models: [], far: null, textures: [], colliders, ...(bodies.length === 0 ? {} : { bodies }), ...(Object.keys(propMaterials).length === 0 ? {} : { materials: propMaterials }) },
    ...(water.length === 0 ? {} : { water }),
    ...(movers.length === 0 ? {} : { movers }),
    // NEW-SHARD-E2E F23: a player starts with a weapon, so a scene shard's creatures can be fought; `extend` may replace it
    items: STARTER_ITEMS,
    ...(creatures.length === 0 ? {} : { rows: { ...base.rows, species: [...base.rows.species, ...creatures.map((c) => c.species)], looks: [...base.rows.looks, ...creatures.map((c) => c.look)] } }),
  };
  // oxlint-disable-next-line unicorn/prefer-structured-clone -- JSON wire normalization (signed zero), as product.ts does
  let shard = parseShardfile(JSON.parse(JSON.stringify(product)));
  if (options.extend !== undefined) shard = options.extend(shard);
  shard = withAnchored(shard, scene.anchored);
  return { shard, assets, report: { cards, lampsDropped: Math.max(0, lights.filter((l) => l.kind === 'point').length - 16), tiles: tileReport } };
}

/**
 * SS-GF2a: one mover part as a format `movers` row: a native platform on a track driver, its rest at the centre of its
 * bounds, its boxes about that, and its keys spaced by distance so it keeps one speed along the path.
 */
export function moverRow(id: string, move: SceneMove, entity: number): Record<string, unknown> {
  const [ax, ay, az] = move.at, rest = { at: { x: ax, y: ay, z: az }, euler: { x: 0, y: 0, z: 0 } };
  const legs = move.path.slice(1).map((p, i) => Math.hypot(...p.map((n, k) => n - (move.path[i]?.[k] ?? n))));
  const total = legs.reduce((a, b) => a + b, 0);
  let run = 0;
  const times = [0, ...legs.map((leg) => { run += leg; return Math.round(run / total * move.seconds * 1e4) / 1e4; })];
  times[times.length - 1] = move.seconds;
  // a leg too short for its share of the time to show at 0.1 ms would key two points at one time
  if (times.some((t, i) => i > 0 && t <= (times[i - 1] ?? t))) throw new SceneRefusalError(id, 'a mover\'s path has a leg too short beside the rest', 'Drop the point that nearly repeats its neighbour');
  const motion: MoverMotion = {
    driver: { kind: 'track' }, trigger: move.start === 'always' ? { kind: 'always' } : { kind: 'stand', delay: 0 },
    track: { clip: 'ride', duration: move.seconds, loop: move.loop, speed: 1, times, position: move.path.map(([x, y, z]): [number, number, number] => [x, y, z]) },
  };
  const boxes = move.boxes.map((b) => ({ x: b.x, y: b.y, z: b.z, hx: b.hx, hy: b.hy, hz: b.hz, rot: { x: b.rot[0], y: b.rot[1], z: b.rot[2], w: b.rot[3] } }));
  return { id, entity, kind: 'platform', ...rest, enabled: true, boxes, ...lowerMoverMotion(motion, rest), ...motion, execution: 'native' };
}

/**
 * SS-MS2a4: one vehicle part as a format `movers` row: a native carry `channel` with a `steer` driver (engine SS-MS2a1b),
 * boarded and left by its two prompts, which ride with it in its own frame (x right, z back), as its landing does: the rider
 * steps off beside it. Its rest is the base of its bounds, so a ground follower stands on the floor it finds.
 */
export function vehicleRow(id: string, vehicle: SceneVehicle, entity: number): Record<string, unknown> {
  const [ax, ay, az] = vehicle.at, rest = { at: { x: ax, y: ay, z: az }, euler: { x: 0, y: vehicle.heading, z: 0 } };
  const motion: MoverMotion = { trigger: { kind: 'interact', permission: 0 }, driver: { kind: 'steer', speed: vehicle.speed, turn: vehicle.turn,
    boost: vehicle.boost, accel: vehicle.accel, ground: vehicle.ground, ...(vehicle.wind === undefined ? {} : { wind: { toward: [vehicle.wind.toward[0], vehicle.wind.toward[1]], push: vehicle.wind.push } }) } };
  const step = round(vehicle.side + 1);
  const carry = {
    seat: vehicle.seat, landings: [[step, 0, 0], [-step, 0, 0]], yaw: 0,
    surface: { level: 0, bankRamp: 0, bob: [0, 0], pitch: [0, 0], roll: [0, 0, 0] },
    // board from beside it on foot; leave from the seat, where the rider's eyes are
    prompts: [{ at: [0, 1, 0], radius: round(Math.min(10, Math.max(vehicle.side, vehicle.reach) + 2)), label: vehicle.board },
      { at: [0, round(vehicle.seat + 1.2), 0], radius: 2, label: vehicle.leave }],
  };
  return { id, entity, kind: 'channel', ...rest, enabled: true, boxes: [], ...lowerMoverMotion(motion, rest), ...motion, carry, execution: 'native' };
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

/**
 * AP25: the scene's anchored rows merged into the sections `extend` wrote (`quests.triggers`, `targets.interactions`), after
 * it, so an `extend` that replaces `quests` keeps them. An id `extend` already declares is refused: one place, one row.
 */
export function withAnchored<T extends { quests?: unknown; targets?: unknown; creatures?: unknown }>(shard: T, anchored: ShardScene['anchored']): T {
  const races = anchored.races ?? [], spawns = anchored.spawns ?? [];
  if (anchored.triggers.length === 0 && anchored.interactions.length === 0 && races.length === 0 && spawns.length === 0) return shard;
  const quests = (shard.quests ?? { flags: [], quests: [], triggers: [], dialogue: [] }) as { flags?: readonly string[]; triggers?: readonly { id: string }[]; races?: readonly { id: string }[] };
  // a trigger's flag is a quest flag: declare the ones `extend` did not (review SHOULD 4)
  const flags = [...quests.flags ?? []]; for (const t of anchored.triggers) if (!flags.includes(t.flag)) flags.push(t.flag);
  // SS-GF1a1b: so is a pickup's
  const raised = (anchored.pickups ?? []).flatMap((p) => p.flag === undefined || flags.includes(p.flag) ? [] : [p.flag]);
  for (const flag of raised) if (!flags.includes(flag)) flags.push(flag);
  // SS-MS1b: and a race's two, and its resets (SS-MS1c)
  const timed = races.flatMap((r) => [r.start, r.stop, ...r.resets ?? []]).filter((flag) => !flags.includes(flag));
  for (const flag of timed) if (!flags.includes(flag)) flags.push(flag);
  const targets = (shard.targets ?? { panels: [], interactions: [] }) as { interactions?: readonly { id: string }[] };
  const twice = (rows: readonly { id: string }[], added: readonly { id: string }[], what: string): void => {
    const taken = new Set(rows.map((row) => row.id)), clash = added.find((row) => taken.has(row.id));
    if (clash !== undefined) throw new SceneRefusalError(clash.id, `extend declares ${what} ${clash.id} too`, `Declare it once: drop the row from extend, or rename the scene's`);
  };
  // OF28d: world.spawnAt's rows join the creature spawns `extend` wrote
  const creatures = (shard.creatures ?? { brains: [], groups: [], spawns: [] }) as { spawns?: readonly { id: string }[] };
  twice(creatures.spawns ?? [], spawns, 'spawn');
  twice(quests.triggers ?? [], anchored.triggers, 'trigger'); twice(quests.races ?? [], races, 'race'); twice(targets.interactions ?? [], anchored.interactions, 'interaction');
  return {
    ...shard,
    ...(anchored.triggers.length === 0 && raised.length === 0 && races.length === 0 ? {} : { quests: { ...quests, flags, triggers: [...quests.triggers ?? [], ...anchored.triggers],
      ...(races.length === 0 ? {} : { races: [...quests.races ?? [], ...races] }) } }),
    ...(anchored.interactions.length === 0 ? {} : { targets: { ...targets, interactions: [...targets.interactions ?? [], ...anchored.interactions] } }),
    ...(spawns.length === 0 ? {} : { creatures: { ...creatures, spawns: [...creatures.spawns ?? [], ...spawns] } }),
  };
}

/**
 * AP32c: a detail card in the format's mesh file layout (`look-details-bytes.ts`): f32 positions, normals and uvs (zero
 * when the card has none), then u16 indices (in order when it has no index).
 */
export function detailMeshFile(geometry: SceneGeometry, material?: Pick<SceneMaterial, 'repeat' | 'offset'>): { bytes: Uint8Array; vertices: number; triangles: number } {
  const vertices = geometry.position.length / 3, triangles = geometry.triangles;
  const indices = Uint16Array.from(geometry.index ?? Array.from({ length: triangles * 3 }, (_, i) => i));
  const floats = new Float32Array(vertices * 8);
  floats.set(geometry.position, 0); floats.set(geometry.normal, vertices * 3);
  if (geometry.uv !== null) {
    const [ru, rv] = material?.repeat ?? [1, 1], [ou, ov] = material?.offset ?? [0, 0];
    for (let at = 0; at < vertices; at++) { floats[vertices * 6 + at * 2] = (geometry.uv[at * 2] ?? 0) * ru + ou; floats[vertices * 6 + at * 2 + 1] = (geometry.uv[at * 2 + 1] ?? 0) * rv + ov; }
  }
  const bytes = new Uint8Array(detailMeshBytes(vertices, triangles));
  bytes.set(new Uint8Array(floats.buffer), 0); bytes.set(new Uint8Array(indices.buffer), floats.byteLength);
  return { bytes, vertices, triangles };
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

/** SS8d: every part's hung bodies in one list (format `look.light.swings`, at most 32), and where each part's rows start. */
export function shardSwings(parts: readonly ScenePart[]): { swings: SceneSwing[]; swingBase: Map<ScenePart, number> } {
  const swings: SceneSwing[] = [], swingBase = new Map<ScenePart, number>();
  for (const part of parts) { swingBase.set(part, swings.length); swings.push(...(part.swings ?? [])); }
  if (swings.length > 32) throw new SceneRefusalError(swings[32]?.path ?? 'scene', `the shard hangs ${swings.length} bodies, over the 32 a look swings`, 'Hang fewer lanterns, or hang several from one group');
  return { swings, swingBase };
}
