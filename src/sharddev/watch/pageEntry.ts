import { Scope } from '@wildshard/engine/app/scope';
import { socketOf, startWatchPage, type DevHookLike, type WatchPageReport } from './page';

// SHARD-SOURCE AP5: the browser entry `wildshard watch` bundles and injects into the page it serves (watch.ts `pageScript`).
declare global { interface Window { __wildshardDevHook?: DevHookLike; __wsDevScene?: WatchPageReport } }

const timers = new Scope('watch.entry');
const page = startWatchPage({
  origin: location.origin,
  hook: () => window.__wildshardDevHook,
  fetch: (url) => fetch(url, { cache: 'no-store' }),
  socket: (url) => socketOf(new WebSocket(url)),
  frame: (run) => { timers.raf(run); },
  wait: (ms, run) => { timers.timeout(ms, run); },
  reload: () => { location.reload(); },
  now: () => Date.now(),
  log: (message) => { console.error(message); },
});
window.__wsDevScene = page.report;
