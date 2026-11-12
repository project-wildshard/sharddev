// Where a draft's sources are read from (DRAFTS DR2, D5). A draft's own files live in sharddev: draft.json,
// content.json, images.json and the generated drafts/public/data/. Its originals (the art rounds, the design docs, the
// cameras, the map's scene and spec) stay where the run made them, and the tools read them through `--sources <dir>`:
// for Thin Ice, the singleplayer checkout. Without originals, the committed atlas.json and images.json stand in for
// them, so `atlas.ts --check` and the tests run on a machine (or CI) that has no singleplayer checkout.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Atlas, DesignDoc, Terrain, VariantStats } from '../src/atlas.ts';
import { diskListing, type DraftConfig, type DraftContent, type Listing } from './build-atlas.ts';
import type { ImageIndex } from './images.ts';

/** sharddev's checkout */
export const ROOT = resolve(import.meta.dirname, '..', '..');
export const SHARDS = join(ROOT, 'drafts', 'shards');
export const OUT = join(ROOT, 'drafts', 'public', 'data');

export type Cams = Record<string, { eye: [number, number, number]; look: [number, number, number] }>;

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- JSON.parse is untyped; the caller names the file's shape
export const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;

export interface DraftSources {
  config: DraftConfig;
  content: DraftContent;
  cams: Cams;
  terrain: Terrain | null;
  design: DesignDoc[];
  index: ImageIndex;
  indexPath: string;
  listing: Listing;
  /** the originals' root (`--sources`), or null when the committed copies stand in for them */
  sources: string | null;
}

/** Path segments compare one at a time, as a sorted depth-first walk visits them. */
function byPath(a: string, b: string): number {
  const x = a.split('/');
  const y = b.split('/');
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const p = x[i] ?? '';
    const q = y[i] ?? '';
    if (p !== q) return p < q ? -1 : 1;
  }
  return x.length - y.length;
}

/** The art folder as images.json and the committed atlas remember it: every published picture, each round's README
 * fields. Only the pictures images.json knows are listed, so a new picture needs its originals (`--publish`). */
export function committedListing(art: string, index: ImageIndex, committed: Atlas | null): Listing {
  const byRound = new Map<string, string[]>();
  for (const r of committed?.rounds ?? []) byRound.set(r.id, []);
  const prefix = `${art}/`;
  for (const source of Object.keys(index)) {
    if (!source.startsWith(prefix)) continue;
    const rest = source.slice(prefix.length);
    const cut = rest.indexOf('/');
    if (cut < 0) continue;
    const round = rest.slice(0, cut);
    const list = byRound.get(round) ?? [];
    list.push(rest.slice(cut + 1));
    byRound.set(round, list);
  }
  const rounds = new Map((committed?.rounds ?? []).map((r) => [r.id, r]));
  return {
    rounds: () => [...byRound.keys()],
    files: (round) => [...(byRound.get(round) ?? [])].sort(byPath),
    readme: (round) => {
      const r = rounds.get(round);
      return r ? { title: r.title, note: r.note, made: r.made, verdict: r.verdict } : null;
    },
  };
}

/** Map Lab's data: the blockout's binaries (already under drafts/public/data/<slug>/), the scene's roads, the spec's radii. */
function loadTerrain(config: DraftConfig, sources: string): Terrain | null {
  const t = config.terrain;
  if (!t) return null;
  interface Scene { S: number; roads: Record<string, { w: number; pts: [number, number][] }>; places: Record<string, [number, number]> }
  interface Spec { regions: { id: string; color: string; walkable: boolean }[]; places: { id: string; r: number }[] }
  const scene = readJson<Scene>(join(sources, t.scene));
  const spec = readJson<Spec>(join(sources, t.spec));
  for (const f of [t.heights, t.labels]) {
    if (!existsSync(join(OUT, config.slug, f))) throw new Error(`${config.slug}: terrain file drafts/public/data/${config.slug}/${f} is missing`);
  }
  return {
    heights: t.heights, labels: t.labels, res: t.res, size: scene.S,
    cats: spec.regions.map((r) => ({ id: r.id, color: r.color, walkable: r.walkable })),
    roads: Object.entries(scene.roads).map(([name, r]) => ({ name, w: r.w, pts: r.pts })),
    places: Object.entries(scene.places).map(([id, [x, z]]) => ({
      id: t.placeIds[id] ?? id, x, z, r: spec.places.find((p) => p.id === id)?.r ?? 0,
    })),
    variants: t.variants.map((v) => ({ id: v.id, title: v.title, stats: readJson<VariantStats>(join(ROOT, v.stats)) })),
  };
}

/** The draft's design documents: every .md in its design folder, design.md first (W1: the design is part of the draft). */
function loadDesign(config: DraftConfig, sources: string): DesignDoc[] {
  const dir = join(sources, config.design);
  if (!config.design || !existsSync(dir)) return [];
  const names = readdirSync(dir).filter((n) => n.endsWith('.md') && n !== 'README.md').sort((a, b) => (a === 'design.md' ? -1 : b === 'design.md' ? 1 : a.localeCompare(b)));
  return names.map((name) => ({ name, text: readFileSync(join(dir, name), 'utf8') }));
}

/** One draft's inputs. `sources` is the originals' root; null (or a root without the draft's art) uses the committed copies. */
export function loadDraft(slug: string, sources: string | null): DraftSources {
  const dir = join(SHARDS, slug);
  const config = readJson<DraftConfig>(join(dir, 'draft.json'));
  const content = readJson<DraftContent>(join(ROOT, config.content));
  const indexPath = join(dir, 'images.json');
  const index: ImageIndex = existsSync(indexPath) ? readJson<ImageIndex>(indexPath) : {};
  const root = sources === null ? null : resolve(sources);
  if (root !== null && existsSync(join(root, config.art))) {
    const cams = config.cams ? readJson<Cams>(join(root, config.cams)) : {};
    return {
      config, content, cams, terrain: loadTerrain(config, root), design: loadDesign(config, root), index, indexPath,
      listing: diskListing(join(root, config.art)), sources: root,
    };
  }
  const atlasPath = join(OUT, slug, 'atlas.json');
  const committed = existsSync(atlasPath) ? readJson<Atlas>(atlasPath) : null;
  const cams: Cams = Object.fromEntries((committed?.cams ?? []).map((c) => [c.id, { eye: c.eye, look: c.look }]));
  return {
    config, content, cams, terrain: committed?.terrain ?? null, design: committed?.design ?? [], index, indexPath,
    listing: committedListing(config.art, index, committed), sources: null,
  };
}
