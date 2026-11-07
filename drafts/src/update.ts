// The reload pill (E391, as the game's src/client/engine/ui/Update.ts). A home-screen app has no address bar, so this is the way to
// take a new deploy: "<build> · reload", lit "New version · tap to update" when the server has a newer build (a waiting
// worker, or /version.json says so). Shown on the title only, where the drafts are picked (E393), top right.
import { drafts } from './pwa';
import { h } from './dom';

declare const __DRAFTS_BUILD__: string;

/** `<sha>-<stamp>` → the sha */
const shortBuild = (id: string): string => id.split('-')[0] ?? id;

/** Mounts the pill; the returned function shows it (on the title) or hides it (everywhere else). */
export function mountUpdatePill(): (visible: boolean) => void {
  const text = h('span');
  const el = h('button', { class: 'wd-update', type: 'button', 'aria-label': 'Reload the drafts site' }, h('span', { class: 'wd-update-dot' }), text);
  document.body.append(el);
  let newer = false;
  let busy = false;
  const paint = (): void => {
    if (busy) return;
    text.textContent = newer ? 'New version · tap to update' : `${shortBuild(__DRAFTS_BUILD__)} · reload`;
  };
  const lightUp = (): void => {
    newer = true;
    el.classList.add('wd-newer');
    paint();
  };
  const reload = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    text.textContent = 'updating…';
    if (!drafts.waiting && newer) await drafts.fetchNew();
    if (drafts.waiting) await drafts.adopt();
    // still here: nothing was waiting, or the hand-over did not land. Reload the document past every cache.
    location.reload();
  };
  // pointerup as well as click: iOS drops the click when a tap jitters
  el.addEventListener('pointerup', () => { void reload(); });
  el.addEventListener('click', () => { void reload(); });
  window.addEventListener('wd-sw-waiting', lightUp);
  const check = async (): Promise<void> => {
    if (newer || !navigator.onLine) return;
    try {
      const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) return;
      const j = (await r.json()) as { build?: string };
      if (j.build !== undefined && j.build !== '' && j.build !== __DRAFTS_BUILD__) lightUp();
    } catch {
      // offline: keep the plain reload pill
    }
  };
  paint();
  void check();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void check(); });
  setInterval(() => { void check(); }, 5 * 60 * 1000);
  return (visible: boolean): void => { el.classList.toggle('wd-visible', visible); };
}
