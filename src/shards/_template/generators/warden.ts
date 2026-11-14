import { Bone, BufferGeometry, Color, Euler, Float32BufferAttribute, MeshStandardMaterial, Quaternion, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3 } from 'three';
import { sampleSkinClip, skinnedGlb, type SampledSkinClip } from '@wildshard/sdk/bake/export';
import { parseGlb } from '@wildshard/sdk/assets';
import { hashImmutableBytes } from '@wildshard/sdk/immutable';

/**
 * Build-time only (SHARD-SOURCE M4.10, the Template look): the Barrow Warden's skin, a hulking golem of mossy stone blocks
 * after the cleanroom's (mossgate-cleanroom `src/world.js` `warden()`): two block legs, hips, a broad torso with a glowing
 * chest core and ivy, a block head with two glowing eyes under a moss cap, and two heavy block arms that rise into the
 * tell and slam. It is written as an SF9c exported skin: one skinned mesh of flat-shaded chamfered blocks in vertex
 * colours (stone, moss, ivy: the binding's `pbr` family material, one draw) plus two mapped parts (TE-ENG10), `Eyes` and
 * `Core`, drawn in the look's emissive `mossgate.lamp` and `mossgate.tell`. Six joints, bound unrotated and unscaled:
 * `body` (the hips), `head`, `armL`, `armR`, `legL`, `legR`; five sampled clips (idle, walk, attack, hit, die).
 *
 * `scripts/bake/template-warden.mjs` writes the GLB and its `{ row, binding }` skin file into `assets/` and the entry
 * into `data/skins.json`; `warden.test.ts` re-bakes and checks the committed bytes are this function's.
 */

/** The cleanroom golem's own units: its group stood at scale 1.45 against the Template spawn's scale 3; 0.88 of that, since
 *  the Template's Warden stands 1 m nearer the arena gate than the cleanroom's (24.5 against 25.5), so the cameras frame
 *  it as the cleanroom's (head and raised fists in shot 13). */
const UNIT = (1.45 / 3) * 0.88;
/** GLB material names: the family surface, and the two look-material parts. */
export const WARDEN_PARTS = { Eyes: 'mossgate.lamp', Core: 'mossgate.tell' } as const;
const MATERIALS = ['Stone', 'Eyes', 'Core'] as const;
const JOINTS = ['body', 'head', 'armL', 'armR', 'legL', 'legR'] as const;
type Joint = typeof JOINTS[number];
/** Joint rest positions in world space (cleanroom units, feet at y 0, facing +z; the golem's left is +x). */
const REST: Record<Joint, readonly [number, number, number]> = {
  body: [0, 1.1, 0], head: [0, 3.2, 0.1], armL: [1.45, 2.95, 0], armR: [-1.45, 2.95, 0], legL: [0.55, 1.1, 0], legR: [-0.55, 1.1, 0],
};
// `body` is the one root (the engine's factory hangs only `body` on the mesh), so the legs hang from it too
const PARENT: Record<Joint, Joint | null> = { body: null, head: 'body', armL: 'body', armR: 'body', legL: 'body', legR: 'body' };

const STONE = '#aba79a', STONE_DARK = '#87847a', MOSS = '#8fb33a', MOSS_DARK = '#6b8c2c', IVY = '#3f6a24', LEAF = '#5f8e2e';
const EYE = '#ffb040', CORE = '#ff9a30';

