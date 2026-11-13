import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { text as readAll } from 'node:stream/consumers'

import { object, optional, safeParse, string } from 'valibot'

import { readVersion } from '../version.ts'

// What every upload names (API-CLOUDFLARE AC16, J275 V1): the shard version
// and the commit of the shard project it was built from. `--version`
// defaults to the project's package.json version and `--commit` to its git
// HEAD, and a HEAD with uncommitted changes to tracked files is refused, as
// it does not describe the bytes. Untracked files (the packed tarball, build
// output) are not dirt, as in `git describe --dirty`. The checks match the
// API's, so a bad value fails here, before any bytes move.
//
// J306 (SHARD-AUTHORING UP3) adds the versions the shard was built with:
// sharddev's own, and engine's and shard-format's from the package.json
// each name resolves to from the shard project, the nearest
// node_modules/<name> at or above it. shard-format is
// `@wildshard/shard-format`, or the `@wildshard/format` alias until the J308
// pins land. A shard with neither installed falls back to the copy this
// sharddev carries, which is what its build ran with.

const VERSION = /^(?:0|[1-9]\d{0,8})\.(?:0|[1-9]\d{0,8})\.(?:0|[1-9]\d{0,8})$/u
const COMMIT = /^[\da-f]{40}$/u
const PACKAGE_JSON = 'package.json'
const GIT_OK = 0

const PackageJsonSchema = object({ version: optional(string()) })

const ENGINE = ['@wildshard/engine']
const SHARD_FORMAT = ['@wildshard/shard-format', '@wildshard/format']
// This sharddev's own install: its node_modules resolve from here up.
const SHARDDEV_DIR = import.meta.dirname

interface ProvenanceRequest {
  /** Where `wildshard upload` runs: inside the shard project. */
  readonly cwd: string
  /** `--version`, if passed. */
  readonly version?: string | undefined
  /** `--commit`, if passed. */
  readonly commit?: string | undefined
}

interface Provenance {
  readonly version: string
  readonly commit: string
  /** The sharddev that uploads (J306). */
  readonly sharddev: string
  /** The engine the shard resolves (J306). */
  readonly engine: string
  /** The shard-format the shard resolves (J306). */
  readonly shardFormat: string
}

async function readIfThere(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8')
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

/** The nearest package.json at or above `dir`, and its text. */
async function nearestPackage(
  dir: string,
): Promise<Readonly<{ file: string; text: string }> | undefined> {
  const file = path.join(dir, PACKAGE_JSON)
  const text = await readIfThere(file)
  if (text !== undefined) {
    return { file, text }
  }
  const parent = path.dirname(dir)
  return parent === dir ? undefined : await nearestPackage(parent)
}

async function projectVersion(cwd: string): Promise<string> {
  const found = await nearestPackage(path.resolve(cwd))
  if (found === undefined) {
    throw new Error(
      `no ${PACKAGE_JSON} at or above ${cwd}; pass --version X.Y.Z`,
    )
  }
  const parsed = safeParse(PackageJsonSchema, JSON.parse(found.text))
  const version = parsed.success ? parsed.output.version : undefined
  if (version === undefined) {
    throw new Error(`no version in ${found.file}; pass --version X.Y.Z`)
  }
  return version
}

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const child = spawn('git', [...args], {
    cwd,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const output = readAll(child.stdout)
  try {
    await once(child, 'close')
  } catch {
    // No git, or no such folder: the same advice.
  }
  if (child.exitCode !== GIT_OK) {
    throw new Error(`${cwd} is not a git checkout; pass --commit <sha>`)
  }
  const out = await output
  return out.trim()
}

async function headCommit(cwd: string): Promise<string> {
  const head = await git(cwd, ['rev-parse', 'HEAD'])
  const dirty = await git(cwd, [
    'status',
    '--porcelain',
    '--untracked-files=no',
  ])
  if (dirty !== '') {
    throw new Error(
      `the shard source has uncommitted changes (git status in ${cwd}); commit them, or pass --commit <sha> for bytes built elsewhere`,
    )
  }
  return head
}

/** The first of `names` installed at `dir` or above, and its version. */
async function installedAt(
  dir: string,
  names: readonly string[],
): Promise<Readonly<{ name: string; file: string; text: string }> | undefined> {
  for (const name of names) {
    const file = path.join(dir, 'node_modules', name, PACKAGE_JSON)
    // oxlint-disable-next-line no-await-in-loop -- the first name found wins
    const text = await readIfThere(file)
    if (text !== undefined) {
      return { name, file, text }
    }
  }
  const parent = path.dirname(dir)
  return parent === dir ? undefined : await installedAt(parent, names)
}

/** The version of the first of `names` the shard, else sharddev, resolves. */
async function installedVersion(
  cwd: string,
  names: readonly string[],
): Promise<string> {
  const found =
    (await installedAt(path.resolve(cwd), names)) ??
    (await installedAt(SHARDDEV_DIR, names))
  if (found === undefined) {
    throw new Error(
      `${names.join(' or ')} is not installed at or above ${cwd}; run pnpm install in the shard repo`,
    )
  }
  const parsed = safeParse(PackageJsonSchema, JSON.parse(found.text))
  const version = parsed.success ? parsed.output.version : undefined
  if (version === undefined || !VERSION.test(version)) {
    throw new Error(
      `${found.name} ${String(version)} (${found.file}) is not X.Y.Z`,
    )
  }
  return version
}

/** The version and commit to send; throws what is missing or malformed. */
async function resolveProvenance(
  request: ProvenanceRequest,
): Promise<Provenance> {
  const version = request.version ?? (await projectVersion(request.cwd))
  if (!VERSION.test(version)) {
    throw new Error(`--version ${version} is not X.Y.Z`)
  }
  const commit = request.commit ?? (await headCommit(request.cwd))
  if (!COMMIT.test(commit)) {
    throw new Error(`--commit ${commit} is not a full 40-hex sha`)
  }
  return {
    version,
    commit,
    sharddev: await readVersion(),
    engine: await installedVersion(request.cwd, ENGINE),
    shardFormat: await installedVersion(request.cwd, SHARD_FORMAT),
  }
}

export { type Provenance, type ProvenanceRequest, resolveProvenance }
