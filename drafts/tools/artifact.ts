#!/usr/bin/env node
// The draft's auto-made artifact page (WORLDCLAW-TOOLS W3, J25, J62): one read-only HTML page made from the same
// atlas.json as the drafts site, republished at every step boundary so Jake reads the draft inside Claude where he
// answers. Map Lab and the playable prototypes stay on the drafts site.
//
//   node drafts/tools/artifact.ts <slug> <out dir>
//
// Writes <out>/index.html and <out>/img/*.webp. The artifact frame loads no outside images, so the pictures ship as
// the page's own files: every thumbnail, plus the full phone copy of each stage pick, the key art and the current
// first-person views (under the platform's 255 files per publish). Then publish <out>/index.html with those files.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { STAGES, TICKS, stageName, type Atlas, type Board, type Item } from '../src/atlas.ts';
import { THUMB_EDGE, toWebp, type ImageIndex } from './images.ts';

const ROOT = resolve(import.meta.dirname, '..', '..');
const SITE = 'https://wildshard-drafts.vercel.app';
const MAX_FILES = 255;

const esc = (s: string): string => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const STATUS: Record<Item['status'], string> = { picked: 'Picked', current: 'Current', rejected: 'Rejected', superseded: 'Superseded', input: 'Input' };

/** The pictures the artifact page shows (J70): picks, current and inputs, plus every picture a board, a model, a view or a
 * step shows; rejected and superseded ones stay on the drafts site. */
export function shownItems(a: Atlas): Set<string> {
  const shown = new Set(a.items.filter((i) => i.status === 'picked' || i.status === 'current' || i.status === 'input').map((i) => i.id));
  for (const b of a.boards) for (const o of b.options) if (o.item) shown.add(o.item);
  for (const m of a.models) shown.add(m.concept);
  for (const st of a.steps) for (const id of st.items) shown.add(id);
  for (const s of a.stages) if (s.pick) shown.add(s.pick);
  if (a.map) shown.add(a.map.item);
  return shown;
}

