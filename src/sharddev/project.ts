import { diagnosticNow } from '@wildshard/engine/core/clock';
import { executeBundle } from './executeBundle';
import { generationRecipes } from './generationRecipe.ts';
import { mergeProjectSections } from './projectSections';
import { writeEmptyShardSource } from './newProject';
import { shardOutputRoot } from './shardSource';
import { assertConfigBoundary } from './configBoundary';
import { createProjectGeneration, finishProjectGeneration, isProjectGenerator, type ProjectGenerationContext, type ProjectGenerationInputRoot } from './projectGeneration';
// oxlint-disable-next-line import/no-nodejs-modules -- The author CLI verifies and writes local build products.
import { cpSync, existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve source assets inside the author project.
import { resolve, sep } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- Build phase diagnostics belong only to the CI compiler process.
import process from 'node:process';
import { build } from 'vite';
import ts from '@typescript/typescript6';
import { parseShardfile, type Shardfile } from '@wildshard/engine/host/shardfile';
import { preflightAssetGraph, offlineMemoryAdmission, prepareAssetDecoders } from "@wildshard/format/product";
import { preflightDeclaredCosts } from '@wildshard/format/assetAdmission';
import { preflightShardfile } from '@wildshard/format/preflight';

import { readBoundedFile } from './sourceReader';
import { encodeCanonicalJson, hashImmutableBytes } from './immutable';
import { withAssetOwner } from './assetScope';
import { hashAssetBytes } from './assetHandle';

import { projectPerformancePolicy } from './performancePolicy';
import { checkProjectRuntime } from './runtimePerformance';
import { admitProduct, assertBuildSides, assertProductTargets, namedJsonReader, SIDE_SECTIONS } from './productOutput';
import { bakeAuthoredWorld } from './bake/authoredWorld';
import { parseWorldSource } from './worldSource';
import { compileBehaviourSource } from './behaviourSource';
import { buildBehaviourProject } from './buildBehaviour';
import { packProjectMap, generatedProjectMap, type ProjectMap } from './projectMap';
import { projectPlaceholders } from './bake/placeholders';
import type { ScriptAdmissionRows } from '@wildshard/format/scriptContract';
import { readCookInput, type CookInput } from './cookInput';
import { AUTHOR_BUDGETS, AUTHOR_BUDGETS_MODULE, authorManifest } from './authorManifest';
import { discoveryDocument, discoveryUrl } from './discoveryDocument';
import { outputScriptAdmissionRows, outputPlatformPayloads, clearOutputProduct, writeOutputProduct, type OutputProductOptions } from './outputProduct';
import { prepareProjectOutput, mergeProjectBlobs, projectMirrors, type PreparedProjectOutput } from './projectOutput';
import type { RuntimeMirror } from './runtimeMirrors';
import { proveRuntimeData, writeRuntimeFiles } from './outputRuntime';
import { readManifestSource, type ProjectManifestSource } from './projectManifest';
import { projectDecisionOptions } from './projectDecisions';
import { projectDecisionBudget } from './projectPolicy';
import { nameBlob } from './blobs';
import { lowerMaterialGraphs } from './materialGraphFiles';
import { parseDiscoveryValues, type DiscoveryValues } from '@wildshard/format/discoveryValues';

/** Stable JSON encoding: sorted object keys, no timestamps or host paths. */
export function canonicalJson(value: unknown): string { return encodeCanonicalJson(value); }
/** Hash of immutable wire bytes; this is also their output filename. */
export function contentHash(bytes: Uint8Array): string { return hashImmutableBytes(bytes); }

/** Validate graph closure costs and actual bytes through the same admission used by the browser loader. */
export function validateProject(input: unknown, assets: ReadonlyMap<string, Uint8Array>, project?: string, scripts: ScriptAdmissionRows = []): Shardfile {
  const source = parseShardfile(input);
  return admitProduct(source, assets, projectPerformancePolicy(project, source), scripts);
}

async function authorModule(project: string, file: string): Promise<{ exports: Record<string, unknown>; hash: string; mapHash: string }> {
  await prepareAssetDecoders();
  // The compiled declaration executes here; only its returned data is emitted.
  // Source-text inspection still enters the recorder's exact-content guard.
  const result = await build({ configFile: false, logLevel: 'silent', plugins: [{name:'wildshard-author-execution',api:{wildshardInputIdentity:'execution'}}], build: { write: false, minify: false, lib: { entry: resolve(project, file), formats: ['es'], fileName: 'config' }, rolldownOptions: { external: [/^node:/u, 'assemblyscript/dist/asc.js'], output: { codeSplitting: false } } } });
  const built = Array.isArray(result) ? result[0] : result;
  if (built === undefined || !('output' in built) || (Array.isArray(result) && result.length !== 1)) throw new Error('config build produced unexpected output');
  const chunks = built.output.filter((out) => out.type === 'chunk');
  if (chunks.length !== 1) throw new Error('config must bundle as one module');
  const chunk = chunks[0]; if (chunk === undefined) throw new Error('config chunk missing');
  assertConfigBoundary([...chunk.imports, ...chunk.dynamicImports]);
  const loaded: unknown = await executeBundle(generationRecipes(chunk.code), project);
  if (typeof loaded !== 'object' || loaded === null) throw new Error('Author module has no exports');
  // Bundler source-location comments change when an author moves a project.
  // Parse before dropping comments so literal text remains part of identity.
  const syntax = ts.createSourceFile('config.js', chunk.code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const executable = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed }).printFile(syntax);
  return { exports: Object.fromEntries(Object.entries(loaded)), hash: contentHash(new TextEncoder().encode(chunk.code)), mapHash: contentHash(new TextEncoder().encode(executable)) };
}

