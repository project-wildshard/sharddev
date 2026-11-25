// oxlint-disable-next-line import/no-nodejs-modules -- migrate reads the repo's installed sdk from its node_modules.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the repo and its node_modules.
import { join, resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- migrate writes its report to stdout and a refusal to stderr.
import process from 'node:process';
import { migrateLines, migrateRepo } from '@wildshard/sdk/internal/migrations';
import { SDK_NAMES } from '@wildshard/sdk/internal/updatePins';
import { refusalHint, refusalNote } from '@wildshard/upload/sharddev/refusals';
import { listedSdks, shardRepoAt, type Output } from './migrationGate.ts';

// SDK 0.5.0 plan M3 (ask A7): `wildshard migrate [dir]`, run from bin/wildshard.mjs unbundled, as `status` is. It brings
// the shard repo up to the sdk installed in its own node_modules (never this CLI's copy): syncs GUIDE.md and the skills,
// runs each pending migration oldest first, writes the stamp and prints what moved and the manual steps
// (migrations.ts migrateRepo). `migrate --dry-run <file>` is another verb (SHARD-COMPAT CP7, src/cli/migrate) that the
// bin routes past this one.

const USAGE = 'usage: wildshard migrate [dir] (or migrate --dry-run <file> [--server <url>])';
const PROCESS_OUTPUT: Output = { out: text => { process.stdout.write(text); }, err: text => { process.stderr.write(text); } };
const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error);

/** The sdk installed in the repo's own node_modules: its root and version. */
function repoSdk(repo: string): { readonly sdkRoot: string; readonly installed: string } {
  const root = listedSdks(repo).map(name => join(repo, 'node_modules', name)).find(folder => existsSync(join(folder, 'package.json')));
  if (root === undefined) throw new Error(`migrate: ${repo} has no ${SDK_NAMES.join(' or ')} installed: run pnpm install, then migrate again`);
  const sdkRoot = realpathSync(root), parsed: unknown = JSON.parse(readFileSync(join(sdkRoot, 'package.json'), 'utf8'));
  const installed = typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'version') : undefined;
  if (typeof installed !== 'string') throw new Error(`migrate: the sdk at ${sdkRoot} names no version`);
  return { sdkRoot, installed };
}

/** `wildshard migrate [dir]`; returns the exit code. A refusal (a dirty tree, a migration that threw) prints its words,
 * then its rule, fix and GUIDE.md section, and exits 1; a migration that threw leaves the stamp as it was. */
export async function runMigrate(args: readonly string[], cwd: string, output: Output = PROCESS_OUTPUT): Promise<number> {
  if (args.length > 1 || args.some(arg => arg.startsWith('-'))) { output.err(`${USAGE}\n`); return 1; }
  const dir = resolve(cwd, args[0] ?? '.');
  try {
    const repo = shardRepoAt(dir);
    if (repo === undefined) throw new Error(`migrate: ${dir} is not a shard repo: its package.json lists no ${SDK_NAMES.join(' or ')}`);
    const result = await migrateRepo(repo, repoSdk(repo));
    output.out(`${migrateLines(result).join('\n')}\n`);
    return 0;
  } catch (error) {
    const message = messageOf(error);
    output.err(`${message}\n  ${refusalHint(refusalNote('update', message))}\n`);
    return 1;
  }
}
