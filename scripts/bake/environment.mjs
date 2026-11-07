// The existing native-bake DOM/fetch adapter. Import is inert; one owned CLI installs it explicitly.
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const noop = () => undefined;
let active = false;
/** Install the navmesh baker's non-drawing environment once, returning its element factory and owned cleanup. */
export function installBakeEnvironment(ROOT) {
  if (active) throw new Error('A bake environment is already installed');
  const names = ['location', 'self', 'document', 'window', 'Request', 'fetch', 'createImageBitmap', 'ProgressEvent', 'navigator'];
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const ctx2d = new Proxy({}, { get: (_t, k) => k === 'createImageData' || k === 'getImageData' ? (w = 1, h = 1) => ({ data: new Uint8ClampedArray(4 * w * h), width: w, height: h }) : k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern' ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 1 }) : noop, set: () => true });
  const el = () => { const listeners = new Map(); return ({ width: 1, height: 1, style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, dataset: {},
    getContext: () => ctx2d, append: noop, appendChild: noop, remove: noop, insertBefore: noop, setAttribute: noop, addEventListener: (type, fn) => { listeners.set(type, fn); }, removeEventListener: (type) => { listeners.delete(type); },
    get src() { return ''; },
    set src(_value) { queueMicrotask(() => { listeners.get('load')?.call(this); }); },
    querySelector: () => el(), querySelectorAll: () => [], parentNode: null, textContent: '', innerHTML: '' }); };
  const HOST = 'http://localhost/';
  const NodeRequest = globalThis.Request, nodeFetch = globalThis.fetch;
  Object.assign(globalThis, {
    location: new URL(HOST), self: globalThis,
    document: { createElement: el, createElementNS: el, getElementById: () => null, fonts: { load: () => Promise.resolve([]) }, head: el(), body: el(), addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [], pointerLockElement: null },
    window: { setTimeout, clearTimeout, addEventListener: noop, removeEventListener: noop, devicePixelRatio: 1, innerWidth: 1600, innerHeight: 900, matchMedia: () => ({ matches: false, addEventListener: noop }), location: new URL(HOST) },
    // three's loaders build Requests from site-relative URLs
    Request: class extends NodeRequest { constructor(input, init) { super(typeof input === 'string' ? new URL(input, HOST).href : input, init); } },
    fetch: (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, HOST);
      // a module's own asset (`new URL('../assets/…', import.meta.url)`, a shard's declared mover scripts): the file itself
      if (url.protocol === 'file:') { const file = fileURLToPath(url); return Promise.resolve(existsSync(file) ? new Response(readFileSync(file)) : new Response(null, { status: 404 })); }
      if (url.origin !== new URL(HOST).origin) return nodeFetch(input, init);
      // Vite's ?url loader names generated source assets under /src/; keep
      // their exact bytes available to the native world and its own admission.
      const pathname = decodeURIComponent(url.pathname);
      const base = resolve(ROOT, pathname.startsWith('/src/') ? 'src' : 'public');
      const file = resolve(base, pathname.startsWith('/src/') ? pathname.slice(5) : pathname.replace(/^\//, ''));
      const local = relative(base, file);
      if (local === '..' || local.startsWith('../') || isAbsolute(local)) return Promise.resolve(new Response(null, { status: 404 }));
      return Promise.resolve(existsSync(file) ? new Response(readFileSync(file)) : new Response(null, { status: 404 }));
    },
    createImageBitmap: () => Promise.resolve({ width: 1, height: 1, close: noop }), // textures are never drawn here
    ProgressEvent: class extends Event { constructor(type, init = {}) { super(type); Object.assign(this, init); } },
  });
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node', onLine: true, maxTouchPoints: 0, hardwareConcurrency: 8 }, configurable: true });

  active = true;
  let disposed = false;
  return { element: el, dispose() {
    if (disposed) return;
    disposed = true;
    for (const name of names) {
      const descriptor = previous.get(name);
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, descriptor);
    }
    active = false;
  } };
}
