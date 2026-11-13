// oxlint-disable-next-line import/no-nodejs-modules -- Build programs cache immutable outputs outside the source tree.
import { existsSync, realpathSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- The cache belongs to this user's author tools.
import { homedir } from 'node:os';
// oxlint-disable-next-line import/no-nodejs-modules -- Explicit inputs stay inside the author project.
import { basename, isAbsolute, resolve, sep } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- Product receipts observe keys without depending on cache paths.
import { channel } from 'node:diagnostics_channel';
// oxlint-disable-next-line import/no-nodejs-modules -- Native output keys include the original runtime and host.
import process from 'node:process';
import * as v from 'valibot';
import { reportBuildCache } from './buildCacheMetrics';
import { encodeCanonicalJson, hashImmutableBytes } from './immutable';
import { copyAssetBytes, hashAssetBytes } from './assetHandle';
import { readBoundedFile } from './sourceReader';
import { projectCompilerIdentity } from './projectCompilerIdentity';
import { compileScript } from './bake/compileScript';
import { compileScriptV2 } from './bake/compileScriptV2';
import { compileReturnProjectionV2 } from './returnProjectionV2';
import { compileDeclaredDecisionScripts, compileDecisionScripts } from './buildDecisionScripts';
import { proveStaticPortalEntries } from './projectEntryProof';
import { readImagePixels, writeImagePixels } from './bake/image';
import { normalizeWorldGlb } from './bake/world';
import { createBasisEncoder } from './bake/basisEncoder';
import { phoneAstcKtx2 } from './bake/phoneAstc';
import { encodeGainKeyMemo } from './bake/keyedSkyMemo';
import { encodePortableBytesMemo } from './bake/portableBytesMemo';
import { encodeZstdBytesMemo } from './bake/zstdBytesMemo';
import { memoAssemblyScript } from './bake/assemblyscriptMemo';
import { meshoptNoLargerMemo } from './bake/meshoptChoiceMemo';
import { projectInputFiles } from './projectInputFiles';
import { generationCache, maybePruneGenerationCache } from './generationCache.ts';
import type { Shardfile } from '@wildshard/engine/host/shardfile';
import type { ProjectOutput } from './projectOutput';
import type { DiscoveryInput } from '@wildshard/format/discoveryValues';

const hash = v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/u));
const Manifest = v.strictObject({ key: hash, files: v.pipe(v.array(v.strictObject({ name: v.string(), hash, bytes: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(256_000_000)) })), v.maxLength(4096)) });
const keys = channel('wildshard.generation-key');
const text = new TextEncoder();

/** An immutable step returns named byte files, including JSON metadata when needed. */
export interface ProjectGenerationStep {
  readonly id: string;
  /** Project-relative paths, or URLs beneath roots explicitly supplied by the author CLI. */
  readonly inputs?: readonly string[];
  readonly native?: boolean;
}
/** Explicit filesystem capability for authored public assets; never inferred from a shard name or parent path. */
export interface ProjectGenerationInputRoot { readonly prefix: string; readonly directory: string }
/** GR9: a multi-output folder's build program for one output (`programs[slug]` beside `outputs` in shard.config.ts), run
 *  when that output builds: its world GLB bytes stand in for reading the declaration's `world.glb`, and its map lattice is
 *  published as the output's map. Neither is written into source. */
