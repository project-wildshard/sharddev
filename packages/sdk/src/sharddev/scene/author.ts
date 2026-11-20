import { DataTexture, type InstancedMesh, LinearFilter, LinearMipmapLinearFilter, Mesh, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, ShapeGeometry, LinearSRGBColorSpace, type ColorRepresentation, type Group, type Object3D, type Scene, type Shape } from 'three';
import { positionLocal } from 'three/tsl';
import type { DetailLayer } from '@wildshard/format/detail-layer';
import type { GraphValue } from '../materials';
import type { Rgb, SceneMotion, ScenePost, SceneSpawnRow } from './description';
import type { CreatureWorldOptions } from './worldCreature';
import type { DockOptions, VehicleKindOptions } from './vehicle';
import type { AmbienceOptions, MusicOptions } from './sound';

/**
 * AUTHORING-PARITY AP1: what an author's scene module calls besides three.js itself. Everything here runs at compile time
 * only (on the author's machine or CI), never in a player's page or on the server.
 */

/** The world a `defineShard` build function receives. `scene` is a plain three.js `Scene`: add to it as in a cleanroom. */
/** AP16: what a part is besides its content. */
export interface PartOptions {
  /** a panel id (`brasscap.gate`): the part's meshes are one hideable GLB and its solids one collider, both of this id */
  readonly panel?: string;
  /** SHARD-SOURCE SS9d: a panel players push (a crate, a barrel): one dynamic body the server keeps, drawn where it is */
  readonly touchable?: TouchableOptions;
  /** SHARD-SOURCE SS-GF2a: a panel that rides a track (a raft, a ferry): the server moves its solids, every page its GLB */
  readonly mover?: MoverOptions;
  /** MIRROR-SALT-ZONE MSZ3: gone. A vehicle is `world.vehicle(kind, build, options)`, placed by `world.dock`; a part with
   *  `vehicle` is refused with that hint. */
  readonly vehicle?: never;
  /**
   * SHARD-SOURCE SS-GF0: a panel shown while a state field holds `equals` (a shrine's flame once it is lit), hidden
   * otherwise, its solids with it. The field is one a use prompt's `sets` writes.
   */
  readonly shownWhen?: ShownWhen;
}

/** SS-GF0: when a panel part shows. `equals` is the field's value: true or false for a flag, a whole number for a count. */
export interface ShownWhen { readonly field: string; readonly equals: boolean | number }

/**
 * SS-GF0: what a use prompt writes, with no script of the author's: a `player` field is the user's own (a socket they
 * lit), a `shared` field every player's (a shrine's lanterns). `value` sets it (true, false or a whole number of 0 or
 * more); `add` adds to it, never past `max` (a count, from 0). A field takes one scope and one kind across its uses.
 */
export type SetsOptions =
  | { readonly field: string; readonly scope: 'player' | 'shared'; readonly value: boolean | number }
  | { readonly field: string; readonly scope: 'player' | 'shared'; readonly add: number; readonly max: number };

/** AP25b and SS-GF0: a use prompt's options. */
export interface InteractOptions {
  readonly label: string;
  readonly radius: number;
  /** the shard scene the use runs (format `hooks.scenes`, from `extend`); give this or `sets` */
  readonly scene?: string;
  /** names the hooks condition that spends it (a `sets` prompt on a shared field is spent once the field holds for good) */
  readonly unless?: string;
  /** SS-GF0: the state field the use writes, with no script of the author's */
  readonly sets?: SetsOptions;
}

/**
 * SS-GF1a1b: a lantern a player carries (format `items.rows`, a `tool` of the engine's `kit.lantern` family): its held view
 * draws in the off hand and lights the way while it burns. Two pickups may hand over one lantern (the same `id` and the
 * same options): a later take refills it.
 */
