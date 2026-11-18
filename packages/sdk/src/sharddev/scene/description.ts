import type { DetailLayer } from '@wildshard/format/detail-layer';
import type { ShardCreatures } from '@wildshard/format/creatures';
import type { ShardRows } from '@wildshard/format/rows';
/**
 * AUTHORING-PARITY AP1: the scene description. An author writes an ordinary three.js scene inside `defineShard`; the
 * walker (`lower.ts`) reads it once into this plain, serialisable shape, and both back ends read only this: the shardfile
 * back end (`shardfile.ts`, `wildshard build`) and the dev transport (`../watch`, `wildshard watch`).
 *
 * Every number is in world metres and linear colour. Geometry is kept in its own frame and deduplicated (a shared
 * `BoxGeometry` is one entry), so a part of 1,000 placed boxes is one geometry and 1,000 matrices, as three draws it.
 * Each part carries a content hash, so a re-run that changes one part changes only that part's hash.
 */

import type { GraphIr } from '@wildshard/format/materialGraph';
import type { MaterialEntry } from '@wildshard/format/materials';

/** Linear RGB, each 0..n (an HDR emissive may exceed 1). */
export type Rgb = readonly [number, number, number];
export type Vec3 = readonly [number, number, number];

/** An RGBA8 raster the author painted (`paint`) or handed in as a `DataTexture`. Row 0 is v = 0 (three's DataTexture). */
export interface SceneTexture {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
  readonly colourSpace: 'srgb' | 'linear';
}

/** A declared motion (`animate(node, ...)`, SHARD-SOURCE AP12): plain data the engine plays, never author code. */
export type SceneMotion =
  | { readonly kind: 'flicker'; readonly rate: number; readonly amount: number }
  | { readonly kind: 'pulse'; readonly rate: number; readonly amount: number }
  | { readonly kind: 'drift'; readonly rate: number; readonly radius: number }
  | { readonly kind: 'rise'; readonly rate: number; readonly height: number; readonly spread: number }
  | { readonly kind: 'sway'; readonly rate: number; readonly amount: number; readonly direction: readonly [number, number] }
  | { readonly kind: 'uvScroll'; readonly u: number; readonly v: number };

/** A lowered material: the fields of `MeshStandardMaterial` / `MeshBasicMaterial` / `SpriteMaterial` / `PointsMaterial`. */
export interface SceneMaterial {
  readonly key: string;
  /** the author's `material.name`, or the key */
  readonly name: string;
  readonly kind: 'standard' | 'basic' | 'sprite' | 'points';
  readonly colour: Rgb;
  readonly roughness: number;
  readonly metalness: number;
  readonly emissive: Rgb;
  readonly emissiveIntensity: number;
  /** a `SceneTexture` key */
  readonly map: string | null;
  /** the map's `repeat` and `offset` (uv' = uv * repeat + offset) */
  readonly repeat: readonly [number, number];
  readonly offset: readonly [number, number];
  readonly alphaTest: number;
  readonly side: 'front' | 'back' | 'double';
  readonly vertexColours: boolean;
  readonly transparent: boolean;
  readonly opacity: number;
  readonly blending: 'normal' | 'additive';
  readonly depthWrite: boolean;
  readonly fog: boolean;
  /** AP13: a TSL material's catalogue entry (`GraphMaterial`, `ToonMaterial`, `PainterlyMaterial`): written as it is */
  readonly entry: MaterialEntry | null;
  /** AP10: `polygonOffset` as its factor (0: none) */
  readonly polygonOffset: number;
  /** AP11: a `PointsMaterial`'s `size` (metres with size attenuation); 0 otherwise */
  readonly pointSize: number;
}

/** One geometry in its own frame. `colour` is 3 floats per vertex when present. */
export interface SceneGeometry {
  readonly key: string;
  readonly position: Float32Array;
  readonly normal: Float32Array;
  readonly uv: Float32Array | null;
  readonly colour: Float32Array | null;
  readonly index: Uint32Array | null;
  /** triangles in one copy */
  readonly triangles: number;
}

/** One mesh draw: a geometry in one material at a world matrix, optionally instanced. */
export interface SceneDraw {
  /** the object's path under its part (`hut/Mesh 3`), for messages and reports */
  readonly path: string;
  readonly geometry: string;
  readonly material: string;
  /** column-major world matrix */
  readonly matrix: readonly number[];
  /** an `InstancedMesh`'s live instances: their local matrices (16 floats each, column-major) and colours (3 each) */
  readonly instances: { readonly count: number; readonly matrices: Float32Array; readonly colours: Float32Array | null } | null;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
  /** AP12: `sway` or `uvScroll`, declared on the mesh or an ancestor in its part; null: still */
  readonly motion: SceneMotion | null;
  /** SS8d: the part's `swings` row it hangs from; absent: it does not swing */
  readonly swing?: number;
}

