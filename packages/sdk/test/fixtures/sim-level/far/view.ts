// SF23 far view board: the dev-mode 3 × 3 grid (§3.3: Driftwood centre, Pine Hollow north, Nalati east, Sunscar Dunes
// west, Sky Reach south, the template in the corners) drawn by the render rings with only far proxies in the catalogue,
// streamed through the one allocator by the SF23 far ports (the baked far.glb parsed by three's GLTFLoader, region in
// uv.x). A camera on the centre cell turns to each neighbour; scripts/bake/far-board.mjs captures them.
import { BufferGeometry, Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshLambertMaterial, PerspectiveCamera, PlaneGeometry, Scene, WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CONTENT_CAPS as C } from '../../../../src/shared/engine/core/config';
import { ResidencyAllocator } from '../../../../src/shared/game/grid/allocator';
import { FAR_RING, type FarLookRuntime } from '../../../../src/shared/game/grid/farProxy';
import { farRingPorts, type FarPrepared } from '../../../../src/client/game/grid/farView';
import { TileStreamer, type RingCell } from '../../../../src/client/engine/world/tileStreamer';
import templateGlb from '../../../../public/assets/baked/_template/far.glb?url';
import template from '../../../../public/assets/baked/_template/far.json';
import driftwoodGlb from '../../../../public/assets/baked/driftwood-isle/far.glb?url';
import driftwood from '../../../../public/assets/baked/driftwood-isle/far.json';
import pineGlb from '../../../../public/assets/baked/pine-hollow/far.glb?url';
import pine from '../../../../public/assets/baked/pine-hollow/far.json';
import nalatiGlb from '../../../../public/assets/baked/nalati-grasslands/far.glb?url';
import nalati from '../../../../public/assets/baked/nalati-grasslands/far.json';
import sunscarGlb from '../../../../public/assets/baked/sunscar-dunes/far.glb?url';
import sunscar from '../../../../public/assets/baked/sunscar-dunes/far.json';
import reachGlb from '../../../../public/assets/baked/far-reach/far.glb?url';
import reach from '../../../../public/assets/baked/far-reach/far.json';

interface FarJson { far: { decoded: number; gpu: number }; look: { family: string; haze: { colour: number[] } } }
const shards: Record<string, { url: string; json: FarJson; label: string }> = {
  '_template': { url: templateGlb, json: template, label: 'Template' }, 'driftwood-isle': { url: driftwoodGlb, json: driftwood, label: 'Driftwood Isle' },
  'pine-hollow': { url: pineGlb, json: pine, label: 'Pine Hollow' }, 'nalati-grasslands': { url: nalatiGlb, json: nalati, label: 'Nalati Grasslands' },
  'sunscar-dunes': { url: sunscarGlb, json: sunscar, label: 'Sunscar Dunes' }, 'far-reach': { url: reachGlb, json: reach, label: 'Sky Reach' },
};
const layout: [number, number, string][] = [[-1, 1, '_template'], [0, 1, 'pine-hollow'], [1, 1, '_template'], [-1, 0, 'sunscar-dunes'], [0, 0, 'driftwood-isle'], [1, 0, 'nalati-grasslands'], [-1, -1, '_template'], [0, -1, 'far-reach'], [1, -1, '_template']];
const look = (json: FarJson): FarLookRuntime => {
  const family = json.look.family === 'toon' || json.look.family === 'painterly' ? json.look.family : 'pbr', [r = 0, g = 0, b = 0] = json.look.haze.colour;
  return { family, haze: { colour: [r, g, b] } };
};

const renderer = new WebGLRenderer({ antialias: true }); renderer.setPixelRatio(2); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new Scene(), camera = new PerspectiveCamera(55, innerWidth / innerHeight, 1, FAR_RING.drawDistance);
scene.background = new Color(0.62, 0.74, 0.86);
const sun = new DirectionalLight(0xffffff, 2.2); sun.position.set(-400, 600, 300); scene.add(sun, new HemisphereLight(0xd6e6ff, 0x5a5040, 1.1));
// the platform deck: the strips and highway between the cells (55 m bands at road level) and the empty-neighbour sea
// beyond the grid; never under a cell, so ground below road level (Nalati's river, Sky Reach's void) stays visible
const deckMaterial = new MeshLambertMaterial({ color: 0x55585c }), seaMaterial = new MeshLambertMaterial({ color: 0x3d6f86 }), gap = C.pitch - 500, span = 3 * C.pitch + gap;
for (const k of [-1.5, -0.5, 0.5, 1.5]) for (const along of ['x', 'z'] as const) {
  const band = new Mesh(new PlaneGeometry(along === 'x' ? span : gap, along === 'x' ? gap : span).rotateX(-Math.PI / 2), deckMaterial);
  band.position.set(along === 'x' ? 0 : k * C.pitch, -0.2, along === 'x' ? k * C.pitch : 0); scene.add(band);
}
for (const [x, z, w, d] of [[0, (span + 8000) / 2, span + 16000, 8000], [0, -(span + 8000) / 2, span + 16000, 8000], [(span + 8000) / 2, 0, 8000, span], [-(span + 8000) / 2, 0, 8000, span]] as const) {
  const sea = new Mesh(new PlaneGeometry(w, d).rotateX(-Math.PI / 2), seaMaterial); sea.position.set(x, -0.3, z); scene.add(sea);
}

