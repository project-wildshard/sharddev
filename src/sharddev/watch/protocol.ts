import type { SceneGeometry, ScenePart, ShardScene } from '../scene/description';

/**
 * SHARD-SOURCE AP5 (J347): the `wildshard watch` protocol, all of it sharddev's. The watch server pushes one `WatchState`
 * per revision over a WebSocket; the page script (`page.ts`, injected into the page `watch` serves) fetches the parts whose
 * hash changed, and only the geometry and rasters it lacks, then drives engine's dev hook. Engine knows none of this: it
 * holds only the hook (`src/client/game/devScene/hook.ts`), whose version is `DEV_HOOK_VERSION` below.
 *
 *   WS  /__wildshard_scene/socket          one `WatchState` (JSON) per revision, the first on connect
 *   GET /__wildshard_scene/part/<name>     one `WatchPart` (JSON)
 *   GET /__wildshard_scene/geometry/<key>  one geometry (`encodeGeometry`), immutable by key
 *   GET /__wildshard_scene/texture/<key>   one RGBA8 raster, row 0 at v = 0, immutable by key
 *   POST /__wildshard_scene/reshell        AP17: the page's look can't take this revision live; build a new shell (the page
 *                                          reloads on the state that names it)
 */
export const DEV_SCENE_PATH = '/__wildshard_scene/';
export const WATCH_SOCKET = '/__wildshard_scene/socket';
export const WATCH_RESHELL = '/__wildshard_scene/reshell';
/** The protocol between the watch server and its own page script: they ship together, so a mismatch is a stale page. */
export const WATCH_WIRE = 3;
/** The engine dev hook version this sdk drives: engine's `DEV_HOOK_VERSION`, named in a devserver client's build flags. */
export const DEV_HOOK_VERSION = 2;

export interface WatchState {
  readonly wire: number;
  /** the shell the page booted from: a new one (a ground, spawn or grade change) means the page reloads */
  readonly shell: number;
  readonly revision: number;
  /** every part and its content hash; a part missing here is gone */
  readonly parts: readonly { readonly name: string; readonly hash: string }[];
  /** the look section the page's shardfile would carry (AP17: day keys, sun arc, exposure, tone, vignette, bloom), set live
   *  through the hook's `setLook` */
  readonly look: { readonly hash: string; readonly keys: readonly unknown[]; readonly look: unknown };
  /** the last compile's refusal; the page keeps what it has */
  readonly error: string | null;
  /** the wall clock (ms) this revision's edit was seen and its state sent: the timing's server half (AP6, AP17) */
  readonly seenAt: number;
  readonly sentAt: number;
}

/** One part as the page fetches it: the hook's `DevPart` with geometry and rasters by key, and its colliders. */
export interface WatchPart {
  readonly name: string;
  readonly hash: string;
  readonly materials: readonly unknown[];
  readonly textures: readonly { readonly key: string; readonly width: number; readonly height: number; readonly colourSpace: 'srgb' | 'linear' }[];
  readonly geometries: readonly string[];
  readonly draws: readonly { readonly geometry: string; readonly material: string; readonly matrix: readonly number[]; readonly castShadow: boolean; readonly receiveShadow: boolean;
    readonly instances: { readonly count: number; readonly matrices: readonly number[]; readonly colours: readonly number[] | null } | null }[];
  readonly sprites: readonly unknown[];
  readonly lamps: readonly unknown[];
  readonly water: readonly unknown[];
  readonly colliders: readonly { readonly centre: readonly number[]; readonly half: readonly number[]; readonly rotation: readonly number[] }[];
}