/** mulberry32: the golem's tints and moss are the same every bake. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

interface Polygon { readonly points: readonly Vector3[]; readonly colour: Color; readonly joint: number; readonly material: number }
/** The hull under construction: flat polygons per material, each vertex rigidly bound to one joint. */
class Hull {
  readonly polygons: Polygon[] = [];
  private readonly rand: () => number;
  constructor(seed: number) { this.rand = random(seed); }
  range(min: number, max: number): number { return min + (max - min) * this.rand(); }
  /** A box with chamfered edges and corners (26 faces, 44 triangles), or a plain box at `chamfer: 0` (12), tilted about its centre. */
  block(joint: Joint, centre: readonly [number, number, number], size: readonly [number, number, number], options: { chamfer?: number; rotation?: readonly [number, number, number]; colour?: (normal: Vector3, height: number) => Color; material?: number } = {}): void {
    const [w, h, d] = size.map((value) => value / 2) as [number, number, number], c = Math.min(options.chamfer ?? 0.09, w * 0.45, h * 0.45, d * 0.45);
    const turn = new Quaternion().setFromEuler(new Euler(...(options.rotation ?? [0, 0, 0]))), at = new Vector3(...centre);
    const place = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z).applyQuaternion(turn).add(at);
    const corner = (sx: number, sy: number, sz: number): { x: Vector3; y: Vector3; z: Vector3 } => ({
      x: place(sx * w, sy * (h - c), sz * (d - c)), y: place(sx * (w - c), sy * h, sz * (d - c)), z: place(sx * (w - c), sy * (h - c), sz * d),
    });
    const k = (sx: number, sy: number, sz: number): ReturnType<typeof corner> => corner(sx, sy, sz);
    const faces: Vector3[][] = [];
    for (const s of [-1, 1]) {
      faces.push([k(s, -1, -1).x, k(s, 1, -1).x, k(s, 1, 1).x, k(s, -1, 1).x]);
      faces.push([k(-1, s, -1).y, k(1, s, -1).y, k(1, s, 1).y, k(-1, s, 1).y]);
      faces.push([k(-1, -1, s).z, k(1, -1, s).z, k(1, 1, s).z, k(-1, 1, s).z]);
      if (c > 0) for (const t of [-1, 1]) {
        faces.push([k(-1, s, t).y, k(1, s, t).y, k(1, s, t).z, k(-1, s, t).z]); // edges along x
        faces.push([k(s, -1, t).x, k(s, 1, t).x, k(s, 1, t).z, k(s, -1, t).z]); // edges along y
        faces.push([k(s, t, -1).x, k(s, t, 1).x, k(s, t, 1).y, k(s, t, -1).y]); // edges along z
        for (const u of [-1, 1]) { const q = k(s, t, u); faces.push([q.x, q.y, q.z]); }
      }
    }
    const material = options.material ?? 0, index = JOINTS.indexOf(joint), tint = this.range(0.8, 1.0);
    for (const points of faces) {
      const centroid = points.reduce((sum, p) => sum.add(p), new Vector3()).multiplyScalar(1 / points.length);
      const normal = new Vector3().subVectors(points[1] ?? at, points[0] ?? at).cross(new Vector3().subVectors(points[2] ?? at, points[0] ?? at)).normalize();
      const ordered = normal.dot(new Vector3().subVectors(centroid, at)) < 0 ? [...points].reverse() : points;
      if (normal.dot(new Vector3().subVectors(centroid, at)) < 0) normal.negate();
      const height = (centroid.y - (at.y - h)) / (2 * h);
      const colour = options.colour?.(normal, height) ?? stoneColour(normal, height, tint, this.rand());
      this.polygons.push({ points: ordered, colour, joint: index, material });
    }
  }
  /** A moss cap: a soft green slab over a block's top, with a few drips down its faces. */
  moss(joint: Joint, centre: readonly [number, number, number], size: readonly [number, number, number], drips: number, rotation: readonly [number, number, number] = [0, 0, 0]): void {
    const [w, h, d] = size, tone = this.range(0.85, 1.05);
    this.block(joint, centre, size, { chamfer: Math.min(h * 0.45, 0.16), rotation, colour: (normal) => colourOf(normal.y > 0.3 ? MOSS : MOSS_DARK, tone) });
    for (let i = 0; i < drips; i++) {
      const side = this.rand(), long = this.range(0.18, 0.5), across = this.range(-0.42, 0.42);
      const [x, z] = side < 0.5 ? [across * w, (side < 0.25 ? 1 : -1) * (d / 2 - 0.02)] : [(side < 0.75 ? 1 : -1) * (w / 2 - 0.02), across * d];
      const thin: [number, number, number] = side < 0.5 ? [this.range(0.14, 0.3), long, 0.08] : [0.08, long, this.range(0.14, 0.3)];
      this.block(joint, [centre[0] + x, centre[1] - h / 2 - long / 2 + 0.06, centre[2] + z], thin, { chamfer: 0, rotation, colour: (normal) => colourOf(normal.y > 0.3 ? MOSS : MOSS_DARK, tone * 0.92) });
    }
  }
  /** An ivy vine hanging down a face at depth `z`: thin stem blocks wandering sideways, with leaf diamonds. */
  ivy(joint: Joint, top: readonly [number, number, number], length: number, facing: 1 | -1 = 1): void {
    let [x, y] = top; const z = top[2], steps = Math.max(2, Math.round(length / 0.4));
    for (let i = 0; i < steps; i++) {
      const dx = this.range(-0.12, 0.12), seg = length / steps, angle = Math.atan2(dx, seg);
      this.block(joint, [x + dx / 2, y - seg / 2, z], [0.06, Math.hypot(seg, dx) + 0.03, 0.05], { chamfer: 0, rotation: [0, 0, angle], colour: () => colourOf(IVY, 1) });
      if (this.rand() < 0.75) {
        const side = this.rand() < 0.5 ? -1 : 1, lx = x + side * 0.1, ly = y - seg * 0.5, s = this.range(0.07, 0.11), tone = this.range(0.85, 1.1);
        const leaf = [new Vector3(lx, ly + s, z + facing * 0.03), new Vector3(lx + side * s * 1.2, ly, z + facing * 0.04), new Vector3(lx, ly - s, z + facing * 0.03), new Vector3(lx - side * s * 0.6, ly, z + facing * 0.025)];
        this.polygons.push({ points: facing * side > 0 ? [...leaf].reverse() : leaf, colour: colourOf(LEAF, tone), joint: JOINTS.indexOf(joint), material: 0 });
      }
      x += dx; y -= seg;
    }
  }
  /** A glowing octahedron (the chest core), material 2. */
  gem(joint: Joint, centre: readonly [number, number, number], radius: number, depth: number): void {
    const [x, y, z] = centre, index = JOINTS.indexOf(joint), colour = colourOf(CORE, 1);
    const tips = [new Vector3(x + radius, y, z), new Vector3(x, y + radius, z), new Vector3(x - radius, y, z), new Vector3(x, y - radius, z)];
    const front = new Vector3(x, y, z + depth), back = new Vector3(x, y, z - depth * 0.4);
    for (let i = 0; i < 4; i++) {
      const a = tips[i] ?? front, b = tips[(i + 1) % 4] ?? front;
      this.polygons.push({ points: [a, b, front], colour, joint: index, material: 2 }, { points: [b, a, back], colour, joint: index, material: 2 });
    }
  }
}

