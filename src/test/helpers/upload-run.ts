// oxlint-disable typescript/prefer-readonly-parameter-types -- a run collects what the double saw
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { TestContext } from 'node:test'

import { uploadShardfile } from '../../cli/upload/upload.ts'
import { makeShardfile } from './shardfile.ts'
import { openUploadServer } from './upload-server.ts'

import type { UploadOutcome } from '../../cli/upload/upload.ts'
import type { UploadServer } from './upload-server.ts'

// One upload run against the HTTP double: the fixture product re-stamped
// as `upload-test`, a scratch folder for its tarball, and the lines the
// client reported. Shared by upload.test.ts and upload-cli.test.ts.

const TARBALL = await makeShardfile({ slug: 'upload-test' })
const VERSION = '0.0.3'
const COMMIT = 'c'.repeat(40)
// J306: fixed test inputs for the versions it was built with.
const BUILT_WITH = { sharddev: '0.2.2', engine: '0.1.13', shardFormat: '0.4.4' }

interface Run {
  readonly server: UploadServer
  readonly file: string
  readonly lines: string[]
}

async function open(
  context: TestContext,
  tarball: Readonly<Uint8Array> = TARBALL,
): Promise<Run> {
  const directory = await mkdtemp(path.join(tmpdir(), 'sharddev-upload-'))
  context.after(async (): Promise<void> => {
    await rm(directory, { recursive: true })
  })
  const file = path.join(directory, 'shard.tar')
  await writeFile(file, tarball)
  return { server: await openUploadServer(context), file, lines: [] }
}

async function upload(
  run: Run,
  bypassSecret?: string,
  version: string = VERSION,
): Promise<UploadOutcome> {
  return await uploadShardfile({
    file: run.file,
    server: run.server.url,
    apiKey: run.server.apiKey,
    privateKey: run.server.privateKey,
    level: 5,
    version,
    commit: COMMIT,
    channel: 'staging',
    ...BUILT_WITH,
    report: (line: string): void => {
      run.lines.push(line)
    },
    ...(bypassSecret === undefined ? {} : { bypassSecret }),
  })
}

function onlyPut(run: Run): UploadServer['state']['puts'][number] {
  const [put, ...rest] = run.server.state.puts
  assert.ok(put)
  assert.equal(rest.length, 0)
  return put
}

export { type Run, BUILT_WITH, COMMIT, TARBALL, VERSION, onlyPut, open, upload }