/** GR9: a declared output's build program (`programs` in shard.config.ts, keyed by slug), if the folder has one for it. */
function outputProgram(loaded: Record<string, unknown>, output: string): ((ctx: ProjectGenerationContext) => unknown) | undefined {
  const programs = loaded['programs'];
  if (programs === undefined) return undefined;
  if (typeof programs !== 'object' || programs === null) throw new Error('config programs must map output slugs to build functions');
  const program: unknown = Object.hasOwn(programs, output) ? Reflect.get(programs, output) : undefined;
  if (program !== undefined && !isProjectGenerator(program)) throw new Error(`config program for ${output} must be a build function`);
  return program;
}

/** SF88g: one declared output of a source folder that emits several products (`outputs` in shard.config.ts, keyed by slug). */
function outputDeclaration(loaded: Record<string, unknown>, output: string): unknown {
  const outputs = loaded['outputs'];
  if (typeof outputs !== 'object' || outputs === null || !Object.hasOwn(outputs, output)) throw new Error(`config declares no output ${output}`);
  return Reflect.get(outputs, output);
}

async function projectModule(project: string, decisionLegacyLines?: number, selected?: string, mapSourceHash?: string, inputRoots: readonly ProjectGenerationInputRoot[] = []): Promise<{ map: Awaited<ReturnType<typeof generatedProjectMap>> | undefined; discovery: DiscoveryValues | undefined; shard: Shardfile; commons: unknown; baked: ReadonlyMap<string, Uint8Array>; output: PreparedProjectOutput; mirrors: readonly RuntimeMirror[] }> {
  const program = await authorModule(project, 'shard.config.ts'), loaded = program.exports;
  if (!('default' in loaded)) throw new Error('config has no default export');
  if ('generate' in loaded && typeof loaded['generate'] !== 'function') throw new Error('config generate export must be a build function');
  let declaration: unknown = selected === undefined ? loaded['generate'] ?? loaded['default'] : outputDeclaration(loaded, selected);
  let shard: Shardfile;
  const baked = new Map<string, Uint8Array>(), root = realpathSync(project);
  const sidecarModule = existsSync(resolve(project, 'generators/output.ts')) ? await authorModule(project, 'generators/output.ts') : undefined;
  // Config and sidecar share pending work. Each bundled callback carries its
  // own recipe; the complete identity remains a safe fallback for dynamic calls.
  const generation = createProjectGeneration(project, contentHash(new TextEncoder().encode(canonicalJson({
    program: program.hash, output: selected ?? null, ...(sidecarModule === undefined ? {} : { sidecar: sidecarModule.hash }),
  }))), baked, undefined, inputRoots, selected ?? 'default');
  let generationSucceeded = false;
  try {
  let generatedOutput: unknown, map: Awaited<ReturnType<typeof generatedProjectMap>> | undefined;
  let discovery: DiscoveryValues | undefined;
  // GR9: a selected output's build program supplies its world GLB bytes and its map lattice
  let programWorld: Uint8Array | undefined;
  const outputBuild = selected === undefined ? undefined : outputProgram(loaded, selected);
  if (outputBuild !== undefined) {
    const result: unknown = await outputBuild(generation);
    if (typeof result !== 'object' || result === null || Object.keys(result).some(key => key !== 'world' && key !== 'map')) throw new Error('Output program returns only world and map');
    if ('world' in result) {
      if (!(result.world instanceof Uint8Array)) throw new Error('Output program world must be GLB bytes');
      programWorld = result.world;
    }
    if ('map' in result) map = await generatedProjectMap(result.map, mapSourceHash ?? program.mapHash);
  }
  if (isProjectGenerator(declaration)) {
    declaration = await declaration(generation);
    if (typeof declaration === 'object' && declaration !== null && 'shard' in declaration) {
      if (!('output' in declaration) || Object.keys(declaration).some(key => !['shard', 'output', 'map', 'discovery'].includes(key))) throw new Error('Generated project requires shard, output and optional map/discovery');
      if ('map' in declaration) map = await generatedProjectMap(declaration.map, mapSourceHash ?? program.mapHash);
      if ('discovery' in declaration) discovery = parseDiscoveryValues(declaration.discovery);
      generatedOutput = declaration.output;
      if (generatedOutput === undefined) throw new Error('Generated project output is absent');
      declaration = declaration.shard;
    }
  }
  const sourcePath = (path: string): string => {
    const resolved = realpathSync(resolve(root, path));
    if (!resolved.startsWith(`${root}${sep}`)) throw new Error('Authored source resolves outside the author project'); return resolved;
  };
  if ('behaviour' in loaded) {
    const compiled = await compileBehaviourSource(loaded['behaviour'], declaration, path => new TextDecoder('utf-8', { fatal: true }).decode(readBoundedFile(sourcePath(path), 1_000_000)));
    declaration = compiled.declaration;
    for (const [hash, bytes] of compiled.assets) baked.set(hash, bytes);
  }
  // D74: inline material graphs become content-addressed graph files of the closure before any admission reads them
  const lowered = lowerMaterialGraphs(declaration);
  declaration = lowered.declaration;
  for (const [hash, bytes] of lowered.assets) baked.set(hash, bytes);
  if (typeof declaration === 'object' && declaration !== null && 'world' in declaration) {
    const world = parseWorldSource(declaration.world);
    const product = await bakeAuthoredWorld(declaration, programWorld ?? readBoundedFile(sourcePath(world.glb), 256_000_000), hash => baked.get(hash));
    shard = product.shard;
    for (const [hash, bytes] of product.assets) baked.set(hash, bytes);
  } else shard = parseShardfile(declaration);
  checkProjectRuntime(project, projectPerformancePolicy(project, shard));
  const sidecar = sidecarModule?.exports;
  if (sidecar !== undefined && ('output' in loaded || !('output' in sidecar))) throw new Error('Output sidecar requires one unambiguous output export');
  if (generatedOutput !== undefined && (sidecar !== undefined || 'output' in loaded)) throw new Error('Generated project requires one unambiguous output declaration');
  let sidecarOutput = sidecar?.['output'];
  const prepareOutput = sidecar?.['prepareOutput'];
  if (prepareOutput !== undefined) {
    if (!isProjectGenerator(prepareOutput) || sidecarModule === undefined) throw new Error('Output preparation must be a build function');
    sidecarOutput = await prepareOutput(generation);
  }
  // GR6: an output sidecar may also build the project's map lattice (`prepareMap(ctx)` → `{ pixels, name? }`), as a
  // source program returning `map` does; one producer of the map only
  const prepareMap = sidecar?.['prepareMap'];
  if (prepareMap !== undefined) {
    if (!isProjectGenerator(prepareMap)) throw new Error('Map preparation must be a build function');
    if (map !== undefined) throw new Error('Generated project declares its map twice');
    map = await generatedProjectMap(await prepareMap(generation), mapSourceHash ?? program.mapHash);
  }
  // A sidecar may compute finite discovery data through the same explicit input context.
  const prepareDiscovery = sidecar?.['prepareDiscovery'];
  if (prepareDiscovery !== undefined) {
    if (!isProjectGenerator(prepareDiscovery)) throw new Error('Discovery preparation must be a build function');
    if (discovery !== undefined) throw new Error('Generated project declares its discovery twice');
    discovery = parseDiscoveryValues(await prepareDiscovery(generation));
  }
  shard = mergeProjectSections(shard, sidecar?.['sections']);
  const output = await prepareProjectOutput(project, generatedOutput ?? (sidecar === undefined ? loaded['output'] : sidecarOutput), { source: shard, options: projectDecisionOptions(loaded['buildOptions'], projectDecisionBudget(project, decisionLegacyLines)) });
  // The CLI-only sidecar may declare the runtime/const.ts mirrors too (a browser config cannot import data/ values).
  if (sidecar !== undefined && 'mirrors' in loaded && 'mirrors' in sidecar) throw new Error('Runtime mirrors declared by both the config and its output sidecar');
  const mirrors = projectMirrors('mirrors' in loaded ? loaded['mirrors'] : sidecar !== undefined && 'mirrors' in sidecar ? sidecar['mirrors'] : undefined);
  if (mapSourceHash !== undefined && map === undefined) throw new Error('Generated map source identity requires a generated map');
  generationSucceeded = true;
  return { map, discovery, shard, commons: 'commons' in loaded ? loaded['commons'] : undefined, baked, output, mirrors };
  } finally { await finishProjectGeneration(generation, generationSucceeded); }
}

