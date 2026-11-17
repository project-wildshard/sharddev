// A draft's map with an SVG overlay in world metres (x east, z south, centred; the painted map spans `size` m).
import { itemById, type Atlas, type Cam } from './atlas';
import { itemUrl } from './data';
import { h, s } from './dom';

export interface MapView {
  el: HTMLElement;
  svg: SVGSVGElement;
  /** World metres → overlay units (0..1000). */
  at: (x: number, z: number) => [number, number];
}

export function mapView(atlas: Atlas, opts: { dim?: number; thumb?: boolean } = {}): MapView | null {
  if (!atlas.map) return null;
  const it = itemById(atlas, atlas.map.item);
  if (!it) return null;
  const size = atlas.map.size;
  const at = (x: number, z: number): [number, number] => [((x + size / 2) / size) * 1000, ((z + size / 2) / size) * 1000];
  const img = h('img', { src: itemUrl(atlas, it, opts.thumb ? 'thumb' : 'full'), alt: it.title, decoding: 'async' });
  if (opts.dim) img.style.filter = `brightness(${1 - opts.dim})`;
  const svg = s('svg', { viewBox: '0 0 1000 1000', preserveAspectRatio: 'none' });
  const el = h('div', { class: 'wd-map' }, img, svg);
  return { el, svg, at };
}

export function pin(m: MapView, x: number, z: number, label: string, color: string, onTap?: () => void, r = 18): SVGGElement {
  const [px, py] = m.at(x, z);
  const g = s('g', { style: onTap ? 'cursor:pointer' : undefined, onclick: onTap ? () => onTap() : undefined },
    s('circle', { cx: px, cy: py, r: r + 10, fill: 'transparent' }),
    s('circle', { cx: px, cy: py, r, fill: 'rgba(8,18,27,0.85)', stroke: color, 'stroke-width': 3 }),
    s('text', { x: px, y: py + 6, 'text-anchor': 'middle', fill: color, 'font-size': 18, 'font-family': 'JetBrains Mono, monospace', 'font-weight': 700 }, label),
  );
  m.svg.append(g);
  return g;
}

export function polyline(m: MapView, pts: [number, number][], color: string, width = 8, dash?: string): void {
  const d = pts.map(([x, z]) => m.at(x, z).join(',')).join(' ');
  m.svg.append(s('polyline', { points: d, fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': dash, opacity: 0.9 }));
}

/** A camera's view cone on the map: its eye, its look direction, a 72° vertical-FOV portrait frame (~38° across). */
export function cone(m: MapView, cam: Cam, color: string, reach = 90, halfDeg = 19): void {
  const [ex, , ez] = cam.eye;
  const [lx, , lz] = cam.look;
  const yaw = Math.atan2(lz - ez, lx - ex);
  const a = (halfDeg * Math.PI) / 180;
  const p1: [number, number] = [ex + Math.cos(yaw - a) * reach, ez + Math.sin(yaw - a) * reach];
  const p2: [number, number] = [ex + Math.cos(yaw + a) * reach, ez + Math.sin(yaw + a) * reach];
  const d = [m.at(ex, ez), m.at(p1[0], p1[1]), m.at(p2[0], p2[1])].map((p) => p.join(',')).join(' ');
  m.svg.append(s('polygon', { points: d, fill: color, 'fill-opacity': 0.22, stroke: color, 'stroke-width': 2 }));
  const [cx, cy] = m.at(ex, ez);
  m.svg.append(s('circle', { cx, cy, r: 7, fill: color }));
}

export const LANE_COLORS: Record<number, string> = { 1: '#f2a640', 2: '#5ae1c8', 3: '#be82ff', 4: '#ffd666' };
