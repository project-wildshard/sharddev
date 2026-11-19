import { spawnWarnings } from '@wildshard/sdk/internal/spawnWarnings';
import { creatureCapRefusals, creatureCapWarnings, creatureNumbers, creatureReportLine } from '@wildshard/sdk/internal/creatureCaps';
import { primitiveReportLine } from '@wildshard/sdk/internal/primitivesReport';
// The real steps behind `wildshard check` (SA4); check.ts runs them in order and gives the verdict.
// oxlint-disable-next-line import/no-nodejs-modules -- Lint runs oxlint (the repo's or the SDK's) as a child process.
import { spawnSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- The author proof tape is an explicit local input file.
import { existsSync, readFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the project, its output and the SDK's lint config.
import { basename, resolve } from 'node:path';
import * as v from 'valibot';
import { AuthorProofPlanSchema } from '@wildshard/engine/host/tickProtocol';
import { proveAuthorSimulation } from '@wildshard/engine/host/headless';
import { checkShardfile } from '@wildshard/engine/host/checkShardfile';
import type { ShardfileCheckReport } from '@wildshard/engine/game/shardfile/checkReport';
import type { Shardfile } from '@wildshard/format/shardSchema';
import { buildProject } from '@wildshard/build/project';
import { isHandwrittenSource, isRepoSource, shardOutputRoot } from '@wildshard/upload/sharddev/shardSource';
import { handwrittenIdentity } from '@wildshard/sdk/internal/handwritten';
import { settleHandwrittenCreatureLayers } from '@wildshard/sdk/internal/handwrittenCreatureLayers';
import { validateOutputProduct } from '@wildshard/sdk/outputProduct';
import { engineMusicLine } from './engineMusic';
import { lintOutcome, runCheck, type CheckResult, type StepOutcome } from './check';
import type { ProjectManifestSource } from '@wildshard/sdk/projectManifest';
import { authorErrorText } from '@wildshard/sdk/internal/authorError';
import { refusalCode } from '@wildshard/upload/sharddev/refusals';
import { DRAFT_SDK, draftMessage } from '@wildshard/upload/sharddev/draft';
import { authorLintPlan } from '@wildshard/sdk/internal/authorLint';
import { assertCreatureDeclarations } from '@wildshard/sdk/internal/creatureLayers';
/** Engine 0.1.47 bundles its own frozen format (0.44.0); sharddev's format types are a newer copy of the same rows. */
type EngineShardfile = Parameters<typeof checkShardfile>[0];

/** The author proof tape `check` runs when the project has one (format: `AuthorProofPlanSchema`). */
export const PROOF_FILE = 'proof.json';
/** The author proof tape at `path`; its refusal names the file first, so it reads as the tape's (SA21). */
export function readProofTape(path: string): v.InferOutput<typeof AuthorProofPlanSchema> {
  try { return v.parse(AuthorProofPlanSchema, JSON.parse(readFileSync(path, 'utf8'))); }
  catch (error) { throw new Error(`${basename(path)}: ${authorErrorText(error)}`, { cause: error }); }
}
// The bundled CLI defines import.meta.dirname as the package's src/sharddev, so the package root is two up.
// SDK-SPLIT SP8c: the sdk (its lint config and oxlint) sits beside this package, in the workspace and under
// node_modules/@wildshard alike.
const SDK_ROOT = resolve(import.meta.dirname, '../../../sdk');

/** The author lint over the project's source: its repo's `.oxlintrc.author.json`, else the SDK's (authorLint.ts). */
function lintProject(project: string): StepOutcome {
  const plan = authorLintPlan(project, SDK_ROOT);
  if (plan.kind === 'skip') return { status: 'skip', note: plan.note };
  const done = spawnSync(plan.bin, plan.args, { cwd: plan.cwd, env: { ...process.env, ...plan.env }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (done.error !== undefined) return { status: 'fail', refusals: [{ message: `oxlint did not run: ${done.error.message}` }] };
  return lintOutcome(`${done.stdout}${done.stdout.trim() === '' ? done.stderr : ''}`, done.status);
}

/** J198: a built folder whose index says sdk 0.2 is a draft; upload refuses it until `wildshard prepare` runs. */
function isDraft(folder: string): boolean {
  const index: unknown = JSON.parse(readFileSync(resolve(folder, 'shard.json'), 'utf8'));
  return typeof index === 'object' && index !== null && 'sdk' in index && index.sdk === DRAFT_SDK;
}

interface Admitted { readonly check: ShardfileCheckReport }
export interface CheckOptions { readonly decisionLegacyLines?: number; readonly output?: string; readonly manifest?: ProjectManifestSource; readonly writeShardfile?: (folder: string, source: string, options?: { readonly draftWarning?: boolean }) => Promise<string> }

/** Lint, build (no client; the shard file too, SA3), validate the built folder, prove its tape and read its report card. */
export async function checkProject(projectPath: string, outputPath: string | undefined, options: CheckOptions = {}): Promise<CheckResult> {
  const project = resolve(projectPath);
  let output = outputPath === undefined ? undefined : resolve(outputPath), admitted: Admitted | undefined;
  // CC47: the validate step's creature numbers, printed on the report card.
  let creatureLine: string | undefined;
  // OF17c: the primitives the server derives from the built sections, printed on the report card.
  let primitiveLine: string | undefined;
  const admit = async (shard: Shardfile, assets: ReadonlyMap<string, Uint8Array>, policy: 'warn' | 'refuse', sections: ReadonlyMap<string, unknown>): Promise<void> => {
    assertCreatureDeclarations(shard.rows);
    admitted = { check: await checkShardfile(shard as unknown as EngineShardfile, assets, {sections, policy}) };
  };
  // SA16 (J314): a hand-written source (`--template blender`) has nothing to build: format's pack settles it into the
  // built folder, which is then admitted as a built shard is.
  const handwritten = isHandwrittenSource(project);
  // TS21: a declared output is built from code; a hand-written shard file has one product and no outputs.
  if (handwritten && options.output !== undefined) throw new Error(`${project}: a hand-written shard file declares no outputs, so check takes no --output`);
  const settleInto = async (source: string): Promise<Shardfile> => {
    // Its build output goes beside src/, never inside the folder pack reads (or a built folder named as a source).
    if (!isRepoSource(source)) throw new Error(`${source}: a hand-written shard file builds only from a repo's src/: run wildshard check on the repo`);
    output ??= resolve(shardOutputRoot(source), 'public/shardfiles', handwrittenIdentity(source).slug);
    const checked = settleHandwrittenCreatureLayers(source, output);
    await admit(checked.shard, checked.assets, checked.shard.runtime === null ? 'refuse' : 'warn', checked.sections);
    return checked.shard;
  };
  const built = (): string => {
    if (output === undefined) throw new Error('no built shard file folder');
    return output;
  };
  const result = await runCheck(project, (): string | null => output ?? null, {
    lint: async (): Promise<StepOutcome> => await Promise.resolve(handwritten
      ? { status: 'skip', note: 'a hand-written shard file: no code to lint' } : lintProject(project)),
    build: async (): Promise<StepOutcome> => {
      const shard = handwritten ? await settleInto(project) : await buildProject(project, output, { outputFormat: 2, client: null, placeholders: true, admit,
        ...(options.output === undefined ? {} : { output: options.output }),
        ...(options.decisionLegacyLines === undefined ? {} : { decisionLegacyLines: options.decisionLegacyLines }),
        ...(options.manifest === undefined ? {} : { manifest: options.manifest }) });
      output ??= resolve(shardOutputRoot(project), 'public/shardfiles', shard.identity.slug);
      let file: string | undefined;
      // The draft warning goes in the verdict (below), so the writer leaves it out.
      try { file = await options.writeShardfile?.(output, project, { draftWarning: false }); }
      catch (error) { return { status: 'fail', refusals: [{ message: authorErrorText(error), code: refusalCode(error), as: 'shardfile' }] }; }
      const warnings = isDraft(output) ? [{ message: draftMessage(shard.identity.slug), as: 'shardfile' as const }] : [];
      return { status: 'pass', note: `built ${shard.identity.slug} v${shard.version}${file === undefined ? '' : `, ${file}`}`, warnings };
    },
    validate: async (): Promise<StepOutcome> => {
      const checked = validateOutputProduct(built());
      // AUDIO AU18 (SDK-SPLIT SP7b: here, not in the build): the engine music the shard plays; a name the engine lacks refuses.
      const music = engineMusicLine(checked.shard.identity.slug, checked.sections.get('audio/audio'));
      const note = `${checked.shard.identity.slug}: format 2 inventory, byte kinds and section schemas${music === undefined ? '' : `; ${music}`}`;
      // ONE-FORMAT CC47: 64 bones and 16 volumes refuse; a size class's triangle and texture marks warn.
      const creatures = creatureNumbers(checked.shard, checked.assets);
      creatureLine = creatureReportLine(creatures, checked.shard.budgets.tier ?? 'small');
      primitiveLine = primitiveReportLine(checked.sections, checked.index.sections);
      const refusals = creatureCapRefusals(creatures);
      return await Promise.resolve({ status: refusals.length === 0 ? 'pass' : 'fail', note, refusals,
        warnings: [...spawnWarnings(checked.shard), ...creatureCapWarnings(creatures)] });
    },
    prove: async (): Promise<StepOutcome> => {
      const tape = resolve(project, PROOF_FILE);
      if (!existsSync(tape)) return { status: 'skip', note: `no ${PROOF_FILE}: add an author proof tape to prove the shard's quests` };
      const { shard, assets, sections } = validateOutputProduct(built());
      if (shard.runtime !== null) return { status: 'skip', note: 'native gameplay: the author proof needs data-only gameplay' };
      const plan = readProofTape(tape);
      // The output's sections name each decision's ABI; without them a v1 decision fails `Import signature outside ABI`.
      const report = await proveAuthorSimulation(shard as unknown as EngineShardfile, assets, plan, sections);
      return { status: 'pass', note: `${report.ticks} ticks, ${report.ledger.facts.length} facts filed` };
    },
    report: async (): Promise<StepOutcome> => {
      if (admitted === undefined) throw new Error('the build admitted no shard to report on');
      const card = admitted.check.performance;
      const refused = admitted.check.failures;
      // TC-NE6 (NEW-SHARD-E2E F6): a count with no names left the author guessing; each warning prints, marked report-only.
      const reported = card.issues.filter(issue => issue.severity !== 'refusal');
      const warnings = reported.length;
      // SP7c: the simulation numbers `wildshard validate` printed before it stopped running the engine.
      const { proof } = admitted.check;
      const sim = typeof proof === 'string' ? `simulation ${proof}` : `${proof.ticks} sim ticks, ${proof.lanes} edge lanes, ${proof.steps} capsule steps${proof.portalTransfers === undefined ? '' : `, ${proof.portalTransfers} portal transfers`}`;
      const note = `${(card.download.total / 1024 / 1024).toFixed(2)} MB download, ~${card.estimatedPlayable.seconds.toFixed(1)} s to playable, ${warnings} warning${warnings === 1 ? '' : 's'}; ${sim}${creatureLine === undefined ? '' : `; creatures: ${creatureLine}`}${primitiveLine === undefined ? '' : `; primitives: ${primitiveLine}`}`;
      return await Promise.resolve({ status: admitted.check.pass ? 'pass' : 'fail', note,
        refusals: refused.map(issue => ({ message: issue.message, code: issue.code })),
        warnings: reported.map(issue => ({ message: `${issue.metric}: ${String(issue.actual)} over ${String(issue.limit)} (a report-only cap: upload still takes it)` })) });
    },
  });
  return {...result, ...(admitted === undefined ? {} : {check: admitted.check})};
}