/** Compile authored geometry and read its remaining immutable inputs without writing hashes into the author folder. */
export async function readProjectAssets(project: string, map?: ProjectMap, manifestSource?: ProjectManifestSource, options: { decisionLegacyLines?: number; output?: string; mapSourceHash?: string } = {}): Promise<{ shard: Shardfile; assets: Map<string, Uint8Array>; output: Omit<OutputProductOptions, 'runtime'>; mirrors: readonly RuntimeMirror[] }> {
  const loaded = await withAssetOwner(() => projectModule(project, options.decisionLegacyLines, options.output, options.mapSourceHash, manifestSource?.imageRoots)), pinned = new Map(pinnedCommons(loaded.commons, loaded.shard, project));
  for (const [hash, bytes] of loaded.baked) pinned.set(hash, bytes);
  for (const [hash, bytes] of loaded.output.assets) {
    const previous = pinned.get(hash);
    if (previous !== undefined && hashAssetBytes(previous) !== hashAssetBytes(bytes)) throw new Error('Output asset conflicts with baked input');
    pinned.set(hash, bytes);
  }
  const level = manifestSource === undefined || manifestSource.file === undefined && loaded.shard.manifest === undefined ? undefined : await readManifestSource(manifestSource, loaded.shard.manifest, loaded.map?.map.bytes);
  if (level !== undefined && loaded.shard.manifest !== undefined && canonicalJson(loaded.shard.manifest) !== canonicalJson(level.authored)) throw new Error('Authored manifest differs from configured level metadata');
  const source = level === undefined ? loaded.shard : parseShardfile({ ...loaded.shard, manifest: level.manifest });
  if (map !== undefined && loaded.map !== undefined) throw new Error('Build map and generated map cannot compete');
  const selectedMap = loaded.map?.map ?? map, packed = selectedMap === undefined ? undefined : packProjectMap(source, selectedMap);
  if (packed !== undefined && selectedMap !== undefined) pinned.set(packed.hash, selectedMap.bytes);
  const shard = packed?.shard ?? source;
  const mapBlobs = loaded.map?.name === undefined ? [] : [nameBlob(loaded.map.name, 'image', loaded.map.map.bytes)];
  // Explicit authored hints retain their positions; automatic UI hints never duplicate them or commons.
  const declaredLate = new Set([...(shard.late ?? []), ...(loaded.output.late ?? [])].map(row => row.hash)),
    existingFiles = new Set(shard.files.map(row => row.hash)), libraryRoots = new Set(shard.library);
  const late = [...loaded.output.late ?? [], ...(level?.late ?? []).filter(row => !declaredLate.has(row.hash) && !shard.requires.commons.includes(row.hash)
    && (!existingFiles.has(row.hash) || libraryRoots.has(row.hash)))];
  const merged = mergeProjectBlobs(shard, pinned, [...loaded.output.blobs, ...mapBlobs, ...(level?.blobs ?? [])], loaded.output.options.namedFiles, late);
  return { shard: merged.shard, assets: projectAssets(project, merged.shard, 'project', merged.assets),
    output: { ...loaded.output.options, namedFiles: merged.namedFiles, ...(loaded.discovery === undefined ? {} : { discovery: loaded.discovery }) }, mirrors: loaded.mirrors };
}

