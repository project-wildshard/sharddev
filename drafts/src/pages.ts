// The title (J39), a draft's home with STAGES (J29), a stage page (J40) and the prototypes (W7). Every page is open to
// everyone (E393: no Developer switch).
import { STAGES, TICKS, itemById, stageName, stageOrder, type Atlas, type DraftCard, type DraftIndex, type Item, type StageId } from './atlas';
import { itemUrl, url } from './data';
import { h } from './dom';
import { boardView, openCompare } from './extras';
import { openViewer } from './viewer';

export function ticks(card: { ticks: number }): HTMLElement {
  return h('div', { class: 'wd-ticks', 'aria-label': `${card.ticks} of ${TICKS.length} stages done` },
    TICKS.map((_, i) => h('span', { class: `wd-tick${i < card.ticks ? ' wd-done' : i === card.ticks ? ' wd-now' : ''}` })));
}

/** The drafts site's title: a carousel over each draft's key art, its stage and what it waits on; OPEN DRAFT. */
export function titlePage(index: DraftIndex): HTMLElement {
  const bg = h('div', { class: 'wd-title-bg' });
  const dots = h('div', { class: 'wd-dots' }, index.drafts.map((_, i) => h('span', { class: `wd-dot${i === 0 ? ' wd-on' : ''}` })));
  const setBg = (d: DraftCard | undefined): void => {
    bg.style.backgroundImage = d?.keyArt ? `url("${url({ blob: index.blob, slug: d.slug }, d.keyArt, 'full')}")` : '';
  };
  const cards = index.drafts.map((d) => {
    const art = d.keyArt
      ? h('img', { class: 'wd-card-art', src: url({ blob: index.blob, slug: d.slug }, d.keyArt, 'thumb'), alt: '' })
      : h('div', { class: 'wd-card-empty' }, d.name);
    return h('a', { class: 'wd-card', href: `#/${d.slug}` },
      art,
      h('span', { class: 'wd-chip' }, `Stage ${d.stage} · ${d.stageName}`),
      h('div', { class: 'wd-card-name' }, d.name),
      h('div', { class: 'wd-card-sub' }, `Waiting on: ${d.waiting}`),
      ticks(d));
  });
  const carousel = h('div', { class: 'wd-carousel' }, cards);
  let current = 0;
  carousel.addEventListener('scroll', () => {
    const w = cards[0]?.getBoundingClientRect().width ?? 1;
    const i = Math.max(0, Math.min(cards.length - 1, Math.round(carousel.scrollLeft / (w + 12))));
    if (i === current) return;
    current = i;
    for (const [k, el] of [...dots.children].entries()) el.classList.toggle('wd-on', k === i);
    setBg(index.drafts[i]);
  }, { passive: true });
  setBg(index.drafts[0]);
  const open = (): void => {
    const d = index.drafts[current];
    if (d) location.hash = `#/${d.slug}`;
  };
  const actions = h('div', { class: 'wd-title-links' }, h('button', { class: 'wd-btn', onclick: open }, 'Open draft'));
  return h('div', { class: 'wd-title' }, bg,
    h('div', { class: 'wd-title-head' }, h('div', { class: 'wd-label' }, 'Project Wildshard'), h('h1', { class: 'wd-h1' }, 'Drafts')),
    h('div', { class: 'wd-title-foot' },
      index.drafts.length === 0 ? h('div', { class: 'wd-panel wd-dimtext' }, 'No drafts yet.') : carousel,
      index.drafts.length > 1 ? dots : h('div', { style: 'height:14px' }),
      actions));
}

function top(back: { href: string; text: string }, right?: string): HTMLElement {
  return h('div', { class: 'wd-top' }, h('a', { class: 'wd-back', href: back.href }, back.text), right ? h('div', { class: 'wd-label wd-amber' }, right) : null);
}

