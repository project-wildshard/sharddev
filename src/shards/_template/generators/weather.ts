import { BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, Matrix3, Mesh, MeshStandardMaterial, SphereGeometry, Vector3, type Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { templateNoise } from './landscapeNoise';

/**
 * TEMPLATES-CLEANROOM M2: the cleanroom's weathering, baked as vertex colours (the plain PBR look reads them; no texture).
 * Every mesh under `root` gets, in world space: a stone mottle (two noises), moss creeping over the tops of grey stone
 * faces, darker courses every half metre on stone walls, a grain on wood, clumps on moss and leaves, and a contact shade
 * near the ground. The colours are multipliers on the mesh's own colour, which the bake keeps (vertex colour × colour).
 */
export function weather(root: Object3D, heightAt: (x: number, z: number) => number): void {
  const mottle = templateNoise(21), speck = templateNoise(22), creep = templateNoise(23), grain = templateNoise(24);
  const seen = new Set<BufferGeometry>(), p = new Vector3(), n = new Vector3(), base = new Color(), hsl = { h: 0, s: 0, l: 0 };
  const MOSS = new Color(0x546826);
  root.updateMatrixWorld(true);
  root.traverse((node) => {
    if (!(node instanceof Mesh) || !(node.material instanceof MeshStandardMaterial) || !(node.geometry instanceof BufferGeometry)) return;
    if (node.material.emissiveIntensity > 0 && node.material.emissive.getHex() !== 0) return;
    if (node.material.transparent) return;
    let geometry: BufferGeometry = node.geometry;
    if (seen.has(geometry)) { geometry = geometry.clone(); node.geometry = geometry; }
    seen.add(geometry);
    if (!geometry.hasAttribute('normal')) geometry.computeVertexNormals();
    base.copy(node.material.color); base.getHSL(hsl);
    geometry.computeBoundingBox(); const tall = geometry.boundingBox === null ? 1 : (geometry.boundingBox.max.y - geometry.boundingBox.min.y) * node.matrixWorld.getMaxScaleOnAxis();
    const kind = hsl.s < 0.16 ? 'stone' : hsl.h > 0.05 && hsl.h < 0.12 && hsl.l < 0.45 ? 'wood' : hsl.h > 0.17 && hsl.h < 0.42 ? 'green' : 'other';
    const pos = geometry.getAttribute('position'), nor = geometry.getAttribute('normal'), old = geometry.hasAttribute('color') ? geometry.getAttribute('color') : null;
    const out = new Float32Array(pos.count * 3), normalMatrix = new Matrix3().getNormalMatrix(node.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(node.matrixWorld);
      n.fromBufferAttribute(nor, i).applyMatrix3(normalMatrix).normalize();
      const m = mottle(p.x * 0.55 + p.y * 0.3, p.z * 0.55 - p.y * 0.3) * 0.5 + 0.5, s = speck(p.x * 3.1 + p.y * 1.7, p.z * 3.1 + p.y * 2.3);
      let r = 1, g = 1, b = 1;
      if (kind === 'stone') {
        const k = 0.8 + m * 0.34 + s * 0.06; r = k; g = k; b = k * 0.98;
        const course = Math.abs(((p.y + 1000) % 0.5) - 0.25) > 0.22 && Math.abs(n.y) < 0.5 ? 0.82 : 1; r *= course; g *= course; b *= course;
        const c = creep(p.x * 0.4, p.z * 0.4) * 0.5 + 0.5 + (n.y > 0.55 ? (tall < 0.4 ? -1 : 0.18) : n.y > -0.2 ? Math.max(0, 0.2 - (p.y - heightAt(p.x, p.z)) * 0.06) : -1);
        const t = Math.min(1, Math.max(0, (c - 0.62) * 4));
        if (t > 0) { const k2 = 0.8 + s * 0.2; r += (MOSS.r * k2 / Math.max(base.r, 0.02) - r) * t; g += (MOSS.g * k2 / Math.max(base.g, 0.02) - g) * t; b += (MOSS.b * k2 / Math.max(base.b, 0.02) - b) * t; }
      } else if (kind === 'wood') {
        const k = 0.82 + (grain(p.x * 0.6 + p.z * 0.6, p.y * 9) * 0.5 + 0.5) * 0.3; r = k; g = k; b = k;
      } else if (kind === 'green') {
        const k = 0.78 + m * 0.36 + s * 0.08; r = k * (0.96 + m * 0.08); g = k; b = k * (0.9 + m * 0.1);
      } else {
        const k = 0.9 + m * 0.18; r = k; g = k; b = k;
      }
      // contact shade: the last 0.6 m above the ground darkens a little (the cleanroom's AO)
      const above = p.y - heightAt(p.x, p.z), shade = 0.72 + 0.28 * Math.min(1, Math.max(0, above / 0.6));
      out[i * 3] = r * shade * (old?.getX(i) ?? 1); out[i * 3 + 1] = g * shade * (old?.getY(i) ?? 1); out[i * 3 + 2] = b * shade * (old?.getZ(i) ?? 1);
    }
    geometry.setAttribute('color', new Float32BufferAttribute(out, 3));
    node.material.vertexColors = true;
  });
}

/** A w × h × d box cut into roughly `step`-metre quads (at most 8 a side), so the baked weathering has vertices to sit on. */
export function surfaceBox(w: number, h: number, d: number, step = 1e9): BoxGeometry {
  const seg = (x: number): number => Math.min(8, Math.max(1, Math.round(x / step)));
  return new BoxGeometry(w, h, d, seg(w), seg(h), seg(d));
}

/**
 * The cleanroom's tree crown: a smooth bumpy ball (broad lumps and ridged leaf clumps on an indexed sphere, so its normals
 * stay smooth), lit from above with a darker underside, the light and dark baked as vertex-colour multipliers.
 */
export function lumpyCrown(r: number, seed: number): BufferGeometry {
  const big = templateNoise(31 + seed), lumps = templateNoise(32 + seed), fine = templateNoise(33 + seed);
  const g = new SphereGeometry(1, 28, 18), p = g.getAttribute('position'), c = new Float32Array(p.count * 3), v = new Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const b = big(v.x * 1.6 + 5, v.z * 1.6 + v.y * 1.3) * 0.5 + 0.5;
    const l = 1 - Math.abs(lumps(v.x * 4.4 + 11, v.y * 4.4 + v.z * 3.3)); // ridged: rounded leaf clumps
    const f = fine(v.x * 12 + 1, v.y * 12 + v.z * 10) * 0.5 + 0.5;
    const pole = Math.abs(v.y) > 0.999 ? 0 : 1; // the seam's poles stay shut
    v.multiplyScalar(r * (0.9 + pole * ((b - 0.5) * 0.24 + l * 0.12 + f * 0.03))); v.y *= 0.92;
    p.setXYZ(i, v.x, v.y, v.z);
    const sun = 0.42 + 0.58 * Math.min(1, Math.max(0, (v.y / r + 0.95) / 1.8)), leaf = 0.82 + l * 0.24 + (f - 0.5) * 0.18;
    c[i * 3] = sun * leaf; c[i * 3 + 1] = sun * leaf; c[i * 3 + 2] = sun * leaf * 0.9;
  }
  g.setAttribute('color', new Float32BufferAttribute(c, 3)); g.deleteAttribute('uv'); g.computeVertexNormals();
  return g;
}

