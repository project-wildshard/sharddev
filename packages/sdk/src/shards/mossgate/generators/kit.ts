// The yard's shared builders (split from world.ts, MZ25): the materials every part shares, and `kit`, the cleanroom's
// accumulators (`addBlock`, `addCap`, `drape`, `ivy`), its colliders, lanterns, halos and fires; `decal` for stencils.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as T from './textures';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { animate, flicker, hang, pulse, rise, solid, type HangOptions } from '@wildshard/sdk/scene/author';
import { noise, groundHeight, type Materials, type Textures } from './hollow';

/** The textures and materials every part shares (`buildWorld`'s `tex` and `M`). */
export function materials(): { M: Materials; tex: Textures } {
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
export const LAMP_FLICKER = flicker({ rate: 1.1, amount: 0.08 });
export const FLAME_PULSE = pulse({ rate: 1.4, amount: 0.14 });

// One material per halo colour and strength, per stencil text: repeated ones share a draw (the cleanroom's decalMats).
const glowMats = new Map<string, THREE.SpriteMaterial>(), decalMats = new Map<string, THREE.MeshStandardMaterial>();
const sparkMats = new Map<string, THREE.PointsMaterial>();
let flameMat: THREE.SpriteMaterial | null = null;
/** SS8e: how a post's rope lantern and a bracket's lantern swing (rate in swings a second, gust lean in radians, bump reach in metres). */
export const POST_SWING: HangOptions = { rate: 0.6, amount: 0.08, reach: 0.35 };
export const BRACKET_SWING: HangOptions = { rate: 0.8, amount: 0.05, reach: 0.3 };

export function glowMat(tex: Textures, colour: string, opacity: number): THREE.SpriteMaterial {
  const key = `${colour}/${opacity}`;
  let m = glowMats.get(key);
  if (m === undefined) { m = new THREE.SpriteMaterial({ map: tex.glow, color: colour, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, fog: false }); glowMats.set(key, m); }
  return m;
}

export interface Block { x: number; y: number; z: number; sx: number; sy: number; sz: number; rotY: number; rotX?: number; tint: number }
export const boxGeo = new THREE.BoxGeometry(1, 1, 1), hidden = new THREE.MeshBasicMaterial();

/** One part's builders: the cleanroom's accumulators (`addBlock`, `addCap`, `drape`, `ivy`), its colliders, lamps and fires. */
// oxlint-disable-next-line typescript/explicit-module-boundary-types -- its builders are the type (`Kit` reads it back)
export function kit(part: THREE.Group, seed: number, M: Materials, tex: Textures) {
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
  // SHARD-SOURCE SS8e: a hung lantern swings from `pivot` (its rope's top or its bracket's hook), the lantern, its light
  // and its halo with it; `extra` meshes (the rope) hang there too, placed in the world.
  function lantern(x: number, y: number, z: number, { on = true, scale = 1, light = true, pivot, extra = [] }: { on?: boolean; scale?: number; light?: boolean; pivot?: { y: number; swing: HangOptions }; extra?: THREE.Object3D[] } = {}): THREE.Group {
    const holder: THREE.Object3D = pivot === undefined ? part : hang(new THREE.Group(), pivot.swing);
    if (pivot !== undefined) { holder.position.set(x, pivot.y, z); part.add(holder); for (const e of extra) { e.position.x -= x; e.position.y -= pivot.y; e.position.z -= z; holder.add(e); } }
    const at = pivot === undefined ? { x, y, z } : { x: 0, y: y - pivot.y, z: 0 };
    const g = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.2), on ? M.lampGlass : M.lampOff);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.15, 4), M.iron); cap.position.y = 0.22; cap.rotation.y = Math.PI / 4;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.05, 0.27), M.iron); base.position.y = -0.155;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 12), M.iron); ring.position.y = 0.33;
    g.add(glass, cap, base, ring);
    for (const [bx, bz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.32, 0.035), M.iron); b.position.set(bx * 0.11, 0, bz * 0.11); g.add(b);
    }
    g.position.set(at.x, at.y, at.z); g.scale.setScalar(scale);
    holder.add(g);
    if (on) {
      if (light) {
        const l = new THREE.PointLight('#ffa850', 3.4 * scale, 6, 1.7);
        l.position.set(at.x, at.y, at.z); holder.add(animate(l, LAMP_FLICKER));
      }
      halo(at.x, at.y, at.z, 1.1 * scale, '#ffb466', 0.5, holder);
    }
    return g;
  }
  function halo(x: number, y: number, z: number, size: number, colour: string, opacity: number, into: THREE.Object3D = part): void {
    const s = new THREE.Sprite(glowMat(tex, colour, opacity));
    s.scale.setScalar(size); s.position.set(x, y, z); into.add(s);
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
    rope.position.set(lx, gy + h - 0.4, lz);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.03, 6, 12), M.rope); coil.position.set(lx, gy + h - 0.12, lz); coil.rotation.y = rotY; part.add(coil);
    // SS8e: the rope and its lantern hang from the coil, a 0.7 m pendulum (about 0.6 swings a second)
    lantern(lx, gy + h - 0.82, lz, { on, scale: 1.25, pivot: { y: gy + h - 0.12, swing: POST_SWING }, extra: [rope] });
    collider({ x, y: gy + h / 2, z, hx: 0.12, hy: h / 2, hz: 0.12, rotY: 0 });
  }
  // A wall bracket lamp: an iron arm out of a stone face.
  function bracketLamp(x: number, y: number, z: number, rotY: number, on = true): void {
    const ax = Math.sin(rotY), az = Math.cos(rotY);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.5), M.iron); arm.position.set(x + ax * 0.22, y + 0.42, z + az * 0.22); arm.rotation.y = rotY; part.add(arm);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.04), M.iron); plate.position.set(x, y + 0.36, z); plate.rotation.y = rotY; part.add(plate);
    // SS8e: the lantern hangs from the arm's hook, a short stiff swing
    lantern(x + ax * 0.44, y, z + az * 0.44, { on, scale: 1.05, pivot: { y: y + 0.42, swing: BRACKET_SWING } });
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
export type Kit = ReturnType<typeof kit>;

export function decal(part: THREE.Group, text: string, x: number, y: number, z: number, rotY: number, size = 1, floor = false): THREE.Mesh {
  let mat = decalMats.get(text);
  if (mat === undefined) { mat = new THREE.MeshStandardMaterial({ map: T.stencil(text), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.9 }); decalMats.set(text, mat); }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size / 2), mat);
  m.position.set(x, y, z);
  if (floor) m.rotation.set(-Math.PI / 2, 0, rotY); else m.rotation.y = rotY;
  m.receiveShadow = true;
  part.add(m);
  return m;
}

/** A fresh build (watch runs it on every save) makes its own shared materials. */
export function resetKit(): void { glowMats.clear(); decalMats.clear(); sparkMats.clear(); flameMat = null; }
