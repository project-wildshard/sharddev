// oxlint-disable-next-line import/no-nodejs-modules -- The author CLI accepts filesystem project/output paths.
import { basename, dirname, resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- The author proof tape is an explicit local input file.
import { existsSync, readFileSync } from 'node:fs';
import * as v from 'valibot';
import { AuthorProofPlanSchema } from '@wildshard/engine/host/tickProtocol';
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
interface CliOptions { readonly decisionLegacyLines?: number; readonly manifest?: ProjectManifestSource }
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
  if (input === undefined) throw new Error('usage: wildshard new <project> | synth <project> | build <project> [output] [--product-only] [--no-placeholders] [--output=<slug>] | build <project> --behaviour-only | validate <project|shard.json> | dev <project> [port]');
  if (command === 'synth') {
    if (output !== undefined) throw new Error('usage: wildshard synth <project>');
    const result = await synthProject(resolve(input));
    console.info(`synthesized ${result.path} (${result.hash})`); return;
  }
  if (command === 'new') {
    if (buildFlag !== undefined) throw new Error('usage: wildshard new <project> [slug]');
    newProject(resolve(input), output ?? input.split('/').reverse().find((part) => part !== '') ?? ''); return;
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
    const flags = args.slice(3), mapSourceHash = flags.find(flag => flag.startsWith('--generated-map-tiles-hash='))?.slice(27), mapPath = flags.find(flag => flag.startsWith('--map='))?.slice(6), tilesHash = flags.find(flag => flag.startsWith('--map-tiles-hash='))?.slice(17), selected = flags.find(flag => flag.startsWith('--output='))?.slice(9);
    const unknownFlag = flags.find(flag => flag !== '--product-only' && flag !== '--no-placeholders' && flag !== '--format=2' && flag !== '--copy-runtime' && !flag.startsWith('--map=') && !flag.startsWith('--map-tiles-hash=') && !flag.startsWith('--output=') && !flag.startsWith('--generated-map-tiles-hash='));
    if (unknownFlag !== undefined) throw new Error(`unknown build flag: ${unknownFlag}`);
    if (flags.filter(flag => flag.startsWith('--output=')).length > 1 || flags.length !== new Set(flags).size || flags.filter(flag => flag.startsWith('--map=')).length > 1 || flags.filter(flag => flag.startsWith('--map-tiles-hash=')).length > 1 || flags.filter(flag => flag.startsWith('--generated-map-tiles-hash=')).length > 1 || mapSourceHash !== undefined && mapPath !== undefined || ((mapPath === undefined) !== (tilesHash === undefined))) throw new Error('unknown or incomplete build map flag');
    const map = mapPath === undefined || tilesHash === undefined ? undefined : { bytes: readBoundedFile(resolve(mapPath), STILL_IMAGE_LIMITS.bytes), tilesHash };
    const shard = await buildProject(resolve(input), output === undefined ? undefined : resolve(output), { outputFormat:2, ...(selected === undefined ? {} : { output: selected }), ...(options.decisionLegacyLines === undefined ? {} : { decisionLegacyLines: options.decisionLegacyLines }), ...(options.manifest === undefined ? {} : { manifest: options.manifest }), copyRuntime: flags.includes('--copy-runtime'), ...(flags.includes('--product-only') ? { client: null } : {}), ...(map === undefined ? {} : { map }), ...(mapSourceHash === undefined ? {} : { mapSourceHash }), placeholders: !flags.includes('--no-placeholders'), admit: admitBuild }); console.info(`built ${shard.identity.slug} v${shard.version}`); return;
  }
  if (command === 'prove') {
    if (input.endsWith('.json') && basename(input) !== 'shard.json') throw new Error('prove requires a format-2 shard.json or author project');
    if (output === undefined || buildFlag !== undefined) throw new Error('usage: wildshard prove <project|shard.json> <proof.json>');
    const built = input.endsWith('.json') || !existsSync(resolve(input, 'shard.config.ts'));
    const { shard, assets } = built
      ? validateOutputProduct(resolve(input.endsWith('.json') ? dirname(input) : input))
      : await readProjectAssets(resolve(input), undefined, options.manifest, options);
    const plan = v.parse(AuthorProofPlanSchema, JSON.parse(readFileSync(resolve(output), 'utf8')));
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
/** Run the author CLI; returns only after validation/build completes. */
export async function runCli(args: readonly string[], options: CliOptions = {}): Promise<void> {
  try { await runCommand(args, options); } catch (error) { throw locatedError(error); }
}
