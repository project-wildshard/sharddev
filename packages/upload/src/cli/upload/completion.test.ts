import assert from 'node:assert/strict'
import { test } from 'node:test'

import { completeUpload } from './completion.ts'

import type { CommitAnswer } from './wire.ts'

const LIVE: CommitAnswer = {
  shardVersion: '0.1.0',
  formatVersion: '0.12.0',
  migrations: [],
  shard: 'live-isle',
  uploadNumber: 1,
  hash: 'a'.repeat(64),
  created: false,
  staged: true,
  bytes: 1,
  storedBytes: 1,
  signedBy: 'account:fixture',
  notified: false,
  uploadId: 'known-upload',
  status: 'live',
  placement: { placed: true, cell: [0, 3], channels: ['preview', 'staging'] },
}

test('an already-live no-wait retry retains its grid and links', async (): Promise<void> => {
  const lines: string[] = []
  const result = await completeUpload(
    {
      server: 'https://api.example.test',
      apiKey: 'fixture',
      channel: 'staging',
      wait: false,
      report: (line: string): void => {
        lines.push(line)
      },
    },
    LIVE,
  )
  assert.equal(result.status, 'live')
  assert.match(result.gridReport.join('\n'), /placed at \(0,3\)/u)
  assert.match(
    result.gridReport.join('\n'),
    /staging\.wildshard\.io\/slug\/live-isle/u,
  )
})
