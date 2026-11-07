// SF18b browser drive: the render rings stream a 3 × 3 grid of synthetic terrain tiles (L0 33² over 62.5 m, L1 17² over
// 125 m, a far proxy of 16 skirted 9² regions per shard) through the one allocator (four sims, four libraries and the
// commons charged beside them), decoding every tile in the decode workers over a modelled 5 Mbit/s serial link with a 10 s
// stall, while a scripted camera drives 30 m/s across the grid with a U-turn and a stand-still. Each frame counts holes
// (a visible patch drawn by no level) and overlaps, and reads the allocator's resident MB. scripts/bake/rings-drive.mjs runs it.
import { Color, DirectionalLight, Fog, Group, HemisphereLight, Mesh, MeshLambertMaterial, PerspectiveCamera, PlaneGeometry, Scene, WebGLRenderer } from 'three';
import { CONTENT_CAPS as C } from '../../../../src/shared/engine/core/config';
import { Scope } from '../../../../src/shared/engine/app/scope';
import { encodeTerrainTile, type TerrainTileData } from '@wildshard/format/terrainTileBytes';
import { installTerrainTile, maskTerrainTile } from '../../../../src/client/engine/world/terrainTileView';
import { ResidencyAllocator } from '../../../../src/shared/game/grid/allocator';
import { TileStreamer, type RingCell, type RingTile, type RingView } from '../../../../src/client/engine/world/tileStreamer';
import { TileDecoder } from '../../../../src/client/game/grid/tileDecoder';

const DRIVE_SECONDS = 60, SPEED = 30, LINK = 5_000_000, LATENCY = 0.1, STALL: readonly [number, number] = [25, 35];
const resident = { far: Math.round(C.far.resident), l1: C.l1.resident, l0: C.l0.resident } as const;
const wire = { far: C.far.compressed, l1: C.l1.compressed, l0: C.l0.compressed } as const;

const scene = new Scene(), renderer = new WebGLRenderer({ antialias: true }); renderer.setPixelRatio(2); renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const camera = new PerspectiveCamera(60, innerWidth / innerHeight, 0.5, 2000);
scene.background = new Color(0.62, 0.7, 0.78); scene.fog = new Fog(new Color(0.62, 0.7, 0.78), 500, 1300);
const sun = new DirectionalLight(0xffffff, 1.6); sun.position.set(300, 500, 200);
scene.add(sun, new HemisphereLight(0xcfe3ff, 0x50483c, 0.9));
// the platform deck under the grid (highway and strips stand-in), so the gaps between cells are not read as holes;
// 8 km wide so its edge stays past the camera's 2 km far plane from anywhere on the grid (no hard edge at the horizon)
const deck = new Mesh(new PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2), new MeshLambertMaterial({ color: 0x5a5d61 })); deck.position.y = -6; scene.add(deck);
const material = new MeshLambertMaterial({ vertexColors: true });

const cells: RingCell[] = [];
const roots = new Map<string, Group>();
for (let z = -1; z <= 1; z++) for (let x = -1; x <= 1; x++) {
  const cell = { instance: `cell${x + 1}${z + 1}`, origin: { x: x * C.pitch, z: z * C.pitch } }; cells.push(cell);
  const root = new Group(); root.position.set(cell.origin.x, 0, cell.origin.z); root.matrixAutoUpdate = false; root.updateMatrix(); scene.add(root); roots.set(cell.instance, root);
}
/** One continuous world height field, so every level samples the same ground. */
function height(wx: number, wz: number): number {
  return 9 * Math.sin(wx * 0.011) * Math.cos(wz * 0.0093) + 4 * Math.sin(wx * 0.037 + wz * 0.029) + 1.5 * Math.cos(wx * 0.11 - wz * 0.07);
}
const tint = { l0: [1, 1, 1], l1: [1.08, 1.02, 0.9], far: [0.88, 0.95, 1.1] } as const;
function tileBytes(cell: RingCell, level: 'l0' | 'l1' | 'far', x: number, z: number, size: number, resolution: number): Uint8Array {
  const heights = new Float32Array(resolution * resolution), colours = new Float32Array(resolution * resolution * 3), step = size / (resolution - 1), k = tint[level];
  for (let j = 0; j < resolution; j++) for (let i = 0; i < resolution; i++) {
    const lx = x + i * step, lz = z + j * step, h = height(cell.origin.x + lx, cell.origin.z + lz), at = j * resolution + i, g = Math.min(1, Math.max(0, (h + 14) / 28));
    heights[at] = h; colours.set([Math.min(1, (0.28 + 0.25 * g) * k[0]), Math.min(1, (0.42 + 0.18 * g) * k[1]), Math.min(1, (0.2 + 0.1 * g) * k[2])], at * 3);
  }
  return encodeTerrainTile({ resolution, x, z, size, heights, colours });
}

