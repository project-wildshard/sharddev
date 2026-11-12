import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Readable } from 'node:stream'
import { text } from 'node:stream/consumers'
import { after, test } from 'node:test'
import type { TestContext } from 'node:test'

import {
  installWildshard,
  tempFolder,
  writeProduct,
} from '../test/helpers/install.ts'
import { openUploadServer } from '../test/helpers/upload-server.ts'

// `wildshard` as a stranger gets it. Node won't strip types under node_modules,
// so a bin that runs in this tree can die in an install, and every other test
// here runs in this tree. A real product goes in, a real result comes out.
// CI only (J186).

interface Ran {
  readonly code: unknown
  readonly stdout: string
}

const dir = tempFolder()
after((): void => {
  rmSync(dir, { recursive: true, force: true })
})
const BIN = installWildshard(dir)

async function wildshard(
  args: readonly string[],
  env: Readonly<Record<string, string>> = {},
): Promise<Ran> {
  const child = spawn(process.execPath, [BIN, ...args], {
    env,
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  const stdout = text(child.stdout)
  const closed: readonly unknown[] = await once(child, 'close')
  return { code: closed[0], stdout: await stdout }
}

test('an installed wildshard packs a real product and uploads it', async (context: TestContext): Promise<void> => {
  const server = await openUploadServer(context)
  const tar = path.join(dir, 'real.tar')
  const folder = await writeProduct(dir, 'real')
  const packed = await wildshard(['pack', folder, '--out', tar])
  const key = { WILDSHARD_CREATOR_PRIVATE_KEY: server.privateKey }
  // Explicit provenance (AC16): this bin runs from no shard project, so the
  // package.json and git HEAD defaults would read whatever the cwd holds.
  const uploaded = await wildshard(
    [
      'upload',
      tar,
      '--server',
      server.url,
      '--version',
      '1.0.0',
      '--commit',
      'a'.repeat(40),
    ],
    key,
  )

  assert.equal(packed.code, 0)
  assert.equal(uploaded.code, 0)
  assert.deepEqual(
    [...server.state.revisions.values()],
    [{ revision: 1, version: '1.0.0' }],
  )
})

test('an installed wildshard refuses a product a server would', async (): Promise<void> => {
  const broken = await writeProduct(dir, 'broken')
  const tar = path.join(dir, 'broken.tar')
  writeFileSync(path.join(broken, 'shard.json'), '{"format":"not a shard"}\n')
  const done = await wildshard(['pack', broken, '--out', tar])

  assert.equal(done.code, 3)
  assert.throws((): void => {
    readFileSync(tar)
  })
})

/** The address `serve` prints. A dead server fails here rather than hangs. */
// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- reading a stream changes it
async function address(stdout: Readable): Promise<string> {
  const first = await stdout[Symbol.asyncIterator]().next()
  assert.notEqual(first.done, true, 'wildshard serve died before it served')
  return String(first.value).trim().split(' ').at(-1) ?? ''
}

test('an installed wildshard serves, and leaves no port behind', async (): Promise<void> => {
  const child = spawn(process.execPath, [BIN, 'serve', '--port', '0'], {
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  const url = await address(child.stdout)
  const health = await fetch(`${url}/api/health`)
  const exited = once(child, 'exit')
  child.kill('SIGTERM')
  await exited

  assert.equal(health.status, 200)
  await assert.rejects(fetch(`${url}/api/health`))
})
