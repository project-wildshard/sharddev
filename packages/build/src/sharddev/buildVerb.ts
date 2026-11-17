// SDK-SPLIT SP9d1: the `wildshard build` verb is build's. Dev's author CLI (packages/dev/src/sharddev/cli.ts) hands its
// `build` branch here, and SP9d2's compiled entry runs the same function, so a build never loads the engine.
// oxlint-disable-next-line import/no-nodejs-modules -- The verb resolves the author's paths.
import { resolve } from 'node:path'

import { STILL_IMAGE_LIMITS } from '@wildshard/format/stillImage'
import { buildBehaviourProject } from '@wildshard/sdk/buildBehaviour'
import {
  performanceReport,
  performanceReportLines,
  type PerformanceObservations,
} from '@wildshard/sdk/reportCard'
import { readBoundedFile } from '@wildshard/sdk/sourceReader'
import { shardOutputRoot } from '@wildshard/upload/sharddev/shardSource'

import { buildProject } from '../sharddev/project'

import type { Shardfile } from '@wildshard/format/shardSchema'
import type { ProjectManifestSource } from '@wildshard/sdk/projectManifest'

// The flags `build <source> [folder]` takes after the folder.
const KNOWN_FLAG =
  /^--(?:shardfile-only|folder-only|product-only|no-placeholders|format=2|copy-runtime)$|^--(?:map|map-tiles-hash|output|generated-map-tiles-hash)=/u
const unmeasured: PerformanceObservations = {
  scripts: { p95Micros: 0, maxMicros: 0, samples: 0 },
  fuel: { p95: 0, max: 0, samples: 0 },
}
/** The performance report's static half (declared bounds, downloads, memory): every refusal stands except the missing
 *  execution samples, which `wildshard check` measures (SP7c). */
export function printStaticReport(
  shard: Shardfile,
  policy: 'warn' | 'refuse',
): void {
  const report = performanceReport(shard, unmeasured, policy)
  for (const line of performanceReportLines(report)) console.info(line)
  if (
    report.issues.some(
      issue =>
        issue.severity === 'refusal' &&
        issue.code !== 'perf-script-samples-missing',
    )
  )
    throw new Error('Performance report refused this shard')
}
/** SA3: writes a built folder's shard file (hero check against `source`, format and audio checks) and returns its path;
 * scripts/wildshard.mjs gives it. `draftWarning: false` leaves the draft warning (J198) to the caller. */
export type ShardfileWriter = (
  folder: string,
  source: string,
  options?: { readonly draftWarning?: boolean },
) => Promise<string>
/** A refusal from the shard file step, named by its own rules (SA3), not build's source rules. */
export class ShardfileRefusalError extends Error {
  override readonly name = 'ShardfileRefusalError'
}
export interface BuildVerbOptions {
  readonly decisionLegacyLines?: number
  readonly manifest?: ProjectManifestSource
  readonly writeShardfile?: ShardfileWriter
}
export async function writeShardfileOf(
  options: BuildVerbOptions,
  folder: string,
  source: string,
): Promise<void> {
  try {
    await options.writeShardfile?.(folder, source)
  } catch (error) {
    throw new ShardfileRefusalError(
      error instanceof Error ? error.message : String(error),
      { cause: error },
    )
  }
}
/** `wildshard build <source> [folder] [flags]` and `build <source> --behaviour-only [--check]`; `input` is the shard source
 *  the caller found (SA16), `rest` the words after it. */
export async function runBuild(
  input: string,
  rest: readonly string[],
  options: BuildVerbOptions,
): Promise<void> {
  const [output, buildFlag] = rest
  if (
    output === '--behaviour-only' &&
    (buildFlag === undefined || buildFlag === '--check')
  ) {
    const files = await buildBehaviourProject(resolve(input), {
      check: buildFlag === '--check',
    })
    console.info(`built ${files.length} native behaviour outputs`)
    return
  }
  // A flag straight after the project is a flag, not the output folder.
  const folder = output?.startsWith('--') === true ? undefined : output
  const flags = rest.slice(folder === undefined ? 0 : 1)
  const value = (prefix: string): string | undefined =>
    flags.find(flag => flag.startsWith(prefix))?.slice(prefix.length)
  const count = (prefix: string): number =>
    flags.filter(flag => flag.startsWith(prefix)).length
  const mapSourceHash = value('--generated-map-tiles-hash='),
    mapPath = value('--map='),
    tilesHash = value('--map-tiles-hash='),
    selected = value('--output=')
  // SA3: --shardfile-only skips the client; --folder-only also skips the shard file, for build-shards, whose folders are
  // cached and prepared before anything tars them. --product-only keeps its old meaning: --folder-only.
  const folderOnly =
      flags.includes('--folder-only') || flags.includes('--product-only'),
    noClient = folderOnly || flags.includes('--shardfile-only')
  const unknownFlag = flags.find(flag => !KNOWN_FLAG.test(flag))
  if (unknownFlag !== undefined)
    throw new Error(`unknown build flag: ${unknownFlag}`)
  if (
    count('--output=') > 1 ||
    flags.length !== new Set(flags).size ||
    count('--map=') > 1 ||
    count('--map-tiles-hash=') > 1 ||
    count('--generated-map-tiles-hash=') > 1 ||
    (mapSourceHash !== undefined && mapPath !== undefined) ||
    (mapPath === undefined) !== (tilesHash === undefined)
  )
    throw new Error('unknown or incomplete build map flag')
  const map =
    mapPath === undefined || tilesHash === undefined
      ? undefined
      : {
          bytes: readBoundedFile(resolve(mapPath), STILL_IMAGE_LIMITS.bytes),
          tilesHash,
        }
  const shard = await buildProject(
    resolve(input),
    folder === undefined ? undefined : resolve(folder),
    {
      outputFormat: 2,
      ...(selected === undefined ? {} : { output: selected }),
      ...(options.decisionLegacyLines === undefined
        ? {}
        : { decisionLegacyLines: options.decisionLegacyLines }),
      ...(options.manifest === undefined ? {} : { manifest: options.manifest }),
      copyRuntime: flags.includes('--copy-runtime'),
      ...(noClient ? { client: null } : {}),
      ...(map === undefined ? {} : { map }),
      ...(mapSourceHash === undefined ? {} : { mapSourceHash }),
      placeholders: !flags.includes('--no-placeholders'),
      admit: async (built, _assets, policy) => {
        printStaticReport(built, policy)
        await Promise.resolve()
      },
    },
  )
  console.info(`built ${shard.identity.slug} v${shard.version}`)
  if (!folderOnly)
    await writeShardfileOf(
      options,
      folder === undefined
        ? resolve(
            shardOutputRoot(resolve(input)),
            'public/shardfiles',
            shard.identity.slug,
          )
        : resolve(folder),
      resolve(input),
    )
}