export function buildPage(a: Atlas, fulls: ReadonlySet<string>): string {
  const shown = shownItems(a);
  const byId = new Map(a.items.map((i) => [i.id, i]));
  const thumb = (it: Item): string => `img/${it.images?.hash ?? ''}-t.webp`;
  const full = (it: Item): string => (fulls.has(it.id) ? `img/${it.images?.hash ?? ''}-f.webp` : thumb(it));
  const fig = (it: Item, label?: string, big = false): string => it.images
    ? `<figure class="t-${it.status}${big ? ' big' : ''}"><img src="${big ? full(it) : thumb(it)}" data-full="${full(it)}" alt="${esc(it.title)}" loading="lazy" width="${it.images.w}" height="${it.images.h}"><figcaption>${label ?? esc(it.title)}${it.status === 'picked' || it.status === 'rejected' || it.status === 'superseded' ? ` <i>${STATUS[it.status]}</i>` : ''}</figcaption></figure>`
    : '';
  const done = a.stages.filter((s) => s.state === 'done' && TICKS.includes(s.id)).length;
  const ticks = TICKS.map((_, i) => `<span class="${i < done ? 'on' : i === done ? 'now' : ''}"></span>`).join('');

  const boardsOf = (id: string): Board[] => a.boards.filter((b) => b.stage === id);
  const boardHtml = (b: Board): string => `<div class="answers board"><span class="lab">${b.stage} · decision</span><b class="q">${esc(b.question)}</b>
    <div class="grid">${b.options.map((o) => {
      const it = o.item ? byId.get(o.item) : undefined;
      const label = `<b>${esc(o.label)}</b>${o.note ? ` · ${esc(o.note)}` : ''}${b.picked === o.label ? ' <i>Picked</i>' : ''}${b.recommended === o.label ? ' <i>Recommended</i>' : ''}`;
      return it ? fig(it, label).replace('<figure class="', `<figure class="${b.picked === o.label ? 'opt-picked ' : ''}`) : `<figure><figcaption>${label}</figcaption></figure>`;
    }).join('')}</div>
    <span class="lab">Your answer</span>${b.answer.map((t) => `<blockquote>${esc(t)}</blockquote>`).join('')}</div>`;
  const stageHtml = a.stages.filter((s) => s.state !== 'todo').map((st) => {
    const pick = st.pick ? byId.get(st.pick) : undefined;
    const rounds = st.rounds.map((rid) => {
      const r = a.rounds.find((x) => x.id === rid);
      const order: Item['status'][] = ['picked', 'current', 'input', 'superseded', 'rejected'];
      const all = a.items.filter((i) => i.round === rid);
      const its = all.filter((i) => shown.has(i.id)).sort((x, y) => order.indexOf(x.status) - order.indexOf(y.status));
      const hidden = all.length - its.length;
      return `<details class="round"${st.state === 'current' ? ' open' : ''}><summary><b>${esc(r?.title ?? rid)}</b> <span class="n">${all.length}</span></summary>
        ${r?.note ? `<p class="dim">${esc(r.note)}</p>` : ''}${r?.verdict ? `<p><span class="lab">Verdict</span> ${esc(r.verdict)}</p>` : ''}
        <div class="grid">${its.map((it) => fig(it, esc(it.angle ?? it.title))).join('')}</div>
        ${hidden > 0 ? `<p class="dim">+ ${hidden} rejected or superseded picture${hidden === 1 ? '' : 's'} on <a href="${SITE}/#/${a.slug}/stage/${st.id}">the drafts site</a></p>` : ''}</details>`;
    }).join('');
    return `<section class="stage s-${st.state}" id="${st.id}">
      <header><span class="sid">${st.id}</span><h2>${esc(st.name)}</h2>${st.state === 'current' ? '<span class="chip">Now</span>' : ''}</header>
      ${pick ? fig(pick, esc(pick.title), true) : ''}
      ${boardsOf(st.id).length > 0 ? boardsOf(st.id).map(boardHtml).join('') : st.answers.length > 0 ? `<div class="answers"><span class="lab">Your answer</span>${st.answers.map((t) => `<blockquote>${esc(t)}</blockquote>`).join('')}</div>` : ''}
      ${st.notes.length > 0 ? `<ul class="notes">${st.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      ${rounds}
    </section>`;
  }).join('');

  const models = a.models.map((m) => { const c = byId.get(m.concept); return c ? fig(c, `${esc(m.name)} <span class="dim">· concept ✓ · model — · in game —</span>`) : ''; }).join('');

  const cams = a.cams.map((cam) => {
    const place = a.places.find((p) => p.id === cam.place);
    const view = a.items.find((i) => i.kind === 'fp' && i.place === cam.place && i.status === 'current');
    const block = a.items.find((i) => i.kind === 'blockout' && i.place === cam.place);
    return `<article class="cam"><header><b>${place?.num ?? ''} · ${esc(place?.name ?? cam.place)}</b><span class="chip ${cam.ok === false ? 'bad' : cam.ok ? 'ok' : ''}">${cam.ok === false ? 'Redo' : cam.ok ? 'Kept' : 'Not reviewed'}</span></header>
      <div class="pair">${view ? fig(view, 'First-person view') : ''}${block ? fig(block, 'Blockout · same camera') : ''}</div>${cam.note ? `<p class="dim">${esc(cam.note)}</p>` : ''}</article>`;
  }).join('');

  const mech = new Map(a.mechanics.map((m) => [m.id, m]));
  const steps = a.steps.map((s) => `<article class="step"><header><span class="sid">${s.n}</span><b>${esc(s.title)}</b></header><p>${esc(s.why)}${s.gets ? ` <span class="lab">Gets</span> ${esc(s.gets)}` : ''}</p>
    <div class="grid three">${s.items.map((id) => byId.get(id)).filter((x): x is Item => x !== undefined).map((it) => fig(it, `Wildcard ${it.view?.split('-').at(-1) ?? ''}`)).join('')}</div>
    ${s.mechanics.length > 0 ? `<div class="chips">${s.mechanics.map((id) => { const m = mech.get(id); return m ? `<span class="chip ${m.state === 'done' ? 'ok' : ''}">${m.isNew ? 'New' : 'Engine'} · ${esc(m.row)}</span>` : ''; }).join('')}</div>` : ''}</article>`).join('');

  const mechRows = a.mechanics.map((m) => `<tr><td>${esc(m.name)}</td><td>${m.isNew ? 'New' : 'Engine'}</td><td class="num">${esc(m.row)}</td><td>${m.state === 'done' ? 'Done' : 'To build'}</td></tr>`).join('');
  const mapItem = a.map ? byId.get(a.map.item) : undefined;
  const keyArt = a.items.find((i) => i.kind === 'keyart');
  const generated = new Date(a.generated).toISOString().replace('T', ' ').slice(0, 16);

  return `<title>${esc(a.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Rajdhani:wght@500;600;700&display=swap">
<style>
/* The Drafts look (the drafts site and the game's UI language): one deliberate dark world, navy glass, cyan
   hairlines, amber for picks and the current stage. Layout: a single reading column, stage after stage. */
:root {
  color-scheme: dark;
  --bg: #08121b; --panel: #0d1b26; --line: rgba(143, 227, 255, 0.28); --cyan: #8fe3ff; --amber: #f2a640;
  --ink: #e8f1f5; --dim: #93a9b8; --ok: #5fe0a0; --bad: #ff6b6b;
  --display: 'Rajdhani', 'Arial Narrow', system-ui, sans-serif; --mono: 'JetBrains Mono', ui-monospace, Menlo, monospace;
}
* { box-sizing: border-box; }
body { background: var(--bg); color: var(--ink); font: 14px/1.5 var(--mono); }
.wrap { max-width: 760px; margin: 0 auto; padding-inline: 16px; padding-block: 24px 64px; display: grid; gap: 28px; }
h1, h2 { font-family: var(--display); text-transform: uppercase; letter-spacing: 0.12em; margin: 0; line-height: 1.1; text-wrap: balance; }
h1 { font-size: 40px; color: var(--ink); }
h2 { font-size: 22px; }
p { margin: 0; max-width: 68ch; }
a { color: var(--cyan); }
.lab { font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--dim); margin-right: 6px; }
.dim { color: var(--dim); }
.chip { display: inline-block; padding: 2px 7px; border: 1px solid var(--amber); color: var(--amber); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; white-space: nowrap; }
.chip.ok { border-color: var(--ok); color: var(--ok); }
.chip.bad { border-color: var(--bad); color: var(--bad); }
.hero { display: grid; gap: 14px; }
.hero img { width: 100%; max-height: 62vh; object-fit: cover; object-position: 50% 30%; border: 1px solid var(--line); }
.run { display: grid; grid-template-columns: auto 1fr; gap: 4px 14px; background: var(--panel); border: 1px solid var(--line); padding: 12px; }
.run > .lab { padding-top: 3px; }
.ticks { display: flex; gap: 3px; grid-column: 1 / -1; margin-bottom: 6px; }
.ticks span { flex: 1; max-width: 22px; height: 6px; background: rgba(143, 227, 255, 0.16); }
.ticks .on { background: var(--cyan); }
.ticks .now { background: var(--amber); }
nav { display: flex; flex-wrap: wrap; gap: 6px; }
nav a { padding: 5px 9px; border: 1px solid var(--line); text-decoration: none; font-size: 11px; letter-spacing: 0.1em; }
section { display: grid; gap: 12px; }
.stage { border-top: 1px solid var(--line); padding-top: 16px; }
.stage header, .cam header, .step header { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.sid { font-family: var(--display); font-weight: 700; font-size: 20px; color: var(--cyan); }
.s-current .sid { color: var(--amber); }
.answers { background: var(--panel); border: 1px solid var(--line); padding: 12px; display: grid; gap: 6px; }
blockquote { margin: 0; font-family: var(--display); font-weight: 600; font-size: 19px; line-height: 1.25; }
blockquote::before { content: '\\201C'; } blockquote::after { content: '\\201D'; }
.notes { margin: 0; padding-left: 18px; display: grid; gap: 4px; color: var(--ink); }
details.round { border: 1px solid rgba(143, 227, 255, 0.14); padding: 8px 10px; }
details.round summary { cursor: pointer; font-family: var(--display); font-size: 16px; letter-spacing: 0.06em; text-transform: uppercase; }
details.round .n { color: var(--dim); font-family: var(--mono); font-size: 11px; }
details.round > p { margin-top: 6px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 6px; margin-top: 8px; }
.grid.three { grid-template-columns: repeat(3, 1fr); }
figure { margin: 0; display: grid; gap: 4px; align-content: start; min-width: 0; }
figure img { width: 100%; height: auto; aspect-ratio: 1; object-fit: cover; border: 1px solid var(--line); cursor: zoom-in; background: var(--panel); }
figure.big img { aspect-ratio: auto; max-height: 70vh; object-fit: contain; }
figure.t-picked img, figure.opt-picked img { border-color: var(--amber); }
.board .q { font-family: var(--display); font-size: 17px; letter-spacing: 0.04em; }
figure.t-rejected img, figure.t-superseded img { filter: grayscale(0.85) brightness(0.65); }
figcaption { font-size: 10.5px; color: var(--dim); line-height: 1.35; overflow-wrap: anywhere; }
figcaption i { font-style: normal; color: var(--amber); letter-spacing: 0.08em; text-transform: uppercase; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.cam, .step { background: var(--panel); border: 1px solid var(--line); padding: 12px; display: grid; gap: 8px; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.pair img, .grid.three img { aspect-ratio: 851 / 1500; }
.chips { display: flex; flex-wrap: wrap; gap: 5px; }
.table { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 12px; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid rgba(143, 227, 255, 0.12); vertical-align: top; }
th { font-weight: 400; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--dim); }
td.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
footer { color: var(--dim); font-size: 12px; display: grid; gap: 4px; border-top: 1px solid var(--line); padding-top: 14px; }
#lb { position: fixed; inset: 0; background: rgba(3, 8, 13, 0.94); display: grid; place-items: center; padding: calc(16px + env(safe-area-inset-top, 0px)) 16px calc(16px + env(safe-area-inset-bottom, 0px)); z-index: 9; cursor: zoom-out; }
#lb img { max-width: 100%; max-height: 100%; }
a:focus-visible, summary:focus-visible { outline: 2px solid var(--cyan); outline-offset: 2px; }
</style>
<div class="wrap">
  <div class="hero">
    <span class="lab">Wildshard draft · read-only · answers go in chat</span>
    <h1>${esc(a.name)}</h1>
    <p>${esc(a.line)}</p>
    ${keyArt?.images ? `<img src="${full(keyArt)}" alt="${esc(a.name)} key art" width="${keyArt.images.w}" height="${keyArt.images.h}">` : ''}
    <div class="run">
      <div class="ticks">${ticks}</div>
      <span class="lab">Stage</span><span><b>${a.run.stage} · ${esc(stageName(a.run.stage))}</b> (${done} of ${TICKS.length})</span>
      <span class="lab">Waiting on</span><span>${esc(a.run.waiting)}</span>
      <span class="lab">Next</span><span>${esc(a.run.next)}</span>
      <span class="lab">Pictures</span><span>${a.items.length} in ${a.rounds.length} rounds</span>
    </div>
    <p class="dim">The drafts site has the same draft with the full-screen swipe, Draft Explore, Map Lab and the prototypes: <a href="${SITE}/#/${a.slug}">${SITE.replace('https://', '')}</a>.</p>
    <nav>${a.stages.filter((s) => s.state !== 'todo').map((s) => `<a href="#${s.id}">${s.id} · ${esc(s.name)}</a>`).join('')}<a href="#explore">Explore</a></nav>
  </div>
  ${stageHtml}
  <section id="explore" class="stage">
    <header><span class="sid">⌖</span><h2>Explore · the mock-ups</h2></header>
    ${mapItem ? fig(mapItem, 'The approved map', true) : ''}
    <span class="lab">Models · the concepts</span>
    <div class="cards">${models}</div>
    <span class="lab">World · the first-person views and their camera check</span>
    ${a.camNoteAll ? `<p class="dim"><span class="lab">Every view</span>${esc(a.camNoteAll)}</p>` : ''}
    <div class="cards">${cams}</div>
    <span class="lab">Beats · the quest, step by step</span>
    ${steps}
    <span class="lab">Mechanics</span>
    <div class="table"><table><tr><th>Mechanic</th><th>Kind</th><th>Row</th><th>State</th></tr>${mechRows}</table></div>
    <p class="dim">Sets: none planned yet (they come with the catalog, P11). Stages still to come: ${STAGES.filter((s) => a.stages.find((x) => x.id === s.id)?.state === 'todo').map((s) => s.id).join(', ')}.</p>
  </section>
  <footer><div>Made from <code>drafts/public/data/${a.slug}/atlas.json</code> (${generated} UTC) by <code>drafts/tools/artifact.ts</code>; republished at every step boundary.</div><div>Originals in git: <code>${esc(a.art)}/</code>.</div></footer>
</div>
<script>
document.addEventListener('click', function (e) {
  var t = e.target;
  if (t instanceof HTMLImageElement && t.dataset.full) {
    var lb = document.createElement('div'); lb.id = 'lb';
    var im = document.createElement('img'); im.src = t.dataset.full; im.alt = t.alt;
    lb.appendChild(im); lb.addEventListener('click', function () { lb.remove(); });
    document.body.appendChild(lb);
  }
});
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { var lb = document.getElementById('lb'); if (lb) lb.remove(); } });
</script>
`;
}