function runHeader(a: Atlas): HTMLElement {
  const done = a.stages.filter((s) => s.state === 'done' && TICKS.includes(s.id)).length;
  return h('div', { class: 'wd-panel wd-run' },
    h('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:8px' },
      h('span', { class: 'wd-chip' }, `${a.run.stage} · ${stageName(a.run.stage)}`),
      h('span', { class: 'wd-label' }, `${done} / ${TICKS.length} stages`)),
    ticks({ ticks: done }),
    h('div', { class: 'wd-run-grid' },
      h('span', { class: 'wd-label' }, 'Waiting on'), h('span', null, a.run.waiting),
      h('span', { class: 'wd-label' }, 'Next'), h('span', null, a.run.next),
      h('span', { class: 'wd-label' }, 'Pictures'), h('span', null, `${a.items.length} in ${a.rounds.length} rounds`),
      h('span', { class: 'wd-label' }, 'Updated'), h('span', null, new Date(a.generated).toLocaleString())));
}

export function seg(slug: string, on: 'stages' | 'explore'): HTMLElement {
  return h('div', { class: 'wd-seg' },
    h('a', { class: `wd-seg-btn${on === 'stages' ? ' wd-on' : ''}`, href: `#/${slug}` }, 'Stages'),
    h('a', { class: `wd-seg-btn${on === 'explore' ? ' wd-on' : ''}`, href: `#/${slug}/explore` }, 'Explore'));
}

export function draftHead(a: Atlas, on: 'stages' | 'explore'): HTMLElement[] {
  // The run header lives on STAGES, the draft's home; EXPLORE keeps the screen for its mock-ups.
  return on === 'stages' ? [top({ href: '#/', text: 'Drafts' }, a.name), runHeader(a), seg(a.slug, on)] : [top({ href: '#/', text: 'Drafts' }, a.name), seg(a.slug, on)];
}

/** STAGES (J29): the run P0 → P17, each with its pick and Jake's answer. */
export function stagesPage(a: Atlas): HTMLElement {
  const rows = a.stages.map((st) => {
    const pick = (st.pick ? itemById(a, st.pick) : undefined) ?? a.items.find((i) => i.stage === st.id && i.images !== null);
    const count = a.items.filter((i) => i.stage === st.id).length;
    const ans = st.answers.at(-1);
    return h('a', { class: `wd-stage-row wd-${st.state}`, href: `#/${a.slug}/stage/${st.id}` },
      h('div', { class: 'wd-stage-id' }, st.id),
      h('div', null,
        h('div', { class: 'wd-stage-name' }, st.name),
        h('div', { class: 'wd-stage-ans' }, ans ? `“${ans}”` : st.state === 'todo' ? 'not yet' : count ? `${count} pictures` : '—')),
      pick?.images ? h('img', { class: 'wd-stage-thumb', src: itemUrl(a, pick, 'thumb'), alt: '', loading: 'lazy' }) : h('div', { class: 'wd-stage-thumb wd-empty' }));
  });
  const protos = a.protos.length > 0
    ? h('a', { class: 'wd-stage-row', href: `#/${a.slug}/protos` },
      h('div', { class: 'wd-stage-id' }, '⚗'),
      h('div', null, h('div', { class: 'wd-stage-name' }, 'Prototypes'), h('div', { class: 'wd-stage-ans' }, `${a.protos.length} · ${a.protos.map((p) => p.id).join(' · ')}`)),
      h('div', null))
    : null;
  const design = a.design.length > 0
    ? h('a', { class: 'wd-stage-row', href: `#/${a.slug}/design` },
      h('div', { class: 'wd-stage-id' }, '§'),
      h('div', null, h('div', { class: 'wd-stage-name' }, 'Design'), h('div', { class: 'wd-stage-ans' }, a.design.map((d) => d.name.replace(/\.md$/, '')).join(' · '))),
      h('div', null))
    : null;
  return h('div', { class: 'wd-page' }, draftHead(a, 'stages'), h('div', { class: 'wd-timeline' }, design, protos, rows));
}

const TAG: Record<Item['status'], string> = { picked: 'Picked', current: 'Current', rejected: 'Rejected', superseded: 'Superseded', input: 'Input' };

