import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { text as readAll } from 'node:stream/consumers'

import { object, optional, safeParse, string } from 'valibot'

// What every upload names (API-CLOUDFLARE AC16, J275 V1): the shard version
// and the commit of the shard project it was built from. `--version`
// defaults to the project's package.json version and `--commit` to its git
// HEAD, and a HEAD with uncommitted changes to tracked files is refused, as
// it does not describe the bytes. Untracked files (the packed tarball, build
// output) are not dirt, as in `git describe --dirty`. The checks match the
// API's, so a bad value fails here, before any bytes move.

const VERSION = /^(?:0|[1-9]\d{0,8})\.(?:0|[1-9]\d{0,8})\.(?:0|[1-9]\d{0,8})$/u
const COMMIT = /^[\da-f]{40}$/u
const PACKAGE_JSON = 'package.json'
const GIT_OK = 0

const PackageJsonSchema = object({ version: optional(string()) })

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
      `the shard project has uncommitted changes (git status in ${cwd}); commit them, or pass --commit <sha> for bytes built elsewhere`,
    )
  }
  return head
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
  return { version, commit }
}

export { type Provenance, type ProvenanceRequest, resolveProvenance }
