/**
 * AUTHORING-PARITY AP1: the scene description. An author writes an ordinary three.js scene inside `defineShard`; the
 * walker (`lower.ts`) reads it once into this plain, serialisable shape, and both back ends read only this: the shardfile
 * back end (`shardfile.ts`, `wildshard build`) and the dev transport (`../watch`, `wildshard watch`).
 *
 * Every number is in world metres and linear colour. Geometry is kept in its own frame and deduplicated (a shared
 * `BoxGeometry` is one entry), so a part of 1,000 placed boxes is one geometry and 1,000 matrices, as three draws it.
 * Each part carries a content hash, so a re-run that changes one part changes only that part's hash.
 */

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

/** A lowered material: the fields of `MeshStandardMaterial` / `MeshBasicMaterial` / `SpriteMaterial` an M1 scene uses. */
export interface SceneMaterial {
  readonly key: string;
  /** the author's `material.name`, or the key */
  readonly name: string;
  readonly kind: 'standard' | 'basic' | 'sprite';
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
}

/** A `Sprite`: a camera-facing card at a world point. */
export interface SceneSprite {
  readonly path: string;
  readonly material: string;
  readonly position: Vec3;
  readonly scale: readonly [number, number];
  readonly center: readonly [number, number];
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

export interface ScenePart {
  readonly name: string;
  /** content hash of everything below and of the materials, textures and geometries it uses */
  readonly hash: string;
  readonly draws: readonly SceneDraw[];
  readonly sprites: readonly SceneSprite[];
  readonly lights: readonly SceneLight[];
  readonly colliders: readonly SceneCollider[];
  readonly water: readonly SceneWater[];
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
}

export interface SceneLook {
  readonly fog: { readonly kind: 'exp2'; readonly colour: Rgb; readonly density: number } | { readonly kind: 'linear'; readonly colour: Rgb; readonly near: number; readonly far: number } | null;
  readonly background: Rgb | null;
  readonly post: ScenePost | null;
}

/** The ground the author declared with `world.ground(heightAt)`: closures stay at compile time, never on the wire. */
export interface SceneGround {
  readonly heightAt: (x: number, z: number) => number;
  readonly colourAt: ((x: number, z: number) => Rgb) | null;
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
}
