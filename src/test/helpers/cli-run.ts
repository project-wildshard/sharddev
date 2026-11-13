import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { text } from 'node:stream/consumers'
import type { TestContext } from 'node:test'
import { fileURLToPath } from 'node:url'

// The real CLI (src/cli/main.ts) in a child process with only the
// environment a test gives it, from the repository root, and a scratch HOME
// for the account key file (meta SHARD-DELETE DEL6).

const MAIN = fileURLToPath(new URL('../../cli/main.ts', import.meta.url))
const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const OWNER_ONLY = 0o600

interface CliRun {
  readonly status: number | null
  readonly stdout: string
  readonly stderr: string
}

async function runCli(
  args: readonly string[],
  env: Readonly<Record<string, string>>,
): Promise<CliRun> {
  const child = spawn(process.execPath, [MAIN, ...args], {
    cwd: ROOT,
    env: { PATH: process.env['PATH'], ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const [stdout, stderr] = [text(child.stdout), text(child.stderr)]
  await once(child, 'close')
  return { status: child.exitCode, stdout: await stdout, stderr: await stderr }
}

/** Where `wildshard account` keeps the key under `home`. */
function keyFileIn(home: string): string {
  return path.join(home, '.config', 'wildshard', 'sharddev-key')
}

/** A scratch HOME, holding `key` in the key file when given. */
async function scratchHome(
  context: TestContext,
  key?: string,
): Promise<string> {
  const home = await mkdtemp(path.join(tmpdir(), 'sharddev-home-'))
  context.after(async (): Promise<void> => {
    await rm(home, { recursive: true })
  })
  if (key !== undefined) {
    await mkdir(path.dirname(keyFileIn(home)), { recursive: true })
    await writeFile(keyFileIn(home), `${key}\n`, { mode: OWNER_ONLY })
  }
  return home
}

export { type CliRun, keyFileIn, runCli, scratchHome }