export interface OutputProgramResult {
  readonly world?: Uint8Array;
  readonly map?: { readonly pixels: Uint8Array; readonly name?: string };
}
/** A build may return output metadata alongside the declaration it describes. Neither is written into source. */
export interface GeneratedProject {
  readonly shard: Shardfile;
  readonly output: ProjectOutput;
  readonly map?: { readonly pixels: Uint8Array; readonly name?: string };
  /** Computed data bindings admitted into the product receipt, never imported at runtime. */
  readonly discovery?: DiscoveryInput;
}
/** Build-only capabilities. No cache filename or intermediate source file enters a product. */
export interface ProjectGenerationContext {
  /** Always fresh: prove real static portal capsule walks and dispose their native world. */
  proveStaticPortalEntries: typeof proveStaticPortalEntries;
  /** Decode bounded still image bytes into owned RGBA at build time; no Sharp dependency enters the author bundle. */
  readImagePixels: typeof readImagePixels;
  /** Encode a bounded RGBA raster as a deterministic lossless PNG at build time (GR9); older adapters may omit it. */
  writeImagePixels?: typeof writeImagePixels;
  /** The authored-world GLB reader (`bake/world.ts`), so an author bundle decodes model kits without Sharp (GR9); older
   *  adapters may omit it. */
  normalizeWorldGlb?: typeof normalizeWorldGlb;
  /** The keyed sky's gain-key gzip (`bake/keyedSky.ts`) with its exact memo in the gen cache (CI6), so an author bundle
   *  reaches no file access; older adapters may omit it. */
  encodeGainKey?: (data: Uint16Array) => Uint8Array;
  /** The portable deflate (`bake/portableBytes.ts` encodePortableBytes) with its exact memo in the gen cache (CI6), for a
   *  large baked payload whose input rarely changes; older adapters may omit it. */
  encodePortableBytes?: (input: Uint8Array, level?: number) => Uint8Array<ArrayBuffer>;
  /** Original native Zstd bytes with a content/codec/level memo outside the product; older adapters may omit it. */
  encodeZstdBytes?: (input: Uint8Array, level?: number) => Uint8Array<ArrayBuffer>;
  /** The meshopt GLB choice (`blobs.ts` meshoptNoLarger, for nameMeshoptBlob) with its exact memo in the gen cache (CI6);
   *  older adapters may omit it. */
  meshoptNoLarger?: (packed: Uint8Array, input: Uint8Array) => Promise<boolean>;
  /** Trusted original UASTC build recipe; older adapters may omit this capability. */
  basisEncoder?: typeof createBasisEncoder;
  /** DL9: a phone-tier UASTC KTX2 as ASTC 4×4 (`bake/phoneAstc.ts`, three's own transcoder at build time); older
   *  adapters may omit it, and the phone keeps transcoding at load. */
  phoneAstcKtx2?: typeof phoneAstcKtx2;
  /** Fresh bounded names below project-relative directories or declared URL roots; older adapters may omit it. */
  inputFiles?: (prefixes: readonly string[]) => readonly string[];
  cached: (step: ProjectGenerationStep, generate: (inputs: ReadonlyMap<string, Uint8Array>) => ReadonlyMap<string, Uint8Array> | Promise<ReadonlyMap<string, Uint8Array>>, recipe?: string) => Promise<ReadonlyMap<string, Uint8Array>>;
  asset: (bytes: Uint8Array) => string;
  compileScript: typeof compileScript;
  compileScriptV2: typeof compileScriptV2;
  compileDecisionScripts: typeof compileDeclaredDecisionScripts;
  /** Exact registries for stateless projections; older adapters may omit it. */
  compileDecisionRows?: typeof compileDecisionScripts;
  /** Dual stateless projection compilation, retaining the original witness and every source/admission check. */
  compileReturnProjection?: typeof compileReturnProjectionV2;
}
/** Build entries are trusted functions; their returned declaration still crosses normal shardfile admission. */
export function isProjectGenerator(input: unknown): input is (ctx: ProjectGenerationContext) => unknown { return typeof input === 'function'; }
const stores = new WeakMap<ProjectGenerationContext, ReturnType<typeof generationCache>>();
/** Seal completed generation's current keys, release its lease and schedule G430. */
export async function finishProjectGeneration(context: ProjectGenerationContext, success: boolean): Promise<void> {
  const store = stores.get(context);
  if (store === undefined) return;
  await store.finish(success); stores.delete(context);
  maybePruneGenerationCache(store.root);
}
function name(value: string): void {
  if (value.length === 0 || isAbsolute(value) || value.includes('\\') || value.split('/').some(part => part === '' || part === '.' || part === '..')) throw new Error('Invalid generation file name');
}
function detached(files: ReadonlyMap<string, Uint8Array>): Map<string, Uint8Array> {
  if (files.size > 4096) throw new Error('Too many generation files');
  return new Map([...files].map(([file, bytes]) => {
    name(file);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > 256_000_000) throw new Error('Invalid generation bytes');
    return [file, copyAssetBytes(bytes)];
  }));
}
/** Bundled steps carry their own lexical recipe identity. Direct callers retain
 * the conservative program identity unless they supply an exact recipe.
 * Explicit input bytes are read on hits too, preserving the product receipt. */
