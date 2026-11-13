// `wildshard check` (meta SHARD-AUTHORING SA4, J317): lint, build, validate, prove and the report card in one verb, with
// one verdict. The loop is new, dev, check, hero, upload. `--json` prints CheckResult below and nothing else on stdout.
// SA21: every refusal carries a rule id, a one-line fix and a GUIDE.md link, from refusals.ts.
import { diagnosticNow } from '@wildshard/engine/core/clock';
import { authorErrorText } from './authorError';
import { refusalHint, refusalNote, type RefusalStep } from './refusals';

/** The five steps, in the order they run. */
export type CheckStepName = 'lint' | 'build' | 'validate' | 'prove' | 'report';
/** A skipped step neither passes nor fails the verdict; its note says why it did not run. */
export type CheckStatus = 'pass' | 'fail' | 'skip';

/** One refusal: what was wrong, the rule that said so, its fix and its GUIDE.md section (`GUIDE.md#<anchor>`). */
export interface CheckRefusal {
  readonly step: CheckStepName;
  readonly rule: string;
  readonly message: string;
  readonly fix: string;
  readonly guide: string;
  readonly file?: string;
}
/** A refusal as a step reports it: a lint diagnostic brings oxlint's code and help; refusals.ts fills in the rest. */
export interface StepRefusal { readonly message: string; readonly lint?: { readonly code: string | null; readonly help: string | null }; readonly file?: string; readonly as?: RefusalStep }
/** A warning: the same fields as a refusal, but it does not fail the verdict (an unprepared draft, J198). */
export type CheckWarning = CheckRefusal;
/** One step's result and wall-clock duration in milliseconds. */
export interface CheckStep { readonly name: CheckStepName; readonly status: CheckStatus; readonly ms: number; readonly note?: string }
/** The `--json` document (version 1). `verdict` is `fail` when any step failed; `output` is the built product folder, null when the build failed.
 * `warnings` never fail the verdict. */
export interface CheckResult {
  readonly version: 1;
  readonly verdict: 'pass' | 'fail';
  readonly project: string;
  readonly output: string | null;
  readonly ms: number;
  readonly steps: readonly CheckStep[];
  readonly refusals: readonly CheckRefusal[];
  readonly warnings: readonly CheckWarning[];
}

/** What a step reports; a thrown error is a `fail` with the error's words as its one refusal. */
export interface StepOutcome {
  readonly status: CheckStatus;
  readonly note?: string;
  readonly refusals?: readonly StepRefusal[];
  readonly warnings?: readonly StepRefusal[];
}
/** The steps' work; validate, prove and report need a built product, so they skip when build fails. */
export type CheckSteps = Readonly<Record<CheckStepName, () => Promise<StepOutcome>>>;

const ORDER: readonly CheckStepName[] = ['lint', 'build', 'validate', 'prove', 'report'];
const NEEDS_BUILD = new Set<CheckStepName>(['validate', 'prove', 'report']);

async function outcomeOf(work: () => Promise<StepOutcome>): Promise<StepOutcome> {
  try { return await work(); }
  catch (error) { return { status: 'fail', refusals: [{ message: authorErrorText(error) }] }; }
}

/** Run every step in order, timing each, and give the verdict. `output` is read after the build; `now` is for tests. */
export async function runCheck(project: string, output: () => string | null, steps: CheckSteps, now: () => number = diagnosticNow): Promise<CheckResult> {
  const started = now(), rows: CheckStep[] = [], refusals: CheckRefusal[] = [], warnings: CheckWarning[] = [];
  const named = (step: CheckStepName, { message, lint, file, as }: StepRefusal): CheckRefusal => {
    // SA3: build's shard file step names its rules by its own step (a format refusal is not a source one).
    const { rule, fix, guide } = refusalNote(as ?? step, message, lint);
    return { step, rule, message, fix, guide, ...(file === undefined ? {} : { file }) };
  };
  let built = true;
  for (const name of ORDER) {
    const begun = now();
    const outcome: StepOutcome = NEEDS_BUILD.has(name) && !built ? { status: 'skip', note: 'build failed' } : await outcomeOf(steps[name]);
    if (name === 'build' && outcome.status !== 'pass') built = false;
    const ms = Math.round(now() - begun);
    rows.push({ name, status: outcome.status, ms, ...(outcome.note === undefined ? {} : { note: outcome.note }) });
    for (const refusal of outcome.refusals ?? []) refusals.push(named(name, refusal));
    for (const warning of outcome.warnings ?? []) warnings.push(named(name, warning));
  }
  const verdict = rows.some(row => row.status === 'fail') ? 'fail' : 'pass';
  return { version: 1, verdict, project, output: built ? output() : null, ms: Math.round(now() - started), steps: rows, refusals, warnings };
}

interface LintLabel { readonly span?: { readonly line?: number; readonly column?: number } }
interface LintDiagnostic { readonly message?: string; readonly code?: string; readonly help?: string; readonly filename?: string; readonly labels?: readonly LintLabel[] }
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

function lintRefusal(raw: LintDiagnostic): StepRefusal {
  const span = raw.labels?.[0]?.span, file = typeof raw.filename === 'string' ? raw.filename : undefined;
  const where = file === undefined ? undefined : span?.line === undefined ? file : `${file}:${span.line}:${span.column ?? 1}`;
  return { message: textOrNull(raw.message) ?? 'lint refusal', lint: { code: textOrNull(raw.code), help: textOrNull(raw.help) }, ...(where === undefined ? {} : { file: where }) };
}

/** Read `oxlint --format json`: each diagnostic becomes a refusal; no linted file is a skip, never a pass. */
export function lintOutcome(stdout: string, exitCode: number | null): StepOutcome {
  if (stdout.includes('No files found to lint')) return { status: 'skip', note: 'oxlint found no files to lint here (a git-ignored path?)' };
  let parsed: unknown;
  try { parsed = JSON.parse(stdout); }
  catch { return { status: 'fail', refusals: [{ message: `oxlint exited ${String(exitCode)} without a report` }] }; }
  if (!isRecord(parsed) || !Array.isArray(parsed['diagnostics'])) return { status: 'fail', refusals: [{ message: 'oxlint report has no diagnostics' }] };
  const diagnostics: readonly unknown[] = parsed['diagnostics'];
  const refusals = diagnostics.filter(isRecord).map(row => lintRefusal(row));
  if (parsed['number_of_files'] === 0) return { status: 'skip', note: 'oxlint found no files to lint here (a git-ignored path?)' };
  return refusals.length === 0 && exitCode === 0 ? { status: 'pass' } : { status: 'fail', refusals };
}

const SECONDS = 1000;
/** The plain-text form: one line per step, each refusal and warning with its rule, fix and guide link, then the verdict. */
export function checkLines(result: CheckResult): string[] {
  const lines = result.steps.map(step => `${step.name.padEnd(8)} ${step.status} (${(step.ms / SECONDS).toFixed(1)} s)${step.note === undefined ? '' : `: ${step.note}`}`);
  for (const refusal of result.refusals) {
    lines.push(`  ${refusal.step}${refusal.file === undefined ? '' : ` ${refusal.file}`}: ${refusal.message}`, `    ${refusalHint(refusal)}`);
  }
  for (const warning of result.warnings) {
    lines.push(`  ${warning.step}: warning: ${warning.message}`, `    ${refusalHint(warning)}`);
  }
  lines.push(`check ${result.verdict} in ${(result.ms / SECONDS).toFixed(1)} s`);
  return lines;
}
