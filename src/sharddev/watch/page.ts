import { Scope } from '@wildshard/engine/app/scope';
import { DEV_HOOK_VERSION, DEV_SCENE_PATH, WATCH_SOCKET, WATCH_WIRE, decodeGeometry, type WatchPart, type WatchState } from './protocol';

/**
 * SHARD-SOURCE AP5 (J347): the page script `wildshard watch` injects into the page it serves (`pageEntry.ts`, bundled at
 * start). It owns the page's half of watch: the socket, the fetches, a cache of decoded geometry and rasters, one scope
 * per part and the swap order, and drives engine's dev hook (`window.__wildshardDevHook`, five calls). Per revision:
 *
 *   1. the look's day keys, if they changed (`setLook`; a look the page can't take live reloads it), and the ground (AP18:
 *      `setGround`, the whole lattice; a page that can't take it reloads)
 *   2. every changed part is fetched and decoded first, so a slow fetch never leaves half a revision on screen
 *   3. each one swaps in (`addPart` or `replacePart`, then `swapColliders`), and only then its old scope goes
 *   4. parts no longer in the scene go (`removePart`, `swapColliders(name, [])`)
 *
 * `window.__wsDevScene` reports what landed and the first frame after it, for `proof.mjs`'s timing.
 */
export interface DevHookLike {
  readonly version: number;
  addPart: (name: string, part: unknown) => void;
  replacePart: (name: string, part: unknown) => void;
  removePart: (name: string) => void;
  setLook: (look: { readonly keys: readonly unknown[]; readonly look?: unknown }) => boolean;
  swapColliders: (name: string, boxes: readonly unknown[]) => void;
  setGround: (ground: Uint8Array) => boolean;
}

export interface SocketLike { onmessage: ((event: { data: unknown }) => void) | null; onclose: (() => void) | null; close: () => void }

export interface WatchPageEnv {
  /** the watch server's origin, `http://127.0.0.1:<port>` */
  readonly origin: string;
  readonly hook: () => DevHookLike | undefined;
  readonly fetch: (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; arrayBuffer: () => Promise<ArrayBuffer> }>;
  readonly socket: (url: string) => SocketLike;
  /** the page's next frame (`requestAnimationFrame`) */
  readonly frame: (run: () => void) => void;
  readonly wait: (ms: number, run: () => void) => void;
  readonly reload: () => void;
  /** AP17: ask the watch server for a new shell (a look the page's hook refused live); the page reloads into it */
  readonly reshell: () => void;
  readonly now: () => number;
  readonly log: (message: string) => void;
  /** the shell this page booted from (`window.__wsShell`, written into the page per shell); a state for another reloads */
  readonly shell?: () => number | null;
}

export interface WatchPageReport {
  revision: number;
  /** the last revision whose parts all landed, and the wall clock (ms) of the first frame after it */
  framedRevision: number;
  framedAt: number;
  /** the wall clock (ms) of the last revision's steps: its state received, its parts fetched and decoded, swapped in */
  readonly steps: { seen: number; sent: number; received: number; fetched: number; swapped: number };
  /** frames since the script started: it only grows, swap or no swap */
  frames: number;
  /** the page's own failure: a part the hook refused, a fetch, a message it couldn't read */
  error: string | null;
  /** the watch server's: the source failed to bundle or describe (the page keeps the last good revision) */
  serverError: string | null;
  /** every part swapped in, in order (`name@hash`) */
  readonly applied: string[];
  /** AP17 to AP19: what the last revision changed on this page, joined with `and` (`look`, `ground`, `parts`), `nothing`, or
   *  `reload` */
  kind: string | null;
}

interface Held<T> { readonly value: T; users: number }
interface LivePart { readonly hash: string; readonly scope: Scope }

/** How long the script waits for the engine to boot and install its hook. */
const HOOK_WAIT_MS = 180_000;