function pinnedCommons(input: unknown, source: Shardfile, project: string): ReadonlyMap<string, Uint8Array> | undefined {
  if (input === undefined) return undefined;
  preflightDeclaredCosts(source, offlineMemoryAdmission(projectPerformancePolicy(project, source)));
  if (typeof input !== 'object' || input === null || !('catalogue' in input) || !('assets' in input)) throw new Error('Build-only commons export needs a compiled catalogue');
  const catalogue = input.catalogue;
  if (typeof catalogue !== 'object' || catalogue === null || !('format' in catalogue) || catalogue.format !== 'wildshard.commons' || !('version' in catalogue) || catalogue.version !== 0 || !(input.assets instanceof Map)) throw new Error('Unsupported build-only commons catalogue');
  const assets = new Map<string, Uint8Array>();
  for (const hash of source.requires.commons) {
    const bytes: unknown = input.assets.get(hash);
    if (!(bytes instanceof Uint8Array) || bytes.length !== source.requires.commonsWire[hash] || hashAssetBytes(bytes) !== hash) throw new Error('Pinned commons export misses or changes a required asset');
    assets.set(hash, bytes);
  }
  return assets;
}
/** Preflight and read bounded immutable files from an author project or flat built product. */
export function projectAssets(project: string, shard: Shardfile, layout: 'project' | 'product' = 'project', pinned?: ReadonlyMap<string, Uint8Array>): Map<string, Uint8Array> {
  preflightShardfile(shard); preflightAssetGraph(shard);
  preflightDeclaredCosts(shard, offlineMemoryAdmission(projectPerformancePolicy(project, shard)));
  assertProductTargets(shard, projectPerformancePolicy(project, shard));
  const read = (hash: string, size: number, folder: string): Uint8Array => {
    const bytes = pinned?.get(hash) ?? readBoundedFile(resolve(project, layout === 'project' ? folder : '.', hash), size);
    if (bytes.length !== size) throw new Error('Project asset differs from its declared wire size'); return bytes;
  };
  return new Map([...shard.files.map((f) => [f.hash, read(f.hash, f.compressed, 'assets')] as const), ...shard.requires.commons.map((h) => [`commons:${h}`, read(h, shard.requires.commonsWire[h] ?? 0, 'commons')] as const)]);
}
/**
 * Build a deterministic shard.json, immutable files and the distributed normal client when present; a shardfile with a
 * terrain gains its far / near placeholders when `placeholders` is set (the CLI's default).
 */
