#!/usr/bin/env node
// G320 / SF87 (a): bake an authored-GLB shard's map from its own world GLB in Node, with no game page and no browser. A
// shard whose look/map.json names `"from": "<its world GLB>"` (the Blender Template: assets/world.glb, SF55a's input) is
// baked here instead of scripts/bake-maps.mjs's served-build capture. The GLB's triangles are rasterized straight down in
// the minimap's frame (north +Z up the image, east −X right, 0.25 m a pixel over the 500 m cell): the colour pass is each
// material's base colour times its vertex colours (sRGB, a fixed top light so walls read darker than floors), the height
// pass the highest surface in each pixel, encoded as bake-maps.mjs encodes it ((y + 100) / 400 over 16 bits in R, G; B = 1
// where anything is). scripts/map-stylize.py then applies the shard's own colour table, and the stamp is written as
// bake-maps.mjs writes it. Deterministic: the same GLB and map.json give the same bytes.
//   node scripts/bake-map-glb.mjs [--shards=a,b] [--all] [--keep=<dir>]
//   (the stylizer runs under `uv run` with numpy, scipy and pillow, as bake-maps.mjs runs it)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { MAP_METRES, mapPixelHash, mapSettings, mapSettingsPath, mapStampPath, mapShards, mapTilesHash, writeMapStamp } from '@wildshard/engine/scripts/map-hash.mjs';

const SIDE = 2000, OUT = 1000, PPM = SIDE / MAP_METRES, BG = [0.16, 0.18, 0.2];
const option = (name) => process.argv.find((part) => part.startsWith(`--${name}=`))?.slice(name.length + 3);

/** Linear [0, 1] to an sRGB byte. @param {number} v */
const srgb = (v) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)));

/**
 * Rasterize a GLB's every triangle top-down into a colour pass and a height pass (binary PPM bytes, SIDE × SIDE).
 * @param {string} glbPath @param {{clipBelow: number | null, clipAbove: number | null}} clip
 * @returns {Promise<{colour: Buffer, height: Buffer, triangles: number}>}
 */
