// oxlint-disable-next-line import/no-nodejs-modules -- The gate reads the shard repo's package.json and its installed sdk.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- It finds the CLI's own sdk when the repo has none installed.
import { createRequire } from 'node:module';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the repo and its node_modules.
import { dirname, join, resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- The gate and status write to stdout and stderr.
import process from 'node:process';
import { pendingMigrations, readStamp, type PendingMigration } from '@wildshard/sdk/internal/migrations';
import { SDK_NAMES } from '@wildshard/sdk/internal/updatePins';
import { refusalHint, refusalNote } from '@wildshard/upload/sharddev/refusals';
import { findShardSource, shardRepoRoot } from '@wildshard/upload/sharddev/shardSource';

// SDK 0.5.0 plan M2 (ask A7): `wildshard status [--brief] [dir]`, and the up-front refusal `migration-pending`.
// bin/wildshard.mjs asks migrationGate before dev, watch, build, check and upload do any work (and @wildshard/cli's bin,
// through scripts/migration-gate.mjs, before it hands `build` to build's own bin), so a repo whose sdk was bumped by hand
// hears about its migration from the CLI. Node loads this file straight from the bin, unbundled: it imports packages only.

/** The verbs that refuse while a migration is pending. */
const GATED: ReadonlySet<string> = new Set(['dev', 'watch', 'build', 'check', 'upload']);
const RUN = 'pnpm exec wildshard migrate';
const SKILL = 'node_modules/@wildshard/sdk/skills/wildshard-upgrade/SKILL.md';
const STEPS = ['lint', 'build', 'validate', 'prove', 'report'] as const;

/** What the installed sdk says about one shard repo. */
export interface MigrationState {
  readonly repo: string;
  readonly installed: string;
  readonly stamp: string | undefined;
  readonly pending: readonly PendingMigration[];
}
/** Where the gate and status write. */
export interface Output { readonly out: (text: string) => void; readonly err: (text: string) => void }
const PROCESS_OUTPUT: Output = { out: text => { process.stdout.write(text); }, err: text => { process.stderr.write(text); } };

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const readJson = (file: string): Json => { const parsed: unknown = JSON.parse(readFileSync(file, 'utf8')); return isRecord(parsed) ? parsed : {}; };
const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error);

/** The sdk names the repo's package.json lists (none: not a shard repo). */
export function listedSdks(repo: string): string[] {
  const file = join(repo, 'package.json');
  if (!existsSync(file)) return [];
  const listed = readJson(file);
  return SDK_NAMES.filter(name => ['dependencies', 'devDependencies'].some(field => { const pins = listed[field]; return isRecord(pins) && Object.hasOwn(pins, name); }));
}

/** The sdk installed in the repo (its codemods are the repo's migrations, as `update --pins` reads them), else the one
 * this CLI runs with (`pnpm dlx`, a repo not installed yet). */
function installedSdk(repo: string, names: readonly string[]): string {
  const installed = names.map(name => join(repo, 'node_modules', name)).find(root => existsSync(join(root, 'package.json')));
  return installed === undefined ? dirname(createRequire(import.meta.url).resolve('@wildshard/sdk/package.json')) : realpathSync(installed);
}

/** True for the sdk's own package (it is named as the sdk), which is never a shard repo. */
function isSdkPackage(repo: string): boolean {
  const file = join(repo, 'package.json');
  if (!existsSync(file)) return false;
  const name = readJson(file)['name'];
  return SDK_NAMES.some(sdk => sdk === name);
}

/** The shard repo at or above `dir` (a repo, or a shard source in one), or undefined when it is none. */
export function shardRepoAt(dir: string): string | undefined {
  const repo = shardRepoRoot(findShardSource(dir));
  // The sdk lists itself (`link:.`), but nothing migrates the sdk: on 0.5.0 its own leftover public/assets/ read as a
  // pending migration, and a status hook or gated verb anywhere under packages/sdk refused.
  if (isSdkPackage(repo)) return undefined;
  return listedSdks(repo).length === 0 ? undefined : repo;
}

/** The installed sdk, the stamp and the pending migrations of `repo`. */
export async function migrationState(repo: string): Promise<MigrationState> {
  const sdk = installedSdk(repo, listedSdks(repo)), installed = readJson(join(sdk, 'package.json'))['version'];
  if (typeof installed !== 'string') throw new Error(`the sdk at ${sdk} names no version`);
  return { repo, installed, stamp: readStamp(repo), pending: await pendingMigrations(repo, sdk, installed) };
}

const versionsOf = (state: MigrationState): string => state.pending.map(row => row.version).join(', ');

/** One pending migration: its version, title and guide heading, then what its `pending` found. */
function migrationLines(row: PendingMigration): string[] {
  const guide = row.guide === undefined ? '' : `   (GUIDE.md#${row.guide})`;
  const lines = [`  ${row.version}  ${row.title ?? `migration ${row.version}`}${guide}`];
  if (row.reason !== undefined) lines.push(`${' '.repeat(row.version.length + 4)}found: ${row.reason}`);
  return lines;
}

/** The refusal's words, the block every gated verb prints. */
export function pendingBlock(state: MigrationState): string {
  const { stamp, installed, pending } = state;
  const head = stamp === undefined
    ? `wildshard: this repo has no migration stamp, but sdk ${installed} is installed.`
    : `wildshard: this repo is migrated to sdk ${stamp}, but ${installed} is installed.`;
  const what = pending.length === 1
    ? `${versionsOf(state)} is a breaking release, and its migration has not run here:`
    : `${versionsOf(state)} are breaking releases, and their migrations have not run here:`;
  return [head, what, ...pending.flatMap(row => migrationLines(row)), `Run:   ${RUN}`, `Agents: read ${SKILL} and follow it.`].join('\n');
}

