// The drafts site (WORLDCLAW-TOOLS W16, J16, J57): a separate, read-only website with only the drafts. Hash routes are
// in-page navigation, not switches (the site has no query params at all):
//   #/                                   the title (J39)
//   #/<slug>                             STAGES, the draft's home (J29)
//   #/<slug>/stage/<P>                   a stage page (J40)
//   #/<slug>/explore/<tab>/<sub>/<arg>   Draft Explore (J44)
//   #/<slug>/protos                      the prototypes (W7)
//   #/<slug>/design/<doc>                the design documents
//   #/<slug>/maplab                      Map Lab (W6)
import './styles.css';
import { stageName, type Atlas } from './atlas';
import { atlas, draftIndex, url } from './data';
import { clear, h } from './dom';
import { explorePage } from './explore';
import { protosPage, stageFromRoute, stagePage, stagesPage, titlePage } from './pages';
import { draftUrls, registerSw, savedCount, warm, type Saved } from './pwa';
import { mountUpdatePill } from './update';
import { designPage } from './extras';

const app = document.getElementById('app') ?? document.body;
void registerSw();
const showPill = mountUpdatePill();

/** The draft home's offline line (E391): how many of its pictures are saved; opening a draft saves the rest. */
function offline(a: Atlas): void {
  const urls = draftUrls(a);
  const paint = (s: Saved): void => {
    const run = app.querySelector('.wd-run');
    if (!run) return;
    let line = run.querySelector<HTMLElement>('.wd-offline');
    if (!line) {
      line = h('div', { class: 'wd-offline' }, h('span'), h('div', { class: 'wd-bar' }, h('span', { style: 'background:#5fe0a0' })));
      run.append(line);
    }
    const label = line.firstElementChild;
    if (label) label.textContent = s.done >= s.total ? `Offline · all ${s.total} pictures saved` : `Offline · ${s.done} / ${s.total} pictures saved`;
    const fill = line.querySelector<HTMLElement>('.wd-bar > span');
    if (fill) fill.style.width = `${(100 * s.done) / Math.max(1, s.total)}%`;
  };
  void savedCount(urls).then(paint).then(() => warm(urls, paint));
}

/** Save every picture of the draft in view, whatever page of it is open; retried when the first worker takes control and
 * when the network comes back. */
let warmSlug = '';
function keepOffline(a: Atlas): void {
  warmSlug = a.slug;
  void warm(draftUrls(a), () => undefined);
}
const rewarm = (): void => { if (warmSlug) void atlas(warmSlug).then(keepOffline); };
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('controllerchange', rewarm);
window.addEventListener('online', rewarm);

/** The draft splash (J41): the key art full screen, "DRAFT · <name> · <stage>", a bar that fills as the first pictures load. */
function splash(a: Atlas): { done: () => void } {
  const fill = h('div', { class: 'wd-splash-fill' });
  const count = h('span', { class: 'wd-label' });
  const el = h('div', { class: 'wd-splash' },
    h('div', { class: 'wd-splash-inner' },
      h('div', { class: 'wd-label' }, `Draft · ${a.name} · ${a.run.stage} ${stageName(a.run.stage)}`),
      h('div', { class: 'wd-h1', style: 'color:#e8f1f5;margin-top:6px' }, a.name),
      h('div', { class: 'wd-splash-bar' }, fill),
      h('div', { style: 'margin-top:6px' }, count)));
  if (a.keyArt) el.style.backgroundImage = `url("${url(a, a.keyArt, 'full')}")`;
  document.body.append(el);
  let finished = false;
  const done = (): void => {
    if (finished) return;
    finished = true;
    el.classList.add('wd-out');
    setTimeout(() => el.remove(), 400);
  };
  // Track the pictures the first screen asked for.
  requestAnimationFrame(() => {
    const imgs = [...app.querySelectorAll('img')].filter((i) => i.loading !== 'lazy').slice(0, 12);
    let loaded = 0;
    const tick = (): void => {
      loaded++;
      fill.style.width = `${(100 * loaded) / Math.max(1, imgs.length)}%`;
      count.textContent = `${loaded} / ${imgs.length} images · ${a.items.length} in the draft`;
      if (loaded >= imgs.length) done();
    };
    count.textContent = `0 / ${imgs.length} images · ${a.items.length} in the draft`;
    if (imgs.length === 0) done();
    for (const img of imgs) {
      if (img.complete) tick();
      else { img.addEventListener('load', tick, { once: true }); img.addEventListener('error', tick, { once: true }); }
    }
  });
  return { done };
}

let shownSplash = '';

let renderId = 0;

async function render(): Promise<void> {
  const id = ++renderId;
  const parts = location.hash.replace(/^#\/?/, '').split('/').map((p) => { try { return decodeURIComponent(p); } catch { return p; } }).filter(Boolean);
  const [slug, view, a1, a2, a3] = parts;
  showPill(slug === undefined);
  try {
    if (!slug) {
      const index = await draftIndex();
      clear(app);
      app.append(titlePage(index));
      return;
    }
    const index = await draftIndex();
    if (!index.drafts.some((d) => d.slug === slug)) throw new Error(`No draft called ${slug}.`);
    const a = await atlas(slug);
    if (id !== renderId) return;
    clear(app);
    let page: HTMLElement;
    if (view === 'stage') {
      const stage = stageFromRoute(a1);
      page = stage ? stagePage(a, stage) : stagesPage(a);
    } else if (view === 'explore') page = explorePage(a, a1, a2, a3);
    else if (view === 'protos') page = protosPage(a);
    else if (view === 'design') page = designPage(a, a1);
    else if (view === 'maplab') page = await (await import('./maplab')).mapLabPage(a);
    else page = stagesPage(a);
    app.append(page);
    if (shownSplash !== slug) {
      shownSplash = slug;
      splash(a);
    }
    if (!view) offline(a);
    else keepOffline(a);
  } catch (e) {
    if (e instanceof TypeError && /dynamically imported module|Importing a module script failed/.test(e.message) && sessionStorage.getItem('wd-reloaded') !== location.hash) {
      // A new deploy replaced the chunk this page knew: load the new build once.
      sessionStorage.setItem('wd-reloaded', location.hash);
      location.reload();
      return;
    }
    clear(app);
    app.append(h('div', { class: 'wd-page' },
      h('a', { class: 'wd-back', href: '#/' }, 'Drafts'),
      h('p', { class: 'wd-error' }, e instanceof Error ? e.message : String(e))));
  }
}

let lastPath = '';
window.addEventListener('hashchange', () => {
  const path = location.hash;
  if (path === lastPath) return;
  lastPath = path;
  void render().then(() => window.scrollTo(0, 0));
});
lastPath = location.hash;
void render();
