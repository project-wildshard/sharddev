// Mossgate Hollow, whole, as three.js source (SHARD-SOURCE AP15): the cleanroom's src/world.js and the light of its
// src/main.js (mossgate-cleanroom 9cb4dc6), ported section by section. The geometry, materials and lights are the
// cleanroom's own lines. What changed, as in the authoring slice (AP7): each section is a `world.part` with its own seeded
// stream (editing the hut never reshuffles the trees), each `colliders.push` box is an invisible `solid` box at the same
// numbers, the pond's Reflector is a `Water`, the canvas painters run at compile time, `update(t)` is said once with
// `animate`, the instanced glow billboard (an `onBeforeCompile` patch) is one additive Sprite per halo, and the phone
// LODs and static merge are the engine's (AP8). The quest state is fixed: brazier A lit, the gate shut, the bridge sunk,
// the Warden idle; making it live is stage 6 (AP23 to AP27).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { animate, drift, flicker, pulse, rise, solid, sway, Water, type ShardWorld } from '@wildshard/sdk/scene/author';
import * as T from './textures';
import { sunsetSky } from './sky';

export const LAYOUT = {
  SPAWN: { x: 0.3, z: 1.8, yaw: 0.04 },
  HUT: { x: -4.0, z: -14.0, w: 5.2, d: 4.6, h: 2.5 }, // door face at z + d/2
  LAMPLIGHTER: { x: 1.3, z: -6.4 },
  SIGN: { x: -6.8, z: -8.8 },
  BRAZIERS: [[5.9, -12.8, 'A'], [-27.6, 0.2, 'B'], [9.6, -5.4, 'C']] as const,
  ROW: [[8.3, -12.8, 'B'], [10.7, -12.8, 'C']] as const,
  GATE: { x: -10, z: 0, half: 1.75 },
  POND: { x: -19.4, z: 0, hx: 6.6, hz: 5.4, r: 2.2 },
  ARENA: { x: 25.5, z: -2, r: 9.5 },
  ARCH: { x: 16, z: -2 },
  YARD: { x0: -10, x1: 12.5, z0: -18.6, z1: 8 },
};

/** The quest state the shard shows (the cleanroom's `?lit=A`): stage 6 makes it live. */
export const STATE = { lit: 'A', gateOpen: false, bridgeUp: false };

const noise = T.makeNoise(99);
const sstep = THREE.MathUtils.smoothstep;
type Materials = Record<string, THREE.MeshStandardMaterial>;
type Textures = Record<string, THREE.Texture>;

/** Signed distance to the pond's rounded rectangle (negative inside). */
export function pondSDF(x: number, z: number): number {
  const { x: px, z: pz, hx, hz, r } = LAYOUT.POND;
  const qx = Math.abs(x - px) - hx + r, qz = Math.abs(z - pz) - hz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
}

export function groundHeight(x: number, z: number): number {
  let y = 0;
  const dp = pondSDF(x, z);
  if (dp < 0.6) y -= 1.1 * (1 - sstep(dp, -1.6, 0.6));
  const da = Math.hypot(x - LAYOUT.ARENA.x, z - LAYOUT.ARENA.z);
  if (da < LAYOUT.ARENA.r) y -= 0.35;
  // the cell edge stays at road height for the four entryways (the cleanroom had no edge)
  const far = sstep(Math.hypot(x - 4, z + 2), 48, 95) * (1 - sstep(Math.hypot(x, z), 170, 230));
  y += far * (noise.fbm(x * 0.02 + 50, z * 0.02 + 50, 3) - 0.35) * 7;
  return y;
}

/** The moss floor's colour, as the cleanroom's ground vertex colours times its moss texture's mean. */
export function groundColour(x: number, z: number): [number, number, number] {
  const v = noise.fbm(x * 0.07, z * 0.07, 4), w = noise.fbm(x * 0.018 + 9, z * 0.018 + 4, 3);
  const c = new THREE.Color().setRGB(0.96 + (v - 0.5) * 0.3, 0.98 + (v - 0.5) * 0.22, 0.86 + (w - 0.5) * 0.3);
  const dp = pondSDF(x, z);
  if (dp < 0.9) c.lerp(new THREE.Color(0.42, 0.38, 0.3), 1 - sstep(dp, -0.4, 0.9));
  const moss = new THREE.Color().setRGB(102 / 255, 120 / 255, 48 / 255, THREE.SRGBColorSpace);
  return [c.r * moss.r, c.g * moss.g, c.b * moss.b];
}

/** The textures and materials every part shares (`buildWorld`'s `tex` and `M`). */
function materials(): { M: Materials; tex: Textures } {
  const tex = { stone: T.stone(3, { moss: 0.32 }), stoneClean: T.stone(8, { moss: 0.12 }), slab: T.slab(), wood: T.wood(), shingle: T.shingle(), checker: T.checker(), glow: T.glow(), ivy: T.ivy(), drape: T.hangingMoss(), frond: T.frond(), grass: T.grassCard(), flame: T.flameSprite() };
  const M = {
    stone: new THREE.MeshStandardMaterial({ map: tex.stone, roughness: 0.93 }),
    stoneClean: new THREE.MeshStandardMaterial({ map: tex.stoneClean, roughness: 0.9 }),
    slab: new THREE.MeshStandardMaterial({ map: tex.slab, roughness: 0.88 }),
    wood: new THREE.MeshStandardMaterial({ map: tex.wood, roughness: 0.78 }),
    darkWood: new THREE.MeshStandardMaterial({ map: tex.wood, color: '#8a6a52', roughness: 0.82 }),
    shingle: new THREE.MeshStandardMaterial({ name: 'roof', map: tex.shingle, roughness: 0.95 }),
    moss: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
    iron: new THREE.MeshStandardMaterial({ color: '#3a302a', roughness: 0.5, metalness: 0.6 }),
    bronze: new THREE.MeshStandardMaterial({ color: '#7a5634', roughness: 0.45, metalness: 0.7 }),
    lampGlass: new THREE.MeshStandardMaterial({ color: '#ffc061', emissive: '#ffa73a', emissiveIntensity: 2.6, roughness: 0.3 }),
    lampOff: new THREE.MeshStandardMaterial({ color: '#4a3e30', roughness: 0.6 }),
    ivy: new THREE.MeshStandardMaterial({ map: tex.ivy, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 }),
    drape: new THREE.MeshStandardMaterial({ map: tex.drape, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 1 }),
    cloth: new THREE.MeshStandardMaterial({ color: '#8a3a2a', roughness: 0.95 }),
    rope: new THREE.MeshStandardMaterial({ color: '#b8925a', roughness: 0.9 }),
  };
  return { M, tex };
}

// The cleanroom's update(t), said as data (AP12): every lamp's intensity * (0.92 + 0.05 sin 7t + 0.03 sin 17.3t), a flame
// tongue's height * (0.85 + 0.12 sin 9t + 0.06 sin 23t), foliage in the wind, sparks climbing, fireflies wandering.
const LAMP_FLICKER = flicker({ rate: 1.1, amount: 0.08 });
const FLAME_PULSE = pulse({ rate: 1.4, amount: 0.14 });
const FOLIAGE_SWAY = sway({ rate: 0.5, amount: 0.06 });

// One material per halo colour and strength, per stencil text: repeated ones share a draw (the cleanroom's decalMats).
const glowMats = new Map<string, THREE.SpriteMaterial>(), decalMats = new Map<string, THREE.MeshStandardMaterial>();
const sparkMats = new Map<string, THREE.PointsMaterial>();
let flameMat: THREE.SpriteMaterial | null = null;
function glowMat(tex: Textures, colour: string, opacity: number): THREE.SpriteMaterial {
  const key = `${colour}/${opacity}`;
  let m = glowMats.get(key);
  if (m === undefined) { m = new THREE.SpriteMaterial({ map: tex.glow, color: colour, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, fog: false }); glowMats.set(key, m); }
  return m;
}

interface Block { x: number; y: number; z: number; sx: number; sy: number; sz: number; rotY: number; rotX?: number; tint: number }
const boxGeo = new THREE.BoxGeometry(1, 1, 1), hidden = new THREE.MeshBasicMaterial();

