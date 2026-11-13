// oxlint-disable-next-line import/no-nodejs-modules -- Author builds emit immutable product files.
import { mkdirSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- The caller supplies its owned output directory.
import { resolve } from 'node:path';
import type { ScriptAdmissionRows } from '@wildshard/format/scriptContract';
import { parseShardfile, type Shardfile } from '@wildshard/format/shardSchema';
import { admitShardfileProduct, assertProductTargets as assertTargets } from '@wildshard/format/productValidation';
import { offlineMemoryAdmission, prepareAssetDecoders } from '@wildshard/format/product';
import { validationRevision, validationSourceBytes } from '@wildshard/format/validationReceipt';
import { preflightDeclaredCosts } from '@wildshard/format/assetAdmission';
import { CLIENT_FEATURE_SIDES, unsidedKinds } from '@wildshard/format/featureSides';
import { PAGE_ONLY_PROGRAM_HOSTS, SCRIPT_V1_VIEW_COMMANDS } from '@wildshard/format/scriptSides';
import { encodeCanonicalJson, hashImmutableBytes } from './immutable';
import { hashAssetBytes } from './assetHandle';

// Author-only facade: direct synchronous writers need the same readiness as the CLI.
await prepareAssetDecoders();

/** Refuse the same target overages as the author CLI; warning policy belongs only to trusted checkout callers. */
export function assertProductTargets(source: Shardfile, policy: 'warn' | 'refuse'): void {
  // Execution has not run yet; report only the targets actually checked.
  assertTargets(source, policy);
}

/** The sections SERVER-PARITY's side refusals read (SS2 kinds, SS7 scripts). */
export const SIDE_SECTIONS: readonly string[] = ['client/plan', 'sim/scripts', 'actors/return-scripts', 'actors/spawn-scripts'];
const SCRIPT_SECTIONS = ['sim/scripts', 'actors/return-scripts', 'actors/spawn-scripts'] as const;
const prop = (value: unknown, key: string): unknown => typeof value === 'object' && value !== null && !Array.isArray(value) && Object.hasOwn(value, key) ? Reflect.get(value, key) : undefined;
const text = (value: unknown, key: string): string | undefined => { const found = prop(value, key); return typeof found === 'string' ? found : undefined; };
const list = (value: unknown): readonly unknown[] => Array.isArray(value) ? value : [];

/** A `view` script row that emits a gameplay command, as one plain line, or nothing (SS7's row rule, with the script named). */
export function viewGameplayLine(row: unknown): string[] {
  if (text(row, 'side') !== 'view') return [];
  const writes = list(prop(row, 'commands')).filter((name): name is string => typeof name === 'string' && !SCRIPT_V1_VIEW_COMMANDS.has(name as never));
  return writes.length === 0 ? [] : [`side refused: script ${text(row, 'id') ?? '(no id)'} declares view, missing its server half: it emits ${writes.join(', ')}, which write gameplay (declare it sim)`];
}

/**
 * SERVER-PARITY SS8: every SS2 and SS7 refusal in a build's sections, one plain line each, naming the kind or script, its
 * declared side and the half nothing runs. The same rules format admission applies to the written folder (`feature-sides.ts`,
 * `script-sides.ts`), said at build time so an author reads which row to fix before anything is written or uploaded.
 * `named` reads a named JSON file of the product by name (a `page.life` feature's `file`).
 */
export function sideRefusalLines(sections: ReadonlyMap<string, unknown>, named: (name: string) => unknown): string[] {
  const lines = unsidedKinds(sections.get('client/plan')).map(entry => {
    const [where = '', kind = ''] = entry.split(' ');
    return `side refused: ${where === 'world.assembly' ? 'world.assembly stage' : 'client/plan kind'} ${kind} declares no side, missing its view, both or server entry in shardfile feature-sides.ts`;
  });
  const returns = list(sections.get('actors/return-scripts'));
  for (const feature of list(prop(sections.get('client/plan'), 'features'))) {
    const kind = text(feature, 'kind') ?? '', host = PAGE_ONLY_PROGRAM_HOSTS.get(kind), file = text(feature, 'file');
    if (host === undefined || file === undefined) continue;
    const script = host.reduce<unknown>((value, key) => prop(value, key), named(file));
    if (script === undefined) continue;
    const id = text(script, 'id') ?? '(no id)', admitted = returns.find(row => text(row, 'id') === id);
    const side = CLIENT_FEATURE_SIDES[kind as keyof typeof CLIENT_FEATURE_SIDES].side;
    if (admitted === undefined || encodeCanonicalJson(admitted) !== encodeCanonicalJson(script)) lines.push(`side refused: ${kind} program ${id} (${file}) is not its actors/return-scripts row, so it has no admitted side`);
    else if (text(admitted, 'side') === 'sim') lines.push(`side refused: script ${id} declares sim, missing its server half: only ${kind} (${side}) runs it, from ${file}`);
  }
  for (const row of list(sections.get('sim/scripts'))) if (text(row, 'side') === 'view') lines.push(`side refused: script ${text(row, 'id') ?? '(no id)'} declares view, missing its page half: it sits in sim/scripts, which only the server runs`);
  for (const name of SCRIPT_SECTIONS) for (const row of list(sections.get(name))) lines.push(...viewGameplayLine(row));
  return [...new Set(lines)];
}

/** A reader of a build's named JSON files by name, from its named-file rows and asset bytes: `undefined` when absent or not JSON. */
export function namedJsonReader(files: readonly { readonly name?: string | undefined; readonly kind: string; readonly hash: string }[], assets: ReadonlyMap<string, Uint8Array>): (name: string) => unknown {
  return (name) => {
    const file = files.find(row => row.kind === 'json' && row.name === name), bytes = file === undefined ? undefined : assets.get(file.hash);
    if (bytes === undefined) return undefined;
    try { const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes)); return parsed; } catch { return undefined; }
  };
}