function colourOf(hex: string, scale: number): Color { return new Color(hex).multiplyScalar(scale); }
/** Stone tinted per block, darker low on the block, with moss on most up-facing faces. */
function stoneColour(normal: Vector3, height: number, tint: number, roll: number): Color {
  if (normal.y > 0.6 && roll < 0.7) return colourOf(MOSS, 0.9 + roll * 0.15);
  const base = new Color(STONE).lerp(new Color(STONE_DARK), 0.5 - height * 0.5);
  return base.multiplyScalar(tint * (0.88 + 0.12 * height));
}

/** The golem's blocks and dressing, after the cleanroom's (its body group sat at y 1.1). */
function buildHull(): Hull {
  const hull = new Hull(437), b = 1.1;
  for (const [s, joint] of [[1, 'legL'], [-1, 'legR']] as const) {
    hull.block(joint, [s * 0.55, 0.62, 0], [0.75, 1.0, 0.8], { rotation: [0, hull.range(-0.06, 0.06), 0] });
    hull.block(joint, [s * 0.55, 0.17, 0.08], [0.9, 0.35, 1.0], { chamfer: 0.07 });
  }
  hull.block('body', [0, b + 0.3, 0], [1.5, 0.6, 1.0], { rotation: [0, 0, 0.03] });
  hull.block('body', [0, b + 1.35, 0], [2.3, 1.5, 1.35], { chamfer: 0.14 });
  // the chest slab's cracks: two darker plates set into the torso front around the core
  hull.block('body', [-0.55, b + 1.55, 0.66], [0.75, 0.62, 0.1], { chamfer: 0, rotation: [0, 0, 0.06], colour: (n, h) => stoneColour(n, h, 0.82, 1) });
  hull.block('body', [0.52, b + 1.1, 0.66], [0.8, 0.55, 0.1], { chamfer: 0, rotation: [0, 0, -0.05], colour: (n, h) => stoneColour(n, h, 0.8, 1) });
  hull.gem('body', [0, b + 1.35, 0.72], 0.24, 0.16);
  hull.moss('body', [0, b + 2.12, 0], [2.42, 0.26, 1.45], 6);
  for (const [x, length] of [[-0.85, 1.25], [-0.32, 0.8], [0.3, 1.05], [0.82, 1.35]] as const) hull.ivy('body', [x, b + 2.05, 0.71], length);
  hull.block('head', [0, b + 2.5, 0.15], [0.95, 0.8, 0.9], { chamfer: 0.1 });
  hull.block('head', [0, b + 2.36, 0.5], [0.7, 0.16, 0.22], { chamfer: 0.04, colour: (n, h) => stoneColour(n, h, 0.78, 1) }); // brow-less jaw ledge
  for (const s of [-1, 1]) hull.block('head', [s * 0.2, b + 2.58, 0.61], [0.18, 0.09, 0.05], { chamfer: 0, material: 1, colour: () => colourOf(EYE, 1) });
  hull.moss('head', [0, b + 2.94, 0.12], [1.02, 0.18, 0.98], 3);
  for (const [s, joint] of [[1, 'armL'], [-1, 'armR']] as const) {
    const x = s * 1.45, y = b + 1.85;
    hull.block(joint, [x, y, 0], [0.85, 0.8, 0.85]);
    hull.moss(joint, [x, y + 0.45, 0], [0.95, 0.2, 0.95], 2);
    hull.block(joint, [x, y - 0.85, 0], [0.65, 1.0, 0.65], { rotation: [0, hull.range(-0.1, 0.1), 0] });
    hull.block(joint, [x, y - 1.75, 0.05], [0.9, 0.85, 0.9]);
    hull.ivy(joint, [x + s * 0.1, y + 0.3, 0.44], 1.1);
  }
  return hull;
}