/** One part's builders: the cleanroom's accumulators (`addBlock`, `addCap`, `drape`, `ivy`), its colliders, lamps and fires. */
function kit(part: THREE.Group, seed: number, M: Materials, tex: Textures) {
  const rand = T.rng(seed);
  const R = (a: number, b: number): number => a + (b - a) * rand();
  const blockGeo = new RoundedBoxGeometry(1, 1, 1, 3, 0.07);
  const capGeo = (() => {
    const g = new RoundedBoxGeometry(1, 1, 1, 7, 0.38);
    const p = g.attributes.position;
    if (p === undefined) return g;
    const c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = noise(x * 7 + 10, z * 7 + 10), n2 = noise(x * 19 + 3, z * 19 + y * 9);
      if (y > 0) p.setY(i, y + (n - 0.5) * 0.4 + (n2 - 0.5) * 0.12);
      else p.setY(i, y - n * 0.45);
      const k = 0.72 + n * 0.42 + (n2 - 0.5) * 0.18;
      const top = y > 0 ? 1 : 0.62;
      c.set([0.085 * k * top, 0.16 * k * top, 0.034 * k * top], i * 3); // linear: olive moss
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.computeVertexNormals();
    return g;
  })();
  const stoneBlocks: Block[] = [], caps: Omit<Block, 'tint'>[] = [], drapeGeos: THREE.BufferGeometry[] = [], ivyGeos: THREE.BufferGeometry[] = [];
  const addBlock = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rotY = 0, tint = 1): void => { stoneBlocks.push({ x, y, z, sx, sy, sz, rotY, tint }); };
  const addCap = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rotY = 0): void => { caps.push({ x, y, z, sx, sy, sz, rotY }); };
  /** The cleanroom's `colliders.push({ x, y, z, hx, hy, hz, rotY })`: an invisible solid box at the same numbers. */
  function collider(c: { x: number; y: number; z: number; hx: number; hy: number; hz: number; rotY: number }): void {
    const m = new THREE.Mesh(boxGeo, hidden);
    m.position.set(c.x, c.y, c.z); m.scale.set(c.hx * 2, c.hy * 2, c.hz * 2); m.rotation.y = c.rotY; m.visible = false;
    part.add(solid(m));
  }
  function drape(x: number, y: number, z: number, len: number, rotY: number, h = 0.45): void {
    const g = new THREE.PlaneGeometry(len, h, Math.max(1, Math.round(len * 3)), 2);
    g.translate(0, -h / 2, 0);
    const p = g.attributes.position, uv = g.attributes.uv;
    if (p !== undefined) for (let i = 0; i < p.count; i++) { p.setZ(i, (noise(p.getX(i) * 3 + x, y) - 0.5) * 0.06); uv?.setX(i, uv.getX(i) * len * 0.9 + R(0, 0)); }
    g.rotateY(rotY); g.translate(x, y, z);
    drapeGeos.push(g);
  }
  function ivy(x: number, y: number, z: number, len: number, rotY: number, w = 0.32): void {
    const g = new THREE.PlaneGeometry(w, len, 1, 5);
    g.translate(0, -len / 2, 0);
    const p = g.attributes.position;
    if (p !== undefined) for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getY(i) * 2.2 + x) * 0.03);
    g.rotateY(rotY); g.translate(x, y, z);
    ivyGeos.push(g);
  }
  function lantern(x: number, y: number, z: number, { on = true, scale = 1, light = true } = {}): THREE.Group {
    const g = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.2), on ? M.lampGlass : M.lampOff);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.15, 4), M.iron); cap.position.y = 0.22; cap.rotation.y = Math.PI / 4;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.05, 0.27), M.iron); base.position.y = -0.155;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 12), M.iron); ring.position.y = 0.33;
    g.add(glass, cap, base, ring);
    for (const [bx, bz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.32, 0.035), M.iron); b.position.set(bx * 0.11, 0, bz * 0.11); g.add(b);
    }
    g.position.set(x, y, z); g.scale.setScalar(scale);
    part.add(g);
    if (on) {
      if (light) {
        const l = new THREE.PointLight('#ffa850', 3.4 * scale, 6, 1.7);
        l.position.set(x, y, z); part.add(animate(l, LAMP_FLICKER));
      }
      halo(x, y, z, 1.1 * scale, '#ffb466', 0.5);
    }
    return g;
  }
  function halo(x: number, y: number, z: number, size: number, colour: string, opacity: number): void {
    const s = new THREE.Sprite(glowMat(tex, colour, opacity));
    s.scale.setScalar(size); s.position.set(x, y, z); part.add(s);
  }
  // A gallows post: a squared timber with an arm, a rope and a hanging lantern.
  function lanternPost(x: number, z: number, rotY = 0, { h = 2.7, on = true, stoneBase = false } = {}): void {
    const gy = groundHeight(x, z);
    const ax = Math.sin(rotY), az = Math.cos(rotY);
    if (stoneBase) {
      const b = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.7, 0.62, 2, 0.05), M.stone); b.position.set(x, gy + 0.35, z); b.castShadow = true; part.add(b);
      addCap(x, gy + 0.72, z, 0.66, 0.16, 0.66);
    }
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.2, h, 0.2), M.wood); p.position.set(x, gy + h / 2, z); p.castShadow = true; part.add(p);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.95), M.wood);
    arm.position.set(x + ax * 0.4, gy + h - 0.12, z + az * 0.4); arm.rotation.y = rotY; arm.castShadow = true; part.add(arm);
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.55), M.wood);
    brace.position.set(x + ax * 0.2, gy + h - 0.36, z + az * 0.2); brace.rotation.set(0, rotY, 0); brace.rotateX(0.75); part.add(brace);
    const lx = x + ax * 0.74, lz = z + az * 0.74;
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.42, 5), M.rope);
    rope.position.set(lx, gy + h - 0.4, lz); part.add(rope);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.03, 6, 12), M.rope); coil.position.set(lx, gy + h - 0.12, lz); coil.rotation.y = rotY; part.add(coil);
    lantern(lx, gy + h - 0.82, lz, { on, scale: 1.25 });
    collider({ x, y: gy + h / 2, z, hx: 0.12, hy: h / 2, hz: 0.12, rotY: 0 });
  }
  // A wall bracket lamp: an iron arm out of a stone face.
  function bracketLamp(x: number, y: number, z: number, rotY: number, on = true): void {
    const ax = Math.sin(rotY), az = Math.cos(rotY);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.5), M.iron); arm.position.set(x + ax * 0.22, y + 0.42, z + az * 0.22); arm.rotation.y = rotY; part.add(arm);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.04), M.iron); plate.position.set(x, y + 0.36, z); plate.rotation.y = rotY; part.add(plate);
    lantern(x + ax * 0.44, y, z + az * 0.44, { on, scale: 1.05 });
  }
  // Fire: three flame cards breathing (normal blending, so overlapping tongues stay orange), a flickering light, a halo,
  // and 36 sparks climbing 2.6 m (the cleanroom's (s0 + t sp 0.4) % 1).
  function fire(x: number, y: number, z: number, size = 1): void {
    flameMat ??= new THREE.SpriteMaterial({ map: tex.flame, color: new THREE.Color(1.5, 1.3, 1.15), depthWrite: false, transparent: true, fog: false, alphaTest: 0.05 });
    const g = animate(new THREE.Group(), FLAME_PULSE);
    for (let i = 0; i < 3; i++) {
      const h = ([1.9, 1.5, 1.3][i] ?? 1) * size, s = new THREE.Sprite(flameMat);
      // the cleanroom's mean frame (k = 0.85): the pulse breathes round it
      s.center.set(0.5, 0.1); s.scale.set(h * 0.62 * 1.05, h * 0.85, 1); s.position.set(([0, -0.24, 0.26][i] ?? 0) * size, -0.02, ([0, 0.12, -0.14][i] ?? 0) * size);
      g.add(s);
    }
    g.position.set(x, y, z); part.add(g);
    const l = new THREE.PointLight('#ff9a3a', 16 * size, 12, 1.5); l.position.set(x, y + 0.7, z); part.add(animate(l, LAMP_FLICKER));
    halo(x, y + 0.55, z, 2.6 * size, '#ff8a40', 0.18);
    const sparks = new Float32Array(36 * 3);
    for (let i = 0; i < 36; i++) sparks.set([x + R(-0.35, 0.35), y + 0.4, z + R(-0.35, 0.35)], i * 3);
    let sm = sparkMats.get('fire');
    if (sm === undefined) { sm = new THREE.PointsMaterial({ map: tex.glow, color: new THREE.Color('#ffc060').multiplyScalar(3), size: 0.07, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); sparkMats.set('fire', sm); }
    part.add(animate(new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(sparks, 3)), sm), rise({ rate: 0.3, height: 2.6 * size, spread: 0.5 })));
  }
  // flush instanced stone, caps, drapes and ivy into the part
  function flush(): void {
    const o = new THREE.Object3D(), c = new THREE.Color();
    if (stoneBlocks.length > 0) {
      const im = new THREE.InstancedMesh(blockGeo, M.stone, stoneBlocks.length);
      stoneBlocks.forEach((b, i) => {
        o.position.set(b.x, b.y, b.z); o.rotation.set(0, b.rotY, 0, 'YXZ'); if (b.rotX !== undefined) o.rotation.set(b.rotX, 0, 0); o.scale.set(b.sx, b.sy, b.sz); o.updateMatrix();
        im.setMatrixAt(i, o.matrix); im.setColorAt(i, c.setRGB(b.tint, b.tint * R(0.96, 1.0), b.tint * R(0.9, 0.97)));
      });
      im.castShadow = im.receiveShadow = true; part.add(im);
    }
    if (caps.length > 0) {
      const cm = new THREE.InstancedMesh(capGeo, M.moss, caps.length);
      caps.forEach((b, i) => { o.position.set(b.x, b.y, b.z); o.rotation.set(0, b.rotY, 0); o.scale.set(b.sx, b.sy, b.sz); o.updateMatrix(); cm.setMatrixAt(i, o.matrix); });
      cm.castShadow = cm.receiveShadow = true; part.add(cm);
    }
    if (drapeGeos.length > 0) { const d = new THREE.Mesh(mergeGeometries(drapeGeos), M.drape); d.castShadow = true; part.add(d); }
    if (ivyGeos.length > 0) part.add(new THREE.Mesh(mergeGeometries(ivyGeos), M.ivy));
  }
  return { rand, R, capGeo, stoneBlocks, addBlock, addCap, collider, drape, ivy, lantern, halo, lanternPost, bracketLamp, fire, flush };
}
type Kit = ReturnType<typeof kit>;

function decal(part: THREE.Group, text: string, x: number, y: number, z: number, rotY: number, size = 1, floor = false): THREE.Mesh {
  let mat = decalMats.get(text);
  if (mat === undefined) { mat = new THREE.MeshStandardMaterial({ map: T.stencil(text), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.9 }); decalMats.set(text, mat); }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size / 2), mat);
  m.position.set(x, y, z);
  if (floor) m.rotation.set(-Math.PI / 2, 0, rotY); else m.rotation.y = rotY;
  m.receiveShadow = true;
  part.add(m);
  return m;
}

