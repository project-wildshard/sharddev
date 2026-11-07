// oxlint-disable-next-line import/no-nodejs-modules -- Build admission compares every byte with the native comparator.
import { Buffer } from 'node:buffer';
// oxlint-disable-next-line import/no-nodejs-modules -- Proxy inputs retain their original getter/callback path.
import { isProxy } from 'node:util/types';
import { parseRiggedHullBook } from '@wildshard/format/riggedHulls';
import { AdmissionLateSchema, lateLibraryRootsValid, type AdmissionLate, type LateFile } from '@wildshard/format/admissionLate';
import * as v from 'valibot';
import { ScriptContractSchema, decisionModuleContracts, type ScriptContractInput, type ScriptContract } from '@wildshard/format/scriptContract';
import { OutputIndexSchema, type OutputFile } from '@wildshard/format/outputIndex';
import { ShardNaturalSchema } from '@wildshard/format/shardSections';
import { parseShardfile, type Shardfile } from '@wildshard/engine/host/shardfile';
import { readNamedBlob, emitNamedBlobs, nameBlob, type NamedBlob, type ServerBlob } from './blobs';
import { encodeCanonicalJson } from '@wildshard/engine/host/immutable';
import { copyAssetBytes, hashAssetBytes } from './assetHandle';
import { defineMirror, type RuntimeMirror } from './runtimeMirrors';
import type { EmittedSections } from './sections';
import { outputDecisionScripts, outputScriptAdmissionRows, type OutputProductOptions } from './outputProduct';
import { prepareProjectDecisions, replacedDecisionBlob, decisionBlobNames } from './projectDecisions';
import type { DecisionBuildOptions } from './buildDecisionScripts';

const bytes = v.custom<Uint8Array>(value => value instanceof Uint8Array);
const assetMap = v.map(v.string(), bytes);
const emitted = v.strictObject({ sections: OutputIndexSchema.entries.sections, files: assetMap });
const options = v.strictObject({
  decoded: v.exactOptional(ShardNaturalSchema), gpu: v.exactOptional(ShardNaturalSchema),
  triangles: v.exactOptional(ShardNaturalSchema), draws: v.exactOptional(ShardNaturalSchema),
  script: v.exactOptional(ScriptContractSchema),
  jsonSchema: v.exactOptional(v.record(v.string(), v.unknown())),
  meshopt: v.exactOptional(v.boolean()), critical: v.exactOptional(v.boolean()), dependencies: v.exactOptional(v.array(v.string())),
});
const declaration: v.StrictObjectSchema<{ readonly name: v.StringSchema<undefined>; readonly kind: v.PicklistSchema<["glb", "ktx2", "image", "audio", "wasm", "bin", "tile", "json"], undefined>; readonly source: v.StringSchema<undefined>; readonly options: v.ExactOptionalSchema<v.StrictObjectSchema<{ readonly decoded: v.ExactOptionalSchema<v.GenericSchema<number, number>, undefined>; readonly gpu: v.ExactOptionalSchema<v.GenericSchema<number, number>, undefined>; readonly triangles: v.ExactOptionalSchema<v.GenericSchema<number, number>, undefined>; readonly draws: v.ExactOptionalSchema<v.GenericSchema<number, number>, undefined>; readonly script: v.ExactOptionalSchema<v.GenericSchema<ScriptContractInput, ScriptContract>, undefined>; readonly jsonSchema: v.ExactOptionalSchema<v.RecordSchema<v.StringSchema<undefined>, v.UnknownSchema, undefined>, undefined>; readonly meshopt: v.ExactOptionalSchema<v.BooleanSchema<undefined>, undefined>; readonly critical: v.ExactOptionalSchema<v.BooleanSchema<undefined>, undefined>; readonly dependencies: v.ExactOptionalSchema<v.ArraySchema<v.StringSchema<undefined>, undefined>, undefined>; }, undefined>, undefined>; }, undefined> = v.strictObject({
  name: v.string(), kind: v.picklist(['glb', 'ktx2', 'image', 'audio', 'wasm', 'bin', 'tile', 'json']),
  source: v.string(), options: v.exactOptional(options),
});
const output = v.strictObject({
  blobs: v.optional(v.pipe(v.array(declaration), v.maxLength(8192)), []),
  platform: v.exactOptional(emitted),
  late: v.exactOptional(AdmissionLateSchema),
  server: v.exactOptional(v.pipe(v.array(v.custom<ServerBlob>(row => typeof row === 'object' && row !== null && 'file' in row && 'bytes' in row && row.bytes instanceof Uint8Array)), v.maxLength(256))),
  namedFiles: v.optional(OutputIndexSchema.entries.files, []), assets: v.optional(assetMap, () => new Map()),
});