/**
 * The cleanroom's masonry: a w × h × d wall box built as staggered courses of half-metre blocks, each a little proud or
 * shy of the face and tinted on its own, over a dark mortar core (one merged geometry; colours are multipliers).
 */
export function coursedBox(w: number, h: number, d: number, seed = 0): BufferGeometry {
  const alongX = w >= d, len = alongX ? w : d, thick = alongX ? d : w;
  const rows = Math.max(2, Math.round(h / 0.5)), rowH = h / rows, gap = 0.035;
  let s = (seed * 9301 + 49297) % 233280; const rand = (): number => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const parts: BufferGeometry[] = [];
  const add = (g: BufferGeometry, x: number, y: number, z: number, k: number): void => {
    g.translate(x, y, z); g.deleteAttribute('uv');
    const n = g.getAttribute('position').count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = k * 1.01; c[i * 3 + 1] = k; c[i * 3 + 2] = k * 0.97; }
    g.setAttribute('color', new Float32BufferAttribute(c, 3)); parts.push(g);
  };
  // the mortar core, shy of both faces
  const core = alongX ? new BoxGeometry(w - 0.02, h - 0.02, Math.max(0.05, d - 0.07)) : new BoxGeometry(Math.max(0.05, w - 0.07), h - 0.02, d - 0.02);
  add(core, 0, 0, 0, 0.5);
  for (let r = 0; r < rows; r++) {
    let at = -len / 2 - (r % 2 === 1 ? 0.45 : 0) + 0.0001;
    while (at < len / 2 - 0.05) {
      const want = 0.75 + rand() * 0.55, a = Math.max(at, -len / 2), b = Math.min(at + want, len / 2);
      at += want;
      if (b - a < 0.12) continue;
      const proud = (rand() - 0.5) * 0.05, bl = b - a - gap, bh = rowH - gap, bd = thick + proud;
      const g = alongX ? new BoxGeometry(bl, bh, bd) : new BoxGeometry(bd, bh, bl);
      const mid = (a + b) / 2, y = -h / 2 + rowH * (r + 0.5);
      add(g, alongX ? mid : 0, y, alongX ? 0 : mid, 0.84 + rand() * 0.28);
    }
  }
  const merged = mergeGeometries(parts); for (const p of parts) p.dispose();
  if (merged === null) throw new Error('coursedBox: merge failed');
  return merged;
}

/** The coarse tiles and the far proxy keep a coursed wall as its plain box (`userData.plainBox`), so their caps hold. */
export function plainWalls(root: Object3D): void {
  root.traverse((node) => {
    const size: unknown = node.userData.plainBox;
    if (!(node instanceof Mesh) || !Array.isArray(size)) return;
    const [w = 1, h = 1, d = 1] = size as number[], g = new BoxGeometry(w, h, d), n = g.getAttribute('position').count;
    g.setAttribute('color', new Float32BufferAttribute(new Float32Array(n * 3).fill(0.85), 3));
    node.geometry = g;
  });
}
