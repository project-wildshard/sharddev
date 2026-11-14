// The Mossgate hut, pond and lamps as three.js source (AUTHORING-PARITY AP7), ported from the cleanroom's
// src/world.js and src/main.js (mossgate-cleanroom eac5bb8). The geometry, materials and lights are the cleanroom's own
// lines. What changed: each block is a `world.part`, colliders are `solid(mesh)` beside the mesh instead of hand-typed
// boxes, the pond's Reflector is a `Water`, the canvas painters run at compile time, and each part draws from its own
// seeded stream, so editing the hut never reshuffles the pond.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { solid, Water, type ShardWorld } from '@wildshard/sdk/scene/author';
import * as T from './textures';

export const LAYOUT = {
  SPAWN: { x: 0, z: 0, yaw: 0 },
  HUT: { x: -4.0, z: -14.0, w: 5.2, d: 4.6, h: 2.5 }, // door face at z + d/2
  POND: { x: -19.4, z: 0, hx: 6.6, hz: 5.4, r: 2.2 },
  ARENA: { x: 25.5, z: -2, r: 9.5 },
};

const noise = T.makeNoise(99);
const sstep = THREE.MathUtils.smoothstep;

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
function materials(): { M: Record<string, THREE.MeshStandardMaterial>; tex: Record<string, THREE.Texture> } {
  const tex = { stone: T.stone(3, { moss: 0.32 }), stoneClean: T.stone(8, { moss: 0.12 }), slab: T.slab(), wood: T.wood(), shingle: T.shingle(), glow: T.glow(), ivy: T.ivy(), drape: T.hangingMoss() };
  const M = {
    stone: new THREE.MeshStandardMaterial({ map: tex.stone, roughness: 0.93 }),
    stoneClean: new THREE.MeshStandardMaterial({ map: tex.stoneClean, roughness: 0.9 }),
    slab: new THREE.MeshStandardMaterial({ map: tex.slab, roughness: 0.88 }),
    wood: new THREE.MeshStandardMaterial({ map: tex.wood, roughness: 0.78 }),
    darkWood: new THREE.MeshStandardMaterial({ map: tex.wood, color: '#8a6a52', roughness: 0.82 }),
    shingle: new THREE.MeshStandardMaterial({ map: tex.shingle, roughness: 0.95 }),
    moss: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
    iron: new THREE.MeshStandardMaterial({ color: '#3a302a', roughness: 0.5, metalness: 0.6 }),
    bronze: new THREE.MeshStandardMaterial({ color: '#7a5634', roughness: 0.45, metalness: 0.7 }),
    lampGlass: new THREE.MeshStandardMaterial({ color: '#ffc061', emissive: '#ffa73a', emissiveIntensity: 2.6, roughness: 0.3 }),
    ivy: new THREE.MeshStandardMaterial({ map: tex.ivy, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 }),
    drape: new THREE.MeshStandardMaterial({ map: tex.drape, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 1 }),
    cloth: new THREE.MeshStandardMaterial({ color: '#8a3a2a', roughness: 0.95 }),
  };
  return { M, tex };
}