/** The yard and pond-garden walls (cleanroom world.js 183-244): coursed blocks, a fat moss cap, drapes, ivy, stencils. */
export function walls(part: THREE.Group, M: Materials, tex: Textures): void {
  const k = kit(part, 183, M, tex), { R, addBlock, addCap, collider, drape, ivy } = k;
  function wall(x0: number, z0: number, x1: number, z1: number, { h = 1.45, t = 0.75, gaps = [] as [number, number][], label = '3x3' as string | null } = {}): void {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    const rotY = Math.atan2(-dz, dx), ux = dx / len, uz = dz / len, nx = -uz, nz = ux;
    const courses = 3, ch = h / courses;
    const inGap = (m: number): boolean => gaps.some(([a, b]) => m > a && m < b);
    for (let c = 0; c < courses; c++) {
      let s = c % 2 ? -0.6 : 0;
      while (s < len) {
        const bl = Math.min(R(0.8, 1.5), len - Math.max(s, 0));
        const a = Math.max(s, 0), b = Math.min(s + bl, len);
        const m = (a + b) / 2;
        if (b - a > 0.2 && !inGap(m)) addBlock(x0 + ux * m, ch * c + ch / 2, z0 + uz * m, b - a - 0.05, ch - 0.04, t * R(0.94, 1.06), rotY, R(0.8, 1.08));
        s += bl;
      }
    }
    const edges = [0, ...gaps.flat(), len];
    for (let i = 0; i < edges.length; i += 2) {
      const a = edges[i] ?? 0, b = edges[i + 1] ?? 0;
      if (b - a < 0.3) continue;
      const m = (a + b) / 2, cx = x0 + ux * m, cz = z0 + uz * m;
      addCap(cx, h + 0.06, cz, b - a + 0.12, 0.36, t + 0.22, rotY);
      collider({ x: cx, y: h / 2, z: cz, hx: (b - a) / 2, hy: h / 2 + 0.2, hz: t / 2, rotY });
      for (const side of [-1, 1]) {
        // drapes in short runs so the edge stays ragged
        for (let s = a + R(0, 0.6); s < b - 0.4; s += R(1.2, 2.6)) {
          const l = Math.min(R(0.6, 1.6), b - s);
          drape(x0 + ux * (s + l / 2) + nx * side * (t / 2 + 0.115), h + 0.02, z0 + uz * (s + l / 2) + nz * side * (t / 2 + 0.115), l, rotY, R(0.25, 0.6));
        }
        for (let s = a + R(0.5, 2); s < b - 0.3; s += R(2.5, 5)) {
          ivy(x0 + ux * s + nx * side * (t / 2 + 0.05), h + 0.05, z0 + uz * s + nz * side * (t / 2 + 0.05), R(0.7, h), rotY);
        }
      }
      if (label !== null && b - a > 4) {
        for (const side of [-1, 1]) decal(part, label, cx + nx * side * (t / 2 + 0.02), h * 0.55, cz + nz * side * (t / 2 + 0.02), rotY + (side > 0 ? 0 : Math.PI), 1.0);
      }
    }
  }
  const Y = LAYOUT.YARD, G = LAYOUT.GATE, P = LAYOUT.POND;
  wall(Y.x0, Y.z0, Y.x0, Y.z1, { gaps: [[G.z - Y.z0 - G.half - 0.5, G.z - Y.z0 + G.half + 0.5]] }); // west, the moss gate
  wall(Y.x0, Y.z0, Y.x1, Y.z0); // north, behind the hut
  wall(Y.x1, Y.z0, Y.x1, Y.z1, { gaps: [[LAYOUT.ARCH.z - Y.z0 - 1.9, LAYOUT.ARCH.z - Y.z0 + 1.9]] }); // east, toward the arch
  wall(Y.x0, Y.z1, Y.x1, Y.z1, { h: 1.2 }); // south
  // the pond's garden: low walls around it, open toward the gate
  wall(Y.x0, -9, P.x - P.hx - 7, -9, { h: 1.2, label: null });
  wall(Y.x0, 9, P.x - P.hx - 7, 9, { h: 1.2, label: null });
  wall(P.x - P.hx - 7, -9, P.x - P.hx - 7, 9, { h: 1.2 });
  // the lamps along the walls (cleanroom world.js 973-977)
  k.lanternPost(-7.4, 3.6, -Math.PI / 2 - 0.4);
  k.lanternPost(13.4, -5.0, Math.PI / 2);
  k.bracketLamp(Y.x1 - 0.4, 1.0, -12.6, -Math.PI / 2, true);
  k.flush();
}

/** The distant dev district (cleanroom world.js 246-274): towers, slabs and scaffold frames the haze eats. */
export function district(part: THREE.Group): void {
  const rand = T.rng(246), R = (a: number, b: number): number => a + (b - a) * rand();
  const solids: { x: number; z: number; w: number; h: number; d: number; r: number }[] = [];
  const beams: { x: number; y: number; z: number; sx: number; sy: number; sz: number; r: number }[] = [];
  for (let i = 0; i < 110; i++) {
    const a = R(0, Math.PI * 2), d = R(85, 200);
    const x = 4 + Math.cos(a) * d, z = -2 + Math.sin(a) * d;
    const kind = rand();
    if (kind < 0.62) solids.push({ x, z, w: R(4, 16), h: R(3, 10) * (rand() < 0.2 ? 1.6 : 1), d: R(4, 16), r: R(0, 3) });
    else {
      // a scaffold frame: four posts and two rings of beams
      const w = R(5, 10), h = R(6, 13), r = R(0, 3);
      const cs = Math.cos(r), sn = Math.sin(r);
      const P2 = (px: number, pz: number): [number, number] => [x + px * cs - pz * sn, z + px * sn + pz * cs];
      for (const [px, pz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) { const [qx, qz] = P2(px * w / 2, pz * w / 2); beams.push({ x: qx, y: h / 2, z: qz, sx: 0.5, sy: h, sz: 0.5, r }); }
      for (const yy of [h * 0.5, h]) {
        for (const [px, pz, sx, sz] of [[0, -1, w, 0.45], [0, 1, w, 0.45], [-1, 0, 0.45, w], [1, 0, 0.45, w]] as const) { const [qx, qz] = P2(px * w / 2, pz * w / 2); beams.push({ x: qx, y: yy, z: qz, sx, sy: 0.45, sz, r }); }
      }
    }
  }
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#8a7a8c', roughness: 0.95 }), solids.length + beams.length);
  const o = new THREE.Object3D();
  let k = 0;
  for (const b of solids) { o.position.set(b.x, groundHeight(b.x, b.z) + b.h / 2 - 0.5, b.z); o.scale.set(b.w, b.h, b.d); o.rotation.set(0, b.r, 0); o.updateMatrix(); im.setMatrixAt(k++, o.matrix); }
  for (const b of beams) { o.position.set(b.x, groundHeight(b.x, b.z) + b.y - 0.3, b.z); o.scale.set(b.sx, b.sy, b.sz); o.rotation.set(0, b.r, 0); o.updateMatrix(); im.setMatrixAt(k++, o.matrix); }
  part.add(im);
}

interface Slab { x: number; z: number; sx: number; sz: number; r: number }
/** The stepping-stone paths' slabs (cleanroom world.js 276-296), from their own stream: the grass reads them too. */
function pathSlabs(): { slabs: Slab[]; R: (a: number, b: number) => number } {
  const rand = T.rng(276), R = (a: number, b: number): number => a + (b - a) * rand();
  const slabs: Slab[] = [];
  function path(points: readonly (readonly [number, number])[], { step = 1.15, width = 1.25 } = {}): void {
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i] ?? [0, 0], [bx, bz] = points[i + 1] ?? [0, 0];
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / step));
      for (let k = i === 0 ? 0 : 1; k <= n; k++) {
        const t = k / n, dir = Math.atan2(bx - ax, bz - az);
        const x = ax + (bx - ax) * t + R(-0.15, 0.15), z = az + (bz - az) * t + R(-0.1, 0.1);
        slabs.push({ x, z, sx: width * R(0.7, 1.0), sz: step * R(0.62, 0.8), r: dir + R(-0.22, 0.22) });
      }
    }
  }
  const H = LAYOUT.HUT, doorZ = H.z + H.d / 2, G = LAYOUT.GATE, P = LAYOUT.POND, [A, B] = LAYOUT.BRAZIERS;
  path([[0, 3], [-0.6, -4], [-2.6, -9], [H.x, doorZ + 0.6]]);
  path([[-1.4, 0.6], [-5, 0.2], [G.x + 1.2, G.z]], { width: 1.15 });
  path([[0.8, -1.2], [4.2, -4], [A[0], A[1] + 2.1]], { width: 1.05 });
  path([[1.5, 0.6], [6, -1.2], [LAYOUT.ARCH.x - 1.4, LAYOUT.ARCH.z]], { width: 1.15 });
  path([[G.x - 1.2, G.z], [P.x + P.hx + 0.9, P.z]], { width: 1.2 });
  path([[P.x - P.hx - 0.6, P.z], [B[0] + 1.3, B[1]]], { width: 1.1 });
  return { slabs, R };
}

/** The stepping-stone paths: flat irregular stones flush with the moss, their corners squashed so they read worn. */
export function paths(part: THREE.Group, M: Materials): void {
  const { slabs, R } = pathSlabs();
  const base = new RoundedBoxGeometry(1, 0.12, 1, 3, 0.05);
  const p = base.attributes.position;
  if (p !== undefined) for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
    if (r > 0.55) { const k = 0.55 / r + (1 - 0.55 / r) * 0.45; p.setX(i, x * k); p.setZ(i, z * k); }
  }
  base.computeVertexNormals();
  const im = new THREE.InstancedMesh(base, M.slab, slabs.length);
  const o = new THREE.Object3D(), c = new THREE.Color();
  slabs.forEach((s, i) => {
    o.position.set(s.x, groundHeight(s.x, s.z), s.z);
    o.rotation.set(R(-0.015, 0.015), s.r, R(-0.015, 0.015));
    o.scale.set(s.sx, 1, s.sz);
    o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    im.setColorAt(i, c.setScalar(R(0.82, 1.04)));
  });
  im.receiveShadow = true;
  part.add(im);
}

/** The braziers (cleanroom world.js 401-428): a lettered pad, a stone plinth, a wide bowl; A lit, the rest cold coal. */
export function braziers(part: THREE.Group, M: Materials, tex: Textures): void {
  const k = kit(part, 401, M, tex);
  const coalM = new THREE.MeshStandardMaterial({ color: '#2a2220', roughness: 1 });
  function brazier(bx: number, bz: number, letter: string, lit: boolean, scale = 1): void {
    const gy = groundHeight(bx, bz);
    const pad = new THREE.Mesh(new RoundedBoxGeometry(2.1, 0.12, 2.1, 2, 0.05), M.slab);
    pad.position.set(bx, gy + 0.02, bz); pad.receiveShadow = true; part.add(pad);
    decal(part, letter, bx, gy + 0.09, bz + 0.68, 0, 0.9, true);
    const g = new THREE.Group();
    const plinth = new THREE.Mesh(new RoundedBoxGeometry(0.78, 0.5, 0.78, 2, 0.05), M.stone); plinth.position.y = 0.25;
    const step = new THREE.Mesh(new RoundedBoxGeometry(0.98, 0.14, 0.98, 2, 0.04), M.stone); step.position.y = 0.07;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.32, 8), M.stone); stem.position.y = 0.66;
    const prof = [new THREE.Vector2(0, 0)];
    for (let i = 0; i <= 10; i++) { const t = i / 10; prof.push(new THREE.Vector2(0.22 + 0.42 * Math.sin(t * Math.PI / 2), t * 0.4)); }
    prof.push(new THREE.Vector2(0.72, 0.42), new THREE.Vector2(0.7, 0.46), new THREE.Vector2(0.6, 0.42), new THREE.Vector2(0.0, 0.32));
    const bowl = new THREE.Mesh(new THREE.LatheGeometry(prof, 8), M.stone); bowl.position.y = 0.8;
    g.add(plinth, step, stem, bowl);
    g.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.position.set(bx, gy, bz); g.scale.setScalar(scale); part.add(g);
    k.collider({ x: bx, y: gy + 0.6, z: bz, hx: 0.45, hy: 0.6, hz: 0.45, rotY: 0 });
    const top = gy + 1.18 * scale;
    if (lit) k.fire(bx, top, bz, scale);
    else {
      const coal = new THREE.Mesh(new THREE.CircleGeometry(0.5 * scale, 12), coalM);
      coal.rotation.x = -Math.PI / 2; coal.position.set(bx, top - 0.02, bz); part.add(coal);
    }
  }
  for (const [x, z, l] of LAYOUT.BRAZIERS) brazier(x, z, l, STATE.lit.includes(l));
  for (const [x, z, l] of LAYOUT.ROW) brazier(x, z, l, STATE.lit.includes(l), 0.92);
}

