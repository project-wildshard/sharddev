// oxlint-disable-next-line import/no-nodejs-modules -- The test writes a scene shard's source and edits it, as an author does.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- The fixture sits under the repo's tmp, so it resolves the sdk and three.
import { join, resolve } from 'node:path';
import { afterAll, expect, test } from 'vitest';
import { socketOf, startWatchPage, type DevHookLike } from './page';
import { DEV_HOOK_VERSION, WATCH_WIRE, hookMismatch } from './protocol';
import { decodeTerrainTile, terrainTileHeight } from '@wildshard/format/terrainTileBytes';
import { NO_SERVICE_WORKER, pageScript, watchProject } from './watch';

const ROOT = resolve(import.meta.dirname, '../../../tmp');
mkdirSync(ROOT, { recursive: true });
const project = mkdtempSync(join(ROOT, 'watch-test-'));
afterAll(() => { rmSync(project, { recursive: true, force: true }); });

const source = (roof: string, pond: boolean): string => `import * as THREE from 'three';
import { defineShard } from '@wildshard/sdk/scene/shard';
import { solid } from '@wildshard/sdk/scene/author';
export default defineShard({ slug: 'watch-test', name: 'Watch Test' }, (world) => {
  world.part('hut', (hut) => {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 4), new THREE.MeshStandardMaterial({ name: 'roof', color: ${roof} }));
    roof.position.set(0, 3, 0); hut.add(solid(roof));
    const lamp = new THREE.PointLight(0xffaa66, 4, 8); lamp.position.set(0, 2, 3); hut.add(lamp);
  });
  ${pond ? "world.part('rock', (rock) => { rock.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ name: 'rock', color: 0x777777 }))); });" : ''}
});
`;

/** A stand-in for engine's dev hook: it records each call and draws nothing. */
/** `refuseCall`: the n-th `setLook` (from 1) answers that the page can't take it live. */
function recordingHook(refuseCall = 0): DevHookLike & { calls: string[]; looks: unknown[]; grounds: Uint8Array[]; roof: () => readonly number[] | null } {
  const calls: string[] = [], looks: unknown[] = [], grounds: Uint8Array[] = [], drawn = new Map<string, { materials: { name: string; colour: number[] }[] }>();
  return {
    version: DEV_HOOK_VERSION, calls, looks, grounds,
    addPart: (name, part) => { calls.push(`add ${name}`); drawn.set(name, part as never); },
    replacePart: (name, part) => { calls.push(`replace ${name}`); drawn.set(name, part as never); },
    removePart: (name) => { calls.push(`remove ${name}`); drawn.delete(name); },
    setLook: (look) => { calls.push('look'); looks.push(look); return looks.length !== refuseCall; },
    swapColliders: (name, boxes) => { calls.push(`colliders ${name} ${boxes.length}`); },
    setGround: (ground) => { calls.push('ground'); grounds.push(ground); return true; },
    roof: () => drawn.get('hut')?.materials.find((m) => m.name === 'roof')?.colour ?? null,
  };
}

const until = async (what: () => boolean, ms = 20_000): Promise<void> => {
  const end = Date.now() + ms;
  while (!what()) { if (Date.now() > end) throw new Error('timed out'); await new Promise((_resolve) => { setTimeout(_resolve, 20); }); }
};