export async function buildProject(project: string, output?: string, options: { decisionLegacyLines?: number; output?: string; outputFormat?: 2; manifest?: ProjectManifestSource; copyRuntime?: boolean; devserver?: boolean; client?: string | null; map?: ProjectMap; mapSourceHash?: string; placeholders?: boolean; admit?: (shard: Shardfile, assets: ReadonlyMap<string, Uint8Array>, policy: 'warn' | 'refuse', sections: ReadonlyMap<string, unknown>) => Promise<void> } = {}): Promise<Shardfile> {
  let phaseStarted = diagnosticNow();
  const phase = (name: string): void => {
    const now = diagnosticNow();
    if (process.env['GITHUB_ACTIONS'] === 'true') console.info(`author timing: ${JSON.stringify({ pid: process.pid, phase: name, product: options.output ?? project, seconds: Number(((now - phaseStarted) / 1000).toFixed(3)) })}`);
    phaseStarted = diagnosticNow();
  };
  await buildBehaviourProject(project); phase('behaviour-compile');
  const loaded = await readProjectAssets(project, options.map, options.manifest, options), assets = loaded.assets;
  phase('project-read');
  // SERVER-PARITY SS8: a kind or script whose side has no half to run it refuses here, one plain line each, before any write.
  assertBuildSides(outputPlatformPayloads(loaded.output.platform, SIDE_SECTIONS), namedJsonReader(loaded.output.namedFiles ?? [], assets));
  // G348: a shardfile with a terrain gets its far and near placeholders from its own terrain, tiles and look (`wildshard
  // build` asks for them; the first-party product builds keep theirs in the repo bake until the grid reads `near`)
  // a static import: the author CLI must bundle to one module (scripts/wildshard.mjs); the bakers' closure stays
  // renderer-free (the Node sim proofs import this module under the renderer-denying loader)
  const shard = validateProject(options.placeholders === true ? await projectPlaceholders(loaded.shard, assets) : loaded.shard, assets, project, outputScriptAdmissionRows(loaded.output.platform));
  phase('asset-admission');
  // The decision rows travel with the moves they bind, so a headless admission resolves the same registries as the build.
  await options.admit?.(shard, assets, projectPerformancePolicy(project, shard), outputPlatformPayloads(loaded.output.platform));
  phase('simulation-admission');
  const destination = output ?? resolve(shardOutputRoot(project), 'public/shardfiles', shard.identity.slug);
  const clientPlan = shard.runtime !== null;
  if (options.copyRuntime === true || clientPlan) {
    const root = realpathSync(project), target = resolve(destination);
    if (target === root || target.startsWith(`${root}${sep}`) || root.startsWith(`${target}${sep}`)) throw new Error('Runtime output must be separate from its author project');
  }
  clearOutputProduct(destination);
  let descriptor: ReturnType<typeof writeOutputProduct>;
  try {
    const runtime = options.copyRuntime === true || clientPlan ? writeRuntimeFiles(project, destination) : undefined;
    const cook = await withDiscovery(project, shard.manifest ?? options.manifest?.composed ?? authorManifest(shard), loaded.output.discovery, readCookInput(project, shard.identity.slug), assets);
    descriptor = writeOutputProduct(shard, assets, destination, { ...loaded.output, ...(runtime === undefined ? {} : { runtime }), ...(cook === undefined ? {} : { cook }) });
    phase('product-write');
    if (runtime !== undefined) proveRuntimeData(destination, descriptor, loaded.mirrors);
    phase('runtime-proof');
  } catch (error) { clearOutputProduct(destination); throw error; }
  const directory = import.meta.dirname;
  const clientFolder = options.devserver === true ? 'client-devserver' : 'client';
  const client = options.client === null ? undefined : options.client ?? [resolve(directory, clientFolder), resolve(directory, 'dist', clientFolder)].find((path) => existsSync(resolve(path, 'index.html')));
  if (client !== undefined) {
    cpSync(client, destination, { recursive: true });
    const json = canonicalJson(descriptor).replaceAll('<', String.raw`\u003c`);
    const html = readFileSync(resolve(destination, 'index.html'), 'utf8').replace('</head>', `<script id="ws-shardfile" type="application/json">${json}</script></head>`);
    writeFileSync(resolve(destination, 'index.html'), html);
  }
  return shard;
}
/** C3: a manifest's bindings go with the product, so a page needs nothing compiled to enter it: the packed level manifest, an
 *  output's composed one, which packs no images of its own, or for an author with neither, the plain one their shard implies. */
