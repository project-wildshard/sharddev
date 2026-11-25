import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import type { TestContext } from 'node:test'

import { sourceShard } from './source.ts'

// QA 11-16 mini F38, re-walked in meta QA 11-25 row 20 on sdk 0.4.34:
// `wildshard build public/shardfiles/<slug>` looked for the hero under
// `public/src/shards/<slug>`, so the build that is uploaded never checked
// the hero.

async function repo(context: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'hero-source-'))
  context.after(async (): Promise<void> => {
    await rm(root, { recursive: true, force: true })
  })
  return root
}

test('a single-shard repo: public/shardfiles/<slug> reads src/', async (context: TestContext): Promise<void> => {
  const root = await repo(context)
  await mkdir(path.join(root, 'src'), { recursive: true })
  await writeFile(path.join(root, 'src', 'shard.config.ts'), '')
  const product = path.join(root, 'public', 'shardfiles', 'my-shard')
  assert.equal(await sourceShard(product), path.join(root, 'src'))
})

test('several shards: public/shardfiles/<slug> reads src/shards/<slug>', async (context: TestContext): Promise<void> => {
  const root = await repo(context)
  const shard = path.join(root, 'src', 'shards', 'my-shard')
  await mkdir(shard, { recursive: true })
  const product = path.join(root, 'public', 'shardfiles', 'my-shard')
  assert.equal(await sourceShard(product), shard)
})

test('the older out/<slug> layout still reads src/shards/<slug>', async (context: TestContext): Promise<void> => {
  const root = await repo(context)
  const shard = path.join(root, 'src', 'shards', 'my-shard')
  await mkdir(shard, { recursive: true })
  assert.equal(await sourceShard(path.join(root, 'out', 'my-shard')), shard)
})

test('no source keeps the src/shards/<slug> path the message names', async (context: TestContext): Promise<void> => {
  const root = await repo(context)
  const product = path.join(root, 'public', 'shardfiles', 'gone')
  assert.equal(
    await sourceShard(product),
    path.join(root, 'src', 'shards', 'gone'),
  )
})
