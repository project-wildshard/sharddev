import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parse } from 'valibot'

import { CommitAnswerSchema } from './wire.ts'

const result = {
  shard: 'upload-test',
  hash: 'a'.repeat(64),
  created: false,
  staged: false,
  bytes: 1,
  storedBytes: 1,
  signedBy: 'fixture',
  notified: false,
  formatVersion: '0.1.0.4',
  migrations: [],
}

test('upload answers normalize either wire shape to uploadNumber and shardVersion', (): void => {
  const identity = { uploadNumber: 4, shardVersion: '1.2.3' }
  const modern = parse(CommitAnswerSchema, { ...result, ...identity })
  assert.deepEqual(modern, { ...result, ...identity })
  const legacy = parse(CommitAnswerSchema, {
    ...result,
    revision: 4,
    version: '1.2.3',
  })
  assert.deepEqual(legacy, modern)
})
