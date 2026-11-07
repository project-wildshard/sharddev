/* The drafts site's service worker (E391: "drafts work as an offline PWA so it's on the Home Screen").
 * drafts/vite.config.ts emits it as /sw.js with two stamps replaced per build:
 *   __BUILD__     the build id (also /version.json and the reload pill's)
 *   __PRECACHE__  every file of this build: the document, the hashed code, fonts, icons, the manifest and the drafts'
 *                 data (index.json, each atlas.json, Map Lab's terrain)
 *
 * Two caches:
 *   wd-shell-<build>  this build's files, precached at install (strict: a failed file fails the install, so the old
 *                     worker keeps serving). `activate` drops the other builds' shells.
 *   wd-images         the pictures on Blob (content-hashed names: they never change), cache-first; the page warms it
 *                     with every picture of an opened draft (src/pwa.ts), so the whole draft reads offline.
 *
 * Updates never reload on their own: a new build installs and WAITS; the reload pill lights up (src/update.ts), and its
 * tap sends SKIP_WAITING. The first install (nothing controls the page yet) takes over at once.
 * /version.json is never answered from a cache: the pill must see the server.
 */
const BUILD = '__BUILD__';
const PRECACHE = JSON.parse('__PRECACHE__');
const SHELL = `wd-shell-${BUILD}`;
const IMAGES = 'wd-images';
const BLOB = '.public.blob.vercel-storage.com';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })));
    if (!self.registration.active) await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('wd-shell-') && key !== SHELL) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data ?? {};
  if (data.type === 'SKIP_WAITING') void self.skipWaiting();
  if (data.type === 'BUILD' && event.ports[0]) event.ports[0].postMessage({ build: BUILD });
});

async function shellFirst(request) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(request, { ignoreSearch: true });
  return hit ?? fetch(request);
}

async function imageFirst(request) {
  const cache = await caches.open(IMAGES);
  const hit = await cache.match(request.url);
  if (hit) return hit;
  const res = await fetch(request.url, { mode: 'cors', credentials: 'omit' });
  if (res.ok) await cache.put(request.url, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.hostname.endsWith(BLOB)) { event.respondWith(imageFirst(request)); return; }
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/version.json' || url.pathname === '/sw.js') return;
  if (request.mode === 'navigate' && url.pathname === '/') {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      return (await cache.match('/')) ?? fetch(request);
    })());
    return;
  }
  event.respondWith(shellFirst(request));
});