export function createProjectGeneration(project: string, programHash: string, assets: Map<string, Uint8Array>, cacheRoot: string = process.env['WILDSHARD_GEN_CACHE'] ?? resolve(homedir(), '.cache/wildshard/gen'), inputRoots: readonly ProjectGenerationInputRoot[] = [], scope = ''): ProjectGenerationContext {
  v.parse(hash, programHash);
  const root = realpathSync(project), pending = new Map<string, Promise<ReadonlyMap<string, Uint8Array>>>();
  if (inputRoots.length > 32) throw new Error('Too many generation input roots');
  // A folder an outside project doesn't have holds no inputs: a project needs no `public/`.
  const roots = inputRoots.flatMap(source => {
    if (!/^\/(?:[a-zA-Z0-9_-]+\/)+$/u.test(source.prefix)) throw new Error('Generation input root needs a bounded absolute URL prefix');
    return existsSync(source.directory) ? [{ prefix: source.prefix, directory: realpathSync(source.directory) }] : [];
  });
  const store = generationCache(cacheRoot, root, scope);
  const context: ProjectGenerationContext = {
    compileScript: (source, options) => compileScript(source, { ...options, compileMemo: memoAssemblyScript }),
    compileScriptV2: (source, options) => compileScriptV2(source, { ...options, compileMemo: memoAssemblyScript }),
    compileDecisionScripts: (input, source, moves, authored, options) => compileDeclaredDecisionScripts(input, source, moves, authored, { ...options, compileMemo: memoAssemblyScript }),
    compileDecisionRows: (input, registries, authored, options) => compileDecisionScripts(input, registries, authored, { ...options, compileMemo: memoAssemblyScript }),
    compileReturnProjection: (input, registries, authored, options) => compileReturnProjectionV2(input, registries, authored, { ...options, compileMemo: memoAssemblyScript }),
    proveStaticPortalEntries, readImagePixels, writeImagePixels, normalizeWorldGlb,
    basisEncoder: createBasisEncoder, phoneAstcKtx2, encodeGainKey: encodeGainKeyMemo, encodePortableBytes: encodePortableBytesMemo, encodeZstdBytes: encodeZstdBytesMemo, meshoptNoLarger: meshoptNoLargerMemo,
    inputFiles: prefixes => projectInputFiles(roots, prefixes, root),
    asset(bytes) {
      if (!(bytes instanceof Uint8Array) || bytes.byteLength > 256_000_000) throw new Error('Invalid generation asset bytes');
      const copy = copyAssetBytes(bytes), key = hashAssetBytes(copy); assets.set(key, copy); return key;
    },
    async cached(step, generate, recipe) {
      if (recipe !== undefined) v.parse(hash, recipe);
      if (!/^[a-z0-9][a-z0-9-]{0,79}$/u.test(step.id)) throw new Error('Invalid generation step id');
      if ((step.inputs?.length ?? 0) > 4096) throw new Error('Too many generation inputs');
      const inputs = new Map<string, Uint8Array>();
      for (const file of step.inputs ?? []) {
        if (inputs.has(file)) throw new Error('Duplicate generation input');
        let base = root, relative = file;
        if (file.startsWith('/')) {
          const matches = roots.filter(source => file.startsWith(source.prefix)), source = matches[0];
          if (matches.length !== 1 || source === undefined) throw new Error('Generation input needs exactly one declared root');
          base = source.directory; relative = file.slice(source.prefix.length);
          if (/[%?#]/u.test(relative)) throw new Error('Generation input URL escapes its root');
        }
        name(relative);
        const path = realpathSync(resolve(base, relative));
        if (!path.startsWith(base + sep)) throw new Error('Generation input escaped its declared root');
        inputs.set(file, readBoundedFile(path, 256_000_000));
      }
      let diagnosticId='';
      const key = hashImmutableBytes(text.encode(encodeCanonicalJson({ version: 3, recipe: recipe ?? programHash, compiler: await projectCompilerIdentity(), id: diagnosticId=step.id, node: process.version,
        native: step.native === true ? [process.platform, process.arch] : null,
        inputs: [...inputs].map(([file, bytes]) => [file, hashImmutableBytes(bytes)]).sort(([a], [b]) => String(a).localeCompare(String(b))) })));
      keys.publish({ key });
      const metric=(event:Parameters<typeof reportBuildCache>[0]['event'],bytes:number):void=>{
        reportBuildCache({cache:'generation-step',project:basename(root),step:diagnosticId,event,bytes});
      };
      metric('lookup',0);
      let work = pending.get(key);
      const memoryHit=work!==undefined;
      if (work === undefined) {
        work = (async () => {
          const saved = await store.read(step.id, key);
          if (saved !== undefined) {
            const manifest = v.parse(Manifest, saved);
            if (manifest.key !== key) throw new Error('Generation cache key mismatch');
            const files = new Map<string, Uint8Array>();
            for (const row of manifest.files) {
              name(row.name);
              if (files.has(row.name)) throw new Error('Duplicate generation cache file');
              const bytes = readBoundedFile(resolve(store.blobs, row.hash), row.bytes);
              if (bytes.byteLength !== row.bytes || hashAssetBytes(bytes) !== row.hash) throw new Error('Generation cache byte mismatch');
              files.set(row.name, bytes);
            }
            metric('disk-hit',[...files.values()].reduce((sum,bytes)=>sum+bytes.byteLength,0));
            return files;
          }
          // Input URL keys have already crossed the explicit-root checks above;
          // output names still cross the stricter cache-file path contract.
          metric('miss',0);
          const copy = new Map([...inputs].map(([file, bytes]) => [file, new Uint8Array(bytes)]));
          const files = detached(await generate(copy));
          const payloadBytes=[...files.values()].reduce((sum,body)=>sum+body.byteLength,0);
          metric('computed',payloadBytes);
          const rows = [...files].map(([file, bytes]) => ({ name: file, hash: hashAssetBytes(bytes), bytes: bytes.byteLength }));
          metric(await store.populate(step.id, { key, files: rows }, files) ? 'population' : 'population-race', payloadBytes);
          return files;
        })();
        pending.set(key, work);
      }
      const files=await work;
      if(memoryHit)metric('memory-hit',[...files.values()].reduce((sum,bytes)=>sum+bytes.byteLength,0));
      return detached(files);
    },
  };
  stores.set(context, store);
  return context;
}
