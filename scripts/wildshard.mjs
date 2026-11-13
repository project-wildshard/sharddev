#!/usr/bin/env node
// Execute the workspace's author CLI without requiring a previously packed SDK or a Vite dev server.
import { build } from 'vite';
import { createBuildCacheCounters, observeBuildCache, formatBuildCacheReport } from '@wildshard/engine/scripts/build-cache-report.mjs';
import { captureProductInputs, recordBundle, inputRecorderPlugin } from '@wildshard/engine/scripts/shardfile-inputs.mjs';
import { basename, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { importBundle } from './import-bundle.mjs';
import { shardfileValidationRevision } from '@wildshard/engine/scripts/shardfile-validation-revision.mjs';
import { rapierAlias } from '@wildshard/engine/vite/rapier.ts';
import { authorBundleCached } from '@wildshard/engine/scripts/author-bundle-cache.mjs';
import { decisionLegacyLines } from '@wildshard/engine/scripts/decision-legacy-lines.mjs';
import { outputManifest, shardOutputs } from '@wildshard/engine/scripts/shard-outputs.mjs';
import { findShardSource, shardFolderName } from '../src/sharddev/shardSource.ts';

/** The verbs whose first operand is a shard source (or, for validate and prove, a built folder). */
const SOURCE_VERBS = new Set(['check', 'synth', 'build', 'dev', 'validate', 'prove']);

let runner;
/** SA3 (J170): `build` and `check` end by writing the folder's shard file, the step `pack` was. It stays out of the author
 * bundle: the same module serves `wildshard build <folder>` and the deprecated `pack` (src/cli/main.ts). */
async function writeShardfile(dir, source, options = {}) {
  const { writeShardfile: write } = await import('../src/cli/shardfile/shardfile.ts');
  return (await write({ dir, source, report: line => console.info(line), ...options })).file;
}
// The bundle's import.meta.dirname stays src/sdk: headless.ts finds bake/headlessWorker.ts beside it, and src/sdk keeps the
// author tools' dependency links until the host leaves at P3 (P1-F4).
const authorRequire = createRequire(resolve(import.meta.dirname, '../src/sharddev/package.json'));
// P4: the project is the repo the author stands in; the tools are this package.
const projectRoot = () => process.cwd();
/** Compile the trusted CLI once before product children; later invocations
 * verify the same content-addressed compiler and replay its complete inputs. */
export function prepareWildshard() {
  const root=projectRoot();
  // Resolver policy is executable compiler input too: a source-only cache hit
  // must not replay a bundle built before an externalization change.
  const policy = createHash('sha256').update(readFileSync(import.meta.filename)).digest('hex');
  return authorBundleCached(root,[shardfileValidationRevision(root),policy],async()=>{
    const result = await build({ configFile: false, publicDir: false, resolve: { alias: rapierAlias }, logLevel: 'silent', define: { __SHARDFILE_VALIDATOR__: JSON.stringify(shardfileValidationRevision()), 'import.meta.dirname': JSON.stringify(resolve(import.meta.dirname, '../src/sharddev')) }, plugins: [inputRecorderPlugin({execution:true}), { name: 'author-node-vite', enforce: 'pre', resolveId(id) {
      if (id === 'vite') return { id: pathToFileURL(resolve(import.meta.dirname,'shardfile-vite.mjs')).href, external: true };
      if (id === 'sharp' || id === 'binaryen' || id === '@typescript/typescript6' || /^assemblyscript(?:\/|$)/u.test(id)) return { id: pathToFileURL(authorRequire.resolve(id)).href, external: true };
      return null;
    } }], build: { write: false, minify: false, lib: { entry: resolve(import.meta.dirname, '../src/sharddev/cli.ts'), formats: ['es'], fileName: 'cli' }, rolldownOptions: { platform: 'node', external: [/^node:/u], output: { codeSplitting: false } } } });
    recordBundle(result,{execution:true});
    const output = Array.isArray(result) ? result.at(0) : result;
    if (output === undefined || !('output' in output)) throw new Error('Author CLI build produced no output');
    const chunks = output.output.filter((chunk) => chunk.type === 'chunk');
    if (chunks.length !== 1) throw new Error('Author CLI must bundle to one module');
    return { code: chunks[0].code, modules: chunks[0].moduleIds ?? Object.keys(chunks[0].modules) };
  });
}
/** Bundle trusted workspace tooling once; external Vite resolves against this installed tool, not a data URL. */
export async function runWildshard(args) {
  const receipt = args.find(arg=>arg.startsWith('--input-receipt='))?.slice('--input-receipt='.length);
  if (receipt !== undefined) { await captureProductInputs(projectRoot(),receipt,()=>runWildshard(args.filter(arg=>!arg.startsWith('--input-receipt=')))); return; }
  runner ??= (async () => {
    const started = performance.now(), bundle = await prepareWildshard();
    recordBundle({output:[{type:'chunk',moduleIds:bundle.modules}]},{execution:true});
    const cli = await importBundle(bundle.code);
    if (cli === null || typeof cli !== 'object' || !('runCli' in cli) || typeof cli.runCli !== 'function') throw new Error('Author CLI has no runner');
    if (process.env.GITHUB_ACTIONS === 'true') console.info(`author timing: ${JSON.stringify({ pid: process.pid, phase: 'compiler-bundle', reused:bundle.reused, product: args[1] ?? null, seconds: Number(((performance.now() - started) / 1000).toFixed(3)) })}`);
    return cli.runCli;
  })();
  const root = projectRoot();
  // SA16 (J317): a repo path names its shard source at src/ (one shard) or its one src/shards/<slug>/ (several).
  if (SOURCE_VERBS.has(args[0] ?? '') && args[1] !== undefined && !args[1].startsWith('--')) args = [args[0], findShardSource(args[1]), ...args.slice(2)];
  const project = args[1] === undefined ? undefined : resolve(args[1]);
  // The folder build checks the manifest slug against: a src/ source takes its manifest's slug (new <dir> <slug>).
  const folder = project === undefined ? '' : shardFolderName(project);
  // SF88g: `--output=<slug>` builds one declared output of the folder, under its own slug and composed manifest
  const selected = args.find(arg => arg.startsWith('--output='))?.slice(9);
  const output = project === undefined || selected === undefined ? undefined : shardOutputs(root, folder)?.find(row => row.slug === selected);
  if (selected !== undefined && output === undefined) throw new Error(`wildshard: ${basename(project ?? '')} declares no output ${selected}`);
  const manifest = project === undefined || !['build', 'check', 'validate', 'prove'].includes(args[0] ?? '') || !existsSync(resolve(project, 'shard.config.ts')) ? undefined : {
    folder: output?.slug ?? folder, ...(output !== undefined ? { composed: outputManifest(root, folder, output.row) } : existsSync(resolve(project, 'manifest.json')) ? { file: resolve(project, 'manifest.json') } : {}),
    imageRoots: [{ prefix: `/src/shards/${folder}/`, directory: project }, { prefix: '/assets/', directory: resolve(root, 'public/assets') }],
  };
  const legacy = project === undefined ? undefined : decisionLegacyLines(root, folder);
  await (await runner)(args, { ...(legacy === undefined ? {} : { decisionLegacyLines: legacy }), ...(manifest === undefined ? {} : { manifest }), writeShardfile });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const counters=createBuildCacheCounters(),stop=observeBuildCache(counters);
  let complete=false;
  try {
    let args=process.argv.slice(2);
    // SA4: `check` takes its flags anywhere; with --json, stdout is the verdict document alone, so every log goes to stderr.
    if(args[0]==='check'){
      const rest=args.slice(1);
      args=['check',...rest.filter(arg=>!arg.startsWith('--')),...rest.filter(arg=>arg.startsWith('--'))];
      if(args.includes('--json'))for(const level of ['info','log','warn','debug'])console[level]=console.error.bind(console);
    }
    if(args[0]==='--prepare-compiler') {
      if(args.length!==1)throw new Error('Compiler preparation accepts no other arguments');
      const started=performance.now(),compiler=await prepareWildshard();
      console.info(`Author compiler ${compiler.reused?'reused':'built'} in ${((performance.now()-started)/1000).toFixed(3)}s (before product workers)`);
    } else await runWildshard(args);
    complete=true;
  }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
  finally {stop();console.error(`\n${formatBuildCacheReport(counters.snapshot(complete))}`);}
}