interface Block { x: number; y: number; z: number; sx: number; sy: number; sz: number; rotY: number; tint: number }
/** One part's builders: the cleanroom's accumulators (`addBlock`, `addCap`, `drape`, `ivy`) and its lamp helpers. */
function kit(part: THREE.Group, seed: number, M: Record<string, THREE.MeshStandardMaterial>, tex: Record<string, THREE.Texture>) {
  const rand = T.rng(seed);
  const R = (a: number, b: number): number => a + (b - a) * rand();
  const blockGeo = new RoundedBoxGeometry(1, 1, 1, 3, 0.07);
  const capGeo = (() => {
    const g = new RoundedBoxGeometry(1, 1, 1, 7, 0.38);
    const p = g.attributes.position;
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
  function drape(x: number, y: number, z: number, len: number, rotY: number, h = 0.45): void {
    const g = new THREE.PlaneGeometry(len, h, Math.max(1, Math.round(len * 3)), 2);
    g.translate(0, -h / 2, 0);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { p.setZ(i, (noise(p.getX(i) * 3 + x, y) - 0.5) * 0.06); uv?.setX(i, (uv.getX(i)) * len * 0.9 + R(0, 0)); }
    g.rotateY(rotY); g.translate(x, y, z);
    drapeGeos.push(g);
  }
  function ivy(x: number, y: number, z: number, len: number, rotY: number, w = 0.32): void {
    const g = new THREE.PlaneGeometry(w, len, 1, 5);
    g.translate(0, -len / 2, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getY(i) * 2.2 + x) * 0.03);
    g.rotateY(rotY); g.translate(x, y, z);
    ivyGeos.push(g);
  }
  function lantern(x: number, y: number, z: number, { on = true, scale = 1, light = true } = {}): THREE.Group {
    const g = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.2), on ? M.lampGlass : M.iron);
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
        l.position.set(x, y, z); part.add(l);
      }
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glow, color: '#ffb466', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5, fog: false }));
      s.scale.setScalar(1.1 * scale); s.position.set(x, y, z); part.add(s);
    }
    return g;
  }
  // A gallows post: a squared timber with an arm, a rope and a hanging lantern.
  function lanternPost(x: number, z: number, rotY = 0, { h = 2.7, on = true, stoneBase = false } = {}): void {
    const gy = groundHeight(x, z);
    const ax = Math.sin(rotY), az = Math.cos(rotY);
    if (stoneBase) {
      const b = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.7, 0.62, 2, 0.05), M.stone); b.position.set(x, gy + 0.35, z); b.castShadow = true; part.add(b);
      addCap(x, gy + 0.72, z, 0.66, 0.16, 0.66);
    }
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.2, h, 0.2), M.wood); p.position.set(x, gy + h / 2, z); p.castShadow = true; part.add(solid(p));
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.95), M.wood);
    arm.position.set(x + ax * 0.4, gy + h - 0.12, z + az * 0.4); arm.rotation.y = rotY; arm.castShadow = true; part.add(arm);
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.55), M.wood);
    brace.position.set(x + ax * 0.2, gy + h - 0.36, z + az * 0.2); brace.rotation.set(0, rotY, 0); brace.rotateX(0.75); part.add(brace);
    const lx = x + ax * 0.74, lz = z + az * 0.74;
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.42, 5), new THREE.MeshStandardMaterial({ color: '#b8925a', roughness: 0.9 }));
    rope.position.set(lx, gy + h - 0.4, lz); part.add(rope);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.03, 6, 12), rope.material); coil.position.set(lx, gy + h - 0.12, lz); coil.rotation.y = rotY; part.add(coil);
    lantern(lx, gy + h - 0.82, lz, { on, scale: 1.25 });
  }
  // A wall bracket lamp: an iron arm out of a stone face.
  function bracketLamp(x: number, y: number, z: number, rotY: number, on = true): void {
    const ax = Math.sin(rotY), az = Math.cos(rotY);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.5), M.iron); arm.position.set(x + ax * 0.22, y + 0.42, z + az * 0.22); arm.rotation.y = rotY; part.add(arm);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.04), M.iron); plate.position.set(x, y + 0.36, z); plate.rotation.y = rotY; part.add(plate);
    lantern(x + ax * 0.44, y, z + az * 0.44, { on, scale: 1.05 });
  }
  // flush instanced stone, caps, drapes and ivy into the part
  function flush(): void {
    const im = new THREE.InstancedMesh(blockGeo, M.stone, stoneBlocks.length);
    const o = new THREE.Object3D(), c = new THREE.Color();
    stoneBlocks.forEach((b, i) => {
      o.position.set(b.x, b.y, b.z); o.rotation.set(0, b.rotY, 0, 'YXZ'); o.scale.set(b.sx, b.sy, b.sz); o.updateMatrix();
      im.setMatrixAt(i, o.matrix); im.setColorAt(i, c.setRGB(b.tint, b.tint * R(0.96, 1.0), b.tint * R(0.9, 0.97)));
    });
    im.castShadow = im.receiveShadow = true; if (stoneBlocks.length > 0) part.add(im);
    const cm = new THREE.InstancedMesh(capGeo, M.moss, caps.length);
    caps.forEach((b, i) => { o.position.set(b.x, b.y, b.z); o.rotation.set(0, b.rotY, 0); o.scale.set(b.sx, b.sy, b.sz); o.updateMatrix(); cm.setMatrixAt(i, o.matrix); });
    cm.castShadow = cm.receiveShadow = true; if (caps.length > 0) part.add(cm);
    if (drapeGeos.length > 0) { const d = new THREE.Mesh(mergeGeometries(drapeGeos), M.drape); d.castShadow = true; part.add(d); }
    if (ivyGeos.length > 0) part.add(new THREE.Mesh(mergeGeometries(ivyGeos), M.ivy));
  }
  return { rand, R, addBlock, addCap, drape, ivy, lantern, lanternPost, bracketLamp, flush };
}