export interface ToolOptions {
  /** `tool.` and a lower-case name, like `tool.spirit-lantern` */
  readonly id: `tool.${string}`;
  /** what the kit calls it (1 to 128 characters) */
  readonly name: string;
  readonly blurb?: string;
  /** the held lantern's body colour, `#rrggbb` (default a brass `#b08a4a`) */
  readonly colour?: string;
  /** its light while it burns, 0 to 10 (default 2) */
  readonly intensity?: number;
  /** seconds a full lantern burns (default 120); a take refills it */
  readonly fuelSeconds?: number;
}
/** SS-GF1a1b: a pickup's options: its prompt, the tool it hands over, and the quest flag its take raises. */
export interface PickupOptions {
  readonly label: string;
  readonly radius: number;
  readonly item: ToolOptions;
  /** a quest flag the take raises for the player who takes it (declared for you) */
  readonly flag?: string;
}

/**
 * SS-GF2a: how a mover part travels (format `movers`, a native track mover). It starts where it is built; `path` is where
 * the centre of its bounds goes next, in world metres, and it takes `seconds` from the start to the last point, at one
 * speed along the whole path. Its solids are what a player stands on, and they move with it.
 */
export interface MoverOptions {
  /** 1 to 9 world points (x, y, z) the part's centre passes through after where it is built, in order */
  readonly path: readonly (readonly [number, number, number])[];
  /** seconds from where it is built to the last point (0.1 to 3600) */
  readonly seconds: number;
  /** what moves it: `stand` (the default) only while a player stands on it, `always` on its own */
  readonly start?: 'stand' | 'always';
  /** `pingpong` (the default) comes back along the path; `once` stops at the last point; `repeat` starts over */
  readonly loop?: 'pingpong' | 'once' | 'repeat';
}

/** How a touchable panel's body is made. Its rest is the part's bounds: centred there, the shape fitted round them. */
export interface TouchableOptions {
  /** the body's shape round the part's bounds (default `box`) */
  readonly shape?: 'box' | 'ball' | 'cylinder';
  /** the surface its contacts sound and slide as */
  readonly material: 'wood' | 'stone' | 'grass' | 'sand' | 'rock' | 'metal' | 'earth' | 'felt';
  /** kg/m³ (default the engine's 500) */
  readonly density?: number;
  readonly friction?: number;
  readonly restitution?: number;
  readonly damping?: number;
}

/** OF28d: a `world.spawnAt` row: the format spawn row without what the node supplies. */
export type SpawnAtRow = Omit<SceneSpawnRow, 'id' | 'at' | 'yaw'>;