/** Build-only config export: source paths are resolved by the CLI, never by author module side effects. */
export interface ProjectOutput extends Omit<OutputProductOptions, 'runtime' | 'discovery'> {
  /** Existing or newly emitted library hashes; merged only after blob admission establishes every root. */
  readonly late?: readonly LateFile[];
  readonly blobs?: readonly v.InferOutput<typeof declaration>[];
  readonly assets?: ReadonlyMap<string, Uint8Array>;
}
/** Prepared extensions and new named bytes, still subject to complete product/disk admission. */
export interface PreparedProjectOutput {
  readonly late?: AdmissionLate;
  readonly blobs: readonly NamedBlob[];
  readonly options: Omit<OutputProductOptions, 'runtime'>;
  readonly assets: ReadonlyMap<string, Uint8Array>;
}

function ownedAssets(input: ReadonlyMap<string, Uint8Array>): Map<string, Uint8Array> {
  const assets = new Map<string, Uint8Array>();
  for (const [hash, value] of input) {
    if (hashAssetBytes(value) !== hash) throw new Error('Authored output asset hash differs from its bytes');
    assets.set(hash, copyAssetBytes(value));
  }
  return assets;
}
function ownedSections(input: EmittedSections): EmittedSections {
  return { sections: input.sections.map(row => ({ ...row })), files: new Map([...input.files].map(([path, value]) => [path, copyAssetBytes(value)])) };
}

/** Product hull bodies, maps and coat fallbacks have asynchronous readers, not synchronous admitted-map inputs.
 * Keep their complete files/costs; early demand and critical/dependency roots still win. */
function riggedHullLate(platform: EmittedSections | undefined, files: readonly OutputFile[], critical: ReadonlySet<string>): LateFile[] {
  const section = platform?.sections.find(row => row.name === 'look/rigged-hulls');
  if (section === undefined) return [];
  const wire = platform?.files.get(section.path);
  if (wire === undefined || wire.length !== section.bytes || hashAssetBytes(wire) !== section.hash)
    throw new Error('Rigged hull coat section differs from its declared bytes');
  const book = parseRiggedHullBook(JSON.parse(new TextDecoder().decode(wire)));
  if (!book.productFiles) return [];
  const names = new Set(Object.values(book.tiers).flatMap(tier =>
    Object.values(tier.files).flatMap(file => typeof file === 'string' ? [file] : [file.rig, file.base, file.normal])
      .concat(Object.values(tier.coats).map(coat => coat.image), tier.parts === undefined ? [] : [tier.parts.file])));
  return [...new Set(files.filter(file => (file.kind === 'image' || file.kind === 'glb' || file.kind === 'ktx2') && !file.critical && !critical.has(file.hash) && file.name !== undefined && names.has(file.name)).map(file => file.hash))]
    .map(hash => ({ hash }));
}

/** Parse the optional output export and compile project-contained inputs (including glTF) into immutable blobs. */
export async function prepareProjectOutput(project: string, input: unknown, decisions?: { source: Shardfile; options: DecisionBuildOptions }): Promise<PreparedProjectOutput> {
  let parsed = v.parse(output, input === undefined ? {} : input);
  const blobs: NamedBlob[] = [], overlays: OutputFile[] = [];
  if (decisions !== undefined) {
    const built = await prepareProjectDecisions(project, decisions.source, parsed.platform, decisions.options);
    blobs.push(...decisionBlobNames(built.blobs, parsed.namedFiles, parsed.blobs, outputDecisionScripts(parsed.platform)));
    const assets = new Map(parsed.assets); for (const hash of built.replaced) assets.delete(hash);
    parsed = { ...parsed, ...(built.platform === undefined ? {} : { platform: v.parse(emitted, built.platform) }), assets,
      namedFiles: parsed.namedFiles.filter(file => !built.replaced.has(file.hash)),
      blobs: parsed.blobs.filter(row => !replacedDecisionBlob(row, built.replaced)) };
  }
  for (const row of parsed.blobs) blobs.push(await readNamedBlob(project, row.name, row.source, row.kind, row.options));
  const inventory = [...parsed.namedFiles, ...blobs.map(row => row.file)];
  // Other rows may name files already declared by the root source; full product admission resolves those.
  const scripts = outputScriptAdmissionRows(parsed.platform).filter(row => inventory.some(file => file.path === row.module));
  const contracts = decisionModuleContracts(scripts, inventory);
  for (const file of parsed.namedFiles) {
    const value = parsed.assets.get(file.hash);
    if (value === undefined) overlays.push(file);
    else {
      const script = file.kind === 'wasm' ? contracts.get(file.hash) ?? { abi: 0 as const } : undefined;
      const checked = emitNamedBlobs([{ file, bytes: value, ...(script === undefined ? {} : { script }) }]), owned = checked.assets.get(file.hash);
      if (owned === undefined) throw new Error('Named output asset was not admitted');
      blobs.push({ file, bytes: owned, ...(script === undefined ? {} : { script }) });
    }
  }
  const explicit = new Set(parsed.late?.map(row => row.hash));
  const critical = new Set([...inventory.filter(file => file.critical).map(file => file.hash), ...(decisions?.source.critical ?? []), ...(decisions?.source.files.filter(file => file.critical).map(file => file.hash) ?? [])]);
  const late = [...parsed.late ?? [], ...riggedHullLate(parsed.platform, inventory, critical).filter(row => !explicit.has(row.hash))];
  return { blobs, assets: ownedAssets(parsed.assets), ...(parsed.late === undefined && late.length === 0 ? {} : { late }), options: {
    namedFiles: overlays,
    ...(parsed.platform === undefined ? {} : { platform: ownedSections(parsed.platform) }),
    ...(parsed.server === undefined ? {} : { server: parsed.server }),
  } };
}