test('AP5: a part pushed twice through the page script swaps in place; the frame loop runs on; no reload', { timeout: 120_000 }, async () => {
  writeFileSync(join(project, 'shard.config.ts'), source('0xff0000', true));
  const server = await watchProject(project, { client: null, log: () => undefined });
  const hook = recordingHook();
  let reloads = 0;
  const page = startWatchPage({ origin: server.url.replace(/\/$/u, ''), hook: () => hook,
    fetch: (url) => fetch(url), socket: (url) => socketOf(new WebSocket(url)),
    frame: (run) => { setTimeout(run, 8); }, wait: (ms, run) => { setTimeout(run, ms); }, reload: () => { reloads++; }, reshell: () => { reloads++; }, now: () => Date.now(), log: () => undefined });
  try {
    await until(() => page.report.framedRevision >= 1);
    expect(hook.calls.slice(0, 5)).toEqual(['look', 'add hut', 'colliders hut 1', 'add rock', 'colliders rock 0']);
    const red = hook.roof();
    expect(red?.[0]).toBeGreaterThan(0.9);

    // first push: the roof's colour; only the hut swaps, the rock is not fetched again
    let frames = page.report.frames;
    writeFileSync(join(project, 'shard.config.ts'), source('0x0000ff', true));
    await until(() => page.report.framedRevision >= 2);
    expect(hook.calls.slice(5)).toEqual(['replace hut', 'colliders hut 1']);
    expect(hook.roof()?.[2]).toBeGreaterThan(0.9);
    expect(page.report.frames).toBeGreaterThan(frames);

    // second push: the colour again, and a part gone
    frames = page.report.frames;
    writeFileSync(join(project, 'shard.config.ts'), source('0x00ff00', false));
    await until(() => page.report.framedRevision >= 3);
    expect(hook.calls.slice(7)).toEqual(['replace hut', 'colliders hut 1', 'remove rock', 'colliders rock 0']);
    expect(hook.roof()?.[1]).toBeGreaterThan(0.9);
    expect(page.report.frames).toBeGreaterThan(frames);
    expect(page.report.applied.map((at) => at.split('@')[0])).toEqual(['hut', 'rock', 'hut', 'hut']);
    expect(reloads).toBe(0);
    expect(page.report.error).toBeNull();
  } finally { page.stop(); await server.close(); }
});

test('AP5: the page script refuses a hook of another version; watch refuses a client whose build flags name another', () => {
  const logs: string[] = [];
  const page = startWatchPage({ origin: 'http://127.0.0.1:1', hook: () => ({ ...recordingHook(), version: DEV_HOOK_VERSION + 1 }), fetch: () => { throw new Error('no fetch'); },
    socket: () => { throw new Error('no socket'); }, frame: () => undefined, wait: () => undefined, reload: () => undefined, reshell: () => undefined, now: () => 0, log: (line) => { logs.push(line); } });
  expect(page.report.error).toContain(`v${DEV_HOOK_VERSION + 1}`);
  page.stop();
  expect(hookMismatch({ devserver: true, devHook: DEV_HOOK_VERSION })).toBeNull();
  expect(hookMismatch({ devserver: true })).toContain('no dev hook');
  expect(hookMismatch({ devserver: true, devHook: DEV_HOOK_VERSION + 1 })).toContain(`v${DEV_HOOK_VERSION + 1}`);
});

test('AP5: the injected page script is one classic script with no early close tag', { timeout: 60_000 }, async () => {
  const script = await pageScript();
  expect(script.startsWith('<script>')).toBe(true);
  expect(script.slice(8, -9)).not.toContain('</script');
  expect(script).toContain('__wildshardDevHook');
});

test('AP5: a page booted from shell 1 reloads on a state for shell 2; a part whose colliders fail is still recorded', async () => {
  const reloads: string[] = [], logs: string[] = [], sockets: { onmessage: ((event: { data: unknown }) => void) | null }[] = [];
  const hook = { ...recordingHook(), swapColliders: () => { throw new Error('bad box'); } };
  const part = { name: 'hut', hash: 'h1', materials: [], sprites: [], lamps: [], water: [], draws: [], geometries: [], textures: [], colliders: [] };
  const env = { origin: 'http://127.0.0.1:1', hook: () => hook, fetch: () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve<unknown>(part), arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }),
    socket: () => { const socket = { onmessage: null, onclose: null, close: () => undefined }; sockets.push(socket); return socket; },
    frame: () => undefined, wait: () => undefined, reshell: () => undefined, now: () => 0, log: (line: string) => { logs.push(line); } };
  const stale = startWatchPage({ ...env, reload: () => { reloads.push('stale'); }, shell: () => 1 });
  sockets[0]?.onmessage?.({ data: JSON.stringify({ wire: WATCH_WIRE, shell: 2, revision: 1, parts: [], look: { hash: '', keys: [], look: null }, ground: { hash: '', shell: '' }, error: null, seenAt: 0, sentAt: 0 }) });
  expect(reloads).toEqual(['stale']);
  stale.stop();
  const page = startWatchPage({ ...env, reload: () => { reloads.push('page'); }, shell: () => 1 });
  sockets[1]?.onmessage?.({ data: 'not json' });
  expect(page.report.error).toContain('can\'t read');
  sockets[1]?.onmessage?.({ data: JSON.stringify({ wire: WATCH_WIRE, shell: 1, revision: 1, parts: [{ name: 'hut', hash: 'h1' }], look: { hash: '', keys: [], look: null }, ground: { hash: '', shell: '' }, error: null, seenAt: 0, sentAt: 0 }) });
  await until(() => page.report.applied.length === 1);
  expect(page.report.error).toContain('hut colliders: bad box');
  expect(page.report.framedRevision).toBe(0);
  page.stop();
});

