// Map Lab (W6, J31, J61): A the map's layers with live numbers (drag a place; nothing saves, J24), B the eye-height walk
// on the bare terrain, C each variant's checks. On the approved map's blockout with the dry run's maths until T3–T5 land.
import { h, s } from './dom';
import { itemById, type Atlas, type Terrain } from './atlas';
import { itemUrl } from './data';
import { loadField } from './terrain';
import { BAND_CLOSE_M, BAND_MID_M, GENTLE_DEG, MAX_CLIMB_DEG, placeGentlePct, sightlines, slopeDeg, type Numbers, type PlacePt } from './maplab-math';

type Layer = 'painted' | 'layout' | 'slope' | 'sight';
const LAYERS: [Layer, string][] = [['painted', 'Painted'], ['layout', 'Layout'], ['slope', 'Slope'], ['sight', 'Sightlines']];

// The dry run's render colours (terrain_vis.py): slope ≤ 30° green, ≤ 40° yellow, steeper grey, water blue; bands close
// red, mid amber, far blue.
const SLOPE_RGB: [number, number, number][] = [[80, 170, 90], [200, 190, 70], [150, 150, 150], [40, 80, 140]];
const BAND_RGB: [number, number, number][] = [[230, 80, 60], [240, 170, 60], [110, 140, 200]];