// the modelled link: one request at a time, latency + bytes at 5 Mbit/s, nothing completes during the stall
const decoder = new TileDecoder(2);
let clock = 0, linkFree = 0;
const network: { at: number; run: () => Promise<void> }[] = [];
function fetchTile(tile: RingTile, done: (result: TerrainTileData[] | Error) => void): void {
  const start = Math.max(clock, linkFree) + LATENCY; linkFree = start + wire[tile.level] * 8 / LINK;
  network.push({ at: linkFree, run: async () => {
    const cell = cells.find((c) => c.instance === tile.instance); if (cell === undefined) { done(new Error('unknown cell')); return; }
    const payloads = tile.level === 'far' ? Array.from({ length: 16 }, (_, r) => tileBytes(cell, 'far', -250 + (r % 4) * 125, -250 + Math.floor(r / 4) * 125, 125, 9))
      : [tile.level === 'l1' ? tileBytes(cell, 'l1', -250 + tile.x * 125, -250 + tile.z * 125, 125, 17) : tileBytes(cell, 'l0', -250 + tile.x * 62.5, -250 + tile.z * 62.5, 62.5, 33)];
    let decoded: TerrainTileData[] | Error;
    try { decoded = await Promise.all(payloads.map((bytes) => decoder.decode(bytes, { transfer: true }))); }
    catch (error) { decoded = error instanceof Error ? error : new Error(String(error)); }
    done(decoded);
  } });
}

const drawn = new Map<string, { level: RingTile['level']; mask: ReadonlySet<number> }>(), session = new Scope('sf18b.rings-drive');
let uploadMs = 0, uploadsDone = 0;
function upload(tile: RingTile, data: TerrainTileData[]): RingView {
  const root = roots.get(tile.instance); if (root === undefined) throw new Error('unknown cell');
  const t0 = performance.now(), scope = session.child(tile.key);
  const meshes = data.map((d) => installTerrainTile(d, { root, scope, material, shadow: false }));
  uploadMs += performance.now() - t0; uploadsDone++;
  drawn.set(tile.key, { level: tile.level, mask: new Set() });
  return {
    mask: (excluded) => {
      const entry = drawn.get(tile.key); if (entry !== undefined) entry.mask = new Set(excluded);
      if (tile.level === 'l1') { const mesh = meshes[0]; if (mesh !== undefined) maskTerrainTile(mesh, excluded); }
      else meshes.forEach((mesh, region) => { mesh.visible = !excluded.has(region); });
    },
    shadow: () => undefined,
    dispose: () => { drawn.delete(tile.key); scope.dispose(); },
  };
}

const allocator = new ResidencyAllocator();
for (let i = 0; i < 4; i++) {
  allocator.reserve({ id: `sim:cell${i}`, category: 'sim', bytes: C.sim.resident, owner: `cell${i}`, distance: 0, needed: true });
  allocator.reserve({ id: `library:cell${i}`, category: 'library', bytes: C.library.resident, owner: `cell${i}`, distance: 0, needed: true });
}
allocator.reserve({ id: 'commons:base', category: 'commons', bytes: 10_000_000, owner: 'platform', distance: 0, needed: true });
const rings = new TileStreamer<TerrainTileData[]>(cells, allocator, (_instance, level) => resident[level], { fetch: fetchTile, upload });

const legs: { from: readonly [number, number]; to: readonly [number, number]; hold?: number }[] = [
  { from: [0, -100], to: [760, -100] }, { from: [760, -100], to: [-760, -100] }, { from: [-760, -100], to: [-760, -100], hold: 4 }, { from: [-760, -100], to: [-760, 700] },
];
function pose(t: number): { x: number; z: number; vx: number; vz: number } {
  let left = t;
  for (const leg of legs) {
    const dx = leg.to[0] - leg.from[0], dz = leg.to[1] - leg.from[1], len = Math.hypot(dx, dz), time = leg.hold ?? len / SPEED;
    if (left > time) { left -= time; continue; }
    if (leg.hold !== undefined || len === 0) return { x: leg.from[0], z: leg.from[1], vx: 0, vz: 0 };
    return { x: leg.from[0] + dx * left / time, z: leg.from[1] + dz * left / time, vx: dx / len * SPEED, vz: dz / len * SPEED };
  }
  return { x: -760, z: 700, vx: 0, vz: 0 };
}