/** The skinned mesh: polygons fanned into indexed triangles, grouped by material, each vertex on one joint. */
function buildMesh(hull: Hull): SkinnedMesh {
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], colours: number[] = [], joints: number[] = [], weights: number[] = [], indices: number[] = [];
  const geometry = new BufferGeometry();
  MATERIALS.forEach((_name, material) => {
    const start = indices.length;
    for (const polygon of hull.polygons.filter((row) => row.material === material)) {
      const [a, b2, c] = polygon.points; if (a === undefined || b2 === undefined || c === undefined) throw new Error('Warden polygon');
      const normal = new Vector3().subVectors(b2, a).cross(new Vector3().subVectors(c, a)).normalize(), first = positions.length / 3;
      const [u, v] = Math.abs(normal.y) > 0.7 ? ['x', 'z'] as const : Math.abs(normal.x) > 0.7 ? ['z', 'y'] as const : ['x', 'y'] as const;
      for (const point of polygon.points) {
        positions.push(point.x * UNIT, point.y * UNIT, point.z * UNIT); normals.push(normal.x, normal.y, normal.z); uvs.push(point[u] * UNIT, point[v] * UNIT);
        colours.push(polygon.colour.r, polygon.colour.g, polygon.colour.b); joints.push(polygon.joint, 0, 0, 0); weights.push(1, 0, 0, 0);
      }
      for (let i = 1; i + 1 < polygon.points.length; i++) indices.push(first, first + i, first + i + 1);
    }
    geometry.addGroup(start, indices.length - start, material);
  });
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3)); geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2)); geometry.setAttribute('color', new Float32BufferAttribute(colours, 3));
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(joints, 4)); geometry.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4)); geometry.setIndex(indices);
  const materials = MATERIALS.map((name) => { const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }); material.name = name; return material; });
  const mesh = new SkinnedMesh(geometry, materials); mesh.name = 'barrow-warden'; mesh.castShadow = true;
  const bones = new Map<Joint, Bone>();
  for (const name of JOINTS) {
    const bone = new Bone(); bone.name = name; const parent = PARENT[name], at = REST[name], from = parent === null ? [0, 0, 0] : REST[parent];
    bone.position.set((at[0] - (from[0] ?? 0)) * UNIT, (at[1] - (from[1] ?? 0)) * UNIT, (at[2] - (from[2] ?? 0)) * UNIT);
    (parent === null ? mesh : bones.get(parent))?.add(bone); bones.set(name, bone);
  }
  mesh.updateMatrixWorld(true); mesh.bind(new Skeleton(JOINTS.map((name) => bones.get(name) ?? new Bone())));
  return mesh;
}

