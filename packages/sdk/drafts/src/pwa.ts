// The drafts site as an offline home-screen app (E391): registers /sw.js, announces a waiting build to the reload pill,
// and warms the picture cache with every picture of an opened draft so it reads with the network off.
import { imgUrl, type Atlas } from './atlas';

export interface DraftsSw {
  /** a newer build installed and waiting for the pill's tap */
  waiting: ServiceWorker | null;
  /** take the waiting build: SKIP_WAITING → controllerchange → reload. Resolves without reloading when nothing waits. */
  adopt: () => Promise<void>;
  /** look for the server's newer build now and wait (capped) until it is installed and waiting */
  fetchNew: () => Promise<void>;
}

const IMAGES = 'wd-images';
const sw = 'serviceWorker' in navigator ? navigator.serviceWorker : null;

export const drafts: DraftsSw = { waiting: null, adopt, fetchNew };

function announce(w: ServiceWorker): void {
  drafts.waiting = w;
  window.dispatchEvent(new CustomEvent('wd-sw-waiting'));
}

async function adopt(): Promise<void> {
  const w = drafts.waiting;
  if (!sw || !w || w.state === 'redundant') return;
  await new Promise<void>((resolve) => {
    // the game's hand-over cap (src/client/engine/boot/sw.ts CAP_MS)
    const timer = setTimeout(resolve, 2500);
    sw.addEventListener('controllerchange', () => { clearTimeout(timer); location.reload(); }, { once: true });
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a ServiceWorker's postMessage has no target origin
    w.postMessage({ type: 'SKIP_WAITING' });
  });
}

async function fetchNew(): Promise<void> {
  if (!sw) return;
  const reg = await sw.getRegistration();
  if (!reg) return;
  await reg.update().catch(() => undefined);
  if (reg.waiting) { announce(reg.waiting); return; }
  const w = reg.installing;
  if (!w) return;
  await new Promise<void>((resolve) => {
    // the game's hand-over cap, twice: an install downloads the new build's files
    const timer = setTimeout(resolve, 5000);
    w.addEventListener('statechange', () => { if (w.state === 'installed' || w.state === 'redundant') { clearTimeout(timer); resolve(); } });
  });
  const after = await sw.getRegistration();
  if (after?.waiting) announce(after.waiting);
}

export async function registerSw(): Promise<void> {
  if (!sw || import.meta.env.DEV) return;
  try {
    const reg = await sw.register('/sw.js', { scope: '/' });
    // a worker already waiting from an earlier visit
    if (reg.waiting && sw.controller) announce(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && sw.controller) announce(w);
      });
    });
    // look for a new build whenever the app comes back to the foreground
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void reg.update().catch(() => undefined);
    });
  } catch {
    // no worker (private mode, an old browser): the site still works online
  }
}

export interface Saved {
  done: number;
  total: number;
}

/** Every picture URL a draft shows: thumbnails and full copies. */
export function draftUrls(a: Atlas): string[] {
  const urls = new Set<string>();
  for (const it of a.items) {
    if (!it.images) continue;
    urls.add(imgUrl(a.media, a.slug, it.images, 'thumb'));
    urls.add(imgUrl(a.media, a.slug, it.images, 'full'));
  }
  return [...urls];
}

/** How many of a draft's pictures are already stored for offline. */
export async function savedCount(urls: string[]): Promise<Saved> {
  if (!('caches' in window)) return { done: 0, total: urls.length };
  try {
    const cache = await caches.open(IMAGES);
    let done = 0;
    for (const u of urls) if (await cache.match(u)) done++;
    return { done, total: urls.length };
  } catch {
    return { done: 0, total: urls.length };
  }
}

let warming: Promise<void> | null = null;

/** Download every picture of a draft that is not stored yet, a few at a time, through the worker's cache. */
export function warm(urls: string[], progress: (s: Saved) => void): Promise<void> {
  if (warming || !sw?.controller || !navigator.onLine) return warming ?? Promise.resolve();
  warming = (async () => {
    const cache = await caches.open(IMAGES);
    const todo: string[] = [];
    for (const u of urls) if (!(await cache.match(u))) todo.push(u);
    let done = urls.length - todo.length;
    progress({ done, total: urls.length });
    const lane = async (): Promise<void> => {
      for (let u = todo.shift(); u !== undefined; u = todo.shift()) {
        try {
          const res = await fetch(u, { mode: 'cors', credentials: 'omit' });
          // saved only when the worker stored it (an error response is never cached)
          if (res.ok && (await cache.match(u))) {
            done++;
            progress({ done, total: urls.length });
          }
        } catch {
          return; // the network dropped: the rest waits for the next open or the 'online' event
        }
      }
    };
    await Promise.all([lane(), lane(), lane(), lane()]);
  })().finally(() => { warming = null; });
  return warming;
}