export function startWatchPage(env: WatchPageEnv): { readonly report: WatchPageReport; readonly stop: () => void } {
  const scope = new Scope('watch.page');
  const report: WatchPageReport = { revision: 0, framedRevision: 0, framedAt: 0, frames: 0, error: null, serverError: null, applied: [], kind: null, steps: { seen: 0, sent: 0, received: 0, fetched: 0, swapped: 0 } };
  const parts = new Map<string, LivePart>(), geometries = new Map<string, Held<ReturnType<typeof decodeGeometry>>>(), textures = new Map<string, Held<Uint8Array>>();
  let hook: DevHookLike | null = null, shell: number | null = env.shell?.() ?? null, look: string | null = null, ground: string | null = null, socket: SocketLike | null = null;
  let pendingFrame: number | null = null;

  const tick = (): void => {
    if (scope.disposed) return;
    report.frames++;
    if (pendingFrame !== null) { report.framedRevision = pendingFrame; report.framedAt = env.now(); pendingFrame = null; }
    env.frame(tick);
  };
  env.frame(tick);

  const fail = (message: string): void => { report.error = message; env.log(`wildshard watch: ${message}`); };
  const get = async (path: string): Promise<{ json: () => Promise<unknown>; arrayBuffer: () => Promise<ArrayBuffer> }> => {
    const response = await env.fetch(`${env.origin}${DEV_SCENE_PATH}${path}`);
    if (!response.ok) throw new Error(`${path} answered ${response.status}`);
    return response;
  };
  /** Take one use of a cached asset for `owner`; it is let go when `owner` is disposed. */
  const hold = <T>(map: Map<string, Held<T>>, key: string, owner: Scope): T => {
    const held = map.get(key);
    if (held === undefined) throw new Error(`asset ${key} was not fetched`);
    held.users++;
    owner.onDispose(() => { if (--held.users === 0) map.delete(key); });
    return held.value;
  };

  const sync = async (state: WatchState, first: boolean): Promise<void> => {
    const live = hook;
    if (live === null) return;
    report.serverError = state.error;
    if (state.error !== null) env.log(`wildshard watch: ${state.error}`);
    const lookChanged = state.look.hash !== look;
    if (lookChanged) {
      if (!live.setLook({ keys: state.look.keys, look: state.look.look })) {
        if (!first) { env.log('wildshard watch: this look change needs a new shell; reloading'); report.kind = 'reload'; env.reshell(); return; }
        fail('the page\'s look can\'t take this look live: look edits will reload the page');
      }
      look = state.look.hash;
    }
    // AP18: the ground the page holds is its shell's until one is set live
    const groundChanged = state.ground.hash !== (ground ?? state.ground.shell);
    if (groundChanged) {
      const bytes = new Uint8Array(await (await get(`ground/${encodeURIComponent(state.ground.hash)}`)).arrayBuffer());
      if (scope.disposed) return;
      if (!live.setGround(bytes)) { env.log('wildshard watch: the page can\'t take this ground live; reloading'); report.kind = 'reload'; env.reshell(); return; }
      ground = state.ground.hash;
    }
    // fetch and decode every changed part before any swaps in
    const changed = state.parts.filter((part) => parts.get(part.name)?.hash !== part.hash);
    const fetched = await Promise.all(changed.map(async ({ name }) => await (await get(`part/${encodeURIComponent(name)}`)).json() as WatchPart));
    const fresh = new Map<string, Promise<void>>();
    for (const part of fetched) {
      for (const key of part.geometries) if (!geometries.has(key) && !fresh.has(`g:${key}`)) fresh.set(`g:${key}`, (async () => { const bytes = await (await get(`geometry/${key}`)).arrayBuffer(); geometries.set(key, { value: decodeGeometry(key, bytes), users: 0 }); })());
      for (const t of part.textures) if (!textures.has(t.key) && !fresh.has(`t:${t.key}`)) fresh.set(`t:${t.key}`, (async () => { const bytes = await (await get(`texture/${t.key}`)).arrayBuffer(); textures.set(t.key, { value: new Uint8Array(bytes), users: 0 }); })());
    }
    await Promise.all(fresh.values());
    if (scope.disposed) return;
    report.steps.fetched = env.now();
    let landed = true;
    for (const part of fetched) {
      const owner = scope.child(`watch.part.${part.name}@${part.hash}`), old = parts.get(part.name);
      try {
        const devPart = { materials: part.materials, sprites: part.sprites, lamps: part.lamps, water: part.water, draws: part.draws,
          geometries: part.geometries.map((key) => hold(geometries, key, owner)),
          textures: part.textures.map((t) => ({ ...t, rgba: hold(textures, t.key, owner) })) };
        if (old === undefined) live.addPart(part.name, devPart); else live.replacePart(part.name, devPart);
      } catch (cause) {
        // the hook keeps the old part drawn; this revision's copy lets its assets go
        owner.dispose(); landed = false;
        fail(`part ${part.name}: ${cause instanceof Error ? cause.message : String(cause)}`);
        continue;
      }
      // the new part is drawn: record it before anything else can throw, so the next revision replaces it
      parts.set(part.name, { hash: part.hash, scope: owner });
      report.applied.push(`${part.name}@${part.hash}`);
      old?.scope.dispose();
      try { live.swapColliders(part.name, part.colliders); }
      catch (cause) { landed = false; fail(`part ${part.name} colliders: ${cause instanceof Error ? cause.message : String(cause)}`); }
    }
    const names = new Set(state.parts.map((part) => part.name));
    let removed = 0;
    for (const [name, part] of parts) {
      if (names.has(name)) continue;
      removed++;
      live.removePart(name); live.swapColliders(name, []);
      parts.delete(name); part.scope.dispose();
    }
    report.kind = [lookChanged ? 'look' : '', groundChanged ? 'ground' : '', fetched.length > 0 || removed > 0 ? 'parts' : ''].filter((what) => what !== '').join(' and ') || 'nothing';
    report.revision = state.revision;
    // the timing counts a revision only once all its parts landed
    report.steps.swapped = env.now();
    if (landed) pendingFrame = state.revision;
  };

  // one sync at a time; a revision announced while one runs waits, and only the newest one runs
  let running = false, next: WatchState | null = null, synced = 0;
  const drain = async (): Promise<void> => {
    running = true;
    while (next !== null && !scope.disposed) {
      const state = next; next = null;
      try { await sync(state, synced++ === 0); } catch (cause) { fail(cause instanceof Error ? cause.message : String(cause)); }
    }
    running = false;
  };
  const receive = (data: unknown): void => {
    report.steps.received = env.now();
    let state: WatchState;
    try { state = JSON.parse(String(data)) as WatchState; }
    catch { fail('the watch server sent a message this page can\'t read'); return; }
    if (state.wire !== WATCH_WIRE) { env.log(`wildshard watch: the server speaks wire ${state.wire}, this page ${WATCH_WIRE}; reloading`); env.reload(); return; }
    if (shell !== null && state.shell !== shell) { env.log('wildshard watch: the spawn or a fixed look field changed; reloading'); env.reload(); return; }
    shell = state.shell; next = state;
    report.steps.seen = state.seenAt; report.steps.sent = state.sentAt;
    if (!running) void drain();
  };
  const connect = (): void => {
    if (scope.disposed) return;
    const opened = env.socket(`${env.origin.replace(/^http/u, 'ws')}${WATCH_SOCKET}`);
    socket = opened;
    opened.onmessage = (event) => { receive(event.data); };
    opened.onclose = () => { if (socket === opened && !scope.disposed) env.wait(1000, connect); };
  };

  const started = env.now();
  const find = (): void => {
    if (scope.disposed) return;
    const found = env.hook();
    if (found === undefined) {
      if (env.now() - started > HOOK_WAIT_MS) { fail('the page never installed engine\'s dev hook: is this a devserver client?'); return; }
      env.wait(250, find); return;
    }
    if (found.version !== DEV_HOOK_VERSION) { fail(`the page's dev hook is v${found.version}, this sdk drives v${DEV_HOOK_VERSION}: move the sdk and its engine pin together`); return; }
    hook = found;
    connect();
  };
  find();
  return { report, stop: () => { scope.dispose(); const open = socket; socket = null; open?.close(); } };
}

/** A platform WebSocket as the page script's `SocketLike` (the browser's, or Node's in a test). */
export function socketOf(open: WebSocket): SocketLike {
  const socket: SocketLike = { onmessage: null, onclose: null, close: () => { open.close(); } };
  open.onmessage = (event) => { socket.onmessage?.({ data: event.data }); };
  open.onclose = () => { socket.onclose?.(); };
  return socket;
}