/** A `Sprite`: a camera-facing card at a world point. */
export interface SceneSprite {
  readonly path: string;
  readonly material: string;
  readonly position: Vec3;
  readonly scale: readonly [number, number];
  readonly center: readonly [number, number];
  /** AP12: `pulse`, `drift` or `rise`; null: still */
  readonly motion: SceneMotion | null;
  /** SS8d: the part's `swings` row it hangs from; absent: it does not swing */
  readonly swing?: number;
}

/** AP11: a `Points` cloud: each point a camera-facing card `pointSize` across, its seat in world space. */
export interface ScenePoints {
  readonly path: string;
  readonly material: string;
  /** world x, y, z per point */
  readonly positions: Float32Array;
  readonly motion: SceneMotion | null;
}

export interface SceneLight {
  readonly path: string;
  readonly kind: 'point' | 'directional' | 'hemisphere' | 'ambient';
  readonly colour: Rgb;
  /** hemisphere only */
  readonly groundColour: Rgb | null;
  readonly intensity: number;
  /** point only: three's range (0 = infinite) and decay */
  readonly distance: number;
  readonly decay: number;
  readonly position: Vec3;
  /** directional only: where it points */
  readonly target: Vec3 | null;
  readonly castShadow: boolean;
  /** AP12: a point light's `flicker`; null: steady */
  readonly motion: SceneMotion | null;
  /** SS8d: the part's `swings` row it hangs from; absent: it does not swing */
  readonly swing?: number;
}

/** SS8d: one `hang(group, ...)` body: its pivot (world), the distance down to its body's middle, rate, gust lean, reach. */
export interface SceneSwing {
  readonly path: string;
  readonly pivot: Vec3;
  readonly length: number;
  readonly rate: number;
  readonly amount: number;
  readonly reach: number;
}

/** A solid box, said once by `solid(mesh)`: the mesh's own bounds in its world frame. */
export interface SceneCollider {
  readonly path: string;
  readonly kind: 'cuboid';
  readonly centre: Vec3;
  readonly half: Vec3;
  /** world rotation quaternion (x, y, z, w) */
  readonly rotation: readonly [number, number, number, number];
}

/** A `Water` surface: its outline (world x, z) and level, taken from its own geometry. */
export interface SceneWater {
  readonly path: string;
  readonly outline: readonly (readonly [number, number])[];
  readonly level: number;
  readonly tint: Rgb;
  readonly reflect: 'planar' | 'sky';
  /** the surface triangles in world space (x, y, z per vertex, non-indexed), for the dev page */
  readonly triangles: Float32Array;
}

/** SS9d: one touchable panel's body, in the cell's frame. */
export interface SceneTouch {
  readonly at: readonly [number, number, number];
  readonly shape: { readonly ball: number } | { readonly cylinder: { readonly radius: number; readonly halfHeight: number } } | { readonly cuboid: { readonly x: number; readonly y: number; readonly z: number } };
  readonly material: 'wood' | 'stone' | 'grass' | 'sand' | 'rock' | 'metal' | 'earth' | 'felt';
  readonly density?: number;
  readonly friction?: number;
  readonly restitution?: number;
  readonly damping?: number;
}

/** SS-GF2a: a mover part's track, in the cell's frame: its rest (the centre of its bounds), solids about it, and its path. */
export interface SceneMove {
  readonly at: Vec3;
  /** the part's solids about `at` (world axes), what a rider stands on */
  readonly boxes: readonly { readonly x: number; readonly y: number; readonly z: number; readonly hx: number; readonly hy: number; readonly hz: number; readonly rot: readonly [number, number, number, number] }[];
  /** the centre's track from `at` (first) to the last point */
  readonly path: readonly Vec3[];
  readonly seconds: number;
  readonly start: 'stand' | 'always';
  readonly loop: 'pingpong' | 'once' | 'repeat';
}

/** SS-MS2a4: a vehicle part's rest (the base centre of its bounds, in the cell's frame) and its driving. */
export interface SceneVehicle {
  readonly at: Vec3;
  /** the half width of its footprint across its heading: where a rider steps off */
  readonly side: number;
  /** the half length of its footprint along its heading: how near a player boards */
  readonly reach: number;
  readonly speed: number;
  readonly turn: number;
  readonly boost: number;
  readonly accel: number;
  readonly ground: boolean;
  readonly heading: number;
  readonly seat: number;
  readonly wind?: { readonly toward: readonly [number, number]; readonly push: number };
  readonly board: string;
  readonly leave: string;
}