function main(): void {
  const [slug, outArg] = process.argv.slice(2);
  if (!slug || !outArg) {
    console.error('usage: node drafts/tools/artifact.ts <slug> <out dir>');
    process.exit(2);
  }
  const out = resolve(outArg);
  const a =JSON.parse(readFileSync(join(ROOT, 'drafts/public/data', slug, 'atlas.json'), 'utf8')) as Atlas;
  const index =JSON.parse(readFileSync(join(ROOT, 'drafts/shards', slug, 'images.json'), 'utf8')) as ImageIndex;
  const picks = new Set(a.stages.flatMap((s) => (s.pick ? [s.pick] : [])));
  const wanted = a.items.filter((i) => picks.has(i.id) || i.kind === 'keyart' || (i.kind === 'fp' && i.status === 'current') || i.id === a.map?.item);
  const shown = shownItems(a);
  const withImages = a.items.filter((i) => i.images && shown.has(i.id));
  const fulls = new Set(wanted.slice(0, Math.max(0, MAX_FILES - 1 - withImages.length)).map((i) => i.id));
  mkdirSync(join(out, 'img'), { recursive: true });
  for (const it of withImages) {
    const src = `${a.art}/${it.id}`;
    const e = index[src];
    if (!e) continue;
    const dims = { w: e.w, h: e.h };
    copyFileSync(toWebp(join(ROOT, src), e.hash, THUMB_EDGE, dims), join(out, 'img', `${e.hash}-t.webp`));
    if (fulls.has(it.id)) copyFileSync(toWebp(join(ROOT, src), e.hash, null, dims), join(out, 'img', `${e.hash}-f.webp`));
  }
  writeFileSync(join(out, 'index.html'), buildPage(a, fulls));
  console.log(`${slug}: ${withImages.length} thumbnails + ${fulls.size} full pictures → ${out}`);
}

main();