/** Refuse a build whose sections carry a side refusal: each line is printed, then the build fails with them all. */
export function assertBuildSides(sections: ReadonlyMap<string, unknown>, named: (name: string) => unknown): void {
  const lines = sideRefusalLines(sections, named);
  if (lines.length === 0) return;
  throw new Error(lines.join('\n'));
}

/** Each product admitProduct returned: the assets map, policy and script rows it was admitted with, and its exact JSON then
 *  (by object identity only: a different object, even an equal one, is admitted in full) */
const admitted = new WeakMap<object, { readonly assets: ReadonlyMap<string, Uint8Array>; readonly policy: 'warn' | 'refuse'; readonly scripts: string; readonly snapshot: string }>();

/** Admit declared costs and actual immutable bytes through the browser's defining contracts, without a config loader. */
export function admitProduct(input: unknown, assets: ReadonlyMap<string, Uint8Array>, policy: 'warn' | 'refuse' = 'refuse', scripts: ScriptAdmissionRows = []): Shardfile {
  const product = admitShardfileProduct(input, assets, hashAssetBytes, policy, scripts);
  rememberAdmitted(product, assets, policy, scripts);
  return product;
}

/** Record a product format validation just admitted, so a writer handed that same object does not admit it twice. */
export function rememberAdmitted(product: Shardfile, assets: ReadonlyMap<string, Uint8Array>, policy: 'warn' | 'refuse', scripts: ScriptAdmissionRows): void {
  admitted.set(product, { assets, policy, scripts: JSON.stringify(scripts), snapshot: JSON.stringify(product) });
}

/**
 * CI6: the product this very call chain just admitted, handed straight back to a writer that would admit it again: the same
 * object admitProduct returned, with the same assets map, policy and script rows, and JSON unchanged since (nothing wrote
 * to it). Its admission's own result then is a fresh parse of it; any other input (a copy, a mutated object, another map
 * or policy) returns null and takes the full admission. The written folder's own re-admission never depends on this.
 */
export function readmitted(input: unknown, assets: ReadonlyMap<string, Uint8Array>, policy: 'warn' | 'refuse', scripts: ScriptAdmissionRows): Shardfile | null {
  if (typeof input !== 'object' || input === null) return null;
  const row = admitted.get(input);
  if (row === undefined || row.assets !== assets || row.policy !== policy || row.scripts !== JSON.stringify(scripts) || row.snapshot !== JSON.stringify(input)) return null;
  return parseShardfile(input);
}

/** Emit a complete product: canonical shard.json, every charged local/commons asset and the informational validation receipt.
 * Config builds and author-only cold producers share this writer. No client, runtime, cache or retained product is read.
 * Default admission refuses overages; a trusted caller alone may request the existing warning policy. */
export function writeProduct(input: unknown, assets: ReadonlyMap<string, Uint8Array>, destination: string, policy: 'warn' | 'refuse' = 'refuse'): Shardfile {
  const shard = admitProduct(input, assets, policy);
  shard.files.sort((a, b) => a.hash.localeCompare(b.hash));
  shard.tiles.sort((a, b) => a.lod - b.lod || a.x - b.x || a.z - b.z);
  mkdirSync(destination, { recursive: true });
  const emitted = new Set<string>();
  for (const [ref, bytes] of assets) {
    const hash = ref.replace('commons:', '');
    if (emitted.has(hash)) continue;
    writeFileSync(resolve(destination, hash), bytes); emitted.add(hash);
  }
  writeFileSync(resolve(destination, 'shard.json'), encodeCanonicalJson(shard));
  writeFileSync(resolve(destination, 'validation.json'), encodeCanonicalJson({ revision: validationRevision(), sourceHash: hashImmutableBytes(validationSourceBytes(shard)), worst: preflightDeclaredCosts(shard, offlineMemoryAdmission(policy)).worst }));
  return shard;
}