export interface ShardWorld {
  readonly scene: Scene;
  /**
   * A named piece of the world, the unit `watch` swaps. Objects added to `scene` outside a part belong to part `scene`.
   * `options.panel` makes the part a panel (SHARD-SOURCE AP16): its meshes ship as one GLB the shard's `targets.panels`
   * rows show and hide by state (a gate that opens, a rifle taken off a rack), and its solids as one collider of that id.
   * `options.mover` (with a panel) makes it ride a track: a raft a player stands on and rides (SHARD-SOURCE SS-GF2a).
   * A vehicle is no part: see `vehicle` and `dock` (MIRROR-SALT-ZONE MSZ3).
   */
  part: (name: string, build: (part: Group) => void, options?: PartOptions) => Group;
  /**
   * The ground: its height everywhere in the 500 m cell, and optionally its colour (linear RGB). `material` is the
   * cleanroom ground mesh's `MeshStandardMaterial` (its colour, roughness and metalness; the vertex colours are
   * `colourAt`); a map on it does not reach the shard (the terrain has no uvs): say its grain with `detail`, the PBR
   * family's procedural layer (format `detail-layer`), drawn from world position.
   */
  ground: (heightAt: (x: number, z: number) => number, options?: { colourAt?: (x: number, z: number) => Rgb; material?: MeshStandardMaterial; detail?: DetailLayer }) => void;
  /**
   * AP14: the sky, a TSL colour (linear) along {@link skyRay}, drawn on the engine's dome in place of its gradient: the
   * cleanroom's sky dome `ShaderMaterial`, written in TSL. `environment` lights PBR surfaces from that same sky (three's
   * `scene.environment` from a PMREM of the dome, at `intensity`, over a `ground` colour), so ponds and metal reflect it.
   */
  sky: (colour: GraphValue, options?: { environment?: { intensity: number; ground: Rgb } }) => void;
  /** The cleanroom's composer, as numbers. */
  post: (settings: Partial<Omit<ScenePost, 'bloom'>> & { bloom?: ScenePost['bloom'] }) => void;
  /** Where a player enters. */
  spawn: (x: number, y: number, z: number, yaw?: number) => void;
  /**
   * AP25a: a region trigger round `at`'s world position (read once the build has run, so a node moved later still counts):
   * entering `radius` metres of it sets quest flag `flag` (default `id`). Written into the shard's `quests.triggers` beside
   * any `extend` declares, so a quest's place is typed once, in the scene.
   */
  trigger: (id: string, at: Object3D, options: { radius: number; flag?: string }) => void;
  /**
   * AP25b: a use prompt at `at`'s world position: within `radius` metres the player sees `label`, and using it runs the
   * shard scene `scene` (format `targets.interactions`; `unless` names the hooks condition that spends it). SS-GF0: or it
   * `sets` a state field, which a panel part's `shownWhen` reads: the sdk writes the field, the scene and the script.
   */
  interact: (id: string, at: Object3D, options: InteractOptions) => void;
  /**
   * SS-GF1a1b: a tool on a stand at `at`'s world position. Within `radius` metres the player sees `label`; using it puts
   * `item` in their kit, lit and full (format `targets.itemActions`, a take, action 3, of a declared tool the loadout does
   * not carry), and raises `flag` if given. A later use refills it. The sdk writes the tool, the scene, the take and the
   * fields that show its light on the page. Needs an engine that takes a tool off its stand (SS-GF1a1a).
   */
  pickup: (id: string, at: Object3D, options: PickupOptions) => void;
  /**
   * SS-MS1b: a timed run (format `quests.races`). Each player's clock starts when quest flag `start` rises (a trigger at the
   * start gate) and stops when `stop` rises; the finish files `fact` (default `id`) and the page shows the time and the best.
   * Past `cap` seconds (whole, 1 to 3600; default 600) the run lapses. Both flags drop after a finish or a lapse, so the run can
   * be run again, and so do `resets` (SS-MS1c: the middle gates' flags, so a second run counts them again; 1 to 64, not the
   * start or stop). Needs an engine with the race clock (SS-MS1a2, SS-MS1a3), and one that lowers resets (SS-MS1c).
   */
  race: (id: string, options: { start: string; stop: string; fact?: string; cap?: number; resets?: readonly string[] }) => void;
  /**
   * ONE-FORMAT OF28d (absorbs SHARD-SOURCE AP25c): a creature spawn row at `at`'s world position and heading (its +z,
   * read once the build has run, so a node moved later still counts). `row` is the rest of the format's spawn row:
   * species, variant, brain, strike, seed and scale, and any of rank, count, when, group or respawn. Written into the
   * shard's `creatures.spawns` beside any `extend` declares. A boss is a spawn its encounter names by this id.
   */
  spawnAt: (id: string, at: Object3D, row: SpawnAtRow) => void;
  /**
   * ONE-FORMAT CC24: a whole creature from a three.js `Group` of named bone nodes (built outside `world.scene`): its
   * skinned GLB rig (each mesh bound to its nearest bone, `clips` kept), its skin, and the species and look rows
   * (`<id>.look`) with its size, skeleton, volumes and lock, under the creature caps (64 bones). Place it with
   * `world.spawnAt(…, { species: id, … })`.
   */
  creature: (id: string, body: Object3D, options: CreatureWorldOptions) => void;
  /**
   * AP32c: grass, ferns and small clutter as a detail layer (format `look.details`). Build the clumps as a cleanroom does,
   * one InstancedMesh of a small card (at most 2,000 triangles), and hand it here: the shard keeps the card once and how
   * many clumps stand in each `cell`-metre square (and their mean height), not the copies, and the engine scatters them
   * within `radius` metres of the camera (half on a phone), with a seeded yaw and a lean, size and tint inside the ranges
   * the copies span. The mesh may sit in the scene or not; it is never drawn as copies. `sway` moves the cards' tops on
   * the wind (`amount` 0 to 1, `rate` in cycles a second).
   */
  detail: (id: string, mesh: InstancedMesh, options: { cell: number; radius: number; sway?: { amount: number; rate: number }; shadow?: boolean }) => void;
  /**
   * MIRROR-SALT-ZONE MSZ3: a vehicle kind (format `world/vehicles`): players get in, sit, drive and get out. Build it about
   * the part's origin, its base at y 0, facing -z: empties named `seat.driver` (one) and `seat.passenger` (or
   * `seat.passenger.2`, up to four seats) say where riders sit, `leave.driver` and `leave.passenger` where getting out sets
   * them down (default a step past the side they sit on), and its `solid()` meshes are its hull (at most 16 boxes, each at
   * most 8 m half). `kind` is its id and its panel's: the GLB every page poses at its docks. It stands nowhere until a
   * `world.dock` names it. Needs an engine that reads `world/vehicles` (MSZ6).
   */
  vehicle: (kind: string, build: (part: Group) => void, options: VehicleKindOptions) => Group;
  /**
   * MIRROR-SALT-ZONE MSZ3: where a `world.vehicle` kind stands, at `at`'s world position and heading (its +z is the
   * vehicle's back: it faces the node's -z), read once the build has run. `per: 'player'` (the default) hands each
   * player their own; `shared` parks one for everyone. It comes back `respawn` seconds (default 60) after it goes.
   */
  dock: (id: string, at: Object3D, options: DockOptions) => void;
  /**
   * MOSSGATE-ZONE MZ23: the shard's music, from the engine's own piano (J304: no recordings of the shard's, no audio bytes):
   * `day` while it is light, `night` once it is dark, `boss` while one of the shard's bosses fights, each a slot of the
   * engine's style (`title`, `island` or `pine`). Once. Needs an engine whose grid cells play a score (engine `30c22f00`).
   */
  music: (options: MusicOptions) => void;
  /**
   * MZ23: the cell's ambient bed, one to eight synth winds (band-passed noise, `../scene/sound` `Wind`), played while a player
   * stands in the cell. Once. With `music`, this ends the scene shard's default silence, so quest steps are heard.
   */
  ambience: (options: AmbienceOptions) => void;
}