const smooth = (t: number): number => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };
/** 0 → 1 across [from, to], eased. */
const ease = (t: number, from: number, to: number): number => smooth((t - from) / (to - from));
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
interface Pose { body?: [number, number, number]; bodyY?: number; bodyZ?: number; head?: [number, number, number]; armL?: [number, number, number]; armR?: [number, number, number]; legL?: [number, number, number]; legR?: [number, number, number] }
/** Arms hang a touch outward at rest (the cleanroom's s * 0.12). */
const HANG = 0.12;

/** Set every joint from rest: Euler angles (XYZ) per joint, the body raised or pushed in cleanroom units. The legs' angles are
 *  world angles (they hang from the body, so its lean is taken back out of them and they stay planted). */
function apply(mesh: SkinnedMesh, rest: ReadonlyMap<string, Vector3>, pose: Pose): void {
  for (const bone of mesh.skeleton.bones) {
    const name = bone.name as Joint, base = rest.get(name); if (base === undefined) throw new Error('Warden rest');
    bone.position.copy(base);
    const angles = pose[name] ?? (name === 'armL' ? [0, 0, HANG] : name === 'armR' ? [0, 0, -HANG] : [0, 0, 0]);
    bone.quaternion.setFromEuler(new Euler(angles[0], angles[1], angles[2], 'XYZ'));
  }
  const lean = new Quaternion().setFromEuler(new Euler(...(pose.body ?? [0, 0, 0]), 'XYZ')).invert();
  for (const leg of mesh.skeleton.bones.filter((bone) => bone.name === 'legL' || bone.name === 'legR')) leg.quaternion.premultiply(lean);
  const body = mesh.skeleton.bones.find((bone) => bone.name === 'body');
  if (body !== undefined) { body.position.y += (pose.bodyY ?? 0) * UNIT; body.position.z += (pose.bodyZ ?? 0) * UNIT; }
}

/** The five clips as pose closures over normalized time (idle 2 s, walk 1 s, attack 1 s at attackSpan 1, hit 0.6 s, die 2 s). */
function clipPose(name: string, t: number): Pose {
  const tau = Math.PI * 2;
  switch (name) {
    case 'idle': { const w = Math.sin(t / 2 * tau);
      return { bodyY: 0.02 * w, body: [0.015 * w, 0, 0], head: [-0.02 * w, 0.08 * Math.sin(t / 2 * tau + 1), 0], armL: [0.04 * w, 0, HANG + 0.03 * w], armR: [0.04 * w, 0, -HANG - 0.03 * w] }; }
    case 'walk': { const p = t * tau, s = Math.sin(p);
      return { bodyY: -0.05 + 0.05 * Math.abs(Math.cos(p)), body: [0.05, 0, 0.04 * s], head: [-0.03, -0.05 * s, 0], legL: [0.35 * s, 0, 0], legR: [-0.35 * s, 0, 0], armL: [-0.3 * s, 0, HANG + 0.05], armR: [0.3 * s, 0, -HANG - 0.05] }; }
    case 'attack': {
      // 0 → 0.5: both arms rise into the tell (the cleanroom's raised V); 0.5 → 0.58 they meet overhead; 0.58 → 0.64 the
      // slam (fists to the ground before it, the body pitched over them); held to 0.78, then back to rest
      const raise = ease(t, 0, 0.42), meet = ease(t, 0.5, 0.58), slam = ease(t, 0.58, 0.64), back = ease(t, 0.78, 1);
      const arm = (s: 1 | -1): [number, number, number] => {
        const x = mix(mix(0, -2.75, meet), -0.75, slam), z = mix(mix(s * HANG, s * 2.6, raise), s * 0.3, meet);
        return [mix(x, 0, back), 0, mix(slam > 0 ? mix(z, s * 0.18, slam) : z, s * HANG, back)];
      };
      const lean = mix(mix(-0.14 * raise, 0.7, slam), 0, back), drop = mix(mix(0.04 * raise, 0, slam), 0, back);
      return { body: [lean, 0, 0], bodyY: drop, head: [mix(-0.2 * raise * (1 - slam), 0.1 * slam, 1 - back), 0, 0], armL: arm(1), armR: arm(-1) }; }
    case 'hit': { const k = Math.sin(Math.min(1, t / 0.6) * Math.PI) * (1 - t / 0.6 * 0.3);
      return { body: [-0.16 * k, 0.06 * k, 0], bodyZ: -0.12 * k, head: [-0.12 * k, 0, 0.06 * k], armL: [0.25 * k, 0, HANG + 0.2 * k], armR: [0.25 * k, 0, -HANG - 0.2 * k] }; }
    case 'die': {
      // the legs give, the golem sinks and topples back, arms splayed, the head lolling (held on the last frame)
      const sink = ease(t, 0, 0.7), fall = ease(t, 0.35, 1.3), settle = ease(t, 1.1, 1.5);
      const y = -0.6 * sink - 0.3 * fall, z = -0.9 * fall;
      return { bodyY: y, bodyZ: z, body: [-1.25 * fall, 0, 0.12 * sink], head: [-0.3 * fall - 0.15 * settle, 0.4 * settle, 0.25 * settle],
        armL: [-0.4 * fall, 0, HANG + 1.1 * fall], armR: [-0.6 * fall, 0, -HANG - 0.9 * fall], legL: [-1.4 * sink, 0, 0.2 * sink], legR: [-1.3 * sink, 0, -0.25 * sink] }; }
    default: throw new Error(`Warden clip ${name}`);
  }
}