const lookSource = (exposure: number, stone: string, fog: string): string => `import * as THREE from 'three';
import { defineShard } from '@wildshard/sdk/scene/shard';
import { paint } from '@wildshard/sdk/scene/author';
const STONE = ${stone};
export default defineShard({ slug: 'watch-test', name: 'Watch Test' }, (world) => {
  const map = paint(16, 16, (u) => [STONE * u, 90, 60]);
  world.scene.fog = new THREE.FogExp2(new THREE.Color('#d898a0'), ${fog});
  world.post({ tone: 'aces', exposure: ${exposure}, bloom: null });
  world.part('hut', (hut) => { hut.add(new THREE.Mesh(new THREE.BoxGeometry(4, 1, 4), new THREE.MeshStandardMaterial({ name: 'roof', map }))); });
});
`;

test('AP17: fog and exposure edits go live as the look section (no part fetched, no new shell); a painter kept by its text is checked and pushed again', { timeout: 120_000 }, async () => {
  writeFileSync(join(project, 'shard.config.ts'), lookSource(1.05, '200', '0.0062'));
  const server = await watchProject(project, { client: null, log: () => undefined });
  const hook = recordingHook();
  let reloads = 0;
  const page = startWatchPage({ origin: server.url.replace(/\/$/u, ''), hook: () => hook, fetch: (url) => fetch(url), socket: (url) => socketOf(new WebSocket(url)),
    frame: (run) => { setTimeout(run, 8); }, wait: (ms, run) => { setTimeout(run, ms); }, reload: () => { reloads++; }, reshell: () => { reloads++; }, now: () => Date.now(), log: () => undefined, shell: () => 1 });
  const exposureOf = (look: unknown): number => (look as { look: { grade: { exposure: number } } }).look.grade.exposure;
  try {
    await until(() => page.report.framedRevision >= 1);
    expect(hook.calls).toEqual(['look', 'add hut', 'colliders hut 0']);
    // exposure: a look-only revision, the grade in the section the hook gets
    writeFileSync(join(project, 'shard.config.ts'), lookSource(2, '200', '0.0062'));
    await until(() => page.report.framedRevision >= 2);
    expect(hook.calls.slice(3)).toEqual(['look']);
    expect(exposureOf(hook.looks.at(-1))).toBeCloseTo(1, 3);
    expect(page.report.kind).toBe('look');
    // fog: the same
    writeFileSync(join(project, 'shard.config.ts'), lookSource(2, '200', '0.0150'));
    await until(() => page.report.framedRevision >= 3);
    expect(hook.calls.slice(4)).toEqual(['look']);
    // the painter's text is the same and its captured value is not: the kept pixels go out first, then the true ones
    const applied = page.report.applied.length;
    writeFileSync(join(project, 'shard.config.ts'), lookSource(2, '20', '0.0150'));
    await until(() => page.report.applied.length >= applied + 1, 30_000);
    expect(page.report.applied.at(-1)?.startsWith('hut@')).toBe(true);
    expect(page.report.kind).toBe('parts');
    expect(reloads).toBe(0);
  } finally { page.stop(); await server.close(); }
});

test('AP17: a look the hook refuses live asks the watch server for a new shell, which the page reloads into', { timeout: 120_000 }, async () => {
  writeFileSync(join(project, 'shard.config.ts'), lookSource(1.05, '200', '0.0062'));
  const server = await watchProject(project, { client: null, log: () => undefined });
  const hook = recordingHook(2);
  let reshells = 0, reloads = 0;
  const page = startWatchPage({ origin: server.url.replace(/\/$/u, ''), hook: () => hook, fetch: (url) => fetch(url), socket: (url) => socketOf(new WebSocket(url)),
    frame: (run) => { setTimeout(run, 8); }, wait: (ms, run) => { setTimeout(run, ms); }, reload: () => { reloads++; },
    reshell: () => { reshells++; void fetch(`${server.url}__wildshard_scene/reshell`, { method: 'POST' }); }, now: () => Date.now(), log: () => undefined, shell: () => 1 });
  try {
    await until(() => page.report.framedRevision >= 1);
    // a reload must reach watch's server: the client's service worker would serve its cached page, so watch serves none
    expect(await (await fetch(`${server.url}sw.js`)).text()).toBe(NO_SERVICE_WORKER);
    writeFileSync(join(project, 'shard.config.ts'), lookSource(3, '200', '0.0062'));
    await until(() => reshells === 1);
    expect(page.report.kind).toBe('reload');
    // the server built shell 2: the page script reloads on its state
    await until(() => reloads === 1, 60_000);
  } finally { page.stop(); await server.close(); }
});

