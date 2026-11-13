import { ktx2DeviceCosts } from '@wildshard/format/ktx2Cost';
import { HEADLESS_CONTEXT_SECTIONS } from '@wildshard/engine/host/headlessSections';
import {publishedSourceResidency} from '@wildshard/format/sourceResidency';
import {postStackCost} from '@wildshard/format/postStack';
/** Author-only format-2 emission and on-disk inventory validation. */
// oxlint-disable-next-line import/no-nodejs-modules -- The author CLI owns its explicit product output directory.
import { existsSync, lstatSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Product paths are validated relative paths, never URLs.
import { dirname, resolve } from 'node:path';
import { parseOutputIndex, parseOutputSection, type OutputFile, type OutputIndex } from '@wildshard/format/outputIndex';
import { outputSectionPayloads, OUTPUT_SECTIONS } from '@wildshard/format/outputFields';
import { decisionScriptsFromSections, scriptAdmissionRows, type ScriptAdmissionRows } from '@wildshard/format/scriptContract';
import type { DecisionScripts } from '@wildshard/format/decisionScripts';
import { structuralGridEvidence } from '@wildshard/format/gridReadiness';
import { offlineMemoryAdmission } from '@wildshard/format/product';
import { validationRevision, validationSourceBytes } from '@wildshard/format/validationReceipt';
import { preflightDeclaredCosts } from '@wildshard/format/assetAdmission';
import { admitProduct, readmitted, rememberAdmitted } from './productOutput';
import { performanceTargetIssues } from './reportCard';
import { encodeCanonicalJson, hashImmutableBytes } from '@wildshard/engine/host/immutable';
import { assetHandles, hashAssetBytes, immutableAsset, verifyAssetBytes, type ImmutableAsset } from './assetHandle';
import { readBoundedFile } from './sourceReader';
import { validateRuntimeImports } from './runtimeImports';
import type { ServerBlob } from './blobs';
import { COOK_DATA_PATH, cookMountPath } from '@wildshard/format/cookData';
import type { CookInput } from './cookInput';
import { validateDefinedJson, type EmittedSections } from './sections';
import { parseDiscoveryValues, type DiscoveryValues } from '@wildshard/format/discoveryValues';
import { checkWorldTargets, outputBlobExtension as blobExtension, outputBlobKind as blobKind, readCanonicalJson as readJson, validateShardfileProduct, type ProductFiles, type ValidatedProduct } from '@wildshard/format/productValidation';

const encoder = new TextEncoder();
function jsonBytes(value: unknown): Uint8Array { return encoder.encode(encodeCanonicalJson(value)); }
function put(destination: string, path: string, bytes: Uint8Array): void { const target = resolve(destination,path); mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes); }
/** Optional build-only extensions. Runtime bytes themselves are written by the P3 copier. */
export interface OutputProductOptions {
  /** Build metadata only; discovery inlines these admitted values after the product is built. */
  readonly discovery?: DiscoveryValues;
  readonly platform?: EmittedSections;
  readonly namedFiles?: readonly OutputFile[];
  /** J91: server-class files. They enter the index's `admission.server`, never `files`. */
  readonly server?: readonly ServerBlob[];
  readonly runtime?: { readonly files: readonly NonNullable<OutputIndex['runtime']>['files'][number][]; readonly lines: number };
  /** C0 (J137): the files and hints that let this product stand alone (`cook.json`). */
  readonly cook?: CookInput;
}
/** C0: the mounts' bytes and their `cook.json` join the product's emitted files. */
function cookRow(input: CookInput | undefined, emitted: Map<string,Uint8Array>, files: readonly {readonly path:string;readonly hash:string}[]): NonNullable<OutputIndex['cook']> | undefined {
  if (input === undefined) return undefined;
  // A mount with the bytes of a listed blob names that blob: a shardfile holds a file once, however many URLs serve it.
  const blobs = new Map(files.map(file=>[file.hash,file.path]));
  const mounts = input.mounts.map(({url,bytes}) => { const hash=hashAssetBytes(bytes),blob=blobs.get(hash),path=blob??cookMountPath(url);if(blob===undefined)emitted.set(path,bytes);return {url,path,hash,bytes:bytes.length}; });
  const {packs,fence} = input, bytes = jsonBytes({version:1,mounts,...(packs===undefined?{}:{packs}),...(fence===undefined?{}:{fence})});
  emitted.set(COOK_DATA_PATH,bytes);
  return {path:COOK_DATA_PATH,hash:hashAssetBytes(bytes),bytes:bytes.length};
}
/** Read the named canonical platform payloads, each only after checking its emitted hash and size. */
export function outputPlatformPayloads(platform: EmittedSections | undefined, names: readonly string[] = HEADLESS_CONTEXT_SECTIONS): ReadonlyMap<string, unknown> {
  const payloads = new Map<string, unknown>();
  for (const entry of platform?.sections ?? []) {
    if (!names.includes(entry.name)) continue;
    if (payloads.has(entry.name)) throw new Error(`Duplicate ${entry.name} section`);
    const bytes = platform?.files.get(entry.path);
    if (bytes === undefined || bytes.length !== entry.bytes || hashAssetBytes(bytes) !== entry.hash) throw new Error(`${entry.name} section hash or size mismatch`);
    payloads.set(entry.name, readJson(bytes));
  }
  return payloads;
}
/** Read the canonical platform decision payload only after checking its emitted hash and size. */
export function outputDecisionScripts(platform?: EmittedSections): DecisionScripts {
  return decisionScriptsFromSections(outputPlatformPayloads(platform, ['sim/scripts']));
}
/** Exact contracts for both generic actor decisions and population-owned directors. */
export function outputScriptAdmissionRows(platform?: EmittedSections): ScriptAdmissionRows {
  return scriptAdmissionRows(outputPlatformPayloads(platform, ['sim/scripts', 'actors/spawn-scripts', 'actors/return-scripts', 'view/modules']));
}
/** Split an admitted product without changing host values or any immutable asset byte. */
export function writeOutputProduct(input: unknown, assets: ReadonlyMap<string,Uint8Array>, destination: string, options: OutputProductOptions = {}): OutputIndex {
  if (Object.hasOwn(options, 'custom')) throw new Error('Custom output extensions are retired');
  // the product buildProject admitted a moment ago is not admitted twice in memory (readmitted); the written folder always is
  const scripts = outputScriptAdmissionRows(options.platform), source = readmitted(input,assets,'warn',scripts) ?? admitProduct(input,assets,'warn',scripts);
  const targetEntry = options.platform?.sections.find(row => row.name === 'world/targets');
  if (targetEntry !== undefined) {
    const bytes = options.platform?.files.get(targetEntry.path);
    if (bytes === undefined || bytes.length !== targetEntry.bytes || hashAssetBytes(bytes) !== targetEntry.hash) throw new Error('World target section hash or size mismatch');
    checkWorldTargets(source, readJson(bytes));
  }
  for(const issue of performanceTargetIssues(source,'warn'))console.warn(`Output budget report-only (G453): ${issue.metric}: ${issue.actual} exceeds ${issue.limit}`);
  source.files.sort((a,b)=>a.hash.localeCompare(b.hash));
  source.tiles.sort((a,b)=>a.lod-b.lod||a.x-b.x||a.z-b.z);
  const sections: OutputIndex['sections'] = [], schemas: OutputIndex['schemas'] = [], files: OutputIndex['files'] = [];
  const emitted = new Map<string,Uint8Array>();
  for (const [name,value] of outputSectionPayloads(source)) {
    const mapping = OUTPUT_SECTIONS.find(row => row.name === name); if (mapping === undefined) throw new Error('Missing platform section mapping');
    parseOutputSection(name,value);
    const bytes = jsonBytes(value), path = `sections/${name}.json`;emitted.set(path,bytes);
    sections.push({name,path,schema:`wildshard:${name}@1`,hash:hashAssetBytes(bytes),bytes:bytes.length});
  }
  for (const {name,path,schema,hash,bytes} of options.platform?.sections ?? []) sections.push({name,path,schema,hash,bytes});
  for (const [path,bytes] of options.platform?.files ?? []) {
    if (emitted.has(path)) throw new Error('Duplicate platform output path');
    emitted.set(path,bytes);
    if (path.startsWith('schemas/')) schemas.push({path,hash:hashAssetBytes(bytes),bytes:bytes.length});
  }
  for (const blob of options.server ?? []) {
    if (emitted.has(blob.file.path)) throw new Error('Duplicate server output path');
    emitted.set(blob.file.path,blob.bytes);
  }
  const declarations = new Map(source.files.map(file => [file.hash,file]));
  const names=new Map<string,OutputFile>();
  for(const file of options.namedFiles??[]){if(names.has(file.hash))throw new Error('Duplicate named blob reference');names.set(file.hash,file);}
  for (const [reference,bytes] of assets) {
    const commons = reference.startsWith('commons:'), hash = commons ? reference.slice(8) : reference;
    if(commons&&declarations.has(hash))continue;
    const declaration = declarations.get(hash), pinned = source.requires.commonsCosts[hash];
    if (!commons && declaration === undefined) throw new Error('Unlisted output asset');
    if (commons && (pinned === undefined || !source.requires.commons.includes(hash))) throw new Error('Unlisted output commons asset');
    const kind = blobKind(commons ? 'commons' : declaration?.kind ?? '',bytes), path = `blobs/${kind}/${hash}.${blobExtension(kind,bytes)}`;
    if (emitted.has(path)) throw new Error('Output asset path collision');
    emitted.set(path,bytes);
    files.push({hash,kind,path,compressed:bytes.length,decoded:declaration?.decoded ?? pinned?.decoded ?? 0,gpu:declaration?.gpu ?? pinned?.gpu ?? 0,triangles:declaration?.triangles ?? pinned?.triangles ?? 0,draws:declaration?.draws ?? pinned?.draws ?? 0,dependencies:commons ? [] : declaration?.dependencies ?? [],critical:commons ? false : declaration?.critical ?? false,...(commons ? {commons:true as const} : {})});
  }
  for(const file of files){const named=names.get(file.hash);if(named!==undefined){const {name,jsonSchema,tier,variantOf,...metadata}=named;if(encodeCanonicalJson(metadata)!==encodeCanonicalJson(file))throw new Error('Named blob differs from its admitted declaration');if(name!==undefined)file.name=name;if(tier!==undefined)file.tier=tier;if(variantOf!==undefined)file.variantOf=variantOf;if(jsonSchema!==undefined)file.jsonSchema=jsonSchema;names.delete(file.hash);}}
  if(names.size>0)throw new Error('Unadmitted named blob');
  const ktx2Costs: NonNullable<OutputIndex['ktx2Costs']> = {};
  for (const file of files) if (file.kind==='ktx2' && file.commons!==true) {
    const bytes=emitted.get(file.path);if(bytes===undefined)throw new Error('Missing KTX2 cost bytes');
    ktx2Costs[file.hash]=ktx2DeviceCosts(bytes);
  }
  const cook=cookRow(options.cook,emitted,files);
  const {spawns:_spawns,...runtime} = source.runtime ?? {};
  const index = parseOutputIndex({format:'wildshard.shardfile',formatVersion:2,sdk:'0.2',version:source.version,identity:source.identity,requires:source.requires,
    build:{sourceHash:hashImmutableBytes(jsonBytes(source)),validator:validationRevision() ?? 'source'},admission:{budgets:source.budgets,serverBudget:source.serverBudget,authorCaps:source.authorCaps,critical:source.critical,library:source.library,...(source.late===undefined?{}:{late:source.late}),...(options.cook?.audioWaiver===undefined?{}:{audioWaiver:options.cook.audioWaiver}),...(options.server===undefined||options.server.length===0?{}:{server:options.server.map(blob=>blob.file).sort((a,b)=>a.name.localeCompare(b.name))})},
    ...(Object.keys(ktx2Costs).length===0?{}:{ktx2Costs}),
    sections:sections.sort((a,b)=>a.name.localeCompare(b.name)),schemas:schemas.sort((a,b)=>a.path.localeCompare(b.path)),files:files.sort((a,b)=>a.hash.localeCompare(b.hash)||a.path.localeCompare(b.path)),...(cook===undefined?{}:{cook}),runtime:source.runtime === null ? null : {...runtime,trust:'first-party',files:options.runtime?.files ?? [],lines:options.runtime?.lines ?? 0}});
  // A writer owns this product directory, never a source folder. Preserve only the
  // already-copied runtime files; refuse unrelated leftovers in validation below.
  mkdirSync(destination,{recursive:true});
  // S5: engine cooks packs from the raw upload, so a product holds none; clear any an older writer left here
  rmSync(resolve(destination,'blobs/pack'),{recursive:true,force:true});
  for (const [path,bytes] of emitted) put(destination,path,bytes);
  put(destination,'shard.json',jsonBytes(index));
  const published=validateOutputProduct(destination,assetHandles(emitted.values()));
  const cost = preflightDeclaredCosts(source,offlineMemoryAdmission('warn')).worst;
  const discovery = options.discovery === undefined ? undefined : parseDiscoveryValues(options.discovery);
  put(destination,'validation.json',jsonBytes({revision:index.build.validator,sourceHash:hashImmutableBytes(validationSourceBytes(source)),indexHash:hashImmutableBytes(jsonBytes(index)),worst:cost,residentBytes:publishedSourceResidency(published.shard),postCost:postStackCost(published.shard,hash=>published.assets.get(hash)).cost,gridReady:structuralGridEvidence(source),
    ...(discovery === undefined ? {} : { discovery: { hash: hashImmutableBytes(jsonBytes(discovery)), values: discovery } }) }));
  return index;
}
/** The product folder as format validation reads it: bounded reads of regular files only, never through a symlink. */
function productFolder(destination: string): ProductFiles {
  return {
    read: (path: string, maxBytes: number): Uint8Array => {
      let target = destination;
      for (const part of path.split('/')) { target = resolve(target, part); if (lstatSync(target).isSymbolicLink()) throw new Error('Output symlinks refuse'); }
      if (!lstatSync(target).isFile()) throw new Error('Output inventory needs regular files');
      return readBoundedFile(resolve(destination, path), maxBytes);
    },
    paths: (): string[] => {
      const found: string[] = [];
      const walk = (folder: string): void => {
        for (const name of readdirSync(resolve(destination, folder))) {
          const path = folder === '' ? name : `${folder}/${name}`;
          if (lstatSync(resolve(destination, path)).isDirectory()) walk(path); else found.push(path);
        }
      };
      walk(''); return found;
    },
  };
}
/** Validate a written product folder: P1-F3's format half (`@wildshard/format/productValidation`), with the author's
 * Ajv schema check, runtime import check and verified-asset snapshots. Executing script bytes is not part of it. */
export function validateOutputProduct(destination: string, prior?: ReadonlyMap<string, ImmutableAsset>): ValidatedProduct {
  const verified = new Map(prior);
  const checked = validateShardfileProduct(productFolder(destination), {
    hash: hashAssetBytes,
    verify: (bytes, expected, whole) => {
      if (!verifyAssetBytes(bytes, expected, verified.get(expected))) return false;
      if (whole) verified.set(expected, immutableAsset(bytes));
      return true;
    },
    definedJson: (schemaBytes, bytes, name) => { validateDefinedJson(schemaBytes, bytes, name); },
    runtimeImports: (path, source) => { validateRuntimeImports(destination, path, source); },
  });
  rememberAdmitted(checked.shard, checked.assets, 'warn', checked.scripts);
  return checked;
}
/** Clear only a caller-owned generated product before a fresh emission. */
export function clearOutputProduct(destination: string): void { if(existsSync(destination))rmSync(destination,{recursive:true,force:true}); }