/** AP14: the view ray through a sky pixel (unit, world axes, y up): the dome is centred on the camera. */
export const skyRay: ReturnType<typeof positionLocal.normalize> = positionLocal.normalize();

/** Painted pixels by texture source: `clone()` shares the source, so a clone with its own `repeat` still lowers. */
/** as a canvas `ImageData` stores a value: clamped to 0..255 and rounded */
export const byte = (value: number): number => Math.min(255, Math.max(0, Math.round(value)));
const PAINTED = new WeakMap<object, { width: number; height: number; rgba: Uint8Array }>();
export const paintedPixels = (source: object): { width: number; height: number; rgba: Uint8Array } | undefined => PAINTED.get(source);

/**
 * `paint(w, h, fn)`: a texture painted per pixel, the cleanroom's `paint` without a canvas. `fn(u, v, x, y)` returns
 * `[r, g, b, a?]` in 0..255 with row 0 at the top, as a canvas draws; the texture samples as a `CanvasTexture` would
 * (sRGB, repeat, mipmapped). This is J338's procedural path: the shardfile ships the pixels, no image file is authored.
 */
export function paint(width: number, height: number, fn: (u: number, v: number, x: number, y: number) => readonly number[], options: { colourSpace?: 'srgb' | 'linear' } = {}): DataTexture {
  checkSize(width, height);
  return memoPainted('paint', width, height, fn, options, () => {
    const top = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const [r = 0, g = 0, b = 0, a = 255] = fn(x / width, y / height, x, y), i = (y * width + x) * 4;
      top[i] = byte(r); top[i + 1] = byte(g); top[i + 2] = byte(b); top[i + 3] = byte(a);
    }
    return top;
  });
}

/**
 * SHARD-SOURCE AP17: `wildshard watch`'s paint memo. A watched revision reruns the author's whole build, and painting is most
 * of it (the authoring slice: ~200 of ~250 ms). While `withPaintMemo` runs a build in `guess` mode, a `paint` or
 * `paintCanvas` call whose painter source, size and colour space match the n-th such call of the last revision takes that
 * call's pixels without painting. It is a guess: a painter's closure can change while its source text does not. So watch
 * pushes the guess, then runs the build again in `truth` mode (every call paints) and pushes the difference, if any.
 */
