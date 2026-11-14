// oxlint-disable-next-line import/no-nodejs-modules -- Find the repo's and the SDK's lint config and oxlint on disk.
import { existsSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Find oxlint the way the repo (or this package) resolves it.
import { createRequire } from 'node:module';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the repo root, its config and the linted folder.
import { dirname, relative, resolve } from 'node:path';
import { shardRepoRoot } from './shardSource';

/** How `wildshard check` runs the author lint for one project, or why it skips it. */
export type AuthorLintPlan =
  | { readonly kind: 'run'; readonly bin: string; readonly cwd: string; readonly args: readonly string[]; readonly env: Readonly<Record<string, string>> }
  | { readonly kind: 'skip'; readonly note: string };

export const AUTHOR_LINT_CONFIG = '.oxlintrc.author.json';

/** The oxlint binary `root`'s package resolves, if it has one. */
export function oxlintFrom(root: string): string | undefined {
  try {
    const manifest = createRequire(resolve(root, 'package.json')).resolve('oxlint/package.json');
    const bin = resolve(dirname(manifest), 'bin/oxlint');
    return existsSync(bin) ? bin : undefined;
  } catch { return undefined; }
}

/**
 * SS3 follow-up: a shard repo's own author lint first. Every shard repo carries `.oxlintrc.author.json` (its jsPlugins are
 * the installed engine's and sdk's lint plugins, under `./node_modules`) and lints `src` with it from its root; oxlint
 * matches a config's `overrides` against paths under the config's folder, so the wildshard rules hold only when the
 * config sits in the repo. `check` runs that same lint, with the repo's oxlint and `lint/ratchet.json`, so an npm-installed
 * sdk lints too. Without one, the SDK's own config (a sharddev checkout); without either, a skip that names the fix.
 */
export function authorLintPlan(projectPath: string, sdkRoot: string, findOxlint: (root: string) => string | undefined = oxlintFrom): AuthorLintPlan {
  const project = resolve(projectPath), root = shardRepoRoot(project), repoConfig = resolve(root, AUTHOR_LINT_CONFIG);
  if (resolve(root) !== resolve(sdkRoot) && existsSync(repoConfig)) {
    const bin = findOxlint(root) ?? findOxlint(sdkRoot);
    if (bin === undefined) return { kind: 'skip', note: `oxlint is installed neither in ${root} nor with this @wildshard/sdk, so ${AUTHOR_LINT_CONFIG} cannot run` };
    const ratchet = resolve(root, 'lint/ratchet.json');
    return { kind: 'run', bin, cwd: root, args: ['-c', repoConfig, '--format', 'json', relative(root, project) || '.'],
      env: existsSync(ratchet) ? { WILDSHARD_RATCHET_FILE: ratchet } : {} };
  }
  const sdkConfig = resolve(sdkRoot, AUTHOR_LINT_CONFIG), bin = findOxlint(sdkRoot);
  // The SDK's jsPlugins resolve engine from the working directory: run from the SDK root, as `pnpm lint:author` does.
  if (bin !== undefined && existsSync(sdkConfig)) return { kind: 'run', bin, cwd: sdkRoot, args: ['-c', sdkConfig, '--format', 'json', project], env: {} };
  return { kind: 'skip', note: `no author lint: ${root} has no ${AUTHOR_LINT_CONFIG} (a shard repo's lints src with the engine's and the sdk's lint plugins)` };
}