const cells: RingCell[] = [], roots = new Map<string, Group>(), slugOf = new Map<string, string>(), bytes = new Map<string, number>();
for (const [x, z, slug] of layout) {
  const instance = `${slug}@${x},${z}`, origin = { x: x * C.pitch, z: z * C.pitch }, root = new Group(), json = shards[slug]?.json;
  if (json === undefined) throw new Error(slug);
  // north is +z on the grid (GridAssembly's origins), so each shard faces its neighbours with its real edges
  root.position.set(origin.x, 0, origin.z); root.updateMatrixWorld(); scene.add(root);
  cells.push({ instance, origin }); roots.set(instance, root); slugOf.set(instance, slug); bytes.set(instance, json.far.decoded + json.far.gpu);
}
const loader = new GLTFLoader();
async function load(instance: string): Promise<FarPrepared> {
  const shard = shards[slugOf.get(instance) ?? ''];
  if (shard === undefined) throw new Error(`unknown ${instance}`);
  const gltf = await loader.loadAsync(shard.url);
  const found: BufferGeometry[] = [];
  gltf.scene.traverse((o) => { if (o instanceof Mesh && o.geometry instanceof BufferGeometry) found.push(o.geometry); });
  const [geometry] = found; if (geometry === undefined || found.length !== 1) throw new Error(`${instance}: expected one far mesh`);
  return { geometry, look: look(shard.json) };
}
const allocator = new ResidencyAllocator();
const rings = new TileStreamer<FarPrepared>(cells, allocator, (instance, level) => level === 'far' ? bytes.get(instance) ?? null : null, farRingPorts({ root: (i) => roots.get(i) ?? scene, load }), { farCount: FAR_RING.count, viewDistance: FAR_RING.viewDistance, farPrefetch: FAR_RING.farPrefetch, residentCaps: { far: FAR_RING.count } });

const hud = document.getElementById('hud');
const views: Record<string, { label: string; yaw: number }> = {};
for (const [x, z, slug] of layout) if (x !== 0 || z !== 0) views[`${x},${z}`] = { label: `${z > 0 ? 'N' : z < 0 ? 'S' : ''}${x > 0 ? 'E' : x < 0 ? 'W' : ''} · ${shards[slug]?.label ?? slug}`, yaw: Math.atan2(-x, -z) }; // three's camera looks down −z: this yaw faces the neighbour
let view = '0,1', eye = { y: 120, pitch: -0.16, back: 100 }; // 100 m behind the centre, 120 m up: the island in front, the neighbour at 0.4–1 km
function frame(): void {
  rings.step({ x: 0, z: 0, vx: 0, vz: 0 });
  const v = views[view]; const yaw = v?.yaw ?? 0; camera.position.set(Math.sin(yaw) * eye.back, eye.y, Math.cos(yaw) * eye.back) /* back > 0 moves away from the neighbour */; camera.rotation.set(eye.pitch, yaw, 0, 'YXZ');
  renderer.render(scene, camera);
  if (hud !== null) hud.textContent = `SF23 far view · from the centre (Driftwood) → ${v?.label ?? view}\nfar proxies ${rings.stats().resident.far}/${FAR_RING.count} · far ${(allocator.cost().input.far / 1e6).toFixed(2)} MB · draws ${renderer.info.render.calls}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
declare global { interface Window { farView: { ready: () => boolean; show: (key: string) => void; pose: (y: number, pitch: number, back: number) => void; views: () => string[]; stats: () => { far: number; farMB: number; draws: number } } } }
window.farView = {
  ready: () => rings.ready() && rings.stats().resident.far === cells.length,
  show: (key) => { view = key; },
  pose: (y, pitch, back) => { eye = { y, pitch, back }; },
  views: () => Object.keys(views),
  stats: () => ({ far: rings.stats().resident.far, farMB: allocator.cost().input.far / 1e6, draws: renderer.info.render.calls }),
};
