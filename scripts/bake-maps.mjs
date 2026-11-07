#!/usr/bin/env node
// Bake each shard's map from its world (SF66, G246 / G247; the look is G252's B, stylized): boot the shard in a served
// build, render it straight down (orthographic, the full 500 m cell centred on the origin) in 2 × 2 tiles, twice: a colour
// pass and a height pass (every mesh drawn with its world height). scripts/map-stylize.py turns the two into flat colours
// by ground type from the shard's own colour table (look/map.json "style"), with a hillshade and inked edges, and writes
// public/assets/<slug>/map/top.webp (1000 px, 0.5 m per pixel). The stamp (the map inputs' hash, look/map.json included, so
// a palette change rebakes) goes in src/shards/<slug>/look/map.baked.json. Only shards whose map inputs changed are baked
// unless --all or --shards is given. A shard with no "style" fails its bake: every shard owns its colour table.
//   node scripts/bake-maps.mjs --url=<scripts/serve-build.sh --head> [--shards=a,b] [--all] [--keep=<dir>]
//   (through scripts/browser-lane.sh; the stylizer runs under `uv run` with numpy, scipy and pillow)
// Bake rules (art/maps/round-1-baked-map-style/README.md): the engine renders with autoClear off, so colour and depth are
// cleared before every tile; the pixels are read straight after each draw; movers are drawn at rest (each mover runtime's
// `showRest`, in the same task as the draws).
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { saveFixture } from '@wildshard/engine/scripts/debug-settings.mjs';
import { installInit } from '@wildshard/engine/scripts/parity/init.mjs';
import { MAP_METRES, mapPixelHash, mapSettings, mapSettingsPath, mapStampPath, mapShards, mapTilesHash, writeMapStamp } from '@wildshard/engine/scripts/map-hash.mjs';
import { saveMapFrames } from './map-bake-frames.mjs';

const option = (name) => process.argv.find((part) => part.startsWith(`--${name}=`))?.slice(name.length + 3);
const root = resolve(import.meta.dirname, '..');
const url = option('url');
if (url === undefined) throw new Error('bake-maps: --url=<served build> (scripts/serve-build.sh --head)');
const base = url.replace(/\/?$/, '/');
const only = option('shards')?.split(',');
const keep = option('keep');
const TILE = 1000, HEIGHT = 900, OUT = 1000;

const stampPath = mapStampPath;
const todo = mapShards(root).filter(({ slug, dir }) => {
  if (JSON.parse(readFileSync(mapSettingsPath(dir), 'utf8')).painter !== undefined) return false;
  // G320: a map with "from" (its world GLB) is baked by scripts/bake-map-glb.mjs in Node, never from the game page
  if (mapSettings(dir).from !== null) return false;
  if (only) return only.includes(slug);
  if (process.argv.includes('--all') || !existsSync(stampPath(dir))) return true;
  const stamp = JSON.parse(readFileSync(stampPath(dir), 'utf8'));
  return stamp.tilesHash !== mapTilesHash(dir) || typeof stamp.pixelHash !== 'string';
});
if (todo.length === 0) { console.log('bake-maps: every map is current'); process.exit(0); }