export async function rasterizeGlb(glbPath, clip) {
  const doc = await new NodeIO().read(glbPath);
  const top = new Float64Array(SIDE * SIDE).fill(-Infinity), rgb = new Float32Array(SIDE * SIDE * 3);
  const lo = clip.clipBelow ?? -Infinity, hi = clip.clipAbove ?? Infinity;
  let triangles = 0;
  const p = [0, 0, 0], c = [1, 1, 1, 1];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (mesh === null) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4) continue; // triangles only
      const position = prim.getAttribute('POSITION'), colour = prim.getAttribute('COLOR_0'), indices = prim.getIndices();
      if (position === null) continue;
      const base = prim.getMaterial()?.getBaseColorFactor() ?? [1, 1, 1, 1];
      const count = position.getCount(), world = new Float64Array(count * 3), albedo = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        position.getElement(i, p);
        world[i * 3] = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
        world[i * 3 + 1] = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
        world[i * 3 + 2] = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
        if (colour !== null) colour.getElement(i, c); else c[0] = c[1] = c[2] = 1;
        for (let k = 0; k < 3; k++) albedo[i * 3 + k] = base[k] * c[k];
      }
      const n = indices === null ? count : indices.getCount();
      for (let t = 0; t + 2 < n; t += 3) {
        const v = [0, 1, 2].map((k) => (indices === null ? t + k : indices.getScalar(t + k)));
        const [a, b, d] = v.map((i) => [world[i * 3], world[i * 3 + 1], world[i * 3 + 2]]);
        triangles++;
        // the face's light: straight-down floors full, walls darker (a fixed top light, no shard look involved)
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = d[0] - a[0], wy = d[1] - a[1], wz = d[2] - a[2];
        const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, len = Math.hypot(nx, ny, nz);
        if (len === 0) continue;
        const light = 0.55 + 0.45 * Math.abs(ny / len);
        // pixel space: column from +X (left) toward −X, row from +Z (top) toward −Z
        const px = [a, b, d].map((q) => (MAP_METRES / 2 - q[0]) * PPM), py = [a, b, d].map((q) => (MAP_METRES / 2 - q[2]) * PPM);
        const area = (px[1] - px[0]) * (py[2] - py[0]) - (px[2] - px[0]) * (py[1] - py[0]);
        if (area === 0) continue;
        const x0 = Math.max(0, Math.floor(Math.min(...px))), x1 = Math.min(SIDE - 1, Math.ceil(Math.max(...px)));
        const y0 = Math.max(0, Math.floor(Math.min(...py))), y1 = Math.min(SIDE - 1, Math.ceil(Math.max(...py)));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const sx = x + 0.5, sy = y + 0.5;
          const w0 = ((px[1] - sx) * (py[2] - sy) - (px[2] - sx) * (py[1] - sy)) / area;
          const w1 = ((px[2] - sx) * (py[0] - sy) - (px[0] - sx) * (py[2] - sy)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const h = w0 * a[1] + w1 * b[1] + w2 * d[1];
          const at = y * SIDE + x;
          if (h < lo || h > hi || h <= top[at]) continue;
          top[at] = h;
          for (let k = 0; k < 3; k++) rgb[at * 3 + k] = light * (w0 * albedo[v[0] * 3 + k] + w1 * albedo[v[1] * 3 + k] + w2 * albedo[v[2] * 3 + k]);
        }
      }
    }
  }
  const header = Buffer.from(`P6\n${SIDE} ${SIDE}\n255\n`, 'ascii');
  const colour = Buffer.alloc(SIDE * SIDE * 3), height = Buffer.alloc(SIDE * SIDE * 3);
  for (let at = 0; at < SIDE * SIDE; at++) {
    if (top[at] === -Infinity) { for (let k = 0; k < 3; k++) colour[at * 3 + k] = srgb(BG[k]); continue; }
    for (let k = 0; k < 3; k++) colour[at * 3 + k] = srgb(rgb[at * 3 + k]);
    const e = Math.floor(Math.min(1, Math.max(0, (top[at] + 100) / 400)) * 65535);
    height[at * 3] = Math.floor(e / 256); height[at * 3 + 1] = e % 256; height[at * 3 + 2] = 255;
  }
  return { colour: Buffer.concat([header, colour]), height: Buffer.concat([header, height]), triangles };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = resolve(import.meta.dirname, '..');
  const only = option('shards')?.split(','), keep = option('keep');
  const stampPath = mapStampPath;
  const todo = mapShards(root).filter(({ slug, dir }) => {
    if (JSON.parse(readFileSync(mapSettingsPath(dir), 'utf8')).painter !== undefined) return false;
    if (mapSettings(dir).from === null) return false;
    if (only) return only.includes(slug);
    if (process.argv.includes('--all') || !existsSync(stampPath(dir))) return true;
    const stamp = JSON.parse(readFileSync(stampPath(dir), 'utf8'));
    return stamp.tilesHash !== mapTilesHash(dir) || typeof stamp.pixelHash !== 'string';
  });
  if (todo.length === 0) { console.log('bake-map-glb: every GLB-baked map is current'); process.exit(0); }
  const work = keep ?? mkdtempSync(join(tmpdir(), 'bake-map-glb-'));
  mkdirSync(work, { recursive: true });
  try {
    for (const { slug, dir } of todo) {
      const settings = mapSettings(dir);
      if (settings.style === null || settings.from === null) throw new Error(`${slug}: look/map.json needs "style" and "from"`);
      const out = await rasterizeGlb(join(dir, settings.from), settings);
      const colourPath = join(work, `colour-${slug}.ppm`), heightPath = join(work, `height-${slug}.ppm`), stylePath = join(work, `style-${slug}.json`);
      writeFileSync(colourPath, out.colour); writeFileSync(heightPath, out.height); writeFileSync(stylePath, JSON.stringify(settings.style));
      const imageDir = join(root, 'public/assets', slug, 'map'), webp = join(imageDir, 'top.webp');
      mkdirSync(imageDir, { recursive: true });
      execFileSync('uv', ['run', '--quiet', '--with', 'numpy', '--with', 'scipy', '--with', 'pillow', 'python', join(root, 'scripts/map-stylize.py'), colourPath, heightPath, stylePath, webp, String(OUT)], { stdio: 'inherit' });
      const bytes = statSync(webp).size;
      const stamp = { version: 1, tilesHash: mapTilesHash(dir), pixelHash: await mapPixelHash(webp), image: `/assets/${slug}/map/top.webp`, size: OUT, metres: MAP_METRES, north: '+z', east: '-x', style: `stylized:${settings.style.kind}`, bytes };
      await writeMapStamp(dir, webp, stamp);
      console.log(`bake-map-glb: ${slug} from ${settings.from}, ${out.triangles} triangles, ${OUT}px ${(bytes / 1024).toFixed(0)} KB`);
    }
  } finally { if (keep === undefined) rmSync(work, { recursive: true, force: true }); }
}