const CLIPS = [['idle', 2], ['walk', 1], ['attack', 1], ['hit', 0.6], ['die', 2]] as const;
/** The skin's clip rate: 30 Hz linear samples, half the bytes of 60 Hz on slow stone. */
const RATE = 30;

/** One `data/skins.json` entry, as `product.ts` reads it. */
export interface WardenSkinEntry {
  species: string; look: string; skin: string; glb: string;
  files: { hash: string; kind: 'json' | 'glb'; compressed: number; decoded: number; gpu: number; triangles: number; draws: number; dependencies: string[]; critical: boolean }[];
}
/** Bake the Warden: the GLB, its `{ row, binding }` skin file and the skins.json entry, deterministic from this source. */
export async function bakeWardenSkin(): Promise<{ glb: Uint8Array; json: Uint8Array; entry: WardenSkinEntry }> {
  const mesh = buildMesh(buildHull()), rest = new Map(mesh.skeleton.bones.map((bone) => [bone.name, bone.position.clone()]));
  try {
    const clips: SampledSkinClip[] = CLIPS.map(([name, duration]) => sampleSkinClip(mesh, name, duration, (time) => { apply(mesh, rest, clipPose(name, time)); }, RATE));
    const glb = await skinnedGlb(mesh, clips, 'barrow-warden'), cost = parseGlb(glb), file = hashImmutableBytes(glb);
    const row = { id: 'barrow-warden', file, family: 'pbr', rig: { skeleton: 'template.barrowWarden', joints: [[...JOINTS]], clips: CLIPS.map(([name]) => name), sockets: ['body', 'head'] },
      cost: { decoded: cost.decoded, gpu: cost.gpu, triangles: cost.triangles, draws: cost.draws } };
    const binding = { skin: 'barrow-warden', material: { family: 'pbr', roughness: 0.9, metalness: 0, occlusion: 0, envStrength: 0.7, vertexColours: true }, materials: { ...WARDEN_PARTS }, loops: ['idle', 'walk'] };
    const json = new TextEncoder().encode(JSON.stringify({ row, binding })), skin = hashImmutableBytes(json);
    return { glb, json, entry: { species: 'barrow-warden', look: 'template.look.barrowWarden', skin, glb: file, files: [
      // the parsed rows: twice the text, over the plain JSON charge (as scripts/bake/template-skins.mjs declares the others)
      { hash: skin, kind: 'json', compressed: json.length, decoded: json.length * 2, gpu: 0, triangles: 0, draws: 0, dependencies: [file], critical: false },
      { hash: file, kind: 'glb', compressed: glb.length, decoded: cost.decoded, gpu: cost.gpu, triangles: cost.triangles, draws: cost.draws, dependencies: [], critical: false },
    ] } };
  } finally { mesh.geometry.dispose(); for (const material of [mesh.material].flat()) material.dispose(); }
}