/** Expose build-time mirrors without loading or executing the copied runtime module. */
export function projectMirrors(input: unknown): readonly RuntimeMirror[] {
  const rows = v.parse(v.pipe(v.array(v.strictObject({ name: v.string(), value: v.unknown() })), v.maxLength(8192)), input === undefined ? [] : input);
  const names = new Set<string>();
  return rows.map(row => {
    if (names.has(row.name)) throw new Error('Duplicate runtime mirror');
    names.add(row.name); return defineMirror(row.name, row.value);
  });
}

function libraryCost(source: Shardfile): { compressed: number; resident: number } {
  const files = new Map(source.files.map(file => [file.hash, file])), seen = new Set<string>(), pending = [...source.library];
  let compressed = 0, resident = 0;
  while (pending.length > 0) {
    const hash = pending.pop(); if (hash === undefined || seen.has(hash)) continue;
    seen.add(hash);
    if (hash.startsWith('commons:')) {
      const key = hash.slice(8), cost = source.requires.commonsCosts[key];
      if (cost === undefined) throw new Error('Missing named library commons cost');
      compressed += source.requires.commonsWire[key] ?? 0; resident += cost.decoded + cost.gpu;
    } else {
      const file = files.get(hash); if (file === undefined) throw new Error('Missing named library dependency');
      compressed += file.compressed; resident += file.decoded + file.gpu; pending.push(...file.dependencies);
    }
  }
  return { compressed, resident };
}

const comparisonPrototype: object | null = Object.getPrototypeOf(Uint8Array.prototype);
const comparisonSome: unknown = Reflect.get(Uint8Array.prototype, 'some');
function comparisonAccessor(name: 'length' | 'buffer'): unknown {
  const descriptor = comparisonPrototype === null ? undefined : Object.getOwnPropertyDescriptor(comparisonPrototype, name);
  return descriptor === undefined ? undefined : Reflect.get(descriptor, 'get');
}
const comparisonLength = comparisonAccessor('length'), comparisonBuffer = comparisonAccessor('buffer');
const comparisonNative = typeof comparisonSome === 'function' && !isProxy(comparisonSome) && Function.prototype.toString.call(comparisonSome).includes('[native code]');

/** Only ordinary nonempty unshared views can avoid the original per-byte callback.
 * No authored accessor or proxy trap is invoked to select this path. */
function comparisonBytes(value: unknown): value is Uint8Array {
  if (!comparisonNative || !ArrayBuffer.isView(value) || isProxy(value) || Object.getPrototypeOf(value) !== Uint8Array.prototype
    || Object.hasOwn(value, 'length') || Object.hasOwn(value, 'some') || comparisonPrototype === null
    || Object.getPrototypeOf(Uint8Array.prototype) !== comparisonPrototype
    || Object.hasOwn(Uint8Array.prototype, 'length') || Object.hasOwn(Uint8Array.prototype, 'some')
    || Object.getOwnPropertyDescriptor(comparisonPrototype, 'length')?.get !== comparisonLength
    || Object.getOwnPropertyDescriptor(comparisonPrototype, 'some')?.value !== comparisonSome
    || typeof comparisonLength !== 'function' || typeof comparisonBuffer !== 'function') return false;
  try {
    const length: unknown = Reflect.apply(comparisonLength, value, []);
    return typeof length === 'number' && length > 0 && Reflect.apply(comparisonBuffer, value, []) instanceof ArrayBuffer;
  } catch { return false; }
}

function conflictingBytes(previous: Uint8Array, blob: NamedBlob): boolean {
  if (!isProxy(blob)) {
    const candidate: unknown = Object.getOwnPropertyDescriptor(blob, 'bytes')?.value;
    if (comparisonBytes(previous) && comparisonBytes(candidate) && previous.length === candidate.length)
      return Buffer.compare(previous, candidate) !== 0;
  }
  return previous.some((value, index) => value !== blob.bytes[index]);
}