const groundSource = (height: number): string => `import * as THREE from 'three';
import { defineShard } from '@wildshard/sdk/scene/shard';
export default defineShard({ slug: 'watch-test', name: 'Watch Test' }, (world) => {
  world.ground((x, z) => ${height} * Math.max(0, 1 - Math.hypot(x - 10, z - 10) / 20), { colourAt: () => [0.3, 0.4, 0.2] });
  world.part('hut', (hut) => { hut.add(new THREE.Mesh(new THREE.BoxGeometry(4, 1, 4), new THREE.MeshStandardMaterial({ name: 'roof' }))); });
});
`;

test('AP18: a ground edit goes live as the whole lattice (no new shell, no part fetched); the page reloads when the hook refuses it', { timeout: 120_000 }, async () => {
  writeFileSync(join(project, 'shard.config.ts'), groundSource(0));
  const server = await watchProject(project, { client: null, log: () => undefined });
  const hook = recordingHook();
  let reloads = 0, reshells = 0;
  const page = startWatchPage({ origin: server.url.replace(/\/$/u, ''), hook: () => hook, fetch: (url) => fetch(url), socket: (url) => socketOf(new WebSocket(url)),
    frame: (run) => { setTimeout(run, 8); }, wait: (ms, run) => { setTimeout(run, ms); }, reload: () => { reloads++; }, reshell: () => { reshells++; }, now: () => Date.now(), log: () => undefined, shell: () => 1 });
  try {
    await until(() => page.report.framedRevision >= 1);
    // the shell holds its own ground: nothing to set
    expect(hook.calls).toEqual(['look', 'add hut', 'colliders hut 0']);
    writeFileSync(join(project, 'shard.config.ts'), groundSource(6));
    await until(() => page.report.framedRevision >= 2);
    expect(hook.calls.slice(3)).toEqual(['ground']);
    expect(page.report.kind).toBe('ground');
    const lattice = decodeTerrainTile(hook.grounds[0] ?? new Uint8Array(0));
    expect([lattice.resolution, lattice.x, lattice.size, lattice.colours?.length]).toEqual([257, -250, 500, 257 ** 2 * 3]);
    expect(terrainTileHeight(lattice, 10, 10)).toBeGreaterThan(5.5); // the peak falls between samples
    expect([reloads, reshells]).toEqual([0, 0]);
    // back to the shell's ground: set live again (the page holds the edited one now)
    writeFileSync(join(project, 'shard.config.ts'), groundSource(0));
    await until(() => page.report.framedRevision >= 3);
    expect(hook.calls.slice(4)).toEqual(['ground']);
    expect(terrainTileHeight(decodeTerrainTile(hook.grounds[1] ?? new Uint8Array(0)), 10, 10)).toBeCloseTo(0, 3);
  } finally { page.stop(); await server.close(); }
  // a page whose hook can't take a ground asks for a new shell
  writeFileSync(join(project, 'shard.config.ts'), groundSource(0));
  const again = await watchProject(project, { client: null, log: () => undefined });
  const refusing = { ...recordingHook(), setGround: () => false };
  let asked = 0;
  const second = startWatchPage({ origin: again.url.replace(/\/$/u, ''), hook: () => refusing, fetch: (url) => fetch(url), socket: (url) => socketOf(new WebSocket(url)),
    frame: (run) => { setTimeout(run, 8); }, wait: (ms, run) => { setTimeout(run, ms); }, reload: () => undefined, reshell: () => { asked++; }, now: () => Date.now(), log: () => undefined, shell: () => 1 });
  try {
    await until(() => second.report.framedRevision >= 1);
    writeFileSync(join(project, 'shard.config.ts'), groundSource(3));
    await until(() => asked === 1);
    expect(second.report.kind).toBe('reload');
  } finally { second.stop(); await again.close(); }
});