export class PaintMemo {
  private last = new Map<string, Uint8Array>();
  private now = new Map<string, Uint8Array>();
  private readonly seen = new Map<string, number>();
  mode: 'guess' | 'truth' = 'guess';
  hits = 0;
  misses = 0;
  /** Start a build: what the last one painted (or guessed) is what this one may take. */
  begin(mode: 'guess' | 'truth'): void {
    if (this.now.size > 0) this.last = this.now;
    this.now = new Map(); this.seen.clear(); this.mode = mode; this.hits = 0; this.misses = 0;
  }
  /** One call's pixels (rows bottom first, as the texture holds them): the last revision's, or `paint()`'s. */
  pixels(kind: string, width: number, height: number, source: string, colourSpace: string, draw: () => Uint8Array): Uint8Array {
    const base = `${kind}|${width}x${height}|${colourSpace}|${source}`, nth = this.seen.get(base) ?? 0;
    this.seen.set(base, nth + 1);
    const key = `${base}#${nth}`, kept = this.mode === 'guess' ? this.last.get(key) : undefined;
    if (kept !== undefined) this.hits++; else this.misses++;
    const rgba = kept ?? draw();
    this.now.set(key, rgba);
    return rgba;
  }
}
let memo: PaintMemo | null = null;
/** Run `build` with `next` as the paint memo (null: none, every call paints). */
export function withPaintMemo<T>(next: PaintMemo | null, build: () => T): T {
  const before = memo; memo = next;
  try { return build(); } finally { memo = before; }
}
/** A painter's texture through the memo, when one is set (rows top first in, as a canvas holds them). */
export function memoPainted(kind: string, width: number, height: number, painter: object, options: { colourSpace?: 'srgb' | 'linear' }, top: () => Uint8Array): DataTexture {
  if (memo === null) return paintedTexture(width, height, top(), options);
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- a painter is a function: its source text is the key
  const rgba = memo.pixels(kind, width, height, String(painter), options.colourSpace ?? 'srgb', () => flipRows(width, height, top()));
  return textureOf(width, height, rgba, options);
}

/** A texture size from 1 to 4096 a side, or a refusal. */
export function checkSize(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096) throw new Error(`paint: ${width}x${height} is not a texture size from 1 to 4096`);
}

/** RGBA8 rows top first (as a canvas holds them) as the texture a `CanvasTexture` of that canvas would be. */
export function paintedTexture(width: number, height: number, top: Uint8Array, options: { colourSpace?: 'srgb' | 'linear' } = {}): DataTexture {
  return textureOf(width, height, flipRows(width, height, top), options);
}

/** Canvas row y (top = 0) is texture row height-1-y: a CanvasTexture flips Y on upload, a DataTexture does not. */
function flipRows(width: number, height: number, top: Uint8Array): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) rgba.set(top.subarray(y * width * 4, (y + 1) * width * 4), (height - 1 - y) * width * 4);
  return rgba;
}

function textureOf(width: number, height: number, rgba: Uint8Array, options: { colourSpace?: 'srgb' | 'linear' }): DataTexture {
  const texture = new DataTexture(rgba, width, height);
  texture.colorSpace = options.colourSpace === 'linear' ? LinearSRGBColorSpace : SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter; texture.minFilter = LinearMipmapLinearFilter; texture.generateMipmaps = true;
  texture.needsUpdate = true;
  PAINTED.set(texture.source, { width, height, rgba });
  return texture;
}

const SOLID = new WeakSet<Object3D>();
/** `solid(mesh)`: the mesh is also a collider, its own box in its own frame. Said once, beside the mesh. */
export function solid<T extends Object3D>(object: T): T { SOLID.add(object); return object; }
export const isSolid = (object: Object3D): boolean => SOLID.has(object);

