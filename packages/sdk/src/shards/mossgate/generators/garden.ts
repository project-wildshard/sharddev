// The Hollow's water and growth (split from world.ts, MZ25; the cleanroom's world.js 641-697 and 815-991): the pond,
// the toy trees, boulders, ferns and flowers, the grass cards and the fireflies.
import * as THREE from 'three';
import * as T from './textures';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { animate, drift, Water, type ShardWorld } from '@wildshard/sdk/scene/author';
import { LAYOUT, STATE, noise, sstep, pondSDF, groundHeight, type Materials, type Textures } from './hollow';
import { kit } from './kit';
import { pathSlabs } from './yard';

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
  // MZ6 (QA 11-19 row 27): a mossy teal, so the pond reads as water on every tier (the dusk-violet tint read as a bare pit)
  const water = new Water(shape, { tint: '#356159', reflect: 'planar' });
  water.position.set(P.x, -0.12, P.z);
  part.add(water);
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
export function flora(part: THREE.Group, tex: Textures, world: ShardWorld): void {
  const rand = T.rng(891), R = (a: number, b: number): number => a + (b - a) * rand();
  const Y = LAYOUT.YARD, G = LAYOUT.GATE;
  const edge: [number, number][] = [];
  for (let z = Y.z0 + 0.8; z < Y.z1 - 0.5; z += R(1.3, 2.8)) { if (Math.abs(z - G.z) > 2.6) edge.push([Y.x0 + 0.8, z]); if (Math.abs(z - LAYOUT.EAST_GAP.z) > 2.6) edge.push([Y.x1 - 0.8, z]); }
  for (let x = Y.x0 + 0.8; x < Y.x1 - 0.5; x += R(1.4, 3)) { edge.push([x, Y.z0 + 0.8]); edge.push([x, Y.z1 - 0.8]); }
  const fernSpots: [number, number][] = [...edge, ...BOULDERS.map(([x, z]): [number, number] => [x + R(-0.8, 0.8), z + R(0.5, 1)]),
    [-1.6, -12.4], [-6.8, -12.6], [-6.6, -12.0], [G.x + 1.0, G.z - 2.6], [G.x + 1.0, G.z + 2.6], [-2.2, -5.4], [3.1, -6.2], [1.6, -11.8]];
  // ferns (AP32d): one nine-frond rosette is the detail card, a copy a spot; the engine scatters them round the camera
  {
    const frond = new THREE.PlaneGeometry(0.3, 1.05, 1, 6); frond.translate(0, 0.52, 0);
    const p = frond.attributes.position;
    if (p !== undefined) for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, y * y * 0.55); p.setY(i, y * (1 - y * 0.25)); }
    frond.computeVertexNormals();
    // the rosette's own stream, so the mushrooms and flowers below draw the numbers they always drew
    const lean = T.rng(892);
    const rosette = mergeGeometries(Array.from({ length: 9 }, (_, f) => frond.clone().rotateX(-(0.25 + 0.3 * lean())).rotateY((f / 9) * Math.PI * 2 + (lean() - 0.5) * 0.4)));
    const im = new THREE.InstancedMesh(rosette, new THREE.MeshStandardMaterial({ map: tex.frond, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 }), fernSpots.length);
    const o = new THREE.Object3D();
    let k = 0;
    for (const [x, z] of fernSpots) {
      const s = R(0.75, 1.25);
      for (let f = 0; f < 9; f++) { R(-0.2, 0.2); R(-0.55, -0.25); R(0.8, 1.1); }
      o.position.set(x, groundHeight(x, z), z); o.rotation.set(0, 0, 0); o.scale.setScalar(s); o.updateMatrix(); im.setMatrixAt(k++, o.matrix);
    }
    world.detail('ferns', im, { cell: 1, radius: 30, sway: { amount: 0.06, rate: 0.5 }, shadow: true });
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

/** Grass (cleanroom world.js 937-959): 9,000 crossed cards within 62 m, off the hut, the pond, the arena and the path, as a
 *  detail layer (AP32d): the shard keeps the card and a count of cards per metre square, the engine grows them round the camera. */
export function grass(world: ShardWorld, tex: Textures): void {
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
  im.count = k;
  world.detail('grass', im, { cell: 2, radius: 40, sway: { amount: 0.06, rate: 0.5 } });
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
