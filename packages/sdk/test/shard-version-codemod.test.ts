// oxlint-disable-next-line import/no-nodejs-modules -- Exercise a real checkout in the test's own scratch.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
// oxlint-disable-next-line import/no-nodejs-modules -- Keep the shard source and package in their real layout.
import { dirname, join } from 'node:path'

import { expect, test } from 'vitest'

import migrate, { pending } from '../codemods/0.9.0.mjs'
import {
  closeFixtures,
  fixtureRoot,
} from '../src/sharddev/test/ownedScratch.ts'

test('an unstamped project gets its authored shard version and an existing mismatch stays explicit', () => {
  const project = fixtureRoot('shard-version-')
  const write = (path: string, value: object): void => {
    const file = join(project, path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(value))
  }
  try {
    write('package.json', { version: '1.2.0' })
    write('src/shards/first/shard.json', { identity: { slug: 'first' } })
    write('src/shards/second/package.json', { version: '2.1.0' })
    write('src/shards/second/shard.json', {
      identity: { slug: 'second' },
      shardVersion: '2.0.0',
    })
    expect(pending({ project })).toContain('first/shard.json')
    expect(migrate({ project })).toEqual({
      lines: ['src/shards/first/shard.json: declared shardVersion 1.2.0'],
      manual: [
        expect.stringContaining(
          'src/shards/second/shard.json: shardVersion differs',
        ),
      ],
    })
    expect(
      JSON.parse(
        readFileSync(join(project, 'src/shards/first/shard.json'), 'utf8'),
      ),
    ).toEqual({
      identity: { slug: 'first' },
      shardVersion: '1.2.0',
    })
    expect(migrate({ project }).lines).toEqual([])
    write('src/shards/second/shard.json', { shardVersion: '2.1.0' })
    expect(pending({ project })).toBeUndefined()
  } finally {
    rmSync(project, { recursive: true, force: true })
    closeFixtures()
  }
})