export interface ScenePart {
  readonly name: string;
  /** AP16: the panel id when the part is one (`world.part(name, build, { panel })`): one hideable GLB and one collider */
  readonly panel?: string;
  /** SS9d: a touchable panel's body (format `props.bodies`): its rest at the part's bounds, the shape fitted round them */
  readonly touch?: SceneTouch;
  /** SS-GF2a: a mover panel's track (format `movers`): its solids ride it, never a static collider */
  readonly move?: SceneMove;
  /** SS-MS2a4: a vehicle panel's driving (format `movers`, a native steer carry): every page poses its GLB; its solids are its hull (SS-GP5) */
  readonly vehicle?: SceneVehicle;
  /** SS-GF0: a panel shown while a state field holds a value (`world.part(..., { panel, shownWhen })`) */
  readonly shownWhen?: { readonly field: string; readonly equals: number };
  /** content hash of everything below and of the materials, textures and geometries it uses */
  readonly hash: string;
  readonly draws: readonly SceneDraw[];
  readonly sprites: readonly SceneSprite[];
  readonly points: readonly ScenePoints[];
  readonly lights: readonly SceneLight[];
  readonly colliders: readonly SceneCollider[];
  readonly water: readonly SceneWater[];
  /** SS8d: the part's hung bodies; a draw, sprite or light's `swing` is a row of this list */
  readonly swings?: readonly SceneSwing[];
  readonly materials: readonly string[];
  readonly textures: readonly string[];
  readonly geometries: readonly string[];
}

/** `world.post(...)`: the cleanroom's composer, as numbers. */
export interface ScenePost {
  readonly tone: 'aces' | 'neutral' | 'none';
  readonly exposure: number;
  readonly bloom: { readonly strength: number; readonly radius: number; readonly threshold: number } | null;
  readonly vignette: number;
  /** AP13: post passes compiled from TSL (`graph({ kind: 'post', ... })`), drawn in order after the grade */
  readonly passes?: readonly GraphIr[];
}

/** AP14 `world.sky(...)`: the dome's painted sky (an unlit graph over the view ray) and the light it gives. */
export interface SceneSky {
  readonly graph: GraphIr;
  /** PBR surfaces lit from the sky (and a pond reflecting it): an intensity over a ground colour; null: none */
  readonly environment: { readonly intensity: number; readonly ground: Rgb } | null;
}

export interface SceneLook {
  /** AP14: null or absent: the format's two-colour dome */
  readonly sky?: SceneSky | null;
  readonly fog: { readonly kind: 'exp2'; readonly colour: Rgb; readonly density: number } | { readonly kind: 'linear'; readonly colour: Rgb; readonly near: number; readonly far: number } | null;
  readonly background: Rgb | null;
  readonly post: ScenePost | null;
}

/** ss4d: the ground's lit surface, from `world.ground`'s `material` and `detail`. */
export interface SceneGroundSurface { readonly colour: Rgb; readonly roughness: number; readonly metalness: number; readonly detail: DetailLayer | null }

/** The ground the author declared with `world.ground(heightAt)`: closures stay at compile time, never on the wire. */
export interface SceneGround {
  readonly heightAt: (x: number, z: number) => number;
  readonly colourAt: ((x: number, z: number) => Rgb) | null;
  /** ss4d: the ground's lit surface (a PBR terrain material): colour (linear), roughness, metalness and its detail layer */
  readonly surface: SceneGroundSurface;
  /** a hash of the height field sampled on a 2 m grid, so a re-run knows whether the ground changed */
  readonly hash: string;
}

export interface ShardIdentityInput { readonly slug: string; readonly name: string; readonly author?: string; readonly revision?: number; readonly seed?: number }

/** Everything the walker read from one run of the author's scene. */
export interface ShardScene {
  readonly identity: ShardIdentityInput;
  readonly parts: readonly ScenePart[];
  readonly materials: Readonly<Record<string, SceneMaterial>>;
  readonly textures: Readonly<Record<string, SceneTexture>>;
  readonly geometries: Readonly<Record<string, SceneGeometry>>;
  readonly look: SceneLook;
  readonly ground: SceneGround | null;
  readonly spawn: { readonly position: Vec3; readonly yaw: number };
  /** AP25: gameplay rows placed at scene nodes (`world.trigger`, `world.interact`), their positions read from the nodes */
  readonly anchored: SceneAnchored;
  /** AP32c: `world.detail` layers (format `look.details`), counted from their InstancedMeshes; absent or empty: none */
  readonly details?: readonly SceneDetailScatter[];
  /** ONE-FORMAT CC24: `world.creature`'s compiled creatures, in the order they were declared; absent or empty: none */
  readonly creatures?: readonly SceneCreature[];
}