/** The hut (cleanroom world.js 430-554): coursed walls, gables, a shingle roof, door, sign, bracket lamp and the room. */
export function hut(part: THREE.Group, M: Materials, tex: Textures): void {
  const k = kit(part, 430, M, tex), { R, addBlock, addCap, drape, ivy, lantern, bracketLamp, collider, rand } = k;
  const H = LAYOUT.HUT, doorZ = H.z + H.d / 2;
  const { x: hx, z: hz, w: W, d: D, h: Hh } = H;
  const z0 = doorZ, z1 = hz - D / 2;
  const rows = 6, rh = Hh / rows, doorW = 1.3, doorH = 2.0;
  for (let r = 0; r < rows; r++) {
    const y = r * rh + rh / 2, off = r % 2 ? 0.4 : 0;
    for (const [fz, front] of [[z0, true], [z1, false]] as const) {
      let s = -W / 2 - off;
      while (s < W / 2) {
        const bl = R(0.75, 1.15), a = Math.max(s, -W / 2), b = Math.min(s + bl, W / 2);
        s += bl;
        if (b - a < 0.15) continue;
        if (front && y < doorH && b > -doorW / 2 - 0.12 && a < doorW / 2 + 0.12) {
          if (a < -doorW / 2 - 0.12) addBlock(hx + (a - doorW / 2 - 0.12) / 2, y, fz, -doorW / 2 - 0.12 - a - 0.03, rh - 0.03, 0.5, 0, R(0.82, 1.05));
          if (b > doorW / 2 + 0.12) addBlock(hx + (b + doorW / 2 + 0.12) / 2, y, fz, b - doorW / 2 - 0.12 - 0.03, rh - 0.03, 0.5, 0, R(0.82, 1.05));
          continue;
        }
        addBlock(hx + (a + b) / 2, y, fz, b - a - 0.03, rh - 0.03, 0.5, 0, R(0.82, 1.05));
      }
    }
    for (const fx of [-W / 2, W / 2]) {
      let s = z1 - off;
      while (s < z0) {
        const bl = R(0.75, 1.15), a = Math.max(s, z1 + 0.25), b = Math.min(s + bl, z0 - 0.25);
        s += bl;
        if (b - a < 0.15) continue;
        addBlock(hx + fx, y, (a + b) / 2, 0.5, rh - 0.03, b - a - 0.03, 0, R(0.82, 1.05));
      }
    }
  }
  // corner quoins: bigger blocks proud of the wall
  for (const [cx, cz] of [[-W / 2, z0], [W / 2, z0], [-W / 2, z1], [W / 2, z1]] as const) for (let r = 0; r < 3; r++) addBlock(hx + cx, r * 0.85 + 0.42, cz, 0.62, 0.8, 0.62, 0, R(0.75, 0.95));
  // the walls' colliders: one box per wall run, from the same numbers the courses use
  const side = (W / 2 - doorW / 2) / 2;
  collider({ x: hx - (W / 2 + doorW / 2) / 2 - 0.05, y: Hh / 2, z: z0, hx: side, hy: Hh / 2, hz: 0.25, rotY: 0 });
  collider({ x: hx + (W / 2 + doorW / 2) / 2 + 0.05, y: Hh / 2, z: z0, hx: side, hy: Hh / 2, hz: 0.25, rotY: 0 });
  collider({ x: hx, y: Hh / 2, z: z1, hx: W / 2, hy: Hh / 2, hz: 0.25, rotY: 0 });
  collider({ x: hx - W / 2, y: Hh / 2, z: hz, hx: 0.25, hy: Hh / 2, hz: D / 2, rotY: 0 });
  collider({ x: hx + W / 2, y: Hh / 2, z: hz, hx: 0.25, hy: Hh / 2, hz: D / 2, rotY: 0 });
  // gables, ridge left-right so the eaves face the path
  const RH = 1.55, half = D / 2 + 0.25;
  const tri = new THREE.Shape(); tri.moveTo(-half, 0); tri.lineTo(half, 0); tri.lineTo(0, RH); tri.closePath();
  const gGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.45, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 });
  const uvA = gGeo.attributes.uv; if (uvA !== undefined) for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) * 0.4, uvA.getY(i) * 0.4);
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(gGeo, M.stone); m.rotation.y = Math.PI / 2;
    m.position.set(hx + sx * (W / 2) - 0.22, Hh - 0.02, hz); m.castShadow = m.receiveShadow = true; part.add(m);
  }
  // roof: thick overlapping mossy shingles, deep overhang, a fat moss ridge and drapes off the eaves
  const over = 0.6, pitch = Math.atan2(RH, half), slopeLen = (half + over) / Math.cos(pitch);
  const shGeo = new RoundedBoxGeometry(0.56, 0.2, 0.7, 2, 0.07);
  const shingles: { x: number; y: number; z: number; side: number }[] = [];
  for (const sd of [-1, 1]) {
    const rowsN = 7;
    for (let r = 0; r < rowsN; r++) {
      const along = (r + 0.55) / rowsN * slopeLen, jitter = r % 2 ? 0.3 : 0;
      for (let xx = -W / 2 - 0.6; xx <= W / 2 + 0.65; xx += 0.58) shingles.push({ x: hx + xx + jitter - 0.15, y: Hh + RH + 0.2 - along * Math.sin(pitch), z: hz + sd * along * Math.cos(pitch), side: sd });
    }
    const under = new THREE.Mesh(new THREE.BoxGeometry(W + 1.5, 0.16, slopeLen + 0.1), M.darkWood);
    under.position.set(hx, Hh + RH + 0.08 - (slopeLen / 2) * Math.sin(pitch), hz + sd * (slopeLen / 2) * Math.cos(pitch));
    under.rotation.x = sd * pitch; under.castShadow = true; part.add(under);
    const ey = Hh + RH + 0.14 - slopeLen * Math.sin(pitch), ez = hz + sd * slopeLen * Math.cos(pitch);
    addCap(hx, ey, ez, W + 1.55, 0.2, 0.32, 0);
    drape(hx, ey - 0.02, ez + sd * 0.12, W + 1.4, 0, 0.42);
  }
  const shM = new THREE.InstancedMesh(shGeo, M.shingle, shingles.length);
  const o = new THREE.Object3D(), cc = new THREE.Color();
  shingles.forEach((s, i) => {
    o.position.set(s.x, s.y, s.z); o.rotation.set(s.side * pitch + R(-0.06, 0.06), R(-0.05, 0.05), R(-0.04, 0.04));
    o.scale.set(R(0.95, 1.1), 1, R(0.95, 1.1)); o.updateMatrix(); shM.setMatrixAt(i, o.matrix);
    const m = rand(); shM.setColorAt(i, cc.setRGB(R(0.7, 0.95), R(0.8, 1.05) + m * 0.08, R(0.6, 0.8)));
  });
  shM.castShadow = shM.receiveShadow = true; shM.name = 'roof'; part.add(shM);
  addCap(hx, Hh + RH + 0.3, hz, W + 1.55, 0.4, 0.66);
  // moss tufts scattered on the roof
  for (let i = 0; i < 16; i++) { const sd = i % 2 ? 1 : -1, al = R(0.2, 0.85) * slopeLen; addCap(hx + R(-W / 2, W / 2), Hh + RH + 0.32 - al * Math.sin(pitch), hz + sd * al * Math.cos(pitch), R(0.5, 1.1), 0.16, R(0.4, 0.7), R(-0.3, 0.3)); }
  // door frame and lintel, a door leaf swung in, the sign
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, doorH + 0.15, 0.32), M.wood); m.position.set(hx + sx * (doorW / 2 + 0.07), (doorH + 0.15) / 2, z0 + 0.08); m.castShadow = true; part.add(m);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.7, 0.26, 0.36), M.wood); lintel.position.set(hx, doorH + 0.16, z0 + 0.1); lintel.castShadow = true; part.add(lintel);
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.05, doorH - 0.05, 0.08), M.darkWood);
  leaf.geometry.translate((doorW - 0.05) / 2, 0, 0);
  leaf.position.set(hx - doorW / 2, doorH / 2, z0 - 0.15); leaf.rotation.y = -1.9; part.add(leaf);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.28), new THREE.MeshStandardMaterial({ map: T.stencil('MOSSGATE HUT', { w: 512, h: 80, font: 'bold 44px monospace', alpha: 0.9 }), transparent: true, roughness: 0.8 }));
  sign.position.set(hx, doorH + 0.17, z0 + 0.29); part.add(sign);
  decal(part, '3x3', hx + 1.6, 1.85, z0 + 0.27, 0, 0.85);
  decal(part, '3x3', hx + W / 2 + 0.27, 1.85, hz, Math.PI / 2, 0.85);
  bracketLamp(hx - 1.15, 1.85, z0 + 0.25, 0);
  // ivy up the front corners
  ivy(hx - W / 2 - 0.05, Hh, z0 + 0.27, Hh * 0.9, 0, 0.4);
  ivy(hx + W / 2 + 0.27, Hh, z0 - 0.4, Hh * 0.7, Math.PI / 2, 0.4);
  // ---- interior: plank floor, rug, table and stools, a shelf of jars, crates, a hanging lamp ----
  const inW = W - 0.55, inD = D - 0.55, iz = hz;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(inW, inD), new THREE.MeshStandardMaterial({ map: tex.wood, color: '#a07a58', roughness: 0.85 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(hx, 0.02, iz); part.add(floor);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(inW, Hh), M.stoneClean); back.position.set(hx, Hh / 2, z1 + 0.26); part.add(back);
  for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(inD, Hh), M.stoneClean); w.rotation.y = -sx * Math.PI / 2; w.position.set(hx + sx * (inW / 2), Hh / 2, iz); part.add(w); }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(inW, inD), M.darkWood); ceil.rotation.x = Math.PI / 2; ceil.position.set(hx, Hh, iz); part.add(ceil);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2), M.cloth); rug.rotation.x = -Math.PI / 2; rug.position.set(hx + 0.1, 0.03, iz + 0.4); part.add(rug);
  const table = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.7), M.wood); top.position.y = 0.76; table.add(top);
  for (const [lx, lz] of [[-0.5, -0.27], [0.5, -0.27], [-0.5, 0.27], [0.5, 0.27]] as const) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.74, 0.08), M.darkWood); l.position.set(lx, 0.37, lz); table.add(l); }
  const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.16, 8), new THREE.MeshStandardMaterial({ color: '#f2e2c0', emissive: '#ffb050', emissiveIntensity: 0.4 })); candle.position.set(0.3, 0.88, 0); table.add(candle);
  const bowlT = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.bronze); bowlT.position.set(-0.25, 0.92, 0.05); table.add(bowlT);
  table.position.set(hx + 0.6, 0, iz - 0.3); part.add(table);
  for (const sx of [-0.5, 1.6]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.45, 8), M.wood); st.position.set(hx + sx, 0.225, iz + 0.15); part.add(st); }
  const shelf = new THREE.Group();
  for (const y of [0.9, 1.45]) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.32), M.wood); b.position.y = y; shelf.add(b); }
  const jarM = ['#6a8a5a', '#b08a4a', '#8a4a3a', '#5a6a8a', '#c0a070'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 }));
  for (let i = 0; i < 9; i++) { const j = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, R(0.16, 0.28), 8), jarM[i % 5]); j.position.set(-0.75 + (i % 5) * 0.36 + R(-0.05, 0.05), i < 5 ? 1.05 : 1.6, 0); shelf.add(j); }
  shelf.position.set(hx - 0.9, 0, z1 + 0.45); part.add(shelf);
  for (const [cx, cz, s] of [[-1.85, -0.6, 0.6], [-1.85, 0.05, 0.5], [-1.8, -0.3, 0.42]] as const) { const cr = new THREE.Mesh(new RoundedBoxGeometry(s, s, s, 1, 0.03), M.wood); cr.position.set(hx + cx, s / 2 + (s < 0.45 ? 0.6 : 0), iz + cz); cr.rotation.y = R(-0.3, 0.3); part.add(cr); }
  barrel(part, k, M, hx + 1.95, iz - 1.4);
  lantern(hx + 0.6, 1.95, iz - 0.3, { on: true, scale: 0.9, light: false });
  const inLight = new THREE.PointLight('#ffa040', 7, 6.5, 1.4); inLight.position.set(hx + 0.4, 1.8, iz + 0.2); part.add(animate(inLight, LAMP_FLICKER));
  const inLight2 = new THREE.PointLight('#ff9a40', 3, 4, 1.5); inLight2.position.set(hx - 1.5, 1.5, iz - 1.0); part.add(animate(inLight2, LAMP_FLICKER));
  // outside: bench, barrels, crates
  const bench = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.12, 0.44, 2, 0.03), M.wood); bench.position.set(hx - 2.15, 0.48, z0 + 0.95); bench.castShadow = true; part.add(bench);
  for (const bx of [-0.58, 0.58]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.38), M.darkWood); l.position.set(hx - 2.15 + bx, 0.22, z0 + 0.95); part.add(l); }
  for (const [bx, bz] of [[1.75, 0.75], [2.4, 1.05]] as const) barrel(part, k, M, hx + bx, z0 + bz);
  k.flush();
}

