import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import type { TestContext } from 'node:test'

import { uploadShardfile } from '../cli/upload/upload.ts'
import { makeShardfile } from '../test/helpers/shardfile.ts'
import { openUploadServer } from '../test/helpers/upload-server.ts'

import type { UploadOutcome } from '../cli/upload/upload.ts'

// A format break (J173): bytes the server holds and now refuses must not
// read as "already stored" to the author. CI only (J186).

const REASON = 'invalid shardfile: format 0.1 is gone'

test('stored bytes the server now refuses fail the upload', async (context: TestContext): Promise<void> => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sharddev-break-'))
  context.after(async (): Promise<void> => {
    await rm(directory, { recursive: true })
  })
  const file = path.join(directory, 'shard.tar')
  await writeFile(file, await makeShardfile({ slug: 'upload-test' }))
  const server = await openUploadServer(context)
  const upload = async (): Promise<UploadOutcome> =>
    await uploadShardfile({
      file,
      server: server.url,
      apiKey: server.apiKey,
      privateKey: server.privateKey,
      level: 5,
      version: '0.0.1',
      commit: 'c'.repeat(40),
      channel: 'staging',
      sharddev: '0.2.2',
      engine: '0.1.13',
      shardFormat: '0.4.4',
      report: (): void => undefined,
    })
  await upload()

  server.state.refuseStored = REASON

  await assert.rejects(upload, new RegExp(REASON, 'u'))
})