function decal(part: THREE.Group, text: string, x: number, y: number, z: number, rotY: number, size = 1, floor = false): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size / 2), new THREE.MeshStandardMaterial({ map: T.stencil(text), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.9 }));
  m.position.set(x, y, z);
  if (floor) m.rotation.set(-Math.PI / 2, 0, rotY); else m.rotation.y = rotY;
  m.receiveShadow = true;
  part.add(m);
  return m;
}

/** The hut (cleanroom world.js 398-530): coursed walls, gables, a shingle roof, door, sign, bracket lamp and the room. */
export function hut(part: THREE.Group, M: Record<string, THREE.MeshStandardMaterial>, tex: Record<string, THREE.Texture>): void {
  const { R, addBlock, addCap, drape, ivy, lantern, bracketLamp, flush, rand } = kit(part, 398, M, tex);
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
  // the walls' colliders: one invisible box per wall run, said once, from the same numbers the courses use
  const wallBox = (x: number, z: number, sx: number, sz: number): void => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, Hh, sz), M.stone); m.position.set(x, Hh / 2, z); m.visible = false; part.add(solid(m)); };
  const side = (W / 2 - doorW / 2) / 2;
  wallBox(hx - (W / 2 + doorW / 2) / 2 - 0.05, z0, side * 2, 0.5); wallBox(hx + (W / 2 + doorW / 2) / 2 + 0.05, z0, side * 2, 0.5);
  wallBox(hx, z1, W, 0.5); wallBox(hx - W / 2, hz, 0.5, D); wallBox(hx + W / 2, hz, 0.5, D);
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
  const jarCols = ['#6a8a5a', '#b08a4a', '#8a4a3a', '#5a6a8a', '#c0a070'];
  for (let i = 0; i < 9; i++) { const j = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, R(0.16, 0.28), 8), new THREE.MeshStandardMaterial({ color: jarCols[i % 5], roughness: 0.4 })); j.position.set(-0.75 + (i % 5) * 0.36 + R(-0.05, 0.05), i < 5 ? 1.05 : 1.6, 0); shelf.add(j); }
  shelf.position.set(hx - 0.9, 0, z1 + 0.45); part.add(shelf);
  for (const [cx, cz, s] of [[-1.85, -0.6, 0.6], [-1.85, 0.05, 0.5], [-1.8, -0.3, 0.42]] as const) { const cr = new THREE.Mesh(new RoundedBoxGeometry(s, s, s, 1, 0.03), M.wood); cr.position.set(hx + cx, s / 2 + (s < 0.45 ? 0.6 : 0), iz + cz); cr.rotation.y = R(-0.3, 0.3); part.add(cr); }
  barrel(part, M, hx + 1.95, iz - 1.4);
  lantern(hx + 0.6, 1.95, iz - 0.3, { on: true, scale: 0.9, light: false });
  const inLight = new THREE.PointLight('#ffa040', 7, 6.5, 1.4); inLight.position.set(hx + 0.4, 1.8, iz + 0.2); part.add(inLight);
  const inLight2 = new THREE.PointLight('#ff9a40', 3, 4, 1.5); inLight2.position.set(hx - 1.5, 1.5, iz - 1.0); part.add(inLight2);
  // outside: bench, barrels, crates
  const bench = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.12, 0.44, 2, 0.03), M.wood); bench.position.set(hx - 2.15, 0.48, z0 + 0.95); bench.castShadow = true; part.add(bench);
  for (const bx of [-0.58, 0.58]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.38), M.darkWood); l.position.set(hx - 2.15 + bx, 0.22, z0 + 0.95); part.add(l); }
  for (const [bx, bz] of [[1.75, 0.75], [2.4, 1.05]] as const) barrel(part, M, hx + bx, z0 + bz);
  flush();
}

