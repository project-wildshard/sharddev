// The real steps behind `wildshard check` (SA4); check.ts runs them in order and gives the verdict.
// oxlint-disable-next-line import/no-nodejs-modules -- Lint runs the SDK's own oxlint as a child process.
import { spawnSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- The author proof tape is an explicit local input file.
import { existsSync, readFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Find oxlint the way this installed package resolves it.
import { createRequire } from 'node:module';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the project, its output and the SDK's lint config.
import { basename, dirname, resolve } from 'node:path';
import * as v from 'valibot';
import { AuthorProofPlanSchema } from '@wildshard/engine/host/tickProtocol';
import { measureSimulation, proveAuthorSimulation } from '@wildshard/engine/host/headless';
import type { Shardfile } from '@wildshard/engine/host/shardfile';
import { buildProject } from './project';
import { validateOutputProduct } from './outputProduct';
import { performanceReport, type PerformanceObservations } from './reportCard';
import { lintOutcome, runCheck, type CheckResult, type StepOutcome } from './check';
import type { ProjectManifestSource } from './projectManifest';
import { authorErrorText } from './authorError';

/** The author proof tape `check` runs when the project has one (format: `AuthorProofPlanSchema`). */
export const PROOF_FILE = 'proof.json';
/** The author proof tape at `path`; its refusal names the file first, so it reads as the tape's (SA21). */
export function readProofTape(path: string): v.InferOutput<typeof AuthorProofPlanSchema> {
  try { return v.parse(AuthorProofPlanSchema, JSON.parse(readFileSync(path, 'utf8'))); }
  catch (error) { throw new Error(`${basename(path)}: ${authorErrorText(error)}`, { cause: error }); }
}
const unmeasured: PerformanceObservations = { scripts: { p95Micros: 0, maxMicros: 0, samples: 0 }, fuel: { p95: 0, max: 0, samples: 0 } };
// The bundled CLI defines import.meta.dirname as the package's src/sharddev, so the package root is two up.
const SDK_ROOT = resolve(import.meta.dirname, '../..');
const LINT_CONFIG = resolve(SDK_ROOT, '.oxlintrc.author.json');

function oxlintBin(): string | undefined {
  try {
    const manifest = createRequire(resolve(SDK_ROOT, 'package.json')).resolve('oxlint/package.json');
    const bin = resolve(dirname(manifest), 'bin/oxlint');
    return existsSync(bin) ? bin : undefined;
  } catch { return undefined; }
}

/** The SDK's author lint (`.oxlintrc.author.json` and its wildshard rules) over the project's source. */
function lintProject(project: string): StepOutcome {
  const bin = oxlintBin();
  if (bin === undefined || !existsSync(LINT_CONFIG)) return { status: 'skip', note: 'the author lint (oxlint and .oxlintrc.author.json) is not installed with this @wildshard/sdk' };
  // The jsPlugins resolve engine from the working directory: run from the SDK root, as `pnpm lint:author` does.
  const done = spawnSync(bin, ['-c', LINT_CONFIG, '--format', 'json', project], { cwd: SDK_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (done.error !== undefined) return { status: 'fail', refusals: [{ message: `oxlint did not run: ${done.error.message}` }] };
  return lintOutcome(`${done.stdout}${done.stdout.trim() === '' ? done.stderr : ''}`, done.status);
}

interface Admitted { readonly shard: Shardfile; readonly observed: PerformanceObservations; readonly policy: 'warn' | 'refuse' }
export interface CheckOptions { readonly decisionLegacyLines?: number; readonly manifest?: ProjectManifestSource }

/** Lint, build (product only), validate the built product, prove its tape and read its report card. */
export async function checkProject(projectPath: string, outputPath: string | undefined, options: CheckOptions = {}): Promise<CheckResult> {
  const project = resolve(projectPath);
  let output = outputPath === undefined ? undefined : resolve(outputPath), admitted: Admitted | undefined;
  const admit = async (shard: Shardfile, assets: ReadonlyMap<string, Uint8Array>, policy: 'warn' | 'refuse', sections: ReadonlyMap<string, unknown>): Promise<void> => {
    // Native hybrids need their trusted recipes for a meaningful measurement; never invent one (as `build` does).
    const observed = shard.runtime === null ? await measureSimulation(shard, assets, undefined, sections) : unmeasured;
    admitted = { shard, observed, policy };
  };
  const built = (): string => {
    if (output === undefined) throw new Error('no built product');
    return output;
  };
  return await runCheck(project, (): string | null => output ?? null, {
    lint: async (): Promise<StepOutcome> => await Promise.resolve(lintProject(project)),
    build: async (): Promise<StepOutcome> => {
      const shard = await buildProject(project, output, { outputFormat: 2, client: null, placeholders: true, admit,
        ...(options.decisionLegacyLines === undefined ? {} : { decisionLegacyLines: options.decisionLegacyLines }),
        ...(options.manifest === undefined ? {} : { manifest: options.manifest }) });
      output ??= resolve(project, 'public/shardfiles', shard.identity.slug);
      return { status: 'pass', note: `built ${shard.identity.slug} v${shard.version}` };
    },
    validate: async (): Promise<StepOutcome> => {
      const checked = validateOutputProduct(built());
      return await Promise.resolve({ status: 'pass', note: `${checked.shard.identity.slug}: format 2 inventory, byte kinds and section schemas` });
    },
    prove: async (): Promise<StepOutcome> => {
      const tape = resolve(project, PROOF_FILE);
      if (!existsSync(tape)) return { status: 'skip', note: `no ${PROOF_FILE}: add an author proof tape to prove the shard's quests` };
      const { shard, assets } = validateOutputProduct(built());
      if (shard.runtime !== null) return { status: 'skip', note: 'native gameplay: the author proof needs data-only gameplay' };
      const plan = readProofTape(tape);
      const report = await proveAuthorSimulation(shard, assets, plan);
      return { status: 'pass', note: `${report.ticks} ticks, ${report.ledger.facts.length} facts filed` };
    },
    report: async (): Promise<StepOutcome> => {
      if (admitted === undefined) throw new Error('the build admitted no shard to report on');
      const card = performanceReport(admitted.shard, admitted.observed, admitted.policy);
      const refused = card.issues.filter(issue => issue.severity === 'refusal');
      const warnings = card.issues.length - refused.length;
      const note = `${(card.download.total / 1024 / 1024).toFixed(2)} MB download, ~${card.estimatedPlayable.seconds.toFixed(1)} s to playable, ${warnings} warning${warnings === 1 ? '' : 's'}`;
      return await Promise.resolve({ status: card.pass ? 'pass' : 'fail', note,
        refusals: refused.map(issue => ({ message: `${issue.metric}: ${String(issue.actual)} over ${String(issue.limit)}` })) });
    },
  });
}