/** A water surface: an outline in the XZ plane (as `ShapeGeometry` makes it, then laid flat), a tint, a reflection. */
export class Water extends Mesh<ShapeGeometry, MeshStandardMaterial> {
  readonly tint: ColorRepresentation;
  readonly reflect: 'planar' | 'sky';
  readonly shape: Shape;
  constructor(shape: Shape, options: { tint?: ColorRepresentation; reflect?: 'planar' | 'sky'; segments?: number } = {}) {
    const material = new MeshStandardMaterial({ color: options.tint ?? '#3a3458', roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.86 });
    super(new ShapeGeometry(shape, options.segments ?? 24), material);
    this.shape = shape; this.tint = options.tint ?? '#3a3458'; this.reflect = options.reflect ?? 'planar';
    this.rotation.x = -Math.PI / 2;
    this.name = 'water';
  }
}

const MOTION = new WeakMap<Object3D, SceneMotion>();
/**
 * `animate(node, motion)`: declared motion (SHARD-SOURCE AP12), the cleanroom's `update(t)` said as data. The engine plays
 * it per frame; no author code runs in a page. A motion on a group reaches every object under it in its part.
 *
 * - `flicker` on a `PointLight`: its intensity wavers (a lamp, a fire);
 * - `pulse` on a `Sprite`: the card breathes (a flame tongue); `drift` / `rise` on a `Sprite` or `Points`: the card wanders
 *   round its seat (fireflies) or climbs and fades (sparks);
 * - `sway` on a mesh: it bends in the wind from its root (foliage); `uvScroll` on a mesh: its map moves (water, cloud).
 */
export function animate<T extends Object3D>(object: T, motion: SceneMotion): T { MOTION.set(object, motion); return object; }
/** The motion declared on `object` or its nearest animated ancestor under `root`. */
export function motionOf(object: Object3D, root: Object3D): SceneMotion | null {
  for (let node: Object3D | null = object; node !== null; node = node.parent) { const m = MOTION.get(node); if (m !== undefined) return m; if (node === root) break; }
  return null;
}
export const flicker = (o: { rate: number; amount: number }): SceneMotion => ({ kind: 'flicker', rate: o.rate, amount: o.amount });
export const pulse = (o: { rate: number; amount: number }): SceneMotion => ({ kind: 'pulse', rate: o.rate, amount: o.amount });
export const drift = (o: { rate: number; radius: number }): SceneMotion => ({ kind: 'drift', rate: o.rate, radius: o.radius });
export const rise = (o: { rate: number; height: number; spread?: number }): SceneMotion => ({ kind: 'rise', rate: o.rate, height: o.height, spread: o.spread ?? 0 });
/** `amount`: metres the top of the mesh moves; it grows with the square of the height over the mesh's own bounds. */
export const sway = (o: { rate: number; amount: number; direction?: readonly [number, number] }): SceneMotion => ({ kind: 'sway', rate: o.rate, amount: o.amount, direction: o.direction ?? [0.8, 0.6] });
export const uvScroll = (u: number, v: number): SceneMotion => ({ kind: 'uvScroll', u, v });

/** SHARD-SOURCE SS8d: how a hung body swings (format `look.light.swings`). */
export interface HangOptions {
  /** about how many swings a second (0.05 to 4) */
  readonly rate: number;
  /** radians it leans at full gust (0 to 0.6); 0 hangs still in the wind but still swings when bumped */
  readonly amount: number;
  /** metres round its body at which a passing player or creature bumps it (0 to 3; default 0.3, 0 never) */
  readonly reach?: number;
}
const HANG = new WeakMap<Object3D, Required<HangOptions>>();
/**
 * `hang(group, { rate, amount, reach })` (SHARD-SOURCE SS8d): `group` hangs from its own origin (the pivot: a rope's top, a
 * bracket's hook) and swings there: it leans in the wind and swings when a body brushes it. Every mesh, sprite and point
 * light under it in its part swings with it, beside any motion they declare (a hung lantern's light still flickers).
 */
export function hang<T extends Object3D>(object: T, options: HangOptions): T { HANG.set(object, { rate: options.rate, amount: options.amount, reach: options.reach ?? 0.3 }); return object; }
/** The hung body `object` swings with (itself or its nearest hung ancestor under `root`), or null. */
export function hungOf(object: Object3D, root: Object3D): { readonly node: Object3D; readonly options: Required<HangOptions> } | null {
  for (let node: Object3D | null = object; node !== null; node = node.parent) { const options = HANG.get(node); if (options !== undefined) return { node, options }; if (node === root) break; }
  return null;
}
