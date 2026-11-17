// The full-screen swipe (J40 B): every picture of a set, one per screen, its title and a counter. Read-only (J17).
import type { Atlas, Item } from './atlas';
import { itemUrl } from './data';
import { h } from './dom';

const STATUS: Record<Item['status'], string> = {
  picked: 'picked', current: 'current', rejected: 'rejected', superseded: 'superseded', input: 'input',
};

export function openViewer(atlas: Atlas, items: Item[], start: number): void {
  const list = items.filter((i) => i.images);
  if (list.length === 0) return;
  let at = Math.max(0, Math.min(list.length - 1, start));
  const title = h('div', { class: 'wd-viewer-title' });
  const meta = h('div', { class: 'wd-label' });
  const counter = h('div', { class: 'wd-label' });
  const slides = list.map((it, i) => {
    const img = h('img', { alt: it.title, decoding: 'async' });
    // Only the slides next to the one on screen load their phone copy.
    const slide = h('div', { class: 'wd-viewer-slide', 'data-i': i }, img);
    return { slide, img, it };
  });
  const track = h('div', { class: 'wd-viewer-track' }, slides.map((s) => s.slide));
  const show = (i: number): void => {
    at = i;
    const it = list[i];
    if (!it) return;
    title.textContent = it.title;
    meta.textContent = `${it.stage} · ${STATUS[it.status]}${it.ref ? ` · edited from build ${it.ref}` : ''}`;
    counter.textContent = `${i + 1} / ${list.length}`;
    for (let k = Math.max(0, i - 2); k <= Math.min(list.length - 1, i + 2); k++) {
      const s = slides[k];
      if (s && !s.img.src) s.img.src = itemUrl(atlas, s.it, 'full');
    }
  };
  const closeBtn = h('button', { class: 'wd-viewer-close', 'aria-label': 'Close' }, '×');
  const root = h('div', { class: 'wd-viewer', role: 'dialog', 'aria-label': 'Pictures' },
    closeBtn,
    track,
    h('div', { class: 'wd-viewer-bar' }, h('div', null, title, meta), counter),
  );
  // Every listener the viewer adds goes when it closes.
  const listeners = new AbortController();
  const remove = (): void => {
    root.remove();
    listeners.abort();
  };
  const close = (): void => {
    remove();
    if (history.state === 'wd-viewer') history.back();
  };
  const scrollTo = (i: number): void => {
    const c = Math.max(0, Math.min(list.length - 1, i));
    track.scrollTo({ left: c * track.clientWidth, behavior: 'smooth' });
  };
  closeBtn.addEventListener('click', close);
  track.addEventListener('scroll', () => {
    const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    if (i !== at) show(i);
  }, { passive: true });
  document.body.append(root);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') scrollTo(at + 1);
    if (e.key === 'ArrowLeft') scrollTo(at - 1);
  }, { signal: listeners.signal });
  // The phone's back gesture closes the viewer rather than leaving the page.
  history.pushState('wd-viewer', '');
  window.addEventListener('popstate', remove, { signal: listeners.signal });
  track.scrollLeft = at * track.clientWidth;
  show(at);
}
