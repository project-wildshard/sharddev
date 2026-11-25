// oxlint-disable-next-line import/no-nodejs-modules -- migrate refuses a repo whose tree git does not show as committed.
import { execFileSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- The stamp lives in the shard repo's package.json; codemods are files.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the repo's package.json and the installed sdk.
import { basename, resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- A codemod is a module the installed sdk ships; it loads by file URL.
import { pathToFileURL } from 'node:url';
// `.ts`: the bin loads this module straight under Node (status, migrate, and the migration gate before dev, build, check
// and upload), with no bundle.
import { updateShardRepo } from './agentFiles.ts';

// SDK 0.5.0 plan M1 (ask A7): what a shard repo was last migrated to, and which of the installed sdk's migrations have
// not run on it. A migration is a release codemod, `codemods/<version>.mjs`; from 0.5.0 on it also exports
//   title: string                                   one line: what the release changes in a shard repo
//   pending({ project }): string | undefined         why the repo is still in the old state (undefined: it is not),
//                                                    sync or async
//   guide: string                                    its GUIDE.md anchor (`migrate-0-5-0`)
// beside its default export, the edit itself: `({ project, from, to }) => string[] | { lines, manual } | void`, sync or
// async. `lines` say what it changed; `manual` names each edit it could not make safely (file:line and what to do).
// The stamp (`package.json` `"wildshard": { "migrated": "<v>" }`) is the sdk version the source was last migrated to, not
// its pin: a repo bumped by hand keeps its old stamp, so the CLI can tell.
// M3: `wildshard migrate` (migrateRepo) runs the pending ones and writes the stamp; M4: `upgrade` (updatePins.ts) runs
// the same engine after it moves the pins. This module is their base: updatePins.ts imports it, never the reverse.

/** A release version `x.y.z[-pre]`. */
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/u;
/** Whether `text` is a release version `x.y.z[-pre]`. */
export function isVersion(text: string): boolean { return SEMVER.test(text); }
/** Compare two versions `x.y.z[-pre]`: negative, zero or positive. A prerelease sorts before its release. */
export function compareVersions(a: string, b: string): number {
  const left = SEMVER.exec(a), right = SEMVER.exec(b);
  if (left === null || right === null) throw new Error(`${left === null ? a : b} is not a version`);
  for (let part = 1; part <= 3; part += 1) {
    const difference = Number(left[part]) - Number(right[part]);
    if (difference !== 0) return difference;
  }
  const [preLeft, preRight] = [left[4], right[4]];
  if (preLeft === preRight) return 0;
  if (preLeft === undefined) return 1;
  if (preRight === undefined) return -1;
  // semver: dot-separated identifiers, numbers numerically and below words; fewer identifiers sort first.
  const [partsLeft, partsRight] = [preLeft.split('.'), preRight.split('.')];
  for (let index = 0; index < Math.min(partsLeft.length, partsRight.length); index += 1) {
    const [l, r] = [partsLeft[index] ?? '', partsRight[index] ?? ''];
    if (l === r) continue;
    const [ln, rn] = [/^\d+$/u.test(l), /^\d+$/u.test(r)];
    if (ln && rn) return Number(l) - Number(r);
    if (ln !== rn) return ln ? -1 : 1;
    return l < r ? -1 : 1;
  }
  return partsLeft.length - partsRight.length;
}

/** A release's codemods: `codemods/<version>.mjs` in the installed sdk, each default-exporting the edit. */
export const CODEMODS_FOLDER = 'codemods';

/** One release codemod the installed sdk ships: its version and its file. */
export interface CodemodFile { readonly version: string; readonly file: string }

/** Every `codemods/<version>.mjs` in the sdk at `sdkRoot`, oldest first. */
export function codemodFiles(sdkRoot: string): CodemodFile[] {
  const folder = resolve(sdkRoot, CODEMODS_FOLDER);
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .map(file => /^(.+)\.mjs$/u.exec(file)?.[1])
    .filter((version): version is string => version !== undefined && SEMVER.test(version))
    .sort(compareVersions)
    .map(version => ({ version, file: resolve(folder, `${version}.mjs`) }));
}

/** The codemods for a pin move `from` → `to`: every `<v>.mjs` with from < v <= to, oldest first. */
export function codemodsBetween(sdkRoot: string, from: string, to: string): string[] {
  return codemodFiles(sdkRoot)
    .filter(({ version }) => compareVersions(version, from) > 0 && compareVersions(version, to) <= 0)
    .map(({ file }) => file);
}

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const packageFile = (project: string): string => resolve(project, 'package.json');
const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error);

/** `upgrade` and `migrate` edit package.json and (by their codemods) the shard source, so they need a repo whose every
 * change is committed: then `git diff` shows only what they made. `verb` names the command in the refusal. It refuses a
 * repo git does not track (no repo, or package.json not committed, as in a folder another repo ignores) and one with
 * uncommitted or untracked changes. Ignored files (node_modules, build output) are not dirt. There is no flag to skip
 * this. */
export function assertCommitted(project: string, verb = 'upgrade'): void {
  const git = (args: readonly string[]): string | undefined => {
    try { return execFileSync('git', [...args], { cwd: project, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (error) {
      if (isRecord(error) && error['code'] === 'ENOENT') throw new Error(`${verb}: git not found: install git, then run ${verb} again`, { cause: error });
      return undefined;
    }
  };
  // Untracked files count whatever the author's status.showUntrackedFiles says.
  const status = git(['ls-files', '--error-unmatch', '--', 'package.json']) === undefined ? undefined : git(['status', '--porcelain', '--untracked-files=normal', '--', '.']);
  if (status === undefined) throw new Error(`${verb}: ${project} is not in a git repo with its package.json committed; ${verb} edits your files, and git diff is how you see what it changed`);
  const changed = status.split('\n').filter(line => line.trim() !== '');
  if (changed.length > 0) {
    const shown = changed.slice(0, 3).map(line => line.slice(3)).join(', ') + (changed.length > 3 ? ` and ${String(changed.length - 3)} more` : '');
    throw new Error(`${verb}: ${project} has uncommitted changes (${shown}); commit or stash them first, so git diff shows only what ${verb} changes`);
  }
}

/** The package.json field that holds the stamp: `"wildshard": { "migrated": "<version>" }`. */
export const STAMP_FIELD = 'wildshard';
/** The first sdk whose codemods may export `pending`. Older codemods are not loaded to ask (0.4.24's pulls in the
 * TypeScript compiler), so they are pending only inside a stamp's window. */
export const FIRST_STATEFUL = '0.5.0';

/** One migration the installed sdk has that has not run on a repo. `reason` is what its `pending` said, when it fired. */
export interface PendingMigration {
  readonly version: string;
  readonly file: string;
  readonly title?: string;
  /** The GUIDE.md anchor, without `GUIDE.md#`. */
  readonly guide?: string;
  readonly reason?: string;
}

/** The repo's stamp: the sdk version it was last migrated to, or undefined when it has none (every repo before 0.5.0). */
export function readStamp(project: string): string | undefined {
  const file = packageFile(project);
  if (!existsSync(file)) return undefined;
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  const field = isRecord(parsed) ? parsed[STAMP_FIELD] : undefined;
  if (field === undefined) return undefined;
  const migrated = isRecord(field) ? field['migrated'] : undefined;
  if (migrated === undefined) return undefined;
  if (typeof migrated !== 'string' || !SEMVER.test(migrated)) throw new Error(`${file}: "${STAMP_FIELD}": { "migrated": ... } must be an sdk version, not ${JSON.stringify(migrated)}`);
  return migrated;
}

/** Stamp the repo as migrated to `version`. Only this field changes: key order and indent stay, and a new field goes last. */
export function writeStamp(project: string, version: string): void {
  if (!SEMVER.test(version)) throw new Error(`writeStamp: ${version} is not a version`);
  const file = packageFile(project), text = readFileSync(file, 'utf8');
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) throw new Error(`${file} is not a JSON object`);
  const field = parsed[STAMP_FIELD];
  if (field !== undefined && !isRecord(field)) throw new Error(`${file}: "${STAMP_FIELD}" is not an object`);
  parsed[STAMP_FIELD] = { ...field, migrated: version };
  const indent = /^\{\r?\n([ \t]+)"/u.exec(text)?.[1] ?? 2;
  writeFileSync(file, `${JSON.stringify(parsed, null, indent)}${text.endsWith('\n') ? '\n' : ''}`);
}

/** A codemod's migration exports, as loaded. */
interface Loaded {
  readonly title?: string;
  readonly guide?: string;
  readonly pending?: (input: { readonly project: string }) => unknown;
  readonly run?: (move: { readonly project: string; readonly from: string; readonly to: string }) => unknown;
}

async function load(file: string): Promise<Loaded> {
  let loaded: unknown;
  try { loaded = await import(pathToFileURL(file).href); }
  catch (error) { throw new Error(`migration ${file} did not load: ${messageOf(error)}`, { cause: error }); }
  if (!isRecord(loaded)) return {};
  const { title, guide, pending, default: run } = loaded;
  return {
    ...(typeof title === 'string' ? { title } : {}),
    ...(typeof guide === 'string' ? { guide: guide.replace(/^(?:GUIDE\.md)?#/u, '') } : {}),
    ...(typeof pending === 'function' ? { pending: input => Reflect.apply(pending, undefined, [input]) as unknown } : {}),
    ...(typeof run === 'function' ? { run: move => Reflect.apply(run, undefined, [move]) as unknown } : {}),
  };
}

/** What a migration's `pending` says about the repo: its reason, or undefined when it has none or says nothing. */
async function askPending(version: string, pending: Loaded['pending'], project: string): Promise<string | undefined> {
  if (pending === undefined) return undefined;
  let said: unknown;
  try { said = await pending({ project }); }
  catch (error) { throw new Error(`migration ${version}'s pending() failed on ${project}: ${messageOf(error)}`, { cause: error }); }
  return typeof said === 'string' && said !== '' ? said : undefined;
}

/** How pendingMigrations reads a repo. `since` stands in for its stamp (upgrade passes the stamp, else the old pin). */
export interface PendingOptions { readonly since?: string | undefined }

/** The installed sdk's migrations that have not run on the repo at `project`, oldest first: each codemod with
 * stamp < v <= installed, plus any codemod <= installed whose `pending` fires. With no stamp, only those whose `pending`
 * fires. A codemod from before FIRST_STATEFUL is never asked. */
export async function pendingMigrations(project: string, sdkRoot: string, installed: string, options: PendingOptions = {}): Promise<PendingMigration[]> {
  const stamp = Object.hasOwn(options, 'since') ? options.since : readStamp(project), found: PendingMigration[] = [];
  for (const { version, file } of codemodFiles(sdkRoot)) {
    if (compareVersions(version, installed) > 0) continue;
    const inWindow = stamp !== undefined && compareVersions(version, stamp) > 0;
    if (!inWindow && compareVersions(version, FIRST_STATEFUL) < 0) continue;
    const { title, guide, pending } = await load(file);
    const reason = await askPending(version, pending, project);
    if (!inWindow && reason === undefined) continue;
    found.push({ version, file, ...(title === undefined ? {} : { title }), ...(guide === undefined ? {} : { guide }), ...(reason === undefined ? {} : { reason }) });
  }
  return found;
}

/** M4: the migrations a pin move `from` → `to` runs: every codemod from before FIRST_STATEFUL in the pin window (the
 * old path, which knows no stamp), and every pendingMigrations entry, its window starting at the stamp or, with none,
 * at `from`. So a repo whose pin already says `to` (bumped by hand) still gets a migration whose `pending` fires.
 * Oldest first, each once. */
export async function migrationsForMove(project: string, sdkRoot: string, from: string, to: string): Promise<PendingMigration[]> {
  const pending = await pendingMigrations(project, sdkRoot, to, { since: readStamp(project) ?? from });
  const old = codemodFiles(sdkRoot).filter(({ version }) => compareVersions(version, FIRST_STATEFUL) < 0 && compareVersions(version, from) > 0 && compareVersions(version, to) <= 0);
  const byVersion = new Map<string, PendingMigration>(old.map(codemod => [codemod.version, codemod]));
  for (const row of pending) byVersion.set(row.version, row);
  return [...byVersion.values()].sort((a, b) => compareVersions(a.version, b.version));
}

/** What one migration did: what it says it changed, and each edit it left to the author. */
export interface MigrationRun {
  readonly version: string;
  /** Its file's name, `0.5.0.mjs`. */
  readonly name: string;
  readonly title?: string;
  readonly lines: readonly string[];
  readonly manual: readonly string[];
}

const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((line): line is string => typeof line === 'string') : [];

/** Run each migration on `project`, in the order given, as the move `from` → `to`. A migration returns `string[]` (its
 * lines), `{ lines, manual }`, or nothing. One that throws, or has no default export, stops the run: the error names
 * its file, and nothing after it runs. */
export async function runMigrations(project: string, migrations: readonly PendingMigration[], move: { readonly from: string; readonly to: string }): Promise<MigrationRun[]> {
  const runs: MigrationRun[] = [];
  for (const migration of migrations) {
    const name = basename(migration.file);
    let said: unknown, title = migration.title;
    try {
      const loaded = await load(migration.file);
      title ??= loaded.title;
      if (loaded.run === undefined) throw new Error('it has no default export function');
      said = await loaded.run({ project, from: move.from, to: move.to });
    } catch (error) { throw new Error(`migration ${name} failed: ${messageOf(error)}`, { cause: error }); }
    const lines = Array.isArray(said) ? strings(said) : isRecord(said) ? strings(said['lines']) : [];
    const manual = isRecord(said) ? strings(said['manual']) : [];
    runs.push({ version: migration.version, name, ...(title === undefined ? {} : { title }), lines, manual });
  }
  return runs;
}

/** The report lines for `runs`: each migration's title and lines, then a "Manual steps" section with every `manual`
 * entry (none: no section). `codemod` labels each run as `upgrade` printed it before (`  codemod <file>`). */
export function runLines(runs: readonly MigrationRun[], label: 'codemod' | 'migration' = 'migration'): string[] {
  const lines: string[] = [];
  for (const run of runs) {
    lines.push(label === 'codemod'
      ? `  codemod ${run.name}${run.title === undefined ? '' : `: ${run.title}`}`
      : `  ${run.version}  ${run.title ?? `migration ${run.name}`}`);
    for (const line of run.lines) lines.push(`    ${line}`);
  }
  const manual = runs.flatMap(run => run.manual.map(step => `  ${run.version}  ${step}`));
  if (manual.length > 0) lines.push('Manual steps (no script can make these edits safely; do each, then run check):', ...manual);
  return lines;
}

/** What `wildshard migrate` did to a repo. */
export interface MigrateResult {
  readonly installed: string;
  /** The stamp before the run. */
  readonly stamp: string | undefined;
  /** What syncing GUIDE.md and the skills said. */
  readonly agentLines: readonly string[];
  readonly runs: readonly MigrationRun[];
}

/** Where migrateRepo finds the installed sdk: its root and version (the one the repo resolves from its node_modules). */
export interface InstalledSdk { readonly sdkRoot: string; readonly installed: string }

/** M3: `wildshard migrate`: bring the shard repo at `project` up to the installed sdk, however it got installed.
 * 1. Refuse unless git shows every change committed, so `git diff` shows only what migrate did; a repo already stamped
 *    at the installed sdk with nothing pending has nothing to write, so it is not refused.
 * 2. Sync GUIDE.md and the skills from the installed sdk first, so an agent reads the new instructions.
 * 3. Run each pending migration, oldest first, as the move stamp → installed (no stamp: from `0.0.0`, unknown).
 * 4. Write the stamp (even when nothing was pending, so the repo is stamped on its first migrate). A migration that
 *    throws stops the run before the stamp: the error names it, and `git diff` shows what it changed. */
export async function migrateRepo(project: string, sdk: InstalledSdk): Promise<MigrateResult> {
  const { sdkRoot, installed } = sdk, stamp = readStamp(project);
  const pending = await pendingMigrations(project, sdkRoot, installed);
  if (pending.length > 0 || stamp !== installed) assertCommitted(project, 'migrate');
  let agentLines: string[];
  try { agentLines = updateShardRepo(project, sdkRoot); }
  catch (error) { throw new Error(`migrate: writing GUIDE.md and the skills from @wildshard/sdk ${installed} failed: ${messageOf(error)}`, { cause: error }); }
  let runs: MigrationRun[];
  try { runs = await runMigrations(project, pending, { from: stamp ?? '0.0.0', to: installed }); }
  catch (error) { throw new Error(`migrate: ${messageOf(error)}; the stamp is unchanged (${stamp ?? 'none'}): git diff shows what it changed before it stopped`, { cause: error }); }
  if (stamp !== installed) writeStamp(project, installed);
  return { installed, stamp, agentLines, runs };
}

/** migrate's report: the agent-file lines, each migration and the manual steps, then its last line. */
export function migrateLines(result: MigrateResult): string[] {
  const { installed, agentLines, runs } = result;
  if (runs.length === 0) return [...agentLines, `nothing to migrate; stamped ${installed}`];
  return [...agentLines, `wildshard migrate: ${String(runs.length)} migration${runs.length === 1 ? '' : 's'} ran`, ...runLines(runs), `migrated to sdk ${installed}; run: pnpm exec wildshard check .`];
}