async function withDiscovery(project: string, manifest: unknown, values: DiscoveryValues | undefined, input: CookInput | undefined, assets: ReadonlyMap<string, Uint8Array>): Promise<CookInput | undefined> {
  if (typeof manifest !== 'object' || manifest === null || !('slug' in manifest) || typeof manifest.slug !== 'string' || !('bindings' in manifest)) return input;
  // A manifest's slug is its product's folder (`packManifestImages`).
  const folder = manifest.slug, document = await discoveryDocument(folder, manifest, values, async (module, name) => {
    if (module === AUTHOR_BUDGETS_MODULE) return AUTHOR_BUDGETS;
    if (name === 'css') return readFileSync(resolve(project, module), 'utf8');
    if (module.endsWith('.json')) return JSON.parse(readFileSync(resolve(project, module), 'utf8')) as unknown;
    return (await authorModule(project, `${module.replace(/^\.\//u, '')}.ts`)).exports[name];
  });
  // Rows name their images where the author keeps them. A product holding those bytes serves them; the rest ride as mounts.
  const mounts = new Map<string, Uint8Array>(), art = new Map<string, number>();
  const packed = JSON.stringify(document).replaceAll(/"\/(src\/shards\/[^"]+(\.[a-z]+))"/gu, (row: string, path: string, extension: string) => {
    if (!/^\.(?:jpe?g|png|webp|svg|hdr)$/u.test(extension)) return row;
    const bytes = readFileSync(resolve(project, '../../..', path)), hash = hashAssetBytes(bytes), held = assets.has(hash);
    const url = `/shardfiles/${folder}/blobs/image/${hash}${extension}`;
    if (!held) mounts.set(url, bytes);
    art.set(url, bytes.length);
    return `"${url}"`;
  });
  for (const [, url, hash] of packed.matchAll(/"(\/shardfiles\/[^/"]+\/blobs\/image\/([a-f0-9]{64})\.[a-z0-9]+)"/gu)) {
    const bytes = hash === undefined ? undefined : assets.get(hash);
    if (url !== undefined && bytes !== undefined) art.set(url, bytes.length);
  }
  return {...input, mounts: [...input?.mounts ?? [], ...[...mounts].map(([url, bytes]) => ({url, bytes})),
    {url: discoveryUrl(folder), bytes: new TextEncoder().encode(`${packed.slice(0, -1)},"art":${JSON.stringify(Object.fromEntries(art))}}`)}]};
}
/** Create the runtime-free source layout without replacing existing work. */
/** A bare shard source at `project` (`wildshard new --empty` writes the same one at a new repo's `src/`). */
export function newProject(project: string, slug: string): void { writeEmptyShardSource(project, slug); }
