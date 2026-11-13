// oxlint-disable-next-line import/no-nodejs-modules -- The author CLI accepts filesystem project/output paths.
import { basename, dirname, resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- `prove` tells a project from a built product by its config file.
import { existsSync } from 'node:fs';
import { buildProject, newProject, readProjectAssets, validateProject } from './project';
import { ShardfileSchema, type Shardfile } from '@wildshard/engine/host/shardfile';
import { devProject } from './dev';
import { proveAuthorSimulation, measureSimulation, validateSimulation } from '@wildshard/engine/host/headless';
import { performanceReport, performanceReportLines, type PerformanceObservations } from './reportCard';
import { projectPerformancePolicy } from './performancePolicy';
import { readBoundedFile } from './sourceReader';
import { STILL_IMAGE_LIMITS } from '@wildshard/format/stillImage';
import { assetOverdraw } from './assets';
// oxlint-disable-next-line import/no-nodejs-modules -- The CLI releases its author server on termination.
import process from 'node:process';
import { buildBehaviourProject } from './buildBehaviour';
import { synthProject } from './synth';
import { formatJsonSchemas, schemaAt, schemaDeclaration } from '@wildshard/engine/host/formatJsonSchema';
import { decisionModuleContracts } from '@wildshard/format/scriptContract';
import { outputScriptAdmissionRows, validateOutputProduct } from './outputProduct';
import { locatedError } from './authorError';
import type { ProjectManifestSource } from './projectManifest';
import { writeReferenceProject } from './newProject';
import { checkProject, readProofTape } from './checkProject';
import { checkLines } from './check';
import { refusalHint, refusalNote, type RefusalStep } from './refusals';

const unmeasured: PerformanceObservations = { scripts: { p95Micros: 0, maxMicros: 0, samples: 0 }, fuel: { p95: 0, max: 0, samples: 0 } };
function printReport(shard: Shardfile, observed: PerformanceObservations, policy: 'warn' | 'refuse'): void {
  const report = performanceReport(shard, observed, policy);
  for (const line of performanceReportLines(report)) console.info(line);
  if (observed.scripts.samples > 0) console.info('script CPU estimate: 60 warm-up ticks; minimum p95 of three 60-tick windows; raw maxima and all fuel retained');
  if (!report.pass) throw new Error('Performance report refused this shard');
}
async function admitBuild(shard: Shardfile, assets: ReadonlyMap<string, Uint8Array>, policy: 'warn' | 'refuse', sections: ReadonlyMap<string, unknown>): Promise<void> {
  // Native hybrids need their trusted recipes for a meaningful proof; never invent a fake native measurement.
  if (shard.runtime !== null) { printReport(shard, unmeasured, policy); return; }
  printReport(shard, await measureSimulation(shard, assets, undefined, sections), policy);
}
/** SA3: writes a built folder's shard file (hero check against `source`, format and audio checks) and returns its path;
 * scripts/wildshard.mjs gives it. `draftWarning: false` leaves the draft warning (J198) to the caller. */
export type ShardfileWriter = (folder: string, source: string, options?: { readonly draftWarning?: boolean }) => Promise<string>;
/** A refusal from the shard file step, named by its own rules (SA3), not build's source rules. */
class ShardfileRefusalError extends Error { override readonly name = 'ShardfileRefusalError'; }
async function writeShardfileOf(options: CliOptions, folder: string, source: string): Promise<void> {
  try { await options.writeShardfile?.(folder, source); }
  catch (error) { throw new ShardfileRefusalError(error instanceof Error ? error.message : String(error), { cause: error }); }
}
interface CliOptions { readonly decisionLegacyLines?: number; readonly manifest?: ProjectManifestSource; readonly writeShardfile?: ShardfileWriter }
async function runCommand(args: readonly string[], options: CliOptions): Promise<void> {
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
    if (positional.length === 0 || positional.length > 2 || rest.some(value => value.startsWith('--') && value !== '--json') || rest.filter(value => value === '--json').length > 1) throw new Error('usage: wildshard check <project> [output] [--json]');
    // --json: stdout carries the verdict document alone; everything the steps print goes to stderr.
    // (scripts/wildshard.mjs moves log and debug for the whole run; the steps here log with info and warn.)
    const saved = { info: console.info, warn: console.warn }, toError = console.error.bind(console);
    if (json) Object.assign(console, { info: toError, warn: toError });
    let result;
    try { result = await checkProject(positional[0] ?? '', positional[1], options); } finally { Object.assign(console, saved); }
    process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `${checkLines(result).join('\n')}\n`);
    if (result.verdict === 'fail') process.exitCode = 1;
    return;
  }
  if (input === undefined) throw new Error('usage: wildshard new <project> | check <project> [output] [--json] | synth <project> | build <project> [output] [--shardfile-only|--folder-only] [--no-placeholders] [--output=<slug>] | build <project> --behaviour-only | validate <project|shard.json> | dev <project> [port]');
  if (command === 'synth') {
    if (output !== undefined) throw new Error('usage: wildshard synth <project>');
    const result = await synthProject(resolve(input));
    console.info(`synthesized ${result.path} (${result.hash})`); return;
  }
  if (command === 'new') {
    const newArguments = args.slice(2), names = newArguments.filter(value => !value.startsWith('--'));
    if (names.length > 1 || newArguments.some(value => value.startsWith('--') && value !== '--empty') || newArguments.filter(value => value === '--empty').length > 1) throw new Error('usage: wildshard new <project> [slug] [--empty]');
    const slug = names[0] ?? input.split('/').reverse().find((part) => part !== '') ?? '';
    if (newArguments.includes('--empty')) newProject(resolve(input), slug);
    else writeReferenceProject(resolve(input), slug);
    return;
  }
  if (command === 'dev') {
    const port = output === undefined ? 0 : Number(output);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('dev port must be 0..65535');
    const server = await devProject(resolve(input), { port, ...(options.decisionLegacyLines === undefined ? {} : { decisionLegacyLines: options.decisionLegacyLines }) });
    const close = (): void => { void server.close(); }; process.once('SIGINT', close); process.once('SIGTERM', close);
    console.info(`wildshard dev: ${server.url}`); return;
  }
  if (command === 'build') {
    if (output === '--behaviour-only' && (buildFlag === undefined || buildFlag === '--check')) {
      const files = await buildBehaviourProject(resolve(input), { check: buildFlag === '--check' });
      console.info(`built ${files.length} native behaviour outputs`); return;
    }
    // A flag straight after the project is a flag, not the output folder.
    const folder = output?.startsWith('--') === true ? undefined : output;
    const flags = args.slice(folder === undefined ? 2 : 3), mapSourceHash = flags.find(flag => flag.startsWith('--generated-map-tiles-hash='))?.slice(27), mapPath = flags.find(flag => flag.startsWith('--map='))?.slice(6), tilesHash = flags.find(flag => flag.startsWith('--map-tiles-hash='))?.slice(17), selected = flags.find(flag => flag.startsWith('--output='))?.slice(9);
    // SA3: --shardfile-only skips the client; --folder-only also skips the shard file, for build-shards, whose folders are
    // cached and prepared before anything tars them. --product-only keeps its old meaning: --folder-only.
    const folderOnly = flags.includes('--folder-only') || flags.includes('--product-only'), noClient = folderOnly || flags.includes('--shardfile-only');
    const unknownFlag = flags.find(flag => flag !== '--shardfile-only' && flag !== '--folder-only' && flag !== '--product-only' && flag !== '--no-placeholders' && flag !== '--format=2' && flag !== '--copy-runtime' && !flag.startsWith('--map=') && !flag.startsWith('--map-tiles-hash=') && !flag.startsWith('--output=') && !flag.startsWith('--generated-map-tiles-hash='));
    if (unknownFlag !== undefined) throw new Error(`unknown build flag: ${unknownFlag}`);
    if (flags.filter(flag => flag.startsWith('--output=')).length > 1 || flags.length !== new Set(flags).size || flags.filter(flag => flag.startsWith('--map=')).length > 1 || flags.filter(flag => flag.startsWith('--map-tiles-hash=')).length > 1 || flags.filter(flag => flag.startsWith('--generated-map-tiles-hash=')).length > 1 || mapSourceHash !== undefined && mapPath !== undefined || ((mapPath === undefined) !== (tilesHash === undefined))) throw new Error('unknown or incomplete build map flag');
    const map = mapPath === undefined || tilesHash === undefined ? undefined : { bytes: readBoundedFile(resolve(mapPath), STILL_IMAGE_LIMITS.bytes), tilesHash };
    const shard = await buildProject(resolve(input), folder === undefined ? undefined : resolve(folder), { outputFormat:2, ...(selected === undefined ? {} : { output: selected }), ...(options.decisionLegacyLines === undefined ? {} : { decisionLegacyLines: options.decisionLegacyLines }), ...(options.manifest === undefined ? {} : { manifest: options.manifest }), copyRuntime: flags.includes('--copy-runtime'), ...(noClient ? { client: null } : {}), ...(map === undefined ? {} : { map }), ...(mapSourceHash === undefined ? {} : { mapSourceHash }), placeholders: !flags.includes('--no-placeholders'), admit: admitBuild }); console.info(`built ${shard.identity.slug} v${shard.version}`);
    if (!folderOnly) await writeShardfileOf(options, folder === undefined ? resolve(input, 'public/shardfiles', shard.identity.slug) : resolve(folder), resolve(input));
    return;
  }
  if (command === 'prove') {
    if (input.endsWith('.json') && basename(input) !== 'shard.json') throw new Error('prove requires a format-2 shard.json or author project');
    if (output === undefined || buildFlag !== undefined) throw new Error('usage: wildshard prove <project|shard.json> <proof.json>');
    const built = input.endsWith('.json') || !existsSync(resolve(input, 'shard.config.ts'));
    const { shard, assets } = built
      ? validateOutputProduct(resolve(input.endsWith('.json') ? dirname(input) : input))
      : await readProjectAssets(resolve(input), undefined, options.manifest, options);
    const plan = readProofTape(resolve(output));
    console.info(JSON.stringify(await proveAuthorSimulation(shard, assets, plan), null, 2)); return;
  }
  if (command === 'validate') {
    if (input.endsWith('.json') && basename(input) !== 'shard.json') throw new Error('validate requires a format-2 shard.json or author project');
    const folder=resolve(input.endsWith('.json') ? dirname(input) : input);
    if (input.endsWith('.json') || existsSync(resolve(folder, 'shard.json'))) {
      // P1-F3 (a): format validation, @wildshard/format/productValidation alone (schema, inventory, hashes, budgets, admission rows).
      const checked = validateOutputProduct(folder);
      // P1-F3 (b): execution proof. G491: validation.json contains static build evidence, never authority
      // for current script CPU. Execute the admitted bytes again on this host.
      await admitBuild(checked.shard, checked.assets, checked.shard.runtime === null ? 'refuse' : 'warn', checked.sections);
      console.info(`validated ${checked.shard.identity.slug}: format 2 inventory, byte kinds and section schemas`); return;
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
    if (shard.runtime !== null) { printReport(shard, unmeasured, policy); console.info(`validated ${shard.identity.slug} v${shard.version}: native execution/entries UNMEASURED (trusted browser proof required)`); return; }
    const proof = await validateSimulation(shard, assets);
    printReport(shard, proof, policy);
    console.info(`validated ${shard.identity.slug} v${shard.version}: ${proof.ticks} sim ticks, ${proof.lanes} edge lanes, ${proof.steps} capsule steps`);
    console.info(`advisory tick timing (${proof.timing.samples} samples): median ${proof.timing.medianMicros.toFixed(1)} us, max ${proof.timing.maxMicros.toFixed(1)} us, declared ${shard.serverBudget.tickMicros} us`);
    if (proof.timing.medianMicros > shard.serverBudget.tickMicros) console.warn('advisory: measured tick median exceeds the declared runtime budget; host load is not an admission refusal');
    return;
  }
  throw new Error('unknown wildshard command');
}
/** The step a verb's refusal comes from (SA21): `dev` and `synth` build. */
const STEPS: Readonly<Record<string, RefusalStep>> = { new: 'new', validate: 'validate', prove: 'prove' };
/** The refusal with its rule, fix and GUIDE.md link on a second line; the first line stays the refusing code's words. */
function authorRefusal(command: string | undefined, error: unknown): unknown {
  const located = locatedError(error);
  const message = located instanceof Error ? located.message : String(located);
  const step = error instanceof ShardfileRefusalError ? 'shardfile' : command !== undefined && Object.hasOwn(STEPS, command) ? STEPS[command] : undefined;
  const hint = refusalHint(refusalNote(step ?? 'build', message));
  return new Error(`${message}\n  ${hint}`, { cause: error });
}
/** Run the author CLI; returns only after validation/build completes. */
export async function runCli(args: readonly string[], options: CliOptions = {}): Promise<void> {
  try { await runCommand(args, options); } catch (error) { throw authorRefusal(args[0], error); }
}