// Browser side: hide what is not the world, pose the movers at rest, render 2 × 2 orthographic tiles of the colour pass and
// the height pass, each tile cleared before its draw and read straight after it; retains both native canvases.
function bake(arg) {
  const g = window.__wildshard.world.game, r = g.renderer, scene = g.rootScene ?? g.scene, gl = r.getContext();
  const exposed = g.app.debug.snapshot();
  const rest = () => { for (const [name, value] of Object.entries(exposed)) if (name.startsWith('movers.') && typeof value?.showRest === 'function') value.showRest(); };
  const hidden = [], hide = (o) => { if (o.visible) { o.visible = false; hidden.push(o); } };
  for (const c of g.camera.children) hide(c); // held items
  const clouds = g.sky?.clouds; if (clouds) hide(clouds);
  const match = (list, o) => list.some((p) => (p.endsWith('*') ? o.name.startsWith(p.slice(0, -1)) : o.name === p));
  const kept = (o) => { for (let p = o; p; p = p.parent) if (arg.keep.includes(p.name)) return true; return false; };
  const named = (o) => match(arg.hide, o) && !kept(o);
  const standing = []; // the hidden meshes whose riders hide too ("hideStanding")
  scene.traverse((o) => {
    // the engine sky and backdrops by name (never an island or a sky isle), the shard's own hides, particles and sprites
    const sky = o.name === 'look-dome' || (/cloud|sky|dome|backdrop/iu.test(o.name) && !/isle|island/iu.test(o.name));
    if (named(o) && match(arg.hideStanding, o)) standing.push(o);
    if (named(o) || sky || o.isPoints === true || o.isSprite === true) hide(o);
  });
  // what stands on a "hideStanding" mesh hides with it: every instance of a visible instanced mesh rooted on the top of one of
  // that mesh's instances, within 80 % of its half width of its origin and from 4 m under to 6 m over the origin's height (a
  // fir on the turf; never a bridge plank or an updraft streak passing under, over or beside it). Sky Reach's sky-isle firs
  // share the archipelago's one forest.
  const M = g.camera.matrixWorld.clone(), V = g.camera.position.clone(), zero = M.clone().makeScale(0, 0, 0);
  const boxes = []; // per hidden instance: its origin (ox, oy, oz) and its top's reach r
  for (const o of standing) o.traverse((m) => {
    if (!m.isMesh || !m.geometry) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox, n = m.isInstancedMesh ? m.count : 1;
    for (let k = 0; k < n; k++) {
      if (m.isInstancedMesh) { m.getMatrixAt(k, M); M.premultiply(m.matrixWorld); } else M.copy(m.matrixWorld);
      const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
      for (let c = 0; c < 8; c++) {
        V.set(c & 1 ? b.max.x : b.min.x, c & 2 ? b.max.y : b.min.y, c & 4 ? b.max.z : b.min.z).applyMatrix4(M);
        box.x0 = Math.min(box.x0, V.x); box.x1 = Math.max(box.x1, V.x); box.y0 = Math.min(box.y0, V.y); box.y1 = Math.max(box.y1, V.y); box.z0 = Math.min(box.z0, V.z); box.z1 = Math.max(box.z1, V.z);
      }
      boxes.push({ ox: M.elements[12], oy: M.elements[13], oz: M.elements[14], r: 0.4 * Math.min(box.x1 - box.x0, box.z1 - box.z0) });
    }
  });
  const collapsed = []; // [mesh, index, original matrix]
  if (boxes.length > 0) scene.traverse((m) => {
    if (!m.isInstancedMesh || standing.includes(m)) return;
    for (let p = m; p; p = p.parent) if (!p.visible) return;
    let changed = false;
    for (let k = 0; k < m.count; k++) {
      m.getMatrixAt(k, M); const local = M.clone(); M.premultiply(m.matrixWorld);
      const x = M.elements[12], y = M.elements[13], z = M.elements[14];
      if (boxes.some((b) => Math.hypot(x - b.ox, z - b.oz) <= b.r && y >= b.oy - 4 && y <= b.oy + 6)) { collapsed.push([m, k, local]); m.setMatrixAt(k, zero); changed = true; }
    }
    if (changed) m.instanceMatrix.needsUpdate = true;
  });
  const fog = scene.fog, bg = scene.background; scene.fog = null;
  const cam0 = g.camera, side = Math.min(arg.tile, gl.drawingBufferWidth, gl.drawingBufferHeight), ratio = r.getPixelRatio(), half = arg.metres / 2;
  const near = arg.clipAbove === null ? 1 : arg.height - arg.clipAbove, far = arg.clipBelow === null ? arg.height + 400 : arg.height - arg.clipBelow;
  const pass = () => {
    const out = document.createElement('canvas'); out.width = side * 2; out.height = side * 2; const ctx = out.getContext('2d');
    r.setRenderTarget(null); r.setScissorTest(false); r.setViewport(0, 0, side / ratio, side / ratio);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      // straight down in the minimap's frame (Minimap.ts): north (+Z) up the image, east (−X) right; tile i from the left (+X), j from the top (+Z)
      const cam = cam0.clone(false); cam.isPerspectiveCamera = false; cam.isOrthographicCamera = true;
      cam.position.set(0, arg.height, 0); cam.up.set(0, 0, 1); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true);
      const l = -half + i * half, t = half - j * half;
      // camera space: x runs toward −X world (east), y toward +Z (north); the tile spans world X [−l−half, −l], Z [t−half, t]
      cam.projectionMatrix.makeOrthographic(l, l + half, t, t - half, near, far);
      cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
      r.clear(true, true, true); r.render(scene, cam);
      const buf = new Uint8Array(side * side * 4); gl.readPixels(0, 0, side, side, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      const img = ctx.createImageData(side, side), row = side * 4;
      for (let y = 0; y < side; y++) img.data.set(buf.subarray((side - 1 - y) * row, (side - y) * row), y * row); // GL rows are bottom-up
      for (let k = 3; k < img.data.length; k += 4) img.data[k] = 255;
      ctx.putImageData(img, i * side, j * side);
    }
    return out;
  };
  const Color = scene.getObjectByProperty('isMesh', true)?.material?.color?.constructor;
  if (Color !== undefined) scene.background = new Color(arg.bg[0], arg.bg[1], arg.bg[2]);
  let colour, height = null;
  try {
    // every material's clock held (as scripts/proof-*-look-parity.mjs hold it): swaying grass and drifting paint drew
    // wherever the wall clock had them when the bake ran
    scene.traverse((o) => {
      for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
        for (const key of ['uTime', 'time', 'uCloudTime']) if (typeof m.uniforms?.[key]?.value === 'number') m.uniforms[key].value = 10;
      }
    });
    rest(); colour = pass();
    // height pass: every mesh in its world height (16 bit over R, G; B = 1 where anything is), cleared to black; the sky / sea
    // backdrops (> 800 m across), ghosts (invisible, colour-off or depth-off transparent) and the shard's "heightHide" left out
    const mat = g.captureHeightMaterial();
    {
      const hid2 = [], back = (o) => arg.heightHide.some((p) => (p.endsWith('*') ? o.name.startsWith(p.slice(0, -1)) : o.name === p));
      scene.traverse((o) => {
        if (!o.visible || !(o.isMesh || o.isLine)) return;
        if (o.geometry && !o.geometry.boundingSphere) o.geometry.computeBoundingSphere?.();
        const radius = o.geometry?.boundingSphere?.radius ?? 0, ms = Array.isArray(o.material) ? o.material : [o.material];
        const ghost = ms.every((m) => !m || m.visible === false || m.colorWrite === false || (m.transparent && m.depthWrite === false));
        if (radius > 800 || ghost || back(o)) { o.visible = false; hid2.push(o); }
      });
      const cc = r.getClearColor(cam0.position.clone()), ca = r.getClearAlpha(), tm = r.toneMapping;
      scene.background = null; r.setClearColor(0x000000, 1); r.toneMapping = 0; scene.overrideMaterial = mat;
      try { rest(); height = pass(); } finally { scene.overrideMaterial = null; r.setClearColor(cc, ca); r.toneMapping = tm; for (const o of hid2) o.visible = true; mat.dispose(); }
    }
  } finally {
    for (const o of hidden) o.visible = true;
    for (const [m, k, local] of collapsed) { m.setMatrixAt(k, local); m.instanceMatrix.needsUpdate = true; }
    scene.fog = fog; scene.background = bg;
    r.setViewport(0, 0, r.domElement.width / ratio, r.domElement.height / ratio);
  }
  return { side, colour, height, collapsed: collapsed.length, from: [...new Set(collapsed.map(([m]) => (m.name !== '' ? m.name : m.parent?.name ?? '?')))].join(' ') };
}

