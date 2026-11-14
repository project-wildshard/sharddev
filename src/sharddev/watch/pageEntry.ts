import { Scope } from '@wildshard/engine/app/scope';
import { installBrowserScopeEnvironment } from '@wildshard/engine/app/view/scopeEnvironment';
import { socketOf, startWatchPage, type DevHookLike, type WatchPageReport } from './page';
import { WATCH_RESHELL } from './protocol';

// SHARD-SOURCE AP5: the browser entry `wildshard watch` bundles and injects into the page it serves (watch.ts `pageScript`).
// It is its own bundle beside the engine's, so it installs its own copy of the browser scope environment (frames, timers).
declare global { interface Window { __wildshardDevHook?: DevHookLike; __wsDevScene?: WatchPageReport; __wsShell?: number } }

installBrowserScopeEnvironment();
const entry = location.href;
const timers = new Scope('watch.entry');
const page = startWatchPage({
  origin: location.origin,
  hook: () => window.__wildshardDevHook,
  fetch: (url) => fetch(url, { cache: 'no-store' }),
  socket: (url) => socketOf(new WebSocket(url)),
  frame: (run) => { timers.raf(run); },
  wait: (ms, run) => { timers.timeout(ms, run); },
  // the address the page opened at (`?skipintro`): the engine rewrites it once it boots, and a plain reload would land on the title
  reload: () => { location.replace(entry); },
  reshell: () => { void fetch(`${location.origin}${WATCH_RESHELL}`, { method: 'POST' }).catch((cause: unknown) => { console.error('wildshard watch: reshell', cause); }); },
  now: () => Date.now(),
  log: (message) => { console.error(message); },
  shell: () => window.__wsShell ?? null,
});
window.__wsDevScene = page.report;