/**
 * ONE-FORMAT CC24: one `world.creature`: its rig GLB, its skin file (the rig row and binding, `{ row, binding }`) and the
 * species and look rows that name them. The shard file stores both files (the skin in the library) and adds the rows.
 */
export interface SceneCreature {
  readonly id: string;
  readonly glb: Uint8Array;
  readonly skin: Uint8Array;
  readonly species: ShardRows['species'][number];
  readonly look: ShardRows['looks'][number];
  readonly bones: number;
  readonly triangles: number;
}

/**
 * SHARD-SOURCE AP32c: one `world.detail` layer, what its InstancedMesh's copies become: a card mesh and a count of clumps
 * per mask cell, which the engine scatters round the camera (format `look.details`) instead of shipping every matrix.
 */
export interface SceneDetailScatter {
  readonly id: string;
  /** the InstancedMesh's path, for refusals and the build log */
  readonly path: string;
  /** the card, a `geometries` key */
  readonly geometry: string;
  /** the card's material, a `materials` key */
  readonly material: string;
  readonly region: { readonly corner: readonly [number, number]; readonly cell: number; readonly columns: number; readonly rows: number; readonly span: readonly [number, number] };
  /** one byte per cell, row by row from the low corner: 255 is `clumps` clumps */
  readonly mask: Uint8Array;
  /** one u16 (little-endian) per cell: the mean height of the cell's clumps over `region.span` */
  readonly heights: Uint8Array;
  /** clumps in the fullest cell */
  readonly clumps: number;
  readonly scale: readonly [number, number];
  /** the most a clump leans, radians */
  readonly tilt: number;
  /** the lowest and highest instance colour per channel (linear), or white */
  readonly tint: readonly [Rgb, Rgb];
  readonly sway: { readonly amount: number; readonly rate: number } | null;
  readonly radius: number;
  readonly shadow: boolean;
  /** how many copies the InstancedMesh held */
  readonly instances: number;
}

/** AP25a: a region trigger (format `quests.triggers`, kind `region`) at a node's world x and z. */
export interface SceneTrigger { readonly id: string; readonly kind: 'region'; readonly flag: string; readonly x: number; readonly z: number; readonly radius: number }
/** AP25b: a use prompt (format `targets.interactions`) at a node's world position. */
export interface SceneInteraction { readonly id: string; readonly at: Vec3; readonly radius: number; readonly label: string; readonly scene: string; readonly unless?: string }
/**
 * SS-GF0: a state field a use prompt writes (`world.interact(..., { sets })`): `use` is the interaction's id (and its
 * scene's); `value` sets it, `add` adds up to `max`. Booleans are 0 and 1 here; `kind` is what the field holds.
 */
export type SceneStateWrite = { readonly use: string; readonly field: string; readonly scope: 'player' | 'shared'; readonly kind: 'bool' | 'count' }
  & ({ readonly value: number } | { readonly add: number; readonly max: number });
/** SS-GF1a1b: a tool a pickup hands over, its defaults filled. */
export interface SceneTool { readonly id: `tool.${string}`; readonly name: string; readonly blurb: string; readonly colour: string; readonly intensity: number; readonly fuelSeconds: number }
/** SS-GF1a1b: a pickup (`world.pickup`): `use` is its interaction's id (and its scene's), `flag` the quest flag its take raises. */
export interface ScenePickup { readonly use: string; readonly tool: SceneTool; readonly flag?: string }
/** SS-MS1b: a timed run (format `quests.races`) between two quest flags. */
export interface SceneRace { readonly id: string; readonly start: string; readonly stop: string; readonly fact: string; readonly cap: number; readonly resets?: readonly string[] }
export interface SceneAnchored {
  readonly triggers: readonly SceneTrigger[];
  readonly interactions: readonly SceneInteraction[];
  /** SS-GF1a1b: the pickups, in the order they were declared; absent or empty: none */
  readonly pickups?: readonly ScenePickup[];
  /** SS-GF0: the state writes of `sets` prompts, in the order they were declared; absent or empty: none */
  readonly writes?: readonly SceneStateWrite[];
  /** SS-MS1b: the races, in the order they were declared; absent or empty: none */
  readonly races?: readonly SceneRace[];
  /** ONE-FORMAT OF28d: `world.spawnAt`'s creature spawn rows, in the order they were declared; absent or empty: none */
  readonly spawns?: readonly SceneSpawnRow[];
}

/** OF28d: one format creature spawn row (`creatures.spawns`), its `at` and `yaw` read off a scene node. */
export type SceneSpawnRow = ShardCreatures['spawns'][number];