const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--mute-audio'] });
mkdirSync(join(root, 'tmp'), { recursive: true });
const work = keep ?? mkdtempSync(join(root, 'tmp', 'bake-maps-'));
mkdirSync(work, { recursive: true });
let failed = 0;
try {
  for (const { slug, dir } of todo) {
    const settings = mapSettings(dir);
    const context = await browser.newContext({ viewport: { width: TILE + 100, height: TILE + 100 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    await saveFixture(context, { scope: 'device', key: 'devMode', data: true }); // Developer-only shards boot too
    // the parity harness's page (scripts/parity/init.mjs), so two bakes of one build are the same bytes: the session's seed
    // and Math.random pinned (a live page salts its seed from crypto: Sky Reach's cosmetic stream drew different island
    // meshes, op-sky81), the capture clock (every frame 1/30 s of game time), the animals held where they spawn, and the
    // world's frames held at ws:ready until the bake advances them (a wall-clock wait moved creatures, rotors and drifting
    // things by however many frames the machine drew, op-sky82)
    await installInit(context, { lane: 'bake-maps', sha: '', browser: 'chromium', capture: 30 });
    const page = await context.newPage();
    try {
      await page.goto(`${base}?chunk=${encodeURIComponent(slug)}&mute=1&skipintro=1&nolock=1&sw=0`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => Boolean(window.__wildshard?.world?.game && !document.querySelector('.ws-load')), null, { timeout: 180_000, polling: 250 });
      // late streamed pieces and models load with the world held; then exactly 6 s of game time (180 capture frames) run,
      // and anything those frames streamed in loads, held again, before the bake
      await page.waitForTimeout(6000);
      await page.evaluate(() => window.__parity.advance(180));
      await page.waitForTimeout(3000);
      const colourPng = join(work, `colour-${slug}.png`), heightPng = join(work, `height-${slug}.png`), stylePath = join(work, `style-${slug}.json`);
      const out = await saveMapFrames(page, await page.evaluateHandle(bake, { tile: TILE, height: HEIGHT, metres: MAP_METRES, bg: [0.16, 0.18, 0.2], hide: settings.hide, heightHide: settings.heightHide, keep: settings.keep, hideStanding: settings.hideStanding, clipBelow: settings.clipBelow, clipAbove: settings.clipAbove }), colourPng, heightPng);
      const imageDir = join(root, 'public/assets', slug, 'map'), webp = join(imageDir, 'top.webp');
      mkdirSync(imageDir, { recursive: true });
      if (settings.style === null || !out.hasHeight) throw new Error(`${slug}: no look/map.json "style" (the colour table) or no height pass`);
      writeFileSync(stylePath, JSON.stringify(settings.style));
      execFileSync('uv', ['run', '--quiet', '--with', 'numpy', '--with', 'scipy', '--with', 'pillow', 'python', join(root, 'scripts/map-stylize.py'), colourPng, heightPng, stylePath, webp, String(OUT)], { stdio: 'inherit' });
      const bytes = statSync(webp).size;
      const stamp = { version: 1, tilesHash: mapTilesHash(dir), pixelHash: await mapPixelHash(webp), image: `/assets/${slug}/map/top.webp`, size: OUT, metres: MAP_METRES, north: '+z', east: '-x', style: `stylized:${settings.style.kind}`, bytes };
      await writeMapStamp(dir, webp, stamp);
      console.log(`bake-maps: ${slug} ${OUT}px ${(bytes / 1024).toFixed(0)} KB${out.collapsed > 0 ? `, ${String(out.collapsed)} instances hidden with what they stand on (${out.from})` : ''}`);
    } catch (error) {
      failed++; console.error(`bake-maps: ${slug} FAILED — ${error instanceof Error ? error.message : String(error)}`);
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  if (keep === undefined) rmSync(work, { recursive: true, force: true });
}
if (failed > 0) process.exit(1);
