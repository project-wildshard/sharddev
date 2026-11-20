// The Hollow yard (split from world.ts, MZ25; the cleanroom's world.js 183-639): its walls, stepping-stone paths, the
// braziers' stone, the hut, the crate players push, the signpost, the moss gate and the Lamplighter's figure.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as T from './textures';
import { animate, solid } from '@wildshard/sdk/scene/author';
import { LAYOUT, STATE, groundHeight, type Materials, type Textures } from './hollow';
import { LAMP_FLICKER, kit, decal, type Kit } from './kit';

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
  // north, behind the hut; TR-12: the gap the lever's gate fills (play.ts `PLAY.NORTH_GATE`, x 8.5, 1.9 m either side)
  wall(Y.x0, Y.z0, Y.x1, Y.z0, { gaps: [[8.5 - Y.x0 - 1.9, 8.5 - Y.x0 + 1.9]] });
  wall(Y.x1, Y.z0, Y.x1, Y.z1, { gaps: [[LAYOUT.EAST_GAP.z - Y.z0 - 1.9, LAYOUT.EAST_GAP.z - Y.z0 + 1.9]] }); // east, toward the Downs
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

export interface Slab { x: number; z: number; sx: number; sz: number; r: number }
/** The stepping-stone paths' slabs (cleanroom world.js 276-296), from their own stream: the grass reads them too. */
export function pathSlabs(): { slabs: Slab[]; R: (a: number, b: number) => number } {
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
  path([[1.5, 0.6], [6, -1.2], [LAYOUT.EAST_GAP.x - 1.4, LAYOUT.EAST_GAP.z]], { width: 1.15 });
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

export function barrel(part: THREE.Group, k: Kit, M: Materials, x: number, z: number): void {
  const g = new THREE.CylinderGeometry(0.31, 0.31, 0.78, 16, 4);
  const p = g.attributes.position;
  if (p !== undefined) for (let i = 0; i < p.count; i++) { const y = p.getY(i), s = 1 + 0.12 * (1 - (y / 0.39) ** 2); p.setX(i, p.getX(i) * s); p.setZ(i, p.getZ(i) * s); }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, M.wood); m.position.set(x, 0.39, z); m.castShadow = true; part.add(m);
  for (const y of [0.15, 0.62]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.345, 0.02, 6, 24), M.iron); ring.rotation.x = Math.PI / 2; ring.position.set(x, y, z); part.add(ring); }
  k.collider({ x, y: 0.39, z, hx: 0.31, hy: 0.39, hz: 0.31, rotY: 0 });
}

/**
 * SHARD-SOURCE SS9e: a crate inside the yard gate that players push (format `props.bodies`): its own panel part, a
 * planked box with iron corner bands, one body the server keeps and every player sees move the same way.
 */
/** SS9e: the crate's planks (`T.crateWood`), made once */
const crateWood = T.crateWood();

export function crate(part: THREE.Group, M: Materials): void {
  const { x, z, yaw } = LAYOUT.CRATE, gy = groundHeight(x, z), size = 0.8;
  // its own planks and bands: a panel's textures load with the shard, and the yard's far tiles may not share them
  const planks = new THREE.MeshStandardMaterial({ map: crateWood, roughness: 0.8 }), iron = M.iron.clone();
  const box = solid(new THREE.Mesh(new RoundedBoxGeometry(size, size, size, 2, 0.03), planks)); box.position.set(x, gy + size / 2, z); box.rotation.y = yaw; box.castShadow = true; part.add(box);
  for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.06, size, 0.06), iron);
    const ox = cx * (size / 2 - 0.02), oz = cz * (size / 2 - 0.02);
    band.position.set(x + ox * Math.cos(yaw) + oz * Math.sin(yaw), gy + size / 2, z - ox * Math.sin(yaw) + oz * Math.cos(yaw)); band.rotation.y = yaw; part.add(band);
  }
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
  // the gate's bars are a panel brazier A's field sinks (play.ts `gateBars`)
  const plaque = new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.55, 0.1, 2, 0.03), M.stoneClean);
  plaque.position.set(gx + 0.66, 1.75, gz - half - 0.6); plaque.rotation.y = Math.PI / 2; part.add(plaque);
  decal(part, 'A', gx + 0.72, 1.75, gz - half - 0.6, Math.PI / 2, 0.6);
  k.flush();
}

/** The Lamplighter (cleanroom world.js 608-639): a hooded, round-faced keeper with a lantern on a staff, a static pose.
 *  TR-12: her figure goes in `figure`, a panel her talk names (gameplay.ts), so its belt and staff wear their own plain
 *  materials (a panel may not share the far tiles' textures); her lantern and collider stay in `part`. */
export function lamplighter(part: THREE.Group, M: Materials, tex: Textures, figure: THREE.Group = part): void {
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
  const beltM = new THREE.MeshStandardMaterial({ color: '#5e4634', roughness: 0.82 }), poleM = new THREE.MeshStandardMaterial({ color: '#8a6446', roughness: 0.78 });
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.035, 6, 24), beltM); belt.rotation.x = Math.PI / 2; belt.position.y = 0.62;
  g.add(body, hem, head, hood, tip, belt);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 2.0, 6), poleM); pole.position.set(0.48, 1.0, 0.2); pole.castShadow = true; g.add(pole);
  g.position.set(x, groundHeight(x, z), z); g.rotation.y = faceYaw; g.scale.setScalar(1.35); figure.add(g);
  const wp = new THREE.Vector3(0.48, 1.86, 0.2).multiplyScalar(1.35).applyEuler(g.rotation).add(g.position);
  k.lantern(wp.x, wp.y, wp.z, { on: true, scale: 1.0 });
  k.collider({ x, y: 0.8, z, hx: 0.4, hy: 0.8, hz: 0.4, rotY: 0 });
}
