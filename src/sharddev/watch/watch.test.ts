// oxlint-disable-next-line import/no-nodejs-modules -- The test writes a scene shard's source and edits it, as an author does.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- The fixture sits under the repo's tmp, so it resolves the sdk and three.
import { join, resolve } from 'node:path';
import { afterAll, expect, test } from 'vitest';
import { socketOf, startWatchPage, type DevHookLike } from './page';
import { DEV_HOOK_VERSION, WATCH_WIRE, hookMismatch } from './protocol';
import { pageScript, watchProject } from './watch';

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
function recordingHook(): DevHookLike & { calls: string[]; roof: () => readonly number[] | null } {
  const calls: string[] = [], drawn = new Map<string, { materials: { name: string; colour: number[] }[] }>();
  return {
    version: DEV_HOOK_VERSION, calls,
    addPart: (name, part) => { calls.push(`add ${name}`); drawn.set(name, part as never); },
    replacePart: (name, part) => { calls.push(`replace ${name}`); drawn.set(name, part as never); },
    removePart: (name) => { calls.push(`remove ${name}`); drawn.delete(name); },
    setLook: () => { calls.push('look'); return true; },
    swapColliders: (name, boxes) => { calls.push(`colliders ${name} ${boxes.length}`); },
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
    frame: (run) => { setTimeout(run, 8); }, wait: (ms, run) => { setTimeout(run, ms); }, reload: () => { reloads++; }, now: () => Date.now(), log: () => undefined });
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
    socket: () => { throw new Error('no socket'); }, frame: () => undefined, wait: () => undefined, reload: () => undefined, now: () => 0, log: (line) => { logs.push(line); } });
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
    frame: () => undefined, wait: () => undefined, now: () => 0, log: (line: string) => { logs.push(line); } };
  const stale = startWatchPage({ ...env, reload: () => { reloads.push('stale'); }, shell: () => 1 });
  sockets[0]?.onmessage?.({ data: JSON.stringify({ wire: WATCH_WIRE, shell: 2, revision: 1, parts: [], look: { hash: '', keys: [] }, error: null }) });
  expect(reloads).toEqual(['stale']);
  stale.stop();
  const page = startWatchPage({ ...env, reload: () => { reloads.push('page'); }, shell: () => 1 });
  sockets[1]?.onmessage?.({ data: 'not json' });
  expect(page.report.error).toContain('can\'t read');
  sockets[1]?.onmessage?.({ data: JSON.stringify({ wire: WATCH_WIRE, shell: 1, revision: 1, parts: [{ name: 'hut', hash: 'h1' }], look: { hash: '', keys: [] }, error: null }) });
  await until(() => page.report.applied.length === 1);
  expect(page.report.error).toContain('hut colliders: bad box');
  expect(page.report.framedRevision).toBe(0);
  page.stop();
});