function barrel(part: THREE.Group, k: Kit, M: Materials, x: number, z: number): void {
  const g = new THREE.CylinderGeometry(0.31, 0.31, 0.78, 16, 4);
  const p = g.attributes.position;
  if (p !== undefined) for (let i = 0; i < p.count; i++) { const y = p.getY(i), s = 1 + 0.12 * (1 - (y / 0.39) ** 2); p.setX(i, p.getX(i) * s); p.setZ(i, p.getZ(i) * s); }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, M.wood); m.position.set(x, 0.39, z); m.castShadow = true; part.add(m);
  for (const y of [0.15, 0.62]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.345, 0.02, 6, 24), M.iron); ring.rotation.x = Math.PI / 2; ring.position.set(x, y, z); part.add(ring); }
  k.collider({ x, y: 0.39, z, hx: 0.31, hy: 0.39, hz: 0.31, rotY: 0 });
}

/** The sign post at the fork (cleanroom world.js 566-575). */
export function signpost(part: THREE.Group, M: Materials, tex: Textures): void {
  const k = kit(part, 566, M, tex), { x, z } = LAYOUT.SIGN;
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.7, 0.16), M.wood); post.position.set(x, 0.85, z); post.castShadow = true; part.add(post);
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.34, 0.07), M.wood); board.position.set(x - 0.15, 1.35, z); board.rotation.y = 0.35; board.castShadow = true; part.add(board);
  const txt = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.24), new THREE.MeshStandardMaterial({ map: T.stencil('HOLLOW', { w: 256, h: 64, font: 'bold 44px monospace', alpha: 0.9 }), transparent: true }));
  txt.position.set(x - 0.15 + Math.sin(0.35) * 0.045, 1.35, z + Math.cos(0.35) * 0.045); txt.rotation.y = 0.35; part.add(txt);
  k.collider({ x, y: 0.85, z, hx: 0.1, hy: 0.85, hz: 0.1, rotY: 0 });
}

/** The moss gate (cleanroom world.js 577-606): two tall mossy pillars, a barred gate, plaque A, lamps. */
export function gate(part: THREE.Group, M: Materials, tex: Textures): void {
  const k = kit(part, 577, M, tex), { R, addBlock, addCap, collider, drape, ivy, bracketLamp } = k;
  const { x: gx, z: gz, half } = LAYOUT.GATE;
  for (const side of [-1, 1]) {
    const pz = gz + side * (half + 0.6);
    for (let r = 0; r < 4; r++) addBlock(gx, r * 0.9 + 0.45, pz, 1.35 - r * 0.03, 0.86, 1.35 - r * 0.03, R(-0.04, 0.04), R(0.82, 1.0));
    addCap(gx, 3.68, pz, 1.6, 0.55, 1.6);
    collider({ x: gx, y: 1.7, z: pz, hx: 0.62, hy: 1.7, hz: 0.62, rotY: 0 });
    for (const f of [-1, 1]) {
      drape(gx + f * 0.72, 3.32, pz, 1.35, Math.PI / 2, R(0.5, 0.8));
      ivy(gx + f * 0.66, 3.25, pz + R(-0.4, 0.4), R(1.4, 2.6), Math.PI / 2, 0.42);
      ivy(gx + f * 0.66, 3.25, pz + R(-0.4, 0.4), R(0.8, 1.8), Math.PI / 2, 0.36);
    }
    bracketLamp(gx + 0.66, 2.35, pz, Math.PI / 2, true);
  }
  // the gate: a top rail, a bottom rail and thick round bars, sunk into the ground when open
  const bars = new THREE.Group();
  const span = half * 2 + 0.05;
  for (const y of [0.2, 2.75]) { const rail = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.3, span, 2, 0.05), M.stone); rail.position.y = y; bars.add(rail); }
  const barGeo = new RoundedBoxGeometry(0.26, 2.6, 0.26, 2, 0.06);
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(barGeo, M.stone); m.position.set(0, 1.45, -half + 0.3 + i * ((half * 2 - 0.6) / 5)); bars.add(m); }
  bars.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
  bars.position.set(gx, STATE.gateOpen ? -2.6 : 0, gz); part.add(bars);
  if (!STATE.gateOpen) collider({ x: gx, y: 1.2, z: gz, hx: 0.15, hy: 1.2, hz: half, rotY: 0 });
  const plaque = new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.55, 0.1, 2, 0.03), M.stoneClean);
  plaque.position.set(gx + 0.66, 1.75, gz - half - 0.6); plaque.rotation.y = Math.PI / 2; part.add(plaque);
  decal(part, 'A', gx + 0.72, 1.75, gz - half - 0.6, Math.PI / 2, 0.6);
  k.flush();
}

/** The Lamplighter (cleanroom world.js 608-639): a hooded, round-faced keeper with a lantern on a staff, a static pose. */
export function lamplighter(part: THREE.Group, M: Materials, tex: Textures): void {
  const k = kit(part, 608, M, tex);
  const { x, z } = LAYOUT.LAMPLIGHTER, faceYaw = Math.atan2(0 - x, 0 - z), cloak = '#4a6a2e';
  const g = new THREE.Group();
  const cloakM = new THREE.MeshStandardMaterial({ color: cloak, roughness: 0.92 });
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; prof.push(new THREE.Vector2(0.5 - 0.26 * t + 0.06 * Math.sin(t * Math.PI), t * 1.05)); }
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 20), cloakM); body.castShadow = true;
  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.04, 6, 24), new THREE.MeshStandardMaterial({ color: '#2e4220', roughness: 0.9 })); hem.rotation.x = Math.PI / 2; hem.position.y = 0.04;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), new THREE.MeshStandardMaterial({ color: '#f0d9b8', roughness: 0.65 })); head.position.y = 1.22; head.castShadow = true;
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.37, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.64), cloakM); hood.position.set(0, 1.26, -0.04); hood.rotation.x = -0.45; hood.castShadow = true;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 12), cloakM); tip.position.set(0, 1.62, -0.2); tip.rotation.x = -0.75;
  const eyeM = new THREE.MeshBasicMaterial({ color: '#1a1410' });
  for (const ex of [-0.1, 0.1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), eyeM); e.position.set(ex, 1.24, 0.27); g.add(e); }
  const cheekM = new THREE.MeshStandardMaterial({ color: '#f0a890', roughness: 0.7 });
  for (const ex of [-0.17, 0.17]) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), cheekM); c.position.set(ex, 1.15, 0.24); c.scale.z = 0.4; g.add(c); }
  for (const sx of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.42, 4, 8), cloakM); arm.position.set(sx * 0.36, 0.72, 0.1); arm.rotation.set(-0.5, 0, sx * 0.25); arm.castShadow = true; g.add(arm); }
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.035, 6, 24), M.darkWood); belt.rotation.x = Math.PI / 2; belt.position.y = 0.62;
  g.add(body, hem, head, hood, tip, belt);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 2.0, 6), M.wood); pole.position.set(0.48, 1.0, 0.2); pole.castShadow = true; g.add(pole);
  g.position.set(x, groundHeight(x, z), z); g.rotation.y = faceYaw; g.scale.setScalar(1.35); part.add(g);
  const wp = new THREE.Vector3(0.48, 1.86, 0.2).multiplyScalar(1.35).applyEuler(g.rotation).add(g.position);
  k.lantern(wp.x, wp.y, wp.z, { on: true, scale: 1.0 });
  k.collider({ x, y: 0.8, z, hx: 0.4, hy: 0.8, hz: 0.4, rotY: 0 });
}

