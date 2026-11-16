// SHARD-SOURCE AP9a: budgets are a report. `wildshard build` and `check` print one table for a scene shard: each part's
// triangles, materials (its view draws: the engine draws a material once across tiles, AP8) and the fine tile it fills
// most, against each tier's caps; every tile over a tier's cap is named with the parts that fill it, the largest first.
// Caps are reported, not enforced (J338). The desktop tier has no tile triangle cap until AP9b gives the format one.
import { CONTENT_CAPS } from '@wildshard/format/contentBounds';
import { VIEW_DRAWS } from '@wildshard/format/viewDraws';
import type { ShardScene } from './description';

/** A tier's caps: triangles in one fine (L0) tile, and the draws one view may cost. `null`: no cap on that tier yet. */
export interface TierCaps { readonly tileTriangles: number | null; readonly viewDraws: number }
/** The caps each tier is reported against (format `CONTENT_CAPS` and `VIEW_DRAWS`). */
export const TIER_CAPS: Readonly<Record<'phone' | 'desktop', TierCaps>> = {
  phone: { tileTriangles: CONTENT_CAPS.l0.triangles, viewDraws: VIEW_DRAWS.phone },
  desktop: { tileTriangles: null, viewDraws: VIEW_DRAWS.desktop },
};

/** One part's share of the budget. Tile triangles are counted at each mesh or instance's origin, so a share is close. */
export interface PartBudget {
  readonly part: string;
  readonly triangles: number;
  readonly materials: number;
  /** triangles per fine tile (`0/x/z`), counted at each copy's origin */
  readonly tiles: ReadonlyMap<string, number>;
}

/** A built tile as the back end measured it (merged and clipped). */
export interface BuiltTile { readonly tile: string; readonly triangles: number; readonly draws: number }

const TILE = 62.5, HALF = 250;
const tileOf = (value: number): number => Math.min(7, Math.max(0, Math.floor((value + HALF) / TILE)));
const address = (x: number, z: number): string => `0/${String(tileOf(x))}/${String(tileOf(z))}`;

/** Every part's triangles, materials and per-tile triangles. */
export function partBudgets(scene: Pick<ShardScene, 'parts' | 'geometries'>): PartBudget[] {
  return scene.parts.map((part) => {
    const tiles = new Map<string, number>(), add = (tile: string, n: number): void => { tiles.set(tile, (tiles.get(tile) ?? 0) + n); };
    let triangles = 0;
    for (const draw of part.draws) {
      const one = scene.geometries[draw.geometry]?.triangles ?? 0, m = draw.matrix;
      if (draw.instances === null) { triangles += one; add(address(m[12] ?? 0, m[14] ?? 0), one); continue; }
      const { count, matrices } = draw.instances;
      triangles += one * count;
      for (let i = 0; i < count; i++) {
        // the instance's origin in world space: the mesh's matrix times the instance's translation
        const lx = matrices[i * 16 + 12] ?? 0, ly = matrices[i * 16 + 13] ?? 0, lz = matrices[i * 16 + 14] ?? 0;
        const wx = (m[0] ?? 1) * lx + (m[4] ?? 0) * ly + (m[8] ?? 0) * lz + (m[12] ?? 0);
        const wz = (m[2] ?? 0) * lx + (m[6] ?? 0) * ly + (m[10] ?? 1) * lz + (m[14] ?? 0);
        add(address(wx, wz), one);
      }
    }
    for (const sprite of part.sprites) { triangles += 2; add(address(sprite.position[0], sprite.position[2]), 2); }
    for (const cloud of part.points) for (let i = 0; i < cloud.positions.length; i += 3) { triangles += 2; add(address(cloud.positions[i] ?? 0, cloud.positions[i + 2] ?? 0), 2); }
    return { part: part.panel ?? part.name, triangles, materials: new Set(part.draws.map((d) => d.material)).size, tiles };
  });
}

const n = (value: number): string => value.toLocaleString('en-US');

/** The report's lines: the per-part table, then each overrun by tier, naming the tile and the parts that fill it. */
export function budgetReport(parts: readonly PartBudget[], built: readonly BuiltTile[], caps: Readonly<Record<string, TierCaps>> = TIER_CAPS): string[] {
  const sorted = [...parts].sort((a, b) => b.triangles - a.triangles || a.part.localeCompare(b.part));
  const worst = (p: PartBudget): [string, number] => [...p.tiles].reduce<[string, number]>((best, t) => (t[1] > best[1] ? t : best), ['-', 0]);
  const tiers = Object.keys(caps);
  const head = ['part', 'triangles', 'materials', 'worst tile', ...tiers];
  const rows = sorted.map((p) => {
    const [tile, tris] = worst(p);
    const verdicts = tiers.map((tier) => {
      const cap = caps[tier]; if (cap === undefined) return '';
      const over = [cap.tileTriangles !== null && tris > cap.tileTriangles ? 'tile tris' : null, p.materials > cap.viewDraws ? 'draws' : null].filter((x) => x !== null);
      return over.length === 0 ? 'ok' : `over: ${over.join(', ')}`;
    });
    return [p.part, n(p.triangles), String(p.materials), tile === '-' ? '-' : `${tile} ${n(tris)}`].concat(verdicts);
  });
  const total = parts.reduce((s, p) => s + p.materials, 0);
  rows.push(['(all parts)', n(parts.reduce((s, p) => s + p.triangles, 0)), String(total), '', ...tiers.map((tier) => { const cap = caps[tier]; return cap === undefined || total <= cap.viewDraws ? 'ok' : `over: draws ${String(total)} > ${String(cap.viewDraws)}`; })]);
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  const line = (cells: readonly string[]): string => cells.map((c, i) => (i === 1 || i === 2 ? c.padStart(widths[i] ?? 0) : c.padEnd(widths[i] ?? 0))).join('  ').trimEnd();
  const out = [`budget (AP9): ${String(parts.length)} parts; caps ${tiers.map((tier) => { const cap = caps[tier]; return cap === undefined ? tier : `${tier} ${cap.tileTriangles === null ? 'no tile cap' : `${n(cap.tileTriangles)} tris a tile`}, ${String(cap.viewDraws)} draws a view`; }).join('; ')} (reported, J338)`, `  ${line(head)}`, ...rows.map((r) => `  ${line(r)}`)];
  for (const tier of tiers) {
    const cap = caps[tier]; if (cap === undefined || cap.tileTriangles === null) continue;
    for (const t of built.filter((b) => b.triangles > (cap.tileTriangles ?? Infinity)).sort((a, b) => b.triangles - a.triangles)) {
      const fill = parts.map((p) => [p.part, p.tiles.get(t.tile) ?? 0] as const).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
      out.push(`over ${tier}: tile ${t.tile} ${n(t.triangles)} tris > ${n(cap.tileTriangles)}: ${fill.slice(0, 4).map(([p, v]) => `${p} ${n(v)}`).join(', ')}${fill.length > 4 ? `, ${String(fill.length - 4)} more` : ''}`);
    }
  }
  return out;
}