const hud = document.querySelector('#hud');
const result = { holes: 0, overlaps: 0, frames: 0, steps: 0, bootSeconds: 0, peakMB: 0, peakTiles: { far: 0, l1: 0, l0: 0 }, frameMs: [] as number[], uploads: 0, uploadMsMean: 0, workers: decoder.threaded };
let booted = false, bootAt = 0, last = performance.now(), accumulator = 0, heading = { x: 1, z: 0 }, finished = false;
function holesNow(): { holes: number; overlaps: number } {
  let holes = 0, overlaps = 0;
  for (const cell of rings.visible()) for (let z = 0; z < 8; z++) for (let x = 0; x < 8; x++) {
    const l1 = drawn.get(`${cell.instance}:l1/${Math.floor(x / 2)}/${Math.floor(z / 2)}`), far = drawn.get(`${cell.instance}:far`);
    const levels = (drawn.has(`${cell.instance}:l0/${x}/${z}`) ? 1 : 0) + (l1 !== undefined && !l1.mask.has(x % 2 + (z % 2) * 2) ? 1 : 0) + (far !== undefined && !far.mask.has(Math.floor(x / 2) + Math.floor(z / 2) * 4) ? 1 : 0);
    if (levels === 0) holes++; else if (levels > 1) overlaps++;
  }
  return { holes, overlaps };
}
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; accumulator += dt;
  const t = booted ? clock - bootAt : 0, p = pose(t);
  while (accumulator >= 1 / 60) {
    accumulator -= 1 / 60; clock += 1 / 60;
    if (!(clock >= STALL[0] && clock < STALL[1])) { network.sort((a, b) => a.at - b.at); while (network.length > 0 && (network[0]?.at ?? Infinity) <= clock) void network.shift()?.run(); }
    else linkFree = Math.max(linkFree, STALL[1]);
    const q = booted ? pose(clock - bootAt) : pose(0);
    rings.step({ x: q.x, z: q.z, vx: booted ? q.vx : 0, vz: booted ? q.vz : 0 }); result.steps++;
    if (!booted && rings.ready()) { booted = true; bootAt = clock; result.bootSeconds = clock; }
  }
  if (Math.hypot(p.vx, p.vz) > 0) heading = { x: p.vx / SPEED, z: p.vz / SPEED };
  const ground = height(p.x, p.z);
  camera.position.set(p.x - heading.x * 30, ground + 38, p.z - heading.z * 30); camera.lookAt(p.x + heading.x * 140, ground, p.z + heading.z * 140);
  renderer.render(scene, camera);
  const cost = allocator.cost(), stats = rings.stats();
  // A demand-start pool can be empty at setup; report any actual worker use during the drive.
  result.workers ||= decoder.threaded;
  if (booted && !finished) {
    const seen = holesNow(); result.holes += seen.holes; result.overlaps += seen.overlaps; result.frames++; result.frameMs.push(dt * 1000);
    result.peakMB = Math.max(result.peakMB, cost.playing / 1e6);
    for (const level of ['far', 'l1', 'l0'] as const) result.peakTiles[level] = Math.max(result.peakTiles[level], stats.resident[level]);
    if (clock - bootAt >= DRIVE_SECONDS) { finished = true; result.uploads = uploadsDone; result.uploadMsMean = uploadMs / Math.max(1, uploadsDone); window.ringsDrive.done = true; }
  }
  if (hud !== null) hud.textContent = `${booted ? `drive ${(clock - bootAt).toFixed(1)} s` : `loading far proxies ${clock.toFixed(1)} s`} · ${SPEED} m/s${clock >= STALL[0] && clock < STALL[1] ? ' · NETWORK STALL' : ''}\nholes ${result.holes} · overlaps ${result.overlaps} · resident ${(cost.playing / 1e6).toFixed(1)} / ${C.playing / 1e6} MB\nL0 ${stats.resident.l0} · L1 ${stats.resident.l1} · far ${stats.resident.far} · in flight ${stats.inFlight} · workers ${decoder.threaded ? 'on' : 'off'}`;
  requestAnimationFrame(frame);
}
declare global { interface Window { ringsDrive: { done: boolean; result: typeof result; elapsed: () => number } } }
window.ringsDrive = { done: false, result, elapsed: () => (booted ? clock - bootAt : -1) };
requestAnimationFrame(frame);
addEventListener('pagehide', () => { rings.dispose(); session.dispose(); decoder.dispose(); renderer.dispose(); });