/** The pond (cleanroom world.js 641-697): kerb stones, the moss bridge, reeds, lilies, three lantern posts and the water,
 *  its outline the same rounded rectangle the ground is carved from. */
export function pond(part: THREE.Group, M: Materials, tex: Textures): void {
  const k = kit(part, 641, M, tex), { R, rand, addBlock, addCap, lanternPost, collider } = k;
  const P = LAYOUT.POND;
  // kerb stones around the rim, gaps where the bridge lands
  const per: [number, number][] = [];
  const steps = 140;
  for (let i = 0; i < steps; i++) {
    // walk the rounded rectangle by angle and project onto the SDF zero line
    const a = (i / steps) * Math.PI * 2;
    let rr = 3;
    for (let j = 0; j < 30; j++) { const d = pondSDF(P.x + Math.cos(a) * rr, P.z + Math.sin(a) * rr); rr -= d * 0.8; }
    per.push([P.x + Math.cos(a) * rr, P.z + Math.sin(a) * rr]);
  }
  let acc = 0;
  for (let i = 0; i < per.length; i++) {
    const [ax, az] = per[i] ?? [0, 0], [bx, bz] = per[(i + 1) % per.length] ?? [0, 0];
    acc += Math.hypot(bx - ax, bz - az);
    if (acc < 0.85) continue;
    acc = 0;
    if (Math.abs(az - P.z) < 1.1) continue; // the bridge landings
    const ang = Math.atan2(-(bz - az), bx - ax);
    addBlock(ax, -0.16 + R(0, 0.05), az, R(0.7, 0.95), 0.3, R(0.5, 0.65), ang + R(-0.15, 0.15), R(0.62, 0.8));
    if (rand() < 0.25) addCap(ax, 0.02, az, R(0.4, 0.8), 0.1, 0.4, ang);
  }
  // the moss bridge: big stone blocks across the long axis; sunk below the surface until A is lit
  const n = 5, x0 = P.x + P.hx - 1.5, x1 = P.x - P.hx + 1.5;
  for (let i = 0; i < n; i++) {
    const x = x0 + (x1 - x0) * (i / (n - 1)), z = P.z + R(-0.15, 0.15);
    const topY = STATE.bridgeUp ? 0.28 : -0.07;
    addBlock(x, topY - 0.6, z, 1.7, 1.2, 1.7, R(-0.08, 0.08), STATE.bridgeUp ? R(0.78, 0.9) : R(0.32, 0.4));
    if (STATE.bridgeUp) { addCap(x, topY + 0.02, z, 1.75, 0.18, 1.75, R(-0.1, 0.1)); collider({ x, y: topY - 0.6, z, hx: 0.85, hy: 0.6, hz: 0.85, rotY: 0 }); }
  }
  // reeds, cattails and lilies
  const reedM = new THREE.MeshStandardMaterial({ color: '#7a8a36', roughness: 0.9 });
  const catM = new THREE.MeshStandardMaterial({ color: '#5a3a22', roughness: 0.9 });
  const catGeo = new THREE.CapsuleGeometry(0.04, 0.2, 3, 6);
  for (let i = 0; i < 140; i++) {
    const a = R(0, Math.PI * 2), x = P.x + Math.cos(a) * R(4, 9), z = P.z + Math.sin(a) * R(3, 8);
    const d = pondSDF(x, z);
    if (d < -0.9 || d > 0.6 || Math.abs(z - P.z) < 1.6) continue;
    const h = R(0.6, 1.5);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.022, h, 4), reedM);
    r.position.set(x, groundHeight(x, z) + h / 2, z); r.rotation.set(R(-0.18, 0.18), 0, R(-0.18, 0.18)); part.add(r);
    if (rand() < 0.4) { const c = new THREE.Mesh(catGeo, catM); c.position.set(x, groundHeight(x, z) + h - 0.05, z); part.add(c); }
  }
  const padM = new THREE.MeshStandardMaterial({ color: '#4a6e2a', roughness: 0.7, side: THREE.DoubleSide });
  const flowerM = new THREE.MeshStandardMaterial({ color: '#f4e4ee', emissive: '#ffd0e0', emissiveIntensity: 0.15 });
  const flowerGeo = new THREE.SphereGeometry(0.07, 8, 6);
  for (let i = 0; i < 40; i++) {
    const x = P.x + R(-P.hx + 0.8, P.hx - 0.8), z = P.z + R(-P.hz + 0.8, P.hz - 0.8);
    if (Math.abs(z - P.z) < 1.2) continue;
    const m = new THREE.Mesh(new THREE.CircleGeometry(R(0.2, 0.36), 14, 0.3, Math.PI * 2 - 0.3), padM);
    m.rotation.set(-Math.PI / 2, 0, R(0, 6)); m.position.set(x, -0.105, z); part.add(m);
    if (rand() < 0.25) { const f = new THREE.Mesh(flowerGeo, flowerM); f.position.set(x, -0.07, z); f.scale.y = 0.6; part.add(f); }
  }
  lanternPost(P.x + P.hx - 0.6, P.z + 2.7, Math.PI / 2 - 0.3, { stoneBase: true });
  lanternPost(P.x + P.hx - 1.6, P.z - 1.5, Math.PI / 2, { h: 1.7 });
  lanternPost(P.x - P.hx - 0.9, P.z - 1.6, -Math.PI / 2, { stoneBase: true });
  // the water: the cleanroom's Reflector shape, a Water now
  const w = P.hx + 0.2, h = P.hz + 0.2, rr = P.r + 0.2;
  const shape = new THREE.Shape();
  shape.moveTo(-w + rr, -h); shape.lineTo(w - rr, -h); shape.quadraticCurveTo(w, -h, w, -h + rr); shape.lineTo(w, h - rr); shape.quadraticCurveTo(w, h, w - rr, h);
  shape.lineTo(-w + rr, h); shape.quadraticCurveTo(-w, h, -w, h - rr); shape.lineTo(-w, -h + rr); shape.quadraticCurveTo(-w, -h, -w + rr, -h);
  const water = new Water(shape, { tint: '#3a3458', reflect: 'planar' });
  water.position.set(P.x, -0.12, P.z);
  part.add(water);
  k.flush();
}

/** The arena (cleanroom world.js 699-813): a sunk checker floor, a mossy ring wall, a stone arch, rim braziers and the
 *  Barrow Warden, a hulking golem of mossy blocks in its idle pose. */