export function tile(a: Atlas, it: Item, set: Item[], label?: string): HTMLElement {
  return h('button', { class: `wd-tile wd-${it.status}`, onclick: () => openViewer(a, set, set.indexOf(it)), 'aria-label': it.title },
    it.images ? h('img', { src: itemUrl(a, it, 'thumb'), alt: '', loading: 'lazy', decoding: 'async' }) : null,
    h('span', { class: 'wd-tile-tag' }, label ?? (it.status === 'picked' || it.status === 'rejected' || it.status === 'superseded' ? `${TAG[it.status]} · ${it.angle ?? it.title}` : it.angle ?? it.title)));
}

function lineage(a: Atlas, it: Item): HTMLElement | null {
  if (!it.view) return null;
  const ids = a.lineages[it.view] ?? [];
  if (ids.length < 2) return null;
  const list = ids.map((id) => itemById(a, id)).filter((x): x is Item => Boolean(x));
  const parts: HTMLElement[] = [];
  list.forEach((x, i) => {
    if (i > 0) parts.push(h('span', { class: 'wd-arrow' }, '→'));
    parts.push(h('div', { class: `wd-lineage-step${x.id === it.id ? ' wd-sel' : ''}`, onclick: () => openViewer(a, list, i) },
      h('img', { src: itemUrl(a, x, 'thumb'), alt: '', loading: 'lazy' }),
      h('span', { class: 'wd-label' }, `${x.stage} · ${x.angle ?? x.round.replace(/^round-\d+-/, '').replaceAll('-', ' ')}`)));
  });
  return h('div', { class: 'wd-section' },
    h('div', { class: 'wd-round-head' }, h('span', { class: 'wd-label' }, 'Lineage'), h('button', { class: 'wd-subtab', style: 'background:none;cursor:pointer', onclick: () => { openCompare(a, list); } }, 'Compare')),
    h('div', { class: 'wd-lineage' }, parts));
}

