// Decision boards (W5, J68), the design documents page (W1: the design is part of the draft) and the two-picture
// comparison (§3.1: "any two compared by a slider"). Read-only.
import { itemById, type Atlas, type Board, type Item } from './atlas';
import { itemUrl } from './data';
import { h } from './dom';
import { openViewer } from './viewer';

/** One decision as Jake saw it: the question, the options side by side, what was recommended, what he picked, his words. */
export function boardView(a: Atlas, b: Board): HTMLElement {
  const items = b.options.map((o) => (o.item ? itemById(a, o.item) : undefined));
  const shown = items.filter((x): x is Item => x !== undefined);
  return h('div', { class: 'wd-panel wd-board-panel' },
    h('div', { class: 'wd-label' }, `${b.stage} · decision`),
    h('div', { class: 'wd-h3', style: 'margin-top:4px;text-transform:none;letter-spacing:0.02em' }, b.question),
    h('div', { class: 'wd-options' }, b.options.map((o, k) => {
      const it = items[k];
      const picked = b.picked === o.label;
      return h('button', { class: `wd-option${picked ? ' wd-picked' : ''}`, onclick: () => { if (it) openViewer(a, shown, shown.indexOf(it)); } },
        it?.images ? h('img', { src: itemUrl(a, it, 'thumb'), alt: o.note || o.label, loading: 'lazy' }) : h('div', { class: 'wd-option-empty' }, o.label),
        h('span', { class: 'wd-option-label' }, h('b', null, o.label), o.note ? ` · ${o.note}` : ''),
        picked ? h('span', { class: 'wd-chip' }, 'Picked') : null,
        b.recommended === o.label ? h('span', { class: 'wd-chip wd-chip-cyan' }, 'Recommended') : null);
    })),
    h('div', { class: 'wd-section' }, h('span', { class: 'wd-label' }, 'Your answer'), b.answer.map((t) => h('p', { class: 'wd-quote' }, t))));
}

// ------------------------------------------------------------------ the design documents

/** Inline markdown: **bold**, *italic*, `code`, [links](…). Text only: no HTML from the document is ever trusted. */
function inline(text: string): (Node | string)[] {
  const out: (Node | string)[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(h('b', null, m[1]));
    else if (m[2] !== undefined) out.push(h('i', null, m[2]));
    else if (m[3] !== undefined) out.push(h('code', null, m[3]));
    else if (m[4] !== undefined) out.push(m[4]);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** A small markdown renderer for the design docs: headings, lists, tables, paragraphs. */
export function renderMarkdown(md: string): HTMLElement {
  const root = h('div', { class: 'wd-md' });
  const lines = md.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.trim() === '') { i++; continue; }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      root.append(h(level <= 1 ? 'h2' : level === 2 ? 'h3' : 'h4', null, inline(heading[2] ?? '')));
      i++;
      continue;
    }
    if (line.startsWith('|')) {
      const rows: string[][] = [];
      for (; i < lines.length && (lines[i] ?? '').startsWith('|'); i++) {
        const cells = (lines[i] ?? '').split('|').slice(1, -1).map((c) => c.trim());
        if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
        rows.push(cells);
      }
      const [head, ...body] = rows;
      root.append(h('div', { class: 'wd-md-table' }, h('table', null,
        head ? h('thead', null, h('tr', null, head.map((c) => h('th', null, inline(c))))) : null,
        h('tbody', null, body.map((r) => h('tr', null, r.map((c) => h('td', null, inline(c)))))))));
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const ul = h('ul');
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i] ?? '')) {
        let item = (lines[i] ?? '').replace(/^\s*[-*]\s+/, '');
        i++;
        // an indented line that is not a new bullet continues the item
        for (; i < lines.length && /^\s+\S/.test(lines[i] ?? '') && !/^\s*[-*]\s+/.test(lines[i] ?? ''); i++) item += ` ${(lines[i] ?? '').trim()}`;
        ul.append(h('li', null, inline(item)));
      }
      root.append(ul);
      continue;
    }
    const para: string[] = [];
    for (; i < lines.length && (lines[i] ?? '').trim() !== '' && !/^(#|\||\s*[-*]\s)/.test(lines[i] ?? ''); i++) para.push((lines[i] ?? '').trim());
    root.append(h('p', null, inline(para.join(' '))));
  }
  return root;
}

export function designPage(a: Atlas, doc: string | undefined): HTMLElement {
  const pick = a.design.find((d) => d.name === doc) ?? a.design[0];
  return h('div', { class: 'wd-page' },
    h('div', { class: 'wd-top' }, h('a', { class: 'wd-back', href: `#/${a.slug}` }, a.name), h('div', { class: 'wd-label wd-amber' }, 'Design')),
    h('div', { class: 'wd-subtabs' }, a.design.map((d) => h('a', { class: `wd-subtab${d === pick ? ' wd-on' : ''}`, href: `#/${a.slug}/design/${encodeURIComponent(d.name)}` }, d.name.replace(/\.md$/, '')))),
    pick ? h('div', { class: 'wd-section' }, renderMarkdown(pick.text)) : h('div', { class: 'wd-empty-state' }, 'No design documents yet.'));
}

// ------------------------------------------------------------------ the comparison slider

/** Two pictures of one view, one over the other; the slider wipes between them. Pick either side from the lineage. */
export function openCompare(a: Atlas, list: Item[]): void {
  const usable = list.filter((i) => i.images);
  if (usable.length < 2) return;
  let left = 0;
  let right = usable.length - 1;
  const imgA = h('img', { alt: '' });
  const imgB = h('img', { alt: '' });
  const clip = h('div', { class: 'wd-compare-clip' }, imgB);
  const slider = h('input', { type: 'range', min: 0, max: 100, value: 50, class: 'wd-compare-range', 'aria-label': 'Wipe between the two pictures' });
  const pickers = h('div', { class: 'wd-compare-pick' });
  const paint = (): void => {
    const A = usable[left];
    const B = usable[right];
    if (!A || !B) return;
    imgA.src = itemUrl(a, A, 'full');
    imgB.src = itemUrl(a, B, 'full');
    clip.style.clipPath = `inset(0 0 0 ${slider.value}%)`;
    pickers.replaceChildren(...usable.map((it, k) => h('button', {
      class: `wd-subtab${k === left ? ' wd-on' : ''}${k === right ? ' wd-on-b' : ''}`, style: 'background:none;cursor:pointer',
      onclick: () => { if (k === left || k === right) return; if (k < right) left = k; else right = k; paint(); },
    }, `${k === left ? 'A ' : k === right ? 'B ' : ''}${it.stage} · ${it.angle ?? it.round.replace(/^round-\d+-/, '').replaceAll('-', ' ')}`)));
  };
  slider.addEventListener('input', () => { clip.style.clipPath = `inset(0 0 0 ${slider.value}%)`; });
  const close = h('button', { class: 'wd-viewer-close', 'aria-label': 'Close' }, '×');
  const root = h('div', { class: 'wd-viewer', role: 'dialog', 'aria-label': 'Compare two pictures' },
    close,
    h('div', { class: 'wd-compare' }, imgA, clip),
    h('div', { class: 'wd-viewer-bar', style: 'flex-direction:column;align-items:stretch' }, slider,
      h('div', { class: 'wd-label' }, 'A left · B right; tap a version to swap it in'), pickers));
  close.addEventListener('click', () => { root.remove(); });
  document.body.append(root);
  paint();
}