export function arena(part: THREE.Group, M: Materials, tex: Textures): void {
  const k = kit(part, 699, M, tex), { R, rand, stoneBlocks, addBlock, addCap, collider, drape, ivy, bracketLamp, capGeo } = k;
  const { x: ax, z: az, r } = LAYOUT.ARENA;
  const t = tex.checker?.clone();
  if (t !== undefined) { t.repeat.set(r * 2 / 8, r * 2 / 8); t.needsUpdate = true; }
  const floor = new THREE.Mesh(new THREE.CircleGeometry(r, 64), new THREE.MeshStandardMaterial({ map: t ?? null, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(ax, -0.34, az); floor.receiveShadow = true; part.add(floor);
  const gateA = Math.PI; // the arch faces west, toward the yard
  const n = 34;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2;
    const da = Math.atan2(Math.sin(am - gateA), Math.cos(am - gateA));
    if (Math.abs(da) < 0.2) continue;
    const x0 = ax + Math.cos(a0) * r, z0 = az + Math.sin(a0) * r, x1 = ax + Math.cos(a1) * r, z1 = az + Math.sin(a1) * r;
    const len = Math.hypot(x1 - x0, z1 - z0), rot = Math.atan2(-(z1 - z0), x1 - x0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    for (let c = 0; c < 3; c++) addBlock(cx, -0.34 + c * 0.55 + 0.27, cz, len + 0.02, 0.52, 0.8, rot, R(0.78, 1.0));
    addCap(cx, 1.36, cz, len + 0.12, 0.34, 1.0, rot);
    drape(cx - Math.cos(am) * 0.52, 1.32, cz - Math.sin(am) * 0.52, len, rot, R(0.2, 0.55));
    if (rand() < 0.35) ivy(cx - Math.cos(am) * 0.45, 1.3, cz - Math.sin(am) * 0.45, R(0.6, 1.4), rot);
    collider({ x: cx, y: 0.5, z: cz, hx: len / 2, hy: 1.0, hz: 0.4, rotY: rot });
    if (i % 6 === 3) decal(part, '8x8', cx - Math.cos(am) * 0.42, 0.5, cz - Math.sin(am) * 0.42, Math.atan2(-Math.cos(am), -Math.sin(am)), 1.0);
  }
  // the arch
  const gx = LAYOUT.ARCH.x, gz = LAYOUT.ARCH.z;
  for (const s of [-1, 1]) {
    const pz = gz + s * 1.9;
    for (let j = 0; j < 4; j++) addBlock(gx, j * 0.8 + 0.4, pz, 1.05, 0.76, 1.05, 0, R(0.8, 1.0));
    collider({ x: gx, y: 1.6, z: pz, hx: 0.52, hy: 1.6, hz: 0.52, rotY: 0 });
    bracketLamp(gx - 0.55, 2.4, pz, -Math.PI / 2, true);
  }
  const archCurve = new THREE.EllipseCurve(0, 0, 1.9, 1.35, 0, Math.PI);
  for (let j = 0; j < 9; j++) {
    const p = archCurve.getPoint((j + 0.5) / 9), p2 = archCurve.getPoint((j + 1) / 9), p1 = archCurve.getPoint(j / 9);
    stoneBlocks.push({ x: gx, y: 3.2 + p.y, z: gz + p.x, sx: 1.0, sy: 0.7, sz: 0.72, rotY: 0, rotX: -Math.atan2(p2.y - p1.y, p2.x - p1.x), tint: R(0.8, 1.0) });
  }
  addCap(gx, 4.72, gz, 1.25, 0.42, 2.6);
  for (const f of [-1, 1]) drape(gx + f * 0.55, 4.62, gz, 2.4, Math.PI / 2, 0.55);
  for (let j = 0; j < 5; j++) ivy(gx - 0.56, 4.4, gz + R(-1.5, 1.5), R(0.6, 2.0), Math.PI / 2, 0.36);
  // rim braziers on the far wall: A north, B east, C south; lit with their quest brazier
  for (const [l, a] of [['A', -0.42], ['B', 0], ['C', 0.42]] as const) {
    const bx = ax + Math.cos(a) * (r + 0.05), bz = az + Math.sin(a) * (r + 0.05);
    const g = new THREE.Group();
    const ped = new THREE.Mesh(new RoundedBoxGeometry(0.85, 0.5, 0.85, 2, 0.05), M.stone); ped.position.y = 0.25;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.3, 0.32, 8), M.stone); bowl.position.y = 0.66;
    g.add(ped, bowl); g.position.set(bx, 1.45, bz); part.add(g);
    decal(part, l, bx - Math.cos(a) * 0.44, 1.7, bz - Math.sin(a) * 0.44, Math.atan2(-Math.cos(a), -Math.sin(a)), 0.4);
    if (STATE.lit.includes(l)) k.fire(bx, 2.25, bz, 0.8);
  }
  // the Barrow Warden, idle: legs, hips, a torso with its core, a head with glowing eyes, arms hanging, moss on top
  const golem = new THREE.Group();
  const eyeM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb040').multiplyScalar(2.2) });
  const coreM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a30').multiplyScalar(1.2) });
  const block = (w: number, h: number, d: number, x: number, y: number, z: number, parent: THREE.Object3D = golem): THREE.Mesh => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, 0.12), M.stone); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };
  const body = new THREE.Group(); golem.add(body);
  for (const s of [-1, 1]) { block(0.75, 1.1, 0.8, s * 0.55, 0.55, 0); block(0.9, 0.35, 1.0, s * 0.55, 0.17, 0.08); }
  body.position.y = 1.1;
  block(1.5, 0.6, 1.0, 0, 0.3, 0, body); // hips
  block(2.3, 1.5, 1.35, 0, 1.35, 0, body); // torso
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), coreM); core.position.set(0, 1.35, 0.7); body.add(core);
  block(0.95, 0.8, 0.9, 0, 2.5, 0.15, body); // head
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.03), eyeM); e.position.set(s * 0.2, 2.55, 0.61); body.add(e); }
  const hm = new THREE.Mesh(capGeo, M.moss); hm.scale.set(1.05, 0.3, 1.0); hm.position.set(0, 2.92, 0.12); body.add(hm);
  const sm = new THREE.Mesh(capGeo, M.moss); sm.scale.set(2.5, 0.32, 1.45); sm.position.set(0, 2.12, 0); body.add(sm);
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 1.45, 1.85, 0); body.add(sh);
    const pm = new THREE.Mesh(capGeo, M.moss); pm.scale.set(0.95, 0.28, 0.95); pm.position.set(0, 0.42, 0); sh.add(pm);
    block(0.85, 0.8, 0.85, 0, 0, 0, sh); block(0.65, 1.0, 0.65, 0, -0.85, 0, sh); block(0.9, 0.85, 0.9, 0, -1.75, 0.05, sh);
    sh.rotation.set(0, 0, s * 0.12);
  }
  golem.position.set(ax, -0.34, az);
  golem.rotation.y = -Math.PI / 2; // facing the arch (west)
  golem.scale.setScalar(1.45);
  part.add(golem);
  // vines over the shoulders
  for (let i = 0; i < 6; i++) { const z = R(-1.2, 1.2); ivy(ax - 1.05, 4.3, az + z * 1.3, R(1.0, 2.2), Math.PI / 2, 0.4); }
  const eyeLight = new THREE.PointLight('#ffa040', 5, 6, 1.5); eyeLight.position.set(ax - 1.6, 3.8, az); part.add(eyeLight);
  collider({ x: ax, y: 1.5, z: az, hx: 1.2, hy: 2.0, hz: 1.0, rotY: 0 });
  k.flush();
}

/** Trees (cleanroom world.js 815-862): round toy trees, a bumpy vertex-coloured canopy ball on a tapered trunk. */
export function trees(part: THREE.Group, M: Materials, tex: Textures): void {
  const k = kit(part, 815, M, tex), { R } = k;
  const spots: [number, number, number][] = [
    [-8.2, -16.6, 1.0], [0.8, -21, 1.15], [-12.5, -21, 1.2], [6.5, -20.5, 1.05], [11, -16, 0.95], [-13, -12, 1.1],
    [-7.8, 5.6, 0.9], [9.5, 5.5, 1.0], [-13.5, 8, 1.15], [-30, 9, 1.2], [-30, -8, 1.15], [-24.5, -10.5, 1.05],
    [-14.5, 11.5, 1.0], [-34, 2, 1.3], [16, -9.5, 1.0], [16, 6, 1.1], [36, -12, 1.2], [37, 8, 1.15], [24, 10, 1.1],
    [20, -15, 1.25], [3, 12, 1.2], [-4, 13, 1.1], [14, 14, 1.2], [-20, 13, 1.1], [-20, -13, 1.15],
  ];
  for (let i = 0; i < 46; i++) { const a = R(0, Math.PI * 2), d = R(36, 72); spots.push([4 + Math.cos(a) * d, -2 + Math.sin(a) * d, R(1.1, 1.7)]); }
  const trunkGeo = new THREE.CylinderGeometry(0.13, 0.2, 1, 7); trunkGeo.translate(0, 0.5, 0);
  // a bumpy ball: big lumps plus small leafy bumps, smooth normals, sunlit crown and a darker underside
  let core: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 6);
  core.deleteAttribute('normal'); core.deleteAttribute('uv'); core = mergeVertices(core);
  const p = core.attributes.position, v = new THREE.Vector3();
  if (p !== undefined) {
    const c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const big = noise.fbm(v.x * 1.6 + 5, v.z * 1.6 + v.y * 1.3 + 5, 2);
      const lumps = 1 - Math.abs(noise(v.x * 5.5 + 11, v.y * 5.5 + v.z * 4.1 + 3) * 2 - 1); // ridged: rounded leaf clumps
      const fine = noise(v.x * 16 + 1, v.y * 16 + v.z * 13);
      v.multiplyScalar(0.9 + (big - 0.5) * 0.22 + lumps * 0.09 + fine * 0.025); v.y *= 0.94;
      p.setXYZ(i, v.x, v.y, v.z);
      const kk = 0.42 + 0.58 * sstep(v.y, -0.95, 0.85);
      const leaf = 0.82 + lumps * 0.22 + (fine - 0.5) * 0.18;
      c.set([0.19 * kk * leaf, 0.28 * kk * leaf, 0.06 * kk * leaf], i * 3); // linear
    }
    core.setAttribute('color', new THREE.BufferAttribute(c, 3)); core.computeVertexNormals();
  }
  const trunkM = new THREE.MeshStandardMaterial({ color: '#7a5638', map: tex.wood, roughness: 0.9 });
  const coreM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
  const tI = new THREE.InstancedMesh(trunkGeo, trunkM, spots.length);
  const cI = new THREE.InstancedMesh(core, coreM, spots.length);
  const o = new THREE.Object3D(), col = new THREE.Color();
  spots.forEach(([x, z, s], i) => {
    const gy = groundHeight(x, z), th = 2.1 * s;
    o.position.set(x, gy, z); o.scale.set(s, th, s); o.rotation.set(0, R(0, 6), 0); o.updateMatrix(); tI.setMatrixAt(i, o.matrix);
    o.position.set(x, gy + th + 0.85 * s, z); o.scale.setScalar(1.3 * s); o.updateMatrix(); cI.setMatrixAt(i, o.matrix);
    col.setRGB(R(0.88, 1.08), R(0.92, 1.06), R(0.8, 1.0)); cI.setColorAt(i, col);
    if (Math.hypot(x, z) < 45) k.collider({ x, y: gy + 1, z, hx: 0.22 * s, hy: 1, hz: 0.22 * s, rotY: 0 });
  });
  tI.castShadow = cI.castShadow = true; cI.receiveShadow = true;
  part.add(tI, cI);
}

const BOULDERS: readonly [number, number, number][] = [[-6.2, -4.6, 0.75], [6.4, 3.4, 0.8], [-8.4, -11.2, 0.7], [10.6, -16.2, 0.8], [-8.8, 6.6, 0.7], [7.8, 5.8, 0.6],
  [-6.8, -17, 0.55], [2.4, -16.8, 0.5], [LAYOUT.POND.x + LAYOUT.POND.hx + 2.4, LAYOUT.POND.z + 4.5, 0.8], [LAYOUT.POND.x - LAYOUT.POND.hx - 2.2, LAYOUT.POND.z - 4.6, 0.7], [13.8, 3.4, 0.6], [-3.6, 5.4, 0.45]];

