// Draft Explore's COVERAGE, measured (W17, J35, J48, J52; E395): on the draft's terrain, which ground a player sees (PB2's
// viewpoints, Map Lab's maths) and which of it a mock-up camera sees (the first-person views' cameras). A cell is
// "mocked up" when a mock-up camera sees it, "to do" when a player sees it and no mock-up does, "unseen" otherwise.
import { itemById, type Atlas } from './atlas';
import { itemUrl } from './data';
import { h } from './dom';
import { BAND_CLOSE_M, BAND_MID_M, cameraSeen, cellOf, type Field, type Numbers } from './maplab-math';
import { loadField } from './terrain';

// J52's colours: red to do · violet mocked up · dark unseen
const RGB = { todo: [255, 90, 90], mocked: [185, 140, 255], unseen: [26, 36, 46] } as const;

export interface CoverageData {
  field: Field;
  /** distance to the nearest player viewpoint that sees each cell (Infinity = unseen) */
  playerSeen: Float32Array;
  camSeen: Uint8Array;
}

const cache = new Map<string, Promise<CoverageData>>();

function measure(a: Atlas): Promise<CoverageData> | null {
  const t = a.terrain;
  if (!t) return null;
  let p = cache.get(a.slug);
  if (!p) {
    p = (async () => {
      const field = await loadField(a, t);
      const playerSeen = await new Promise<Float32Array>((resolve) => {
        const worker = new Worker(new URL('maplab.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (e: MessageEvent<{ n: Numbers; seen: Float32Array }>): void => { resolve(e.data.seen); worker.terminate(); };
        // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a Worker's postMessage has no target origin
        worker.postMessage({ kind: 'init', field });
        // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a Worker's postMessage has no target origin
        worker.postMessage({ kind: 'run', id: 1, places: t.places, roads: t.roads.map((r) => ({ pts: r.pts })) });
      });
      // the views' own aspect (portrait phone frames)
      const view = a.items.find((i) => i.kind === 'fp' && i.status === 'current' && i.images !== null);
      const img = view?.images;
      const aspect = img !== undefined && img !== null ? img.w / img.h : 1;
      const camSeen = cameraSeen(field, a.cams, aspect);
      return { field, playerSeen, camSeen };
    })();
    cache.set(a.slug, p);
  }
  return p;
}

type Band = 'all' | 'close' | 'mid' | 'far';
const inBand = (v: number, b: Band): boolean =>
  b === 'all' ? Number.isFinite(v) : b === 'close' ? v <= BAND_CLOSE_M : b === 'mid' ? v > BAND_CLOSE_M && v <= BAND_MID_M : v > BAND_MID_M && Number.isFinite(v);

/** Shares of the player-seen cells in a band: mocked up, to do. */
export function funnel(c: CoverageData, band: Band): { mocked: number; todo: number; cells: number } {
  let mocked = 0;
  let todo = 0;
  for (let k = 0; k < c.playerSeen.length; k++) {
    if (!inBand(c.playerSeen[k] ?? Infinity, band)) continue;
    if (c.camSeen[k]) mocked++;
    else todo++;
  }
  const cells = mocked + todo;
  return { mocked: cells ? mocked / cells : 0, todo: cells ? todo / cells : 0, cells };
}

function pct(x: number): string {
  return `${Math.round(x * 1000) / 10} %`;
}

function funnelBar(label: string, f: { mocked: number; todo: number }): HTMLElement {
  return h('div', { style: 'margin-top:6px' },
    h('div', { class: 'wd-round-head' }, h('span', { class: 'wd-label' }, label), h('span', { class: 'wd-label' }, `${pct(f.mocked)} mocked up · ${pct(f.todo)} to do`)),
    h('div', { class: 'wd-bar', style: 'display:flex;height:10px' },
      h('span', { style: `width:${f.mocked * 100}%;background:rgb(${RGB.mocked.join(',')})` }),
      h('span', { style: `width:${f.todo * 100}%;background:rgb(${RGB.todo.join(',')})` })));
}

function statusCanvas(a: Atlas, c: CoverageData, band: Band, camsOnly: boolean): HTMLElement {
  const { res } = c.field;
  const canvas = h('canvas', { width: res, height: res, style: 'position:absolute;inset:0;width:100%;height:100%;opacity:0.78' });
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(res, res);
    for (let k = 0; k < res * res; k++) {
      const v = c.playerSeen[k] ?? Infinity;
      const cam = (c.camSeen[k] ?? 0) === 1;
      let rgb: readonly number[] = RGB.unseen;
      let alpha = 200;
      if (camsOnly) { rgb = cam ? RGB.mocked : inBand(v, 'close') ? RGB.todo : RGB.unseen; alpha = cam || inBand(v, 'close') ? 220 : 120; }
      else if (inBand(v, band)) rgb = cam ? RGB.mocked : RGB.todo;
      else alpha = 120;
      img.data[k * 4] = rgb[0] ?? 0;
      img.data[k * 4 + 1] = rgb[1] ?? 0;
      img.data[k * 4 + 2] = rgb[2] ?? 0;
      img.data[k * 4 + 3] = alpha;
    }
    ctx.putImageData(img, 0, 0);
  }
  const mapItem = a.map ? itemById(a, a.map.item) : undefined;
  return h('div', { class: 'wd-map', style: 'aspect-ratio:1' },
    mapItem ? h('img', { src: itemUrl(a, mapItem, 'thumb'), alt: '', style: 'position:absolute;inset:0;width:100%;height:100%;filter:brightness(0.5)' }) : null,
    canvas);
}

function legend(): HTMLElement {
  return h('div', { class: 'wd-map-legend' },
    h('span', null, h('span', { class: 'wd-swatch', style: `background:rgb(${RGB.mocked.join(',')})` }), 'Mocked up'),
    h('span', null, h('span', { class: 'wd-swatch', style: `background:rgb(${RGB.todo.join(',')})` }), 'To do'),
    h('span', null, h('span', { class: 'wd-swatch', style: `background:rgb(${RGB.unseen.join(',')})` }), 'Unseen'));
}

/** Fills `body` with the sub-view once the terrain is measured. */
export function coverageBody(a: Atlas, sub: string): HTMLElement {
  const body = h('div', { class: 'wd-section' }, h('p', { class: 'wd-label' }, 'Measuring coverage on the terrain…'));
  const p = measure(a);
  if (!p) {
    body.replaceChildren(h('div', { class: 'wd-empty-state' }, 'No terrain yet (P5\'s blockout): coverage is measured on it.'));
    return body;
  }
  void (async (): Promise<void> => {
    let c: CoverageData;
    try { c = await p; } catch {
      body.replaceChildren(h('div', { class: 'wd-empty-state' }, 'Could not load the terrain; try again online.'));
      return;
    }
    const funnels = h('div', { class: 'wd-panel' },
      h('div', { class: 'wd-h3' }, 'Seen ground with a mock-up'),
      funnelBar(`Close band (≤ ${BAND_CLOSE_M} m)`, funnel(c, 'close')),
      funnelBar(`Mid band (≤ ${BAND_MID_M} m)`, funnel(c, 'mid')),
      funnelBar('Far band', funnel(c, 'far')),
      h('p', { class: 'wd-p wd-dimtext', style: 'font-size:11px' }, `Measured on the approved map's terrain: a player's view from every road and place (Map Lab's viewpoints) against the ${a.cams.length} first-person views' cameras. Composed and signed off come with the build, in the game's Coverage tab (J35, J43).`));
    if (sub === 'places') {
      const t = a.terrain;
      const rows = (t?.places ?? []).map((pl) => {
        const [cx, cz] = cellOf(c.field, pl.x, pl.z);
        const rr = Math.max(1, Math.trunc(pl.r / (c.field.size / (c.field.res - 1))));
        let seen = 0;
        let mocked = 0;
        for (let j = cz - rr; j <= cz + rr; j++) {
          for (let i = cx - rr; i <= cx + rr; i++) {
            if (i < 0 || j < 0 || i >= c.field.res || j >= c.field.res || Math.hypot(i - cx, j - cz) > rr) continue;
            const k = j * c.field.res + i;
            if (!Number.isFinite(c.playerSeen[k] ?? Infinity)) continue;
            seen++;
            if (c.camSeen[k]) mocked++;
          }
        }
        return { pl, share: seen ? mocked / seen : 0, info: a.places.find((x) => x.id === pl.id) };
      }).sort((x, y) => (x.info?.num ?? 0) - (y.info?.num ?? 0));
      body.replaceChildren(funnels, ...rows.map((r) => h('div', { class: 'wd-place-row' },
        h('div', { class: 'wd-place-row-head' }, h('span', { class: 'wd-h3' }, `${r.info?.num ?? ''} · ${r.info?.name ?? r.pl.id}`), h('span', { class: 'wd-label' }, `${pct(r.share)} mocked up`)),
        h('div', { class: 'wd-bar' }, h('span', { style: `width:${r.share * 100}%;background:rgb(${(r.share > 0 ? RGB.mocked : RGB.todo).join(',')})` })))));
      return;
    }
    if (sub === 'cameras') {
      body.replaceChildren(funnels, h('span', { class: 'wd-label', style: 'display:block;margin-top:12px' }, 'What the mock-up cameras see, and the close band they miss'), statusCanvas(a, c, 'close', true), legend());
      return;
    }
    let band: Band = 'all';
    const mapBox = h('div');
    const chips = h('div', { class: 'wd-subtabs' });
    const paint = (): void => {
      mapBox.replaceChildren(statusCanvas(a, c, band, false));
      chips.replaceChildren(...(['all', 'close', 'mid', 'far'] as const).map((b) => h('button', { class: `wd-subtab${b === band ? ' wd-on' : ''}`, style: 'background:none;cursor:pointer', onclick: () => { band = b; paint(); } }, b)));
    };
    paint();
    body.replaceChildren(funnels, chips, mapBox, legend());
  })();
  return body;
}
