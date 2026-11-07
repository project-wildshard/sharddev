// SF15a view board: today's template ground and props (its terrainPainter and its world generators) beside the template
// shardfile rendered through the loader's views (clientMaterials → clientViews → tileContent), in one renderer under the
// template look's numbers (gradient dome, linear fog 60–180 m, a 1.5 white sun, hemisphere ambient), so the only change is the view layer.
import { Color, DirectionalLight, DoubleSide, Fog, Group, HemisphereLight, Mesh, MeshStandardMaterial, PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, SphereGeometry, WebGLRenderer } from 'three';
import { ResidencyAllocator } from '../../../../src/shared/game/grid/allocator';
import { buildYield } from '../../../../src/shared/engine/core/workSlice';
import { Scope } from '../../../../src/shared/engine/app/scope';
import { buildTerrain } from '../../../../src/shared/engine/world/terrainField';
import type { Vec2 } from '../../../../src/shared/engine/level/data';
import { clientMaterials } from '../../../../src/client/game/shardfile/clientMaterials';
import { clientViews } from '../../../../src/client/game/shardfile/clientViews';
import { standaloneClientTiles } from '../../../../src/client/game/shardfile/tileContent';
import { ClientAssets } from '../../../../src/client/game/shardfile/clientAssets';
import layout from '../../../../src/shards/_template/data/layout.json' with { type: 'json' };
import { poolMask } from '../../../../src/shards/_template/generators/world';
import { templateProps } from '../../../../src/shards/_template/generators/templatePropsSource';
import { readProductDescriptor, browserContentHash } from '../../../../src/client/game/shardfile/product';
import { outputBlobUrl } from '../../../../src/shared/game/shardfile/outputDescriptor';

// Serve this compiled view fixture beside the built Template product.
const productBase = new URL('./shard.json', location.href).href;
const source = await readProductDescriptor({ base: productBase, offline: false, firstParty: true, fetch: url => fetch(url), hash: browserContentHash });

const scene = new Scene(), renderer = new WebGLRenderer({ antialias: true }); renderer.setPixelRatio(2); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFSoftShadowMap; document.body.append(renderer.domElement);
const TEMPLATE_LOOK = source.look, key = TEMPLATE_LOOK.keys[0], day = TEMPLATE_LOOK.day;
if (key === undefined || day === undefined) throw new Error('Template look requires its declared key and day');
const camera = new PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1200);
scene.fog = new Fog(new Color().setRGB(...key.fog.colour), key.fog.near, key.fog.far);
const dome = new Mesh(new SphereGeometry(600, 24, 12), new ShaderMaterial({ side: DoubleSide, depthWrite: false, fog: false,
  vertexShader: 'varying float h; void main(){ h=normalize(position).y; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: 'varying float h; void main(){ gl_FragColor=vec4(mix(vec3(0.75),vec3(0.35,0.42,0.5),clamp(h,0.0,1.0)),1.0); }' }));
const elevation = day.maxElevation * Math.PI / 180, azimuth = day.azimuth * Math.PI / 180;
const sun = new DirectionalLight(new Color().setRGB(...key.sun.colour), key.sun.intensity);
sun.position.set(Math.cos(elevation) * Math.sin(azimuth) * 100, Math.sin(elevation) * 100, Math.cos(elevation) * Math.cos(azimuth) * 100);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 1, far: 300 }); sun.shadow.bias = -0.0005;
const ambient = new HemisphereLight(new Color().setRGB(...key.ambient.sky), new Color().setRGB(...key.ambient.ground), key.ambient.intensity);
scene.add(dome, sun, sun.target, ambient);

// today: the template look's terrainPainter (verbatim numbers from src/shards/_template/look/render.ts) on the legacy field
const trails = layout.TRAIL.map(trail => trail.map((point): Vec2 => {
  const [x, z] = point;
  if (point.length !== 2 || x === undefined || z === undefined) throw new Error('View fixture trail requires two coordinates');
  return [x, z];
}));
const today = new Group(), field = buildTerrain(357, { landscape: (x, z, { n }) => poolMask(x, z) ? -3 : n.get(x * 0.015, z * 0.015) * 0.5, trails, cabinSites: [] });
const plane = new PlaneGeometry(200, 200, 40, 40); plane.rotateX(-Math.PI / 2);
const pos = plane.getAttribute('position'); for (let i = 0; i < pos.count; i++) pos.setY(i, field.heightAt(pos.getX(i), pos.getZ(i)));
plane.computeVertexNormals(); const ground = new Mesh(plane, new MeshStandardMaterial({ color: 0x7e8388, flatShading: true })); ground.receiveShadow = true;
const legacy = templateProps(20); legacy.original.traverse((o) => { if (o instanceof Mesh) { o.castShadow = true; o.receiveShadow = true; } });
today.add(ground, legacy.original); scene.add(today);

// views: the admitted template shardfile through the loader's render side
const views = new Group(), scope = new Scope('sf15a.views-board'); scene.add(views);
const assets = new Map(await Promise.all(source.files.map(async (file) => [file.hash, new Uint8Array(await (await fetch(outputBlobUrl(source, file.hash, productBase))).arrayBuffer())] as const)));
const hash = async (bytes: Uint8Array): Promise<string> => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice()))].map((b) => b.toString(16).padStart(2, '0')).join('');
const reader = new ClientAssets(source, assets, { base: new URL('./shard.json', location.href).href, offline: false, firstParty: true, fetch: (url) => fetch(url), hash });
const look = await clientMaterials(source, assets, renderer, scope);
const installed = clientViews({ root: views, terrain: source.terrain?.family ?? null, materials: look.materials, textures: look.textures });
const world = await standaloneClientTiles({ source, assets: reader, root: views, views: installed.tiles }, scope, {
  instance: 'board', budget: new ResidencyAllocator(), start: { x: 0, z: 0 }, radius: () => 2,
  library: owner => source.props === null ? Promise.resolve(null) : installed.library(source.props, assets, owner),
  viewer: () => camera.position, pause: () => buildYield(scope),
  frame: run => { const follow = (): void => { run(); scope.raf(follow); }; scope.raf(follow); },
});
if (world.props !== null) for (const [id, panel] of world.props.panels) panel.visible = id !== 'template.jump';