/** Boulders (cleanroom world.js 864-889): mossy-topped rocks. */
export function boulders(part: THREE.Group, M: Materials, tex: Textures): void {
  const k = kit(part, 864, M, tex), { R } = k;
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 3);
  g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
  const p = g.attributes.position, v = new THREE.Vector3();
  if (p !== undefined) {
    const c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      v.multiplyScalar(1 + (noise.fbm(v.x * 2 + 3, v.y * 2 + v.z * 2, 3) - 0.5) * 0.5); v.y *= 0.72;
      p.setXYZ(i, v.x, v.y, v.z);
      const mossT = sstep(v.y + noise(v.x * 5, v.z * 5) * 0.4, 0.15, 0.45);
      const s = 0.22 + noise(v.x * 12, v.z * 12 + v.y * 12) * 0.08;
      const cc = new THREE.Color(s, s * 0.95, s * 0.86).lerp(new THREE.Color(0.09, 0.16, 0.035), mossT);
      c.set([cc.r, cc.g, cc.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.computeVertexNormals();
  }
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  for (const [x, z, s] of BOULDERS) {
    const b = new THREE.Mesh(g, m);
    b.position.set(x, groundHeight(x, z) + s * 0.22, z); b.scale.set(s * R(1.1, 1.5), s, s * R(0.9, 1.2)); b.rotation.y = R(0, 6);
    b.castShadow = b.receiveShadow = true; part.add(b);
    k.collider({ x, y: s * 0.4, z, hx: s * 0.9, hy: s * 0.6, hz: s * 0.9, rotY: 0 });
  }
}

/** Ferns, mushrooms and flowers (cleanroom world.js 891-936): ferns along the yard's edges, by the boulders and the hut. */
export function flora(part: THREE.Group, tex: Textures): void {
  const rand = T.rng(891), R = (a: number, b: number): number => a + (b - a) * rand();
  const Y = LAYOUT.YARD, G = LAYOUT.GATE;
  const edge: [number, number][] = [];
  for (let z = Y.z0 + 0.8; z < Y.z1 - 0.5; z += R(1.3, 2.8)) { if (Math.abs(z - G.z) > 2.6) edge.push([Y.x0 + 0.8, z]); if (Math.abs(z - LAYOUT.ARCH.z) > 2.6) edge.push([Y.x1 - 0.8, z]); }
  for (let x = Y.x0 + 0.8; x < Y.x1 - 0.5; x += R(1.4, 3)) { edge.push([x, Y.z0 + 0.8]); edge.push([x, Y.z1 - 0.8]); }
  const fernSpots: [number, number][] = [...edge, ...BOULDERS.map(([x, z]): [number, number] => [x + R(-0.8, 0.8), z + R(0.5, 1)]),
    [-1.6, -12.4], [-6.8, -12.6], [-6.6, -12.0], [G.x + 1.0, G.z - 2.6], [G.x + 1.0, G.z + 2.6], [-2.2, -5.4], [3.1, -6.2], [1.6, -11.8]];
  {
    const fg = new THREE.PlaneGeometry(0.3, 1.05, 1, 6); fg.translate(0, 0.52, 0);
    const p = fg.attributes.position;
    if (p !== undefined) for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, y * y * 0.55); p.setY(i, y * (1 - y * 0.25)); }
    fg.computeVertexNormals();
    const im = new THREE.InstancedMesh(fg, new THREE.MeshStandardMaterial({ map: tex.frond, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 }), fernSpots.length * 9);
    const o = new THREE.Object3D();
    let k = 0;
    for (const [x, z] of fernSpots) {
      const s = R(0.75, 1.25);
      for (let f = 0; f < 9; f++) {
        o.position.set(x, groundHeight(x, z), z); o.rotation.set(0, (f / 9) * Math.PI * 2 + R(-0.2, 0.2), 0); o.rotateX(R(-0.55, -0.25));
        o.scale.set(s, s * R(0.8, 1.1), s); o.updateMatrix(); im.setMatrixAt(k++, o.matrix);
      }
    }
    im.castShadow = true; part.add(animate(im, FOLIAGE_SWAY));
  }
  // mushrooms and flowers: the same small meshes, one shared geometry each (the cleanroom merged them per material)
  const capGeo = new THREE.SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const stemGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.16, 6), dotGeo = new THREE.SphereGeometry(0.018, 5, 4);
  const capM = new THREE.MeshStandardMaterial({ color: '#c8462a', roughness: 0.5 });
  const stemM = new THREE.MeshStandardMaterial({ color: '#efe2c4', roughness: 0.8 });
  const dotM = new THREE.MeshBasicMaterial({ color: '#f4ead8' });
  const pick = (): [number, number] => fernSpots[Math.floor(rand() * fernSpots.length)] ?? [0, 0];
  for (let i = 0; i < 60; i++) {
    const b = pick();
    const x = b[0] + R(-0.8, 0.8), z = b[1] + R(-0.8, 0.8), s = R(0.8, 1.7), y = groundHeight(x, z);
    const st = new THREE.Mesh(stemGeo, stemM); st.position.set(x, y + 0.08 * s, z); st.scale.setScalar(s); part.add(st);
    const cp = new THREE.Mesh(capGeo, capM); cp.position.set(x, y + 0.15 * s, z); cp.scale.set(s, s * 0.75, s); cp.castShadow = true; part.add(cp);
    for (let d = 0; d < 3; d++) { const dt = new THREE.Mesh(dotGeo, dotM); const a = R(0, 6); dt.position.set(x + Math.cos(a) * 0.06 * s, y + 0.15 * s + 0.07 * s, z + Math.sin(a) * 0.06 * s); dt.scale.setScalar(s); part.add(dt); }
  }
  const flowerM = [new THREE.MeshStandardMaterial({ color: '#f2eedc' }), new THREE.MeshStandardMaterial({ color: '#e8c050' })];
  const flowerGeo = new THREE.SphereGeometry(0.035, 6, 4);
  for (let i = 0; i < 80; i++) {
    const b = pick();
    const x = b[0] + R(-1.4, 1.4), z = b[1] + R(-1.4, 1.4);
    const f = new THREE.Mesh(flowerGeo, flowerM[i % 2]); f.position.set(x, groundHeight(x, z) + R(0.1, 0.2), z); part.add(f);
  }
}

/** Grass (cleanroom world.js 937-959): 9,000 crossed cards within 62 m, off the hut, the pond, the arena and the path. */
export function grass(part: THREE.Group, tex: Textures): void {
  const rand = T.rng(937), R = (a: number, b: number): number => a + (b - a) * rand();
  const { slabs } = pathSlabs(), H = LAYOUT.HUT, doorZ = H.z + H.d / 2;
  const card = new THREE.PlaneGeometry(0.38, 0.28); card.translate(0, 0.13, 0);
  const cross = mergeGeometries([card, card.clone().rotateY(Math.PI / 2)]);
  const nrm = cross.attributes.normal;
  if (nrm !== undefined) for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
  const N = 9000, im = new THREE.InstancedMesh(cross, new THREE.MeshStandardMaterial({ map: tex.grass, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.9 }), N);
  const o = new THREE.Object3D(), c = new THREE.Color();
  const onSlab = (x: number, z: number): boolean => slabs.some((s) => Math.abs(s.x - x) < s.sx * 0.55 && Math.abs(s.z - z) < s.sx * 0.55);
  let k = 0, tries = 0;
  while (k < N && tries < N * 5) {
    tries++;
    const r = Math.sqrt(rand()) * 62, a = R(0, Math.PI * 2);
    const x = Math.cos(a) * r + 2, z = Math.sin(a) * r - 2;
    if (x > H.x - H.w / 2 - 0.3 && x < H.x + H.w / 2 + 0.3 && z < doorZ + 0.3 && z > H.z - H.d / 2 - 0.3) continue;
    if (pondSDF(x, z) < 0.3) continue;
    if (Math.hypot(x - LAYOUT.ARENA.x, z - LAYOUT.ARENA.z) < LAYOUT.ARENA.r + 0.6) continue;
    if (noise.fbm(x * 0.25, z * 0.25, 2) < 0.42 && rand() < 0.75) continue;
    if (r < 30 && onSlab(x, z)) continue;
    o.position.set(x, groundHeight(x, z) - 0.02, z); o.rotation.set(0, R(0, Math.PI), 0); o.scale.setScalar(R(0.5, 1.1));
    o.updateMatrix(); im.setMatrixAt(k, o.matrix); im.setColorAt(k, c.setRGB(R(0.82, 1.0), R(0.82, 1.0), R(0.62, 0.85)));
    k++;
  }
  im.count = k; part.add(animate(im, FOLIAGE_SWAY));
}

/** Fireflies (cleanroom world.js 979-991): 160 seats over the hollow, each wandering 0.6 m round itself. */
export function fireflies(part: THREE.Group, tex: Textures): void {
  const rand = T.rng(979), R = (a: number, b: number): number => a + (b - a) * rand();
  const flies = new Float32Array(160 * 3);
  for (let i = 0; i < 160; i++) flies.set([R(-30, 34), R(0.3, 2.4), R(-18, 10)], i * 3);
  const cloud = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(flies, 3)),
    new THREE.PointsMaterial({ map: tex.glow, color: new THREE.Color('#ffd27a').multiplyScalar(2), size: 0.12, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  part.add(animate(cloud, drift({ rate: 0.3, radius: 0.6 })));
}

/** The sunset light (cleanroom main.js 40-66): the painted sky, hemisphere, the key sun, the rim, the haze, the composer. */
export function sunset(world: ShardWorld): void {
  // the sky dome (cleanroom sky.js) and the environment PMREM'd from it at 0.4 (main.js 63-70); under the skyline the
  // cleanroom's environment sees the dome's haze, so the ground the engine filters with is that haze
  const haze = new THREE.Color('#ffb878').multiplyScalar(0.92);
  world.sky(sunsetSky(), { environment: { intensity: 0.4, ground: [haze.r, haze.g, haze.b] } });
  world.scene.fog = new THREE.FogExp2(new THREE.Color('#d898a0'), 0.0062);
  world.part('light', (part) => {
    part.add(new THREE.HemisphereLight(new THREE.Color('#c4b0e4'), new THREE.Color('#7a6a3c'), 0.85));
    const key = new THREE.DirectionalLight(new THREE.Color('#ffd6ae'), 2.2);
    key.position.set(-26, 30, 34); key.castShadow = true;
    part.add(key, key.target);
    const rim = new THREE.DirectionalLight(new THREE.Color('#ff9a80'), 1.2);
    rim.position.set(14, 5, -40);
    part.add(rim);
  });
  world.post({ tone: 'aces', exposure: 1.05, bloom: { strength: 0.42, radius: 0.55, threshold: 0.9 }, vignette: 0.2 });
}

/** Mossgate Hollow: the light, the ground and every section of the cleanroom, one part each. */
export function buildMossgate(world: ShardWorld): void {
  // a fresh build (watch runs it on every save) makes its own shared materials
  glowMats.clear(); decalMats.clear(); sparkMats.clear(); flameMat = null;
  const { M, tex } = materials();
  sunset(world);
  world.ground(groundHeight, { colourAt: groundColour });
  world.part('walls', (part) => { walls(part, M, tex); });
  world.part('district', (part) => { district(part); });
  world.part('paths', (part) => { paths(part, M); });
  world.part('braziers', (part) => { braziers(part, M, tex); });
  world.part('hut', (part) => { hut(part, M, tex); });
  world.part('sign', (part) => { signpost(part, M, tex); });
  world.part('gate', (part) => { gate(part, M, tex); });
  world.part('lamplighter', (part) => { lamplighter(part, M, tex); });
  world.part('pond', (part) => { pond(part, M, tex); });
  world.part('arena', (part) => { arena(part, M, tex); });
  world.part('trees', (part) => { trees(part, M, tex); });
  world.part('boulders', (part) => { boulders(part, M, tex); });
  world.part('flora', (part) => { flora(part, tex); });
  world.part('grass', (part) => { grass(part, tex); });
  world.part('fireflies', (part) => { fireflies(part, tex); });
  world.spawn(LAYOUT.SPAWN.x, 0, LAYOUT.SPAWN.z, LAYOUT.SPAWN.yaw);
}