function hex(c: string): [number, number, number] {
  const n = Number.parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export async function mapLabPage(a: Atlas): Promise<HTMLElement> {
  const t = a.terrain;
  const back = h('a', { class: 'wd-back', href: `#/${a.slug}/explore/world/maplab` }, a.name);
  if (!t) return h('div', { class: 'wd-page' }, back, h('div', { class: 'wd-empty-state' }, 'This draft has no terrain yet (P5\'s blockout).'));
  const field = await loadField(a, t);
  const slope = slopeDeg(field);
  const names0 = new Map(a.places.map((p) => [p.id, p.num]));
  const places: PlacePt[] = t.places.map((p) => ({ ...p })).sort((x, y) => (names0.get(x.id) ?? 99) - (names0.get(y.id) ?? 99));
  const home = t.places.map((p) => ({ ...p }));
  const names = new Map(a.places.map((p) => [p.id, p]));

  // ------------------------------------------------------------------ the canvas layers
  const canvas = h('canvas', { width: t.res, height: t.res, style: 'position:absolute;inset:0;width:100%;height:100%' });
  const ctx = canvas.getContext('2d');
  const mapItem = a.map ? itemById(a, a.map.item) : undefined;
  const painted = mapItem ? h('img', { src: itemUrl(a, mapItem, 'full'), alt: '', style: 'position:absolute;inset:0;width:100%;height:100%' }) : null;
  const svg = s('svg', { viewBox: '0 0 1000 1000', style: 'position:absolute;inset:0;width:100%;height:100%;touch-action:none' });
  const box = h('div', { class: 'wd-map', style: 'aspect-ratio:1;touch-action:none' }, painted, canvas, svg);
  let layer: Layer = 'painted';
  let seen: Float32Array | null = null;

  const paint = (): void => {
    if (!ctx) return;
    canvas.style.display = layer === 'painted' ? 'none' : 'block';
    if (layer === 'painted') return;
    const img = ctx.createImageData(t.res, t.res);
    const cats = t.cats.map((c) => hex(c.color));
    for (let k = 0; k < t.res * t.res; k++) {
      const lab = field.labels[k] ?? 0;
      let rgb: [number, number, number];
      if (layer === 'layout') rgb = cats[lab] ?? [0, 0, 0];
      else if (layer === 'slope') {
        const sl = slope[k] ?? 90;
        rgb = (lab === field.water ? SLOPE_RGB[3] : sl <= GENTLE_DEG ? SLOPE_RGB[0] : sl <= MAX_CLIMB_DEG ? SLOPE_RGB[1] : SLOPE_RGB[2]) ?? [0, 0, 0];
      } else {
        const v = seen?.[k] ?? Infinity;
        const base = cats[lab] ?? [0, 0, 0];
        rgb = v <= BAND_CLOSE_M ? (BAND_RGB[0] ?? base) : v <= BAND_MID_M ? (BAND_RGB[1] ?? base) : Number.isFinite(v) ? (BAND_RGB[2] ?? base) : [base[0] * 0.35, base[1] * 0.35, base[2] * 0.35];
      }
      img.data[k * 4] = rgb[0];
      img.data[k * 4 + 1] = rgb[1];
      img.data[k * 4 + 2] = rgb[2];
      img.data[k * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  };

  // ------------------------------------------------------------------ the numbers (worker)
  const worker = new Worker(new URL('maplab.worker.ts', import.meta.url), { type: 'module' });
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a Worker's postMessage has no target origin
  worker.postMessage({ kind: 'init', field });
  let runId = 0;
  let base: Numbers | null = null;
  let current: Numbers | null = null;
  const panel = h('div', { class: 'wd-panel wd-section' });
  const status = h('span', { class: 'wd-label' }, 'Computing…');
  const roads = t.roads.map((r) => ({ pts: r.pts }));
  const run = (): void => {
    runId++;
    status.textContent = 'Computing…';
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a Worker's postMessage has no target origin
    worker.postMessage({ kind: 'run', id: runId, places, roads });
  };
  const delta = (now: number, was: number | undefined): HTMLElement | null => {
    if (was === undefined) return null;
    const d = Math.round((now - was) * 10) / 10;
    if (d === 0) return null;
    return h('span', { class: `wd-chip ${d > 0 ? 'wd-chip-ok' : 'wd-chip-bad'}`, style: 'margin-left:6px' }, `${d > 0 ? '+' : ''}${d}`);
  };
  const row = (label: string, now: number, was: number | undefined, unit = '%'): HTMLElement =>
    h('div', { style: 'display:flex;justify-content:space-between;align-items:center;padding:3px 0' },
      h('span', { class: 'wd-label' }, label), h('span', null, `${now}${unit}`, delta(now, was)));
  const renderPanel = (): void => {
    if (!current) return;
    const n = current;
    const b = base;
    panel.replaceChildren(
      h('div', { class: 'wd-round-head' }, h('span', { class: 'wd-h3' }, 'Live numbers'), status),
      row(`Walkable (≤ ${MAX_CLIMB_DEG}°) of land`, n.walkablePct, b?.walkablePct),
      row(`Gentle (≤ ${GENTLE_DEG}°) of land`, n.gentlePct, b?.gentlePct),
      row(`Close band (≤ ${BAND_CLOSE_M} m seen)`, n.bands.close, b?.bands.close),
      row(`Mid band (≤ ${BAND_MID_M} m)`, n.bands.mid, b?.bands.mid),
      row('Far band', n.bands.far, b?.bands.far),
      row('Never seen', n.bands.unseen, b?.bands.unseen),
      h('div', { class: 'wd-label', style: 'margin-top:8px' }, `Each place's gentle ground (≤ ${GENTLE_DEG}°, within its radius)`),
      ...places.map((p) => row(`${names.get(p.id)?.num ?? ''} ${names.get(p.id)?.name ?? p.id}`, n.places[p.id] ?? 0, b?.places[p.id])));
  };

  worker.onmessage = (e: MessageEvent<{ id: number; n: Numbers; seen: Float32Array }>): void => {
    if (e.data.id !== runId) return;
    current = e.data.n;
    base ??= current;
    seen = e.data.seen;
    status.textContent = `${current.viewpoints} viewpoints`;
    renderPanel();
    if (layer === 'sight') paint();
  };

  // ------------------------------------------------------------------ places, drag, sightlines
  const k = 1000 / t.size;
  const toSvg = (x: number, z: number): [number, number] => [(x + t.size / 2) * k, (z + t.size / 2) * k];
  const lines = s('g');
  const live = h('div', { class: 'wd-label', style: 'min-height:16px;margin-top:6px' }, 'Drag a place: its numbers update; nothing saves.');
  svg.append(lines);
  for (const r of t.roads) {
    svg.append(s('polyline', { points: r.pts.map(([x, z]) => toSvg(x, z).join(',')).join(' '), fill: 'none', stroke: 'rgba(255,255,255,0.55)', 'stroke-width': 3 }));
  }
  const drawSight = (p: PlacePt): void => {
    lines.replaceChildren();
    const [x0, y0] = toSvg(p.x, p.z);
    for (const id of sightlines(field, p, places)) {
      const q = places.find((x) => x.id === id);
      if (!q) continue;
      const [x1, y1] = toSvg(q.x, q.z);
      lines.append(s('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: '#8fe3ff', 'stroke-width': 2, 'stroke-dasharray': '8 6', opacity: 0.8 }));
    }
  };
  for (const p of places) {
    const info = names.get(p.id);
    const [cx, cy] = toSvg(p.x, p.z);
    const disc = s('circle', { cx, cy, r: Math.max(14, p.r * k), fill: 'rgba(242,166,64,0.18)', stroke: '#f2a640', 'stroke-width': 3 });
    const label = s('text', { x: cx, y: cy + 7, 'text-anchor': 'middle', fill: '#fff', 'font-size': 22, 'font-weight': 700, 'font-family': 'JetBrains Mono, monospace', 'pointer-events': 'none' }, String(info?.num ?? ''));
    const g = s('g', { style: 'cursor:grab' }, disc, label);
    svg.append(g);
    g.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      g.setPointerCapture(e.pointerId);
      const rect = svg.getBoundingClientRect();
      const move = (ev: PointerEvent): void => {
        p.x = Math.max(-t.size / 2, Math.min(t.size / 2, ((ev.clientX - rect.left) / rect.width) * t.size - t.size / 2));
        p.z = Math.max(-t.size / 2, Math.min(t.size / 2, ((ev.clientY - rect.top) / rect.height) * t.size - t.size / 2));
        const [nx, ny] = toSvg(p.x, p.z);
        disc.setAttribute('cx', String(nx));
        disc.setAttribute('cy', String(ny));
        label.setAttribute('x', String(nx));
        label.setAttribute('y', String(ny + 7));
        live.textContent = `${info?.name ?? p.id}: ${placeGentlePct(field, slope, p.x, p.z, p.r)} % gentle here · sees ${sightlines(field, p, places).length} places`;
        drawSight(p);
      };
      const up = (): void => {
        g.removeEventListener('pointermove', move);
        g.removeEventListener('pointerup', up);
        g.removeEventListener('pointercancel', up);
        run();
      };
      g.addEventListener('pointermove', move);
      g.addEventListener('pointerup', up);
      g.addEventListener('pointercancel', up);
      move(e);
    });
  }

  // ------------------------------------------------------------------ the page
  const layerBar = h('div', { class: 'wd-subtabs' });
  const setLayer = (l: Layer): void => {
    layer = l;
    layerBar.replaceChildren(...LAYERS.map(([id, text]) => h('button', { class: `wd-subtab${id === layer ? ' wd-on' : ''}`, style: 'background:none;cursor:pointer', onclick: () => setLayer(id) }, text)));
    paint();
  };
  setLayer('painted');
  const reset = h('button', { class: 'wd-btn wd-btn-small', style: 'margin-top:10px', onclick: () => {
    places.forEach((p, i) => { const o = home[i]; if (o) { p.x = o.x; p.z = o.z; } });
    location.reload();
  } }, 'Reset the places');
  const walkBtn = h('button', { class: 'wd-btn', style: 'margin-top:12px', onclick: () => { void import('./walk').then((w) => w.openWalk(a, t, field, slope)); } }, 'Walk the terrain');
  const legend = h('div', { class: 'wd-map-legend' },
    h('span', null, h('span', { class: 'wd-swatch', style: 'background:rgb(80,170,90)' }), `≤ ${GENTLE_DEG}°`),
    h('span', null, h('span', { class: 'wd-swatch', style: 'background:rgb(200,190,70)' }), `≤ ${MAX_CLIMB_DEG}°`),
    h('span', null, h('span', { class: 'wd-swatch', style: 'background:rgb(150,150,150)' }), 'too steep'),
    h('span', null, h('span', { class: 'wd-swatch', style: 'background:rgb(230,80,60)' }), 'close'),
    h('span', null, h('span', { class: 'wd-swatch', style: 'background:rgb(240,170,60)' }), 'mid'),
    h('span', null, h('span', { class: 'wd-swatch', style: 'background:rgb(110,140,200)' }), 'far'));
  run();
  return h('div', { class: 'wd-page' },
    h('div', { class: 'wd-top' }, back, h('div', { class: 'wd-label wd-amber' }, 'Map Lab')),
    h('p', { class: 'wd-p wd-dimtext' }, 'The approved map\'s blockout with the dry run\'s maths (until T3–T5 land). Drag a place to try a what-if: nothing saves (J24).'),
    layerBar, box, live, legend, panel, walkBtn, reset, checks(a, t));
}

/** C: each map variant's checks (J31), the prototype's measured stats beside the approved map's. */
function checks(a: Atlas, t: Terrain): HTMLElement {
  if (t.variants.length === 0) return h('div');
  const head = ['', ...t.variants.map((v) => v.id)];
  const rows: [string, (v: Terrain['variants'][number]) => string][] = [
    ['Places in region', (v) => `${v.stats.places_in_region} / ${v.stats.places_total}`],
    ['Walkable of land', (v) => `${v.stats.walkable_pct_of_land} %`],
    ['Gentle of land', (v) => `${v.stats.gentle_lt30_pct_of_land} %`],
    ['Close band', (v) => `${v.stats.bands_pct.close_le30m} %`],
    ['Mid band', (v) => `${v.stats.bands_pct.mid_30_80m} %`],
    ['Far band', (v) => `${v.stats.bands_pct.far_gt80m} %`],
    ['Never seen', (v) => `${v.stats.bands_pct.unseen} %`],
  ];
  const cell = 'padding:5px 6px;border-bottom:1px solid rgba(143,227,255,0.1);text-align:right';
  return h('div', { class: 'wd-section' },
    h('span', { class: 'wd-label' }, 'The variants\' checks (prototype PA / PB1, measured)'),
    h('table', { style: 'width:100%;border-collapse:collapse;font-size:12px' },
      h('thead', null, h('tr', null, head.map((x) => h('th', { class: 'wd-label', style: cell }, x)))),
      h('tbody', null, rows.map(([label, f]) => h('tr', null, h('td', { class: 'wd-label', style: `${cell};text-align:left` }, label), t.variants.map((v) => h('td', { style: cell }, f(v))))))),
    h('p', { class: 'wd-p wd-dimtext', style: 'font-size:11px' }, `The approved map (${a.name}, revision 2) is the live numbers above.`));
}
