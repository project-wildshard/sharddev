import { authorStartLinks } from './authorStartLinks';
import { printSpawnWarnings } from '@wildshard/sdk/internal/spawnWarnings';
// oxlint-disable-next-line import/no-nodejs-modules -- The author CLI accepts filesystem project/output paths.
import { basename, dirname, relative, resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- `prove` tells a project from a built product by its config file.
import { existsSync } from 'node:fs';
import { readProjectAssets, validateProject } from '@wildshard/build/project';
import { printStaticReport, runBuild, ShardfileRefusalError, type BuildVerbOptions } from '@wildshard/build/buildVerb';
import { ShardfileSchema } from '@wildshard/format/shardSchema';
import { devProject } from './dev';
import { watchProject } from './watch/watch';
import { devClient } from './devClient';
import { proveAuthorSimulation } from '@wildshard/engine/host/headless';
import { projectPerformancePolicy } from '@wildshard/sdk/internal/performancePolicy';
import { assetOverdraw } from '@wildshard/sdk/assets';
// oxlint-disable-next-line import/no-nodejs-modules -- The CLI releases its author server on termination.
import process from 'node:process';
import { synthProject } from '@wildshard/build/synth';
import { formatJsonSchemas, schemaAt, schemaDeclaration } from '@wildshard/sdk/formatJsonSchema';
import { decisionModuleContracts } from '@wildshard/format/scriptContract';
import { outputPlatformPayloads, outputScriptAdmissionRows, validateOutputProduct } from '@wildshard/sdk/outputProduct';
import { locatedError } from '@wildshard/sdk/internal/authorError';
import { DEFAULT_TEMPLATE, templateNamed, writeShardRepo } from '@wildshard/sdk/internal/newProject';
import { updateShardRepo } from '@wildshard/sdk/internal/agentFiles';
import { updatePins } from '@wildshard/sdk/internal/updatePins';
import { findShardSource, isHandwrittenSource, isRepoSource } from '@wildshard/upload/sharddev/shardSource';
import { checkProject, readProofTape } from './checkProject';
import { checkLines } from './check';
import { refusalCode, refusalHint, refusalNote, type RefusalStep } from '@wildshard/upload/sharddev/refusals';
import { providePortalEntryProof } from '@wildshard/sdk/projectGeneration';

// SDK-SPLIT SP8a: generation's static portal walk (Rapier and the engine sim) is this CLI's to hand in; it loads only when
// a generator asks for it (Nine Dragon's entry proof), so a build that never asks never starts Rapier.
providePortalEntryProof(async (input, pieces) => (await import('./projectEntryProof')).proveStaticPortalEntries(input, pieces));

/** SDK-SPLIT SP7c (D3): build and validate run no simulation. `wildshard check` runs the engine's own full check (the cook's,
 *  SP19), which measures script CPU and walks every entry on this host; this line says so where the measure used to print. */
const SIMULATION_ELSEWHERE = 'simulation, script CPU and entry walk: not run by build or validate; wildshard check runs them (the engine\'s own check, as the upload cook does)';
/** The verbs whose first operand is a shard source (or, for validate and prove, a built folder). */
const SOURCE_VERBS: ReadonlySet<string> = new Set(['check', 'synth', 'build', 'dev', 'watch', 'validate', 'prove']);
type CliOptions = BuildVerbOptions;
async function runCommand(given: readonly string[], options: CliOptions): Promise<void> {
  // SA16 (J317): a verb given a repo finds its shard source at `src/` or its one `src/shards/<slug>/`.
  const args = SOURCE_VERBS.has(given[0] ?? '') && given[1] !== undefined && !given[1].startsWith('--') ? [given[0] ?? '', findShardSource(given[1]), ...given.slice(2)] : given;
  const [command, input, output, buildFlag] = args;
  if (command === 'schema') {
    if (buildFlag !== undefined) throw new Error('usage: wildshard schema [list|shardfile|root] [JSON-pointer]');
    if (input === undefined || input === 'list') {
      if (output !== undefined) throw new Error('schema list accepts no pointer');
      console.info(JSON.stringify(['shardfile', ...Object.keys(formatJsonSchemas())], null, 2)); return;
    }
    const document = input === 'shardfile' ? schemaDeclaration(ShardfileSchema) : formatJsonSchemas()[input];
    if (document === undefined) throw new Error(`Unknown schema root: ${input}`);
    // Whole root sections accept their authored spelling; deeper paths retain RFC 6901 semantics.
    const pointer = input === 'shardfile' && output !== undefined && /^\/[a-z][A-Za-z0-9]*$/u.test(output)
      ? `/properties${output}` : output;
    console.info(JSON.stringify(schemaAt(document, pointer), null, 2)); return;
  }
  if (command === 'check') {
    const rest = args.slice(1), json = rest.includes('--json'), positional = rest.filter(value => !value.startsWith('--'));
    // TS21: --output=<slug> checks one declared output of the folder (scripts/wildshard.mjs composes its manifest and, with
    // no --output on a folder that declares outputs, checks each in turn).
    const outputs = rest.filter(value => value.startsWith('--output=')), selected = outputs[0]?.slice('--output='.length);
    if (positional.length === 0 || positional.length > 2 || rest.some(value => value.startsWith('--') && value !== '--json' && !value.startsWith('--output=')) || rest.filter(value => value === '--json').length > 1 || outputs.length > 1 || selected === '') throw new Error('usage: wildshard check <source> [folder] [--json] [--output=<slug>]');
    // --json: stdout carries the verdict document alone; everything the steps print goes to stderr.
    // (scripts/wildshard.mjs moves log and debug for the whole run; the steps here log with info and warn.)
    const saved = { info: console.info, warn: console.warn }, toError = console.error.bind(console);
    if (json) Object.assign(console, { info: toError, warn: toError });
    let result;
    try { result = await checkProject(findShardSource(positional[0] ?? ''), positional[1], selected === undefined ? options : { ...options, output: selected }); } finally { Object.assign(console, saved); }
    process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `${checkLines(result).join('\n')}\n`);
    if (result.verdict === 'fail') process.exitCode = 1;
    return;
  }
  if (command === 'update') {
    // SA28 (J314 Q7, Q27): one verb. SA18: `--pins[=<version>]` also moves the pins, installs, applies the release's
    // codemods and runs check (updatePins.ts); with no version it takes npm's latest.
    const rest = args.slice(1), pins = rest.filter(value => value === '--pins' || value.startsWith('--pins='));
    const positional = rest.filter(value => !pins.includes(value)), version = pins[0]?.startsWith('--pins=') === true ? pins[0].slice('--pins='.length) : 'latest';
    if (pins.length > 1 || version === '' || positional.length > 1 || positional.some(value => value.startsWith('-'))) throw new Error('usage: wildshard update [dir] [--pins[=<version>]]');
    if (pins.length === 1 && /^\d+\.\d+\.\d+/u.test(positional[0] ?? '') && !existsSync(resolve(positional[0] ?? ''))) throw new Error(`usage: wildshard update [dir] [--pins[=<version>]]: name a version as --pins=${positional[0] ?? ''}`);
    if (pins.length === 1) { await updatePins(resolve(positional[0] ?? '.'), version); return; }
    for (const line of updateShardRepo(resolve(positional[0] ?? '.'))) console.info(line);
    return;
  }
  if (input === undefined) throw new Error('usage: wildshard new <dir> | check <source> [folder] [--json] | synth <source> | build <source> [folder] [--shardfile-only|--folder-only] [--no-placeholders] [--output=<slug>] | build <source> --behaviour-only | validate <source|shard.json> | dev <source> [port] | watch <source> [port] (wildshard --help lists them all)');
  // SA16 (J314): a hand-written src/ (--template blender) has no shard.config.ts to build, synth or serve; check settles it.
  if ((command === 'build' || command === 'synth' || command === 'dev') && isRepoSource(resolve(input)) && isHandwrittenSource(resolve(input))) throw new Error(`${command}: ${input} is a hand-written shard file (the retired --template blender): run wildshard check on the repo, which settles and builds it`);
  if (command === 'synth') {
    if (output !== undefined) throw new Error('usage: wildshard synth <source>');
    const result = await synthProject(resolve(input));
    console.info(`synthesized ${result.path} (${result.hash})`); return;
  }
  if (command === 'new') {
    // SA16: `--template <name>` (or `--template=<name>`) picks the template; a flag only, never a prompt; default scene
    // (Mossgate Hollow, TEMPLATE-E2E TR-2, J434).
    const newArguments = args.slice(2), names: string[] = [], templates: string[] = [];
    let empty = 0, unknown = false;
    for (let index = 0; index < newArguments.length; index += 1) {
      const value = newArguments[index] ?? '';
      if (value === '--empty') empty += 1;
      else if (value === '--template') { const name = newArguments[index + 1]; if (name === undefined || name.startsWith('--')) unknown = true; else templates.push(name); index += 1; }
      else if (value.startsWith('--template=')) templates.push(value.slice('--template='.length));
      else if (value.startsWith('--')) unknown = true;
      else names.push(value);
    }
    if (input.startsWith('--') || names.length > 1 || unknown || empty > 1 || templates.length > 1) throw new Error('usage: wildshard new <dir> [slug] [--template scene] [--empty]');
    // An unknown template refuses here, before anything is written.
    const template = templateNamed(templates[0] ?? DEFAULT_TEMPLATE);
    const slug = names[0] ?? input.split('/').reverse().find((part) => part !== '') ?? '';
    writeShardRepo(resolve(input), slug, { template, empty: empty === 1 });
    // NEW-SHARD-E2E F8: say what was made and what to run next, never exit silently
    const shown = relative(process.cwd(), resolve(input)) || '.';
    console.info(`wildshard new: made ${shown}/, shard ${slug} (${template === 'scene' ? 'a three.js scene shard' : empty === 1 ? 'a bare shard source' : 'the Template, a three.js scene module'}) at ${shown}/src/`);
    console.info(`next: cd ${shown} && pnpm install && pnpm exec wildshard check .${template === 'scene' ? ', then pnpm exec wildshard watch . to see each save' : ''} (GUIDE.md is the guide)`);
    return;
  }
  if (command === 'watch') {
    // SHARD-SOURCE AP6: a scene shard's edits swap into the running page, no reload (`dev` is unchanged)
    const port = output === undefined ? 0 : Number(output);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('watch port must be 0..65535');
    const server = await watchProject(resolve(input), { port, client: await devClient() });
    const onSignal = (): void => {
      // oxlint-disable-next-line unicorn/no-process-exit -- the signal handler replaced Node's default exit; ending is its job.
      void server.close().finally(() => { process.exit(0); });
    };
    process.on('SIGINT', onSignal); process.on('SIGTERM', onSignal);
    console.info(authorStartLinks('watch', server.url).join('\n')); return;
  }
  if (command === 'dev') {
    const port = output === undefined ? 0 : Number(output);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('dev port must be 0..65535');
    const server = await devProject(resolve(input), { port, client: await devClient(), ...(options.decisionLegacyLines === undefined ? {} : { decisionLegacyLines: options.decisionLegacyLines }), ...(options.manifest === undefined ? {} : { manifest: options.manifest }) });
    // SD-6: a signal handler replaces Node's default exit, so the handler ends the process itself: free the port and the
    // build products, then exit 0 (exit drops the watchers and any rebuild still running). A second signal exits at once.
    let stopping = false;
    const stop = async (): Promise<void> => {
      // oxlint-disable-next-line unicorn/no-process-exit -- a second Ctrl-C ends `dev` without waiting for the first.
      if (stopping) process.exit(0);
      stopping = true;
      try { await server.close({ exiting: true }); } catch (error) { console.error(`wildshard dev: ${error instanceof Error ? error.message : String(error)}`); }
      // oxlint-disable-next-line unicorn/no-process-exit -- the signal handler replaced Node's default exit; ending is its job.
      process.exit(0);
    };
    const onSignal = (): void => { void stop(); };
    process.on('SIGINT', onSignal); process.on('SIGTERM', onSignal);
    // SA15: `?skipintro` walks straight into the shard; the bare page sits on the game's title over it
    console.info(authorStartLinks('dev', server.url).join('\n')); return;
  }
  // SDK-SPLIT SP9d1: the build verb is build's (packages/build/src/sharddev/buildVerb.ts).
  if (command === 'build') { await runBuild(input, args.slice(2), options); return; }
  if (command === 'prove') {
    if (input.endsWith('.json') && basename(input) !== 'shard.json') throw new Error('prove requires a format-2 shard.json or shard source');
    if (output === undefined || buildFlag !== undefined) throw new Error('usage: wildshard prove <source|shard.json> <proof.json>');
    const built = input.endsWith('.json') || !existsSync(resolve(input, 'shard.config.ts'));
    // A v1 decision (the Template's) needs the output's sections, or the engine reads every Wasm as ABI 0 and refuses
    // `Import signature outside ABI` (engine TC-NE5b).
    const { shard, assets, sections } = built
      ? validateOutputProduct(resolve(input.endsWith('.json') ? dirname(input) : input))
      : await readProjectAssets(resolve(input), undefined, options.manifest, options).then(read => ({ ...read, sections: outputPlatformPayloads(read.output.platform) }));
    const plan = readProofTape(resolve(output));
    console.info(JSON.stringify(await proveAuthorSimulation(shard as unknown as Parameters<typeof proveAuthorSimulation>[0], assets, plan, sections), null, 2)); return;
  }
  if (command === 'validate') {
    if (input.endsWith('.json') && basename(input) !== 'shard.json') throw new Error('validate requires a format-2 shard.json or shard source');
    const folder=resolve(input.endsWith('.json') ? dirname(input) : input);
    if (input.endsWith('.json') || existsSync(resolve(folder, 'shard.json'))) {
      // P1-F3 (a): format validation, @wildshard/format/productValidation alone (schema, inventory, hashes, budgets, admission rows).
      const checked = validateOutputProduct(folder);
      printSpawnWarnings(checked.shard);
      // P1-F3 (b), the execution proof, is `wildshard check`'s (SP7c). G491 holds there: validation.json is static build
      // evidence, never authority for current script CPU; check executes the admitted bytes again on this host.
      printStaticReport(checked.shard, checked.shard.runtime === null ? 'refuse' : 'warn');
      console.info(`validated ${checked.shard.identity.slug}: format 2 inventory, byte kinds and section schemas`);
      console.info(SIMULATION_ELSEWHERE); return;
    }
    const { shard, assets, output: extensions } = await readProjectAssets(resolve(input), undefined, options.manifest, options);
    const scripts = outputScriptAdmissionRows(extensions.platform), contracts = decisionModuleContracts(scripts, shard.files);
    const project = resolve(input), policy = projectPerformancePolicy(project, shard);
    validateProject(shard, assets, project, scripts);
    let layers = 0, blended = 0, masked = 0;
    const kinds = new Map(shard.files.map((file) => [file.hash, file.kind]));
    for (const [hash, bytes] of assets) {
      const kind = kinds.get(hash) ?? 'commons';
      const estimate = assetOverdraw(kind, bytes, kind === 'wasm' ? contracts.get(hash) ?? { abi: 0 } : undefined); layers += estimate.layers; blended += estimate.blendedLayers; masked += estimate.maskedLayers;
    }
    console.info(`advisory asset raster layers: ${layers.toFixed(2)} total, ${blended.toFixed(2)} blended, ${masked.toFixed(2)} alpha-tested (primitive bounds; before culling/occlusion, not measured screen overdraw)`);
    // The static half of the performance report (declared bounds, downloads, memory) stays; scripts are check's to measure.
    printStaticReport(shard, policy);
    console.info(`validated ${shard.identity.slug} v${shard.version}: format 2 source, assets and section schemas`);
    console.info(SIMULATION_ELSEWHERE);
    return;
  }
  throw new Error('unknown wildshard command');
}
/** The step a verb's refusal comes from (SA21): `dev` and `synth` build. */
const STEPS: Readonly<Record<string, RefusalStep>> = { new: 'new', update: 'update', validate: 'validate', prove: 'prove' };
/** The refusal with its rule, fix and GUIDE.md link on a second line; the first line stays the refusing code's words. */
function authorRefusal(command: string | undefined, error: unknown): unknown {
  const located = locatedError(error);
  const message = located instanceof Error ? located.message : String(located);
  const step = error instanceof ShardfileRefusalError ? 'shardfile' : command !== undefined && Object.hasOwn(STEPS, command) ? STEPS[command] : undefined;
  const hint = refusalHint(refusalNote(step ?? 'build', message, { code: refusalCode(error) }));
  return new Error(`${message}\n  ${hint}`, { cause: error });
}
/** Run the author CLI; returns only after validation/build completes. */
export async function runCli(args: readonly string[], options: CliOptions = {}): Promise<void> {
  try { await runCommand(args, options); } catch (error) { throw authorRefusal(args[0], error); }
}