const poses = { spawn: { at: [0, 2.6, 7], look: [0, 1.2, -12] }, hut: { at: [9, 4, 2], look: [0, 1, -12] }, overview: { at: [45, 32, 45], look: [0, 0, -8] }, horizon: { at: [0, 14, 70], look: [0, 0, -120] } } as const;
function census(root: Group): { meshes: number; triangles: number; casters: number } {
  let meshes = 0, triangles = 0, casters = 0;
  root.traverse((o) => { if (!(o instanceof Mesh) || !o.visible) return; meshes++; if (o.castShadow) casters++; const index = o.geometry.index; triangles += Math.min(o.geometry.drawRange.count, index?.count ?? o.geometry.getAttribute('position').count) / 3; });
  return { meshes, triangles: Math.round(triangles), casters };
}
async function select(mode: 'today' | 'views', pose: keyof typeof poses): Promise<{ calls: number; triangles: number }> {
  today.visible = mode === 'today'; views.visible = mode === 'views';
  const target = poses[pose]; camera.position.set(target.at[0], target.at[1], target.at[2]); camera.lookAt(target.look[0], target.look[1], target.look[2]);
  sun.target.position.set(target.look[0], 0, target.look[2]); sun.position.set(sun.target.position.x + Math.cos(elevation) * Math.sin(azimuth) * 100, Math.sin(elevation) * 100, sun.target.position.z + Math.cos(elevation) * Math.cos(azimuth) * 100);
  renderer.render(scene, camera); await new Promise<void>((resolve) => requestAnimationFrame(() => { resolve(); })); renderer.info.reset(); renderer.info.autoReset = false; renderer.render(scene, camera);
  const info = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }; renderer.info.autoReset = true; return info;
}
/** Frames per second of the views side, spinning the camera for `ms` (rAF-paced: the display caps it). */
async function fps(ms: number): Promise<number> {
  today.visible = false; views.visible = true; let frames = 0; const start = performance.now();
  await new Promise<void>((resolve) => { const step = (): void => { const t = performance.now() - start; camera.position.set(Math.sin(t / 2000) * 40, 6, Math.cos(t / 2000) * 40); camera.lookAt(0, 1, -10); renderer.render(scene, camera); frames++; if (t < ms) requestAnimationFrame(step); else resolve(); }; requestAnimationFrame(step); });
  return frames / ((performance.now() - start) / 1000);
}
declare global { interface Window { viewsBoard: { select: typeof select; fps: typeof fps; census: () => { today: ReturnType<typeof census>; views: ReturnType<typeof census>; fine: number }; ready: boolean } } }
window.viewsBoard = { select, fps, census: () => ({ today: census(today), views: census(views), fine: world.fine.size }), ready: true };
addEventListener('pagehide', () => { scope.dispose(); legacy.dispose(); renderer.dispose(); });