/** `status --brief`: one line while a migration is pending, else undefined. */
export function briefLine(state: MigrationState): string | undefined {
  if (state.pending.length === 0) return undefined;
  const one = state.pending.length === 1;
  const named = state.pending.map(row => row.title === undefined ? row.version : `${row.version} (${row.title})`).join(', ');
  return `wildshard: sdk ${state.installed} is installed, but ${one ? 'migration' : 'migrations'} ${named} ${one ? 'has' : 'have'} not run in this repo: run ${RUN} (agents: read ${SKILL} and follow it)`;
}

/** `status`: the installed sdk, the stamp and each pending migration. */
export function statusLines(state: MigrationState): string[] {
  const head = [`wildshard status: ${state.repo}`, `  sdk installed: ${state.installed}`, `  migration stamp: ${state.stamp ?? 'none'}`];
  if (state.pending.length === 0) return [...head, '  pending migrations: none'];
  return [...head, '  pending migrations:', ...state.pending.flatMap(row => migrationLines(row).map(line => `  ${line}`)), `  run: ${RUN}`];
}

const operandOf = (args: readonly string[]): string | undefined => args.find(arg => !arg.startsWith('-'));

/** The repo a gated invocation works in: a source verb's operand, upload's current folder. Help, `upload status` and a
 * verb with no operand (it refuses with its usage) pass, as does any folder that is no shard repo. */
export function gatedRepo(args: readonly string[], cwd: string): string | undefined {
  const [command, ...rest] = args;
  if (command === undefined || !GATED.has(command) || rest.some(arg => arg === '--help' || arg === '-h')) return undefined;
  if (command === 'upload') return rest[0] === 'status' ? undefined : shardRepoAt(cwd);
  const operand = operandOf(rest);
  return operand === undefined ? undefined : shardRepoAt(resolve(cwd, operand));
}

/** `check --json`'s verdict document (version 1) for the refusal. Like `pin-not-sdk`, it is the lint step's: it is about
 * the repo, not the source; the other steps do not run. */
function checkDocument(source: string, message: string): Json {
  const { rule, fix, guide } = refusalNote('lint', message);
  return {
    version: 1, verdict: 'fail', project: source, output: null, ms: 0,
    steps: STEPS.map(name => name === 'lint' ? { name, status: 'fail', ms: 0, note: 'a migration is pending' } : { name, status: 'skip', ms: 0, note: 'not run: a migration is pending' }),
    refusals: [{ step: 'lint', rule, message, fix, guide }],
    warnings: [],
  };
}

/** Before a gated verb does any work: true when it must refuse, having printed why (the block on stderr; `check --json`
 * prints its verdict document on stdout instead). */
export async function migrationGate(args: readonly string[], cwd: string, output: Output = PROCESS_OUTPUT): Promise<boolean> {
  let state: MigrationState | undefined;
  try {
    const repo = gatedRepo(args, cwd);
    state = repo === undefined ? undefined : await migrationState(repo);
  } catch (error) {
    output.err(`wildshard: cannot tell which migrations have run here: ${messageOf(error)}\n`);
    return true;
  }
  if (state === undefined || state.pending.length === 0) return false;
  const message = pendingBlock(state), rest = args.slice(1);
  if (args[0] === 'check' && rest.includes('--json')) {
    const source = resolve(findShardSource(resolve(cwd, operandOf(rest) ?? '.')));
    output.out(`${JSON.stringify(checkDocument(source, message), null, 2)}\n`);
  } else output.err(`${message}\n  ${refusalHint(refusalNote('lint', message))}\n`);
  return true;
}

/** `wildshard status [--brief] [dir]`; returns the exit code. It reads only, and never the network. `--brief` (a
 * SessionStart hook's) prints one line or nothing, and exits 0 even where it cannot tell (saying why on stderr) or the
 * repo is not installed yet. */
export async function runStatus(args: readonly string[], cwd: string, output: Output = PROCESS_OUTPUT): Promise<number> {
  const brief = args.includes('--brief'), operands = args.filter(arg => arg !== '--brief');
  if (operands.length > 1 || operands.some(arg => arg.startsWith('-'))) { output.err('usage: wildshard status [--brief] [dir]\n'); return 1; }
  const dir = resolve(cwd, operands[0] ?? '.');
  try {
    const repo = shardRepoAt(dir);
    if (repo === undefined) {
      if (brief) return 0;
      output.err(`wildshard status: ${dir} is not a shard repo: its package.json lists no ${SDK_NAMES.join(' or ')}\n`);
      return 1;
    }
    // M5: the SessionStart hook runs this before any install. With no node_modules there is no installed sdk to ask (and
    // `pnpm install` brings one), so it says nothing rather than load this CLI's own migrations.
    if (brief && !existsSync(join(repo, 'node_modules'))) return 0;
    const state = await migrationState(repo);
    const line = briefLine(state);
    if (!brief) output.out(`${statusLines(state).join('\n')}\n`);
    else if (line !== undefined) output.out(`${line}\n`);
    return 0;
  } catch (error) {
    output.err(`wildshard status: ${messageOf(error)}\n`);
    return brief ? 0 : 1;
  }
}
