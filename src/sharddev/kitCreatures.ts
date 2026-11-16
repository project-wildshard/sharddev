// oxlint-disable-next-line import/no-nodejs-modules -- The SDK copies immutable kit assets at build time.
import { readFile } from 'node:fs/promises';
import { parseSkinFile, validateSkinAssets } from '@wildshard/format/skinAssets';
import { parseRows, type ShardRows } from '@wildshard/format/rows';
import type { Shardfile } from '@wildshard/format/shardSchema';
import { commonCreature, type CommonCreatureKind } from '@wildshard/kit/creatures';
import catalogue from '@wildshard/kit/content/animated/catalogue.json' with { type: 'json' };
import { encodeCanonicalJson, hashImmutableBytes } from './immutable.ts';

export interface KitCreatureOptions {
  readonly id: string;
  readonly look: string;
  readonly family: 'pbr' | 'toon';
  readonly strike?: string;
  /** Explicit variant-id to shipped body-variant overrides; omitted entries keep their kit body. */
  readonly skins?: Readonly<Record<string, string>>;
}
export interface KitCreatureProduct {
  readonly items: NonNullable<Shardfile['items']['catalogue']>;
  readonly species: ShardRows['species'][number];
  readonly strikes: ShardRows['strikes'];
  readonly look: ShardRows['looks'][number];
  readonly files: Shardfile['files'];
  readonly library: string[];
  readonly assets: ReadonlyMap<string, Uint8Array>;
}

/** Copy a complete ordinary creature look and its admitted variant asset closure, with no engine owner. */
export async function kitCreature(kind: CommonCreatureKind, options: KitCreatureOptions): Promise<KitCreatureProduct> {
  const content = commonCreature(kind, options), assets = new Map<string, Uint8Array>(), files = new Map<string, Shardfile['files'][number]>();
  const variants = new Set(content.species.variants.map(row => row.id));
  for (const id of Object.keys(options.skins ?? {})) if (!variants.has(id)) throw new Error(`Unknown kit creature variant: ${id}`);
  const skins: Record<string, string> = {};
  for (const variant of content.species.variants) {
    const body = options.skins?.[variant.id] ?? variant.id;
    const entry = catalogue.find(row => row.kind === kind && row.family === options.family && row.variant === body);
    if (entry === undefined) throw new Error(`Unknown kit ${kind} ${options.family} body: ${body}`);
    skins[variant.id] = entry.skinHash;
    if (assets.has(entry.skinHash)) continue;
    const skin = new Uint8Array(await readFile(new URL(import.meta.resolve(`@wildshard/kit/content/animated/${entry.skin}`))));
    const glb = new Uint8Array(await readFile(new URL(import.meta.resolve(`@wildshard/kit/content/animated/${entry.glb}`))));
    if (skin.length !== entry.skinBytes || glb.length !== entry.bytes || hashImmutableBytes(skin) !== entry.skinHash || hashImmutableBytes(glb) !== entry.glbHash) throw new Error(`Kit creature bytes differ: ${entry.skin}`);
    const { row } = parseSkinFile(skin);
    assets.set(entry.skinHash, skin); assets.set(entry.glbHash, glb);
    files.set(entry.skinHash, { hash: entry.skinHash, kind: 'json', compressed: skin.length, decoded: skin.length * 2, gpu: 0, triangles: 0, draws: 0, dependencies: [entry.glbHash], critical: false });
    files.set(entry.glbHash, { hash: entry.glbHash, kind: 'glb', compressed: glb.length, ...row.cost, dependencies: [], critical: false });
  }
  const [first] = content.species.variants, skin = first === undefined ? undefined : skins[first.id];
  if (skin === undefined) throw new Error('Kit creature has no default skin');
  const table = new TextEncoder().encode(encodeCanonicalJson({ version: 1, skins })), hash = hashImmutableBytes(table);
  files.set(hash, { hash, kind: 'json', compressed: table.length, decoded: table.length * 2, gpu: 0, triangles: 0, draws: 0, dependencies: [...new Set(Object.values(skins))], critical: false });
  assets.set(hash, table);
  const rows = parseRows({ species: [content.species], strikes: content.strikes, weather: [], days: [], compendiums: [], loot: [],
    looks: [{ id: options.look, species: options.id, recipe: 'platform.skin', material: null, parameters: { skin, variants: hash }, animation: { recipe: 'platform.clips', parameters: { attackSpan: 1 } } }] });
  const [look] = rows.looks;
  if (look === undefined) throw new Error('Kit creature has no look');
  validateSkinAssets({ rows, files: [...files.values()], look: { materials: {} } }, assets);
  return { species: content.species, strikes: content.strikes, items: content.items, look, files: [...files.values()], library: [skin, hash], assets };
}