function barrel(part: THREE.Group, M: Record<string, THREE.MeshStandardMaterial>, x: number, z: number): void {
  const g = new THREE.CylinderGeometry(0.31, 0.31, 0.78, 16, 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i), k = 1 + 0.12 * (1 - (y / 0.39) ** 2); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, M.wood); m.position.set(x, 0.39, z); m.castShadow = true; part.add(solid(m));
  for (const y of [0.15, 0.62]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.345, 0.02, 6, 24), M.iron); ring.rotation.x = Math.PI / 2; ring.position.set(x, y, z); part.add(ring); }
}

/** The pond (cleanroom world.js 603-650 and main.js 70-111): kerb stones, the moss bridge, reeds, lilies, three lantern
 *  posts and the water, its outline the same rounded rectangle the ground is carved from. */
export function pond(part: THREE.Group, M: Record<string, THREE.MeshStandardMaterial>, tex: Record<string, THREE.Texture>, { bridgeUp = false } = {}): void {
  const { R, rand, addBlock, addCap, lanternPost, flush } = kit(part, 603, M, tex);
  const P = LAYOUT.POND;
  // kerb stones around the rim, gaps where the bridge lands
  const per: [number, number][] = [];
  const steps = 140;
  for (let i = 0; i < steps; i++) {
    // walk the rounded rectangle by angle and project onto the SDF zero line
    const a = (i / steps) * Math.PI * 2;
    let rr = 3;
    for (let k = 0; k < 30; k++) { const d = pondSDF(P.x + Math.cos(a) * rr, P.z + Math.sin(a) * rr); rr -= d * 0.8; }
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
    const topY = bridgeUp ? 0.28 : -0.07;
    addBlock(x, topY - 0.6, z, 1.7, 1.2, 1.7, R(-0.08, 0.08), bridgeUp ? R(0.78, 0.9) : R(0.32, 0.4));
    if (bridgeUp) addCap(x, topY + 0.02, z, 1.75, 0.18, 1.75, R(-0.1, 0.1));
  }
  // reeds, cattails and lilies
  const reedM = new THREE.MeshStandardMaterial({ color: '#7a8a36', roughness: 0.9 });
  const catM = new THREE.MeshStandardMaterial({ color: '#5a3a22', roughness: 0.9 });
  for (let i = 0; i < 140; i++) {
    const a = R(0, Math.PI * 2), x = P.x + Math.cos(a) * R(4, 9), z = P.z + Math.sin(a) * R(3, 8);
    const d = pondSDF(x, z);
    if (d < -0.9 || d > 0.6 || Math.abs(z - P.z) < 1.6) continue;
    const h = R(0.6, 1.5);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.022, h, 4), reedM);
    r.position.set(x, groundHeight(x, z) + h / 2, z); r.rotation.set(R(-0.18, 0.18), 0, R(-0.18, 0.18)); part.add(r);
    if (rand() < 0.4) { const c = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.2, 3, 6), catM); c.position.set(x, groundHeight(x, z) + h - 0.05, z); part.add(c); }
  }
  const padM = new THREE.MeshStandardMaterial({ color: '#4a6e2a', roughness: 0.7, side: THREE.DoubleSide });
  const flowerM = new THREE.MeshStandardMaterial({ color: '#f4e4ee', emissive: '#ffd0e0', emissiveIntensity: 0.15 });
  for (let i = 0; i < 40; i++) {
    const x = P.x + R(-P.hx + 0.8, P.hx - 0.8), z = P.z + R(-P.hz + 0.8, P.hz - 0.8);
    if (Math.abs(z - P.z) < 1.2) continue;
    const m = new THREE.Mesh(new THREE.CircleGeometry(R(0.2, 0.36), 14, 0.3, Math.PI * 2 - 0.3), padM);
    m.rotation.set(-Math.PI / 2, 0, R(0, 6)); m.position.set(x, -0.105, z); part.add(m);
    if (rand() < 0.25) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), flowerM); f.position.set(x, -0.07, z); f.scale.y = 0.6; part.add(f); }
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
  flush();
}

/** The sunset light (cleanroom main.js 40-66): hemisphere, the key sun, the rim, the haze, the composer. */
export function sunset(world: ShardWorld): void {
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

/** The slice: the light, the hut, the pond, the ground they stand on. */
export function buildSlice(world: ShardWorld): void {
  const { M, tex } = materials();
  sunset(world);
  world.ground(groundHeight, { colourAt: groundColour });
  world.part('hut', (part) => { hut(part, M, tex); });
  world.part('pond', (part) => { pond(part, M, tex); });
  world.spawn(-3.9, 0, -5.6, 0.03);
}
