import { Scope } from '@wildshard/engine/app/scope';
import { installBrowserScopeEnvironment } from '@wildshard/engine/app/view/scopeEnvironment';
import { socketOf, startWatchPage, type DevHookLike, type WatchPageReport } from './page';
import { WATCH_RESHELL } from './protocol';

// SHARD-SOURCE AP5: the browser entry `wildshard watch` bundles and injects into the page it serves (watch.ts `pageScript`).
// It is its own bundle beside the engine's, so it installs its own copy of the browser scope environment (frames, timers).
declare global { interface Window { __wildshardDevHook?: DevHookLike; __wsDevScene?: WatchPageReport; __wsShell?: number } }

installBrowserScopeEnvironment();
/** AP19, AP20: the watch panel, top left over the game (the vitals sit bottom left): what the last edit did, and the last full build's budget table. */
let held: HTMLElement | null = null;
const panel = (): HTMLElement => {
  if (held !== null) return held;
  const node = document.createElement('pre');
  node.id = 'wildshard-watch';
  Object.assign(node.style, { position: 'fixed', left: '8px', top: '8px', zIndex: '2147483000', margin: '0', padding: '6px 8px', maxWidth: '46ch',
    font: '11px/1.35 ui-monospace, Menlo, monospace', color: '#e8f0e0', background: 'rgba(12, 16, 12, 0.72)', borderRadius: '4px', pointerEvents: 'none', whiteSpace: 'pre-wrap' });
  // oxlint-disable-next-line wildshard/no-raw-hud, wildshard/no-global-listener-patch -- sharddev's own dev panel beside the game, not a game HUD; the page lives as long as it does
  document.body.append(node);
  held = node;
  return node;
};
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
  overlay: (lines) => { panel().textContent = lines.join('\n'); },
});
window.__wsDevScene = page.report;