/** Admit named bytes once. Existing declarations, conservative costs and names win when content is reused;
 * new content becomes a library root and charges only the newly reachable closure. Inputs are never mutated. */
export function mergeProjectBlobs(input: Shardfile, inputAssets: ReadonlyMap<string, Uint8Array>, blobs: readonly NamedBlob[], namedFiles: readonly OutputFile[] = [], late: readonly LateFile[] = []): { shard: Shardfile; assets: Map<string, Uint8Array>; namedFiles: readonly OutputFile[] } {
  const source = parseShardfile(input), before = libraryCost(source), assets = new Map(inputAssets);
  const files = new Map(source.files.map(file => [file.hash, file]));
  const named = new Map<string, OutputFile>(), names = new Map<string, string>();
  for (const file of v.parse(OutputIndexSchema.entries.files, namedFiles)) {
    if (file.name === undefined || named.has(file.hash) || names.has(file.name)) throw new Error('Duplicate or absent named output identity');
    named.set(file.hash, file); names.set(file.name, file.hash);
  }
  for (const blob of blobs) {
    emitNamedBlobs([blob]);
    const file = blob.file, name = file.name;
    if (name === undefined) throw new Error('Named source blob needs a name');
    const claimed = names.get(name);
    if (claimed !== undefined && claimed !== file.hash) throw new Error('Blob logical name has conflicting content');
    const existing = files.get(file.hash), common = source.requires.commons.includes(file.hash);
    const previous = assets.get(file.hash) ?? (common ? assets.get(`commons:${file.hash}`) : undefined);
    if (previous !== undefined && (hashAssetBytes(previous) !== file.hash || previous.length !== blob.bytes.length || conflictingBytes(previous, blob))) throw new Error('Blob conflicts with admitted asset bytes');
    let overlay: OutputFile;
    if (existing !== undefined) {
      if (existing.kind !== (file.kind === 'bin' || file.kind === 'tile' ? 'binary' : file.kind) || existing.compressed !== blob.bytes.length) throw new Error('Blob kind or size differs from admitted declaration');
      overlay = nameBlob(name, file.kind, blob.bytes, { ...existing, ...(file.jsonSchema === undefined ? {} : { jsonSchema: file.jsonSchema }), ...(file.tier === undefined ? {} : { tier: file.tier }), ...(file.variantOf === undefined ? {} : { variantOf: file.variantOf }), ...(blob.script === undefined ? {} : { script: blob.script }) }).file;
    } else if (common) {
      const cost = source.requires.commonsCosts[file.hash];
      if (cost === undefined || source.requires.commonsWire[file.hash] !== blob.bytes.length) throw new Error('Blob differs from admitted commons');
      overlay = { ...nameBlob(name, file.kind, blob.bytes, { ...cost, ...(file.jsonSchema === undefined ? {} : { jsonSchema: file.jsonSchema }), ...(blob.script === undefined ? {} : { script: blob.script }) }).file, commons: true };
    } else {
      // the tier is the named file's (the output index carries it); the declaration's file row has none
      const { name: _name, path: _path, jsonSchema: _schema, tier: _tier, variantOf: _variant, kind, ...metadata } = file;
      const added = { ...metadata, kind: kind === 'bin' || kind === 'tile' ? 'binary' as const : kind };
      source.files.push(added); files.set(file.hash, added);
      if (file.critical) {
        source.critical.push(file.hash);
        source.budgets.sim.compressed += file.compressed;
        source.budgets.sim.resident += file.decoded + file.gpu;
      } else source.library.push(file.hash);
      overlay = file;
    }
    const old = named.get(file.hash);
    if (old !== undefined) {
      const { name: _oldName, ...oldMetadata } = old, { name: _newName, ...newMetadata } = overlay;
      if (encodeCanonicalJson(oldMetadata) !== encodeCanonicalJson(newMetadata)) throw new Error('Named blob metadata conflicts with admission');
    } else named.set(file.hash, overlay);
    names.set(name, file.hash);
    if (existing !== undefined || !common) assets.set(file.hash, copyAssetBytes(blob.bytes));
  }
  if (late.length > 0) {
    const scheduled = v.parse(AdmissionLateSchema, [...source.late ?? [], ...late]);
    if (!lateLibraryRootsValid(scheduled, files, new Set(source.library))) throw new Error('late files are declared library roots');
    source.late = scheduled;
  }
  const after = libraryCost(source), budget = source.budgets.library;
  budget.compressed += after.compressed - before.compressed; budget.resident += after.resident - before.resident;
  if (budget.downloadAllowance !== undefined) budget.downloadAllowance += after.compressed - before.compressed;
  return { shard: parseShardfile(source), assets, namedFiles: [...named.values()] };
}