/** A stage page, decision first (J40): the pick large, Jake's answer, the lineage, then every round's pictures. */
export function stagePage(a: Atlas, id: StageId): HTMLElement {
  const st = a.stages.find((s) => s.id === id);
  if (!st) return h('div', { class: 'wd-page' }, top({ href: `#/${a.slug}`, text: a.name }), h('p', { class: 'wd-error' }, `No stage ${id}.`));
  const strip = h('div', { class: 'wd-strip' }, a.stages.filter((s) => s.id !== 'P0').map((s) =>
    h('a', { class: `wd-strip-cell${s.state === 'done' ? ' wd-done' : ''}${s.id === id ? ' wd-sel' : ''}`, href: `#/${a.slug}/stage/${s.id}` },
      s.id, h('span', { class: 'wd-mark' }, s.state === 'done' ? '✓' : s.state === 'current' ? '●' : '·'))));
  const stageItems = a.items.filter((i) => i.stage === id);
  const pick = st.pick ? itemById(a, st.pick) : undefined;
  const hero = pick?.images
    ? h('div', { class: 'wd-hero', onclick: () => openViewer(a, stageItems, stageItems.indexOf(pick)) },
      h('img', { src: itemUrl(a, pick, 'full'), alt: pick.title, width: pick.images.w, height: pick.images.h }),
      h('span', { class: 'wd-chip' }, `${TAG[pick.status]} · ${pick.title}`))
    : null;
  const boards = a.boards.filter((b) => b.stage === id);
  // the boards carry Jake's answers; a stage without boards shows them on their own
  const answers = boards.length === 0 && st.answers.length > 0
    ? h('div', { class: 'wd-panel wd-section' }, h('span', { class: 'wd-label' }, 'Your answer'), st.answers.map((t) => h('p', { class: 'wd-quote' }, t)))
    : null;
  const notes = st.notes.length > 0
    ? h('div', { class: 'wd-section' }, h('span', { class: 'wd-label' }, 'Notes'), h('ul', { class: 'wd-notes' }, st.notes.map((n) => h('li', null, n))))
    : null;
  const rounds = st.rounds.map((rid) => {
    const r = a.rounds.find((x) => x.id === rid);
    const its = a.items.filter((i) => i.round === rid);
    // Picks first, then current, inputs, superseded, rejected.
    const order: Item['status'][] = ['picked', 'current', 'input', 'superseded', 'rejected'];
    const sorted = [...its].sort((x, y) => order.indexOf(x.status) - order.indexOf(y.status));
    return h('div', { class: 'wd-round' },
      h('div', { class: 'wd-round-head' }, h('div', { class: 'wd-h3' }, r?.title ?? rid), h('span', { class: 'wd-label' }, `${its.length}`)),
      r?.note ? h('p', { class: 'wd-p wd-dimtext' }, r.note) : null,
      r?.verdict ? h('p', { class: 'wd-p' }, h('span', { class: 'wd-label' }, 'Verdict '), r.verdict) : null,
      r?.made ? h('p', { class: 'wd-p wd-dimtext' }, h('span', { class: 'wd-label' }, 'Made with '), r.made) : null,
      h('div', { class: 'wd-grid' }, sorted.map((it) => tile(a, it, sorted))));
  });
  const empty = stageItems.length === 0 && st.answers.length === 0
    ? h('div', { class: 'wd-empty-state' }, st.state === 'todo' ? `${st.name}: not reached yet.` : 'No pictures at this stage.')
    : null;
  const prev = a.stages[stageOrder(id) - 1];
  const next = a.stages[stageOrder(id) + 1];
  return h('div', { class: 'wd-page' },
    top({ href: `#/${a.slug}`, text: a.name }, `${id} · ${st.name}`),
    strip, hero, answers,
    boards.length > 0 ? h('div', { class: 'wd-section wd-stack' }, h('span', { class: 'wd-label' }, boards.length === 1 ? 'The decision' : `The decisions · ${boards.length}`), boards.map((b) => boardView(a, b))) : null,
    pick ? lineage(a, pick) : null, notes, rounds, empty,
    h('div', { class: 'wd-pager' },
      prev ? h('a', { href: `#/${a.slug}/stage/${prev.id}`, 'aria-label': prev.name }, '‹') : h('span', { class: 'wd-pager-off' }, '‹'),
      h('span', { class: 'wd-label' }, `${id} · ${st.name}`),
      next ? h('a', { href: `#/${a.slug}/stage/${next.id}`, 'aria-label': next.name }, '›') : h('span', { class: 'wd-pager-off' }, '›')));
}

/** The prototype gallery (W7, J9, J63): each card's question, result, what it changed; PLAY when it has a built page. */
export function protosPage(a: Atlas): HTMLElement {
  return h('div', { class: 'wd-page' },
    top({ href: `#/${a.slug}`, text: a.name }, 'Prototypes'),
    a.protos.map((p) => {
      const its = p.items.map((id) => itemById(a, id)).filter((x): x is Item => Boolean(x));
      return h('div', { class: 'wd-panel wd-proto' },
        h('div', { class: 'wd-round-head' }, h('div', { class: 'wd-h2' }, p.id), p.peakMB !== null ? h('span', { class: 'wd-chip wd-chip-cyan' }, `Peak ${p.peakMB} MB`) : null),
        h('div', { class: 'wd-proto-grid' },
          h('span', { class: 'wd-label' }, 'Question'), h('span', null, p.question),
          h('span', { class: 'wd-label' }, 'Result'), h('span', null, p.result),
          h('span', { class: 'wd-label' }, 'Changed'), h('span', null, p.changed)),
        its.length > 0 ? h('div', { class: 'wd-grid' }, its.map((it) => tile(a, it, its, it.title))) : null,
        p.play ? h('a', { class: 'wd-btn', style: 'margin-top:12px', href: p.play }, 'Play') : h('p', { class: 'wd-p wd-dimtext' }, 'No playable page: this prototype was a script whose output is its pictures.'));
    }));
}

export function stageFromRoute(v: string | undefined): StageId | null {
  const st = STAGES.find((s) => s.id === v);
  return st ? st.id : null;
}