/** One part as the page's `WatchPart` JSON. Lamps and water are the shardfile's own rows (`lampRows`, `waterRows`). */
export function encodePart(scene: ShardScene, part: ScenePart, rows: { lamps: readonly unknown[]; water: readonly unknown[] }): WatchPart {
  const material = (key: string): unknown => { const row = scene.materials[key]; if (row === undefined) throw new Error(`watch: part ${part.name} names material ${key} the scene lacks`); return row; };
  return {
    name: part.name, hash: part.hash,
    materials: part.materials.map(material),
    textures: part.textures.map((key) => { const t = scene.textures[key]; if (t === undefined) throw new Error(`watch: part ${part.name} names texture ${key} the scene lacks`); return { key, width: t.width, height: t.height, colourSpace: t.colourSpace }; }),
    geometries: part.geometries,
    draws: part.draws.map((d) => ({ geometry: d.geometry, material: d.material, matrix: d.matrix, castShadow: d.castShadow, receiveShadow: d.receiveShadow,
      instances: d.instances === null ? null : { count: d.instances.count, matrices: Array.from(d.instances.matrices), colours: d.instances.colours === null ? null : Array.from(d.instances.colours) } })),
    sprites: part.sprites.map((s) => ({ material: s.material, position: s.position, scale: s.scale, center: s.center })),
    lamps: rows.lamps, water: rows.water,
    colliders: part.colliders.map((c) => ({ centre: c.centre, half: c.half, rotation: c.rotation })),
  };
}

/** Five little-endian u32 element counts (position, normal, uv, colour, index), then each array in that order. */
export function encodeGeometry(geometry: SceneGeometry): Uint8Array {
  const arrays = [geometry.position, geometry.normal, geometry.uv, geometry.colour, geometry.index];
  const counts = arrays.map((a) => a?.length ?? 0), bytes = new Uint8Array(20 + counts.reduce((n, c) => n + c * 4, 0)), view = new DataView(bytes.buffer);
  counts.forEach((count, i) => { view.setUint32(i * 4, count, true); });
  let offset = 20;
  for (const array of arrays) {
    if (array === null) continue;
    bytes.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), offset);
    offset += array.byteLength;
  }
  return bytes;
}

/** `encodeGeometry`'s inverse (the page script's). */
export function decodeGeometry(key: string, bytes: ArrayBuffer): { key: string; position: Float32Array; normal: Float32Array; uv: Float32Array | null; colour: Float32Array | null; index: Uint32Array | null } {
  const header = new DataView(bytes, 0, 20), [positions = 0, normals = 0, uvs = 0, colours = 0, indices = 0] = [0, 1, 2, 3, 4].map((i) => header.getUint32(i * 4, true));
  let offset = 20;
  const take = (count: number): Float32Array => { const out = new Float32Array(bytes.slice(offset, offset + count * 4)); offset += count * 4; return out; };
  const position = take(positions), normal = take(normals), uv = uvs > 0 ? take(uvs) : null, colour = colours > 0 ? take(colours) : null;
  const index = indices > 0 ? new Uint32Array(bytes.slice(offset, offset + indices * 4)) : null;
  if (offset + indices * 4 !== bytes.byteLength) throw new Error(`watch: geometry ${key} is ${bytes.byteLength} bytes, its header says ${offset + indices * 4}`);
  return { key, position, normal, uv, colour, index };
}

/**
 * The shard a watched page boots from: the scene's ground, look, sun, sky and spawn, with every part's draws, sprites,
 * lamps, colliders and water left to the page script, which swaps them live through the dev hook.
 */
export function liveShell(scene: ShardScene): ShardScene {
  return { ...scene, parts: scene.parts.map((part) => ({ ...part, draws: [], sprites: [], colliders: [], water: [], lights: part.lights.filter((l) => l.kind !== 'point'), materials: [], textures: [], geometries: [] })) };
}

/**
 * The devserver client's dev hook version, from its `build-flags.json` (`devHook`, engine's app build writes it), against
 * this sdk's: null when they agree, else why `watch` can't drive that page.
 */
export function hookMismatch(flags: unknown): string | null {
  const version = typeof flags === 'object' && flags !== null && 'devHook' in flags ? flags.devHook : undefined;
  if (version === DEV_HOOK_VERSION) return null;
  return version === undefined
    ? `this engine client has no dev hook (its build flags name no devHook); wildshard watch needs engine's dev hook v${DEV_HOOK_VERSION}: move the sdk's engine pin to an engine with it, or set WILDSHARD_DEV_CLIENT to a devserver build of one`
    : `this engine client's dev hook is v${String(version)}, this sdk drives v${DEV_HOOK_VERSION}: move the sdk and its engine pin together`;
}
