// SDK-SPLIT SP9d2: `wildshard-build <source> [folder] [flags]`, build's own bin. It runs the same verb as `wildshard build`
// (buildVerb.ts) with the same options dev's scripts/wildshard.mjs composes (declared outputs, the composed manifest, the
// legacy line basis, upload's shard file writer), but needs no dev, no engine and no run-time bundle of the CLI:
// scripts/compile.mjs compiles it to dist/build.mjs at pack time.
// oxlint-disable-next-line import/no-nodejs-modules -- The verb reads the author's repo.
import { existsSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- The verb resolves the author's paths.
import { basename, resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- Exit status and argv.
import process from 'node:process';
import { locatedError } from '@wildshard/sdk/internal/authorError';
import type { ProjectManifestSource } from '@wildshard/sdk/projectManifest';
import { writeShardfile } from '@wildshard/upload/cli/shardfile/shardfile';
import { refusalCode, refusalHint, refusalNote } from '@wildshard/upload/sharddev/refusals';
import { findShardSource, shardFolderName } from '@wildshard/upload/sharddev/shardSource';
import { decisionLegacyLines } from '../../scripts/decision-legacy-lines.mjs';
import { outputManifest, shardCardFile, shardOutputs } from '../../scripts/shard-outputs.mjs';
import { runBuild, ShardfileRefusalError, type BuildVerbOptions } from './buildVerb';

const USAGE = 'usage: wildshard-build <source> [folder] [--shardfile-only|--folder-only] [--no-placeholders] [--output=<slug>]';

/** The options dev's scripts/wildshard.mjs gives `build` for the source `project`, read from the repo at `root`. */
function buildOptions(root: string, project: string, selected: string | undefined): BuildVerbOptions {
  // The folder build checks the manifest slug against: a src/ source takes its manifest's slug (new <dir> <slug>).
  const folder = shardFolderName(project);
  // SF88g: `--output=<slug>` builds one declared output of the folder, under its own slug and composed manifest.
  const output = selected === undefined ? undefined : new Map((shardOutputs(root, folder) ?? []).map(row => [row.slug, row])).get(selected);
  if (selected !== undefined && output === undefined) throw new Error(`wildshard-build: ${basename(project)} declares no output ${selected}`);
  // ONE-FORMAT OF6a: the card is `data/card.json` (a legacy `manifest.json` first while one is left).
  const card = shardCardFile(project);
  const manifest: ProjectManifestSource | undefined = !existsSync(resolve(project, 'shard.config.ts')) ? undefined : {
    folder: output?.slug ?? folder,
    ...(output !== undefined ? { composed: outputManifest(root, folder, output.row) } : card !== null ? { file: card } : {}),
    imageRoots: [{ prefix: `/src/shards/${folder}/`, directory: project }, { prefix: '/assets/', directory: resolve(root, 'public/assets') }],
  };
  const legacy = decisionLegacyLines(root, folder);
  return {
    ...(legacy === undefined ? {} : { decisionLegacyLines: legacy }),
    ...(manifest === undefined ? {} : { manifest }),
    writeShardfile: async (dir, source) => (await writeShardfile({ dir, source, report: line => console.info(line) })).file,
  };
}

/** The refusal with its rule, fix and GUIDE.md link on a second line, as `wildshard build` prints it. */
function refusal(error: unknown): string {
  const located = locatedError(error);
  const message = located instanceof Error ? located.message : String(located);
  return `${message}\n  ${refusalHint(refusalNote(error instanceof ShardfileRefusalError ? 'shardfile' : 'build', message, { code: refusalCode(error) }))}`;
}

/** Run `wildshard-build` with `args` (the words after the bin) from the repo at `root`. */
export async function buildMain(args: readonly string[], root: string): Promise<void> {
  const [operand, ...rest] = args;
  if (operand === undefined || operand.startsWith('-')) throw new Error(USAGE);
  // SA16 (J317): a repo path names its shard source at src/ (one shard) or its one src/shards/<slug>/ (several).
  const project = resolve(findShardSource(operand));
  const selected = rest.find(arg => arg.startsWith('--output='))?.slice('--output='.length);
  try { await runBuild(project, rest, buildOptions(root, project, selected)); } catch (error) { throw new Error(refusal(error), { cause: error }); }
}

/** The bin: the repo is the folder the author stands in. */
export async function main(): Promise<void> {
  try { await buildMain(process.argv.slice(2), process.cwd()); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
