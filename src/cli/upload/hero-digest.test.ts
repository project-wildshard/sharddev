import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import type { TestContext } from 'node:test'
import { fileURLToPath } from 'node:url'

import { installFormatHook } from '@wildshard/format/formatHook'

import { folderFiles, preparedFiles } from '../../test/helpers/shardfile.ts'
import { open, upload } from '../../test/helpers/upload-run.ts'
import { heroHashOf } from './hero.ts'
import { validateShardfile } from './validate.ts'

// The hero digest sharddev computes is api-server's (meta SHARD-AUTHORING
// UP4, J306, api-server `79f5ca1` `src/server/shardfile/hero.ts`): the
// manifest card first, else the presentation card. The expected digests
// are the ones api-server's own stream check gives for the same corpus
// files (its `stream-check-hero.test.ts`), run against format v0.4.4's
// corpus. Brasscap Mesa is shaped like `_template`: a generated `data:`
// card in its manifest and no presentation card, the shape UP3's first
// pre-check never refused.

const CORPUS = fileURLToPath(
  new URL('../../../node_modules/@wildshard/format/corpus/', import.meta.url),
)
const API_DIGEST = {
  handwritten:
    'e3774b1d1ea3c3c44d14d6aa286d561c1c0be384f085fdbe096ca5ab858134c2',
  brasscapMesa:
    '3cd056a0891cf951011171dd2d1e5d1ae4037ae08264aaefc3362924aa55d168',
  presentationOnly:
    'bd9c8e0df149c367a9421e2dbf9f8c1856118c490b6261501572b2ab2e109d1d',
}

/**
 * A product folder as one tarball, as `wildshard build` writes it (no
 * `blobs/pack/`); `prepared` as `wildshard prepare` leaves it, for upload.
 */
async function tarOf(root: string, prepared = false): Promise<Uint8Array> {
  installFormatHook()
  const { writeTar } = await import('@wildshard/format/tar')
  const files = await folderFiles(root)
  for (const name of files.keys()) {
    if (name.startsWith('blobs/pack/')) {
      files.delete(name)
    }
  }
  return writeTar(prepared ? await preparedFiles(files) : files)
}

/** A `_template`-shaped shard: its tarball, slug and the API's digest. */
async function templateShaped(): Promise<
  Readonly<{ tarball: Uint8Array; slug: string; heroHash: string }>
> {
  const tarball = await tarOf(path.join(CORPUS, 'brasscap-mesa'), true)
  const { slug } = await validateShardfile(tarball)
  return { tarball, slug, heroHash: API_DIGEST.brasscapMesa }
}

test("a packed manifest card's digest is the API's", async (): Promise<void> => {
  const shard = await validateShardfile(
    await tarOf(path.join(CORPUS, 'handwritten')),
  )

  assert.equal(shard.heroHash, API_DIGEST.handwritten)
})

test("a generated data: card's digest is the API's", async (): Promise<void> => {
  const shard = await validateShardfile(
    await tarOf(path.join(CORPUS, 'brasscap-mesa')),
  )

  assert.equal(shard.card, undefined, 'no presentation card, as _template')
  assert.equal(shard.heroHash, API_DIGEST.brasscapMesa)
})

test("a presentation-only card's digest is the API's", (): void => {
  const card = {
    thumb: 'a'.repeat(64),
    portrait: 'b'.repeat(64),
    landscape: 'c'.repeat(64),
  }

  assert.equal(
    heroHashOf({ presentation: { card } }),
    API_DIGEST.presentationOnly,
  )
  assert.equal(heroHashOf({}), undefined)
})

test('the manifest card wins over the presentation card', (): void => {
  const card = {
    thumb: 'a'.repeat(64),
    portrait: 'b'.repeat(64),
    landscape: 'c'.repeat(64),
  }
  const other = { ...card, thumb: 'd'.repeat(64) }

  assert.equal(
    heroHashOf({ manifest: { card }, presentation: { card: other } }),
    API_DIGEST.presentationOnly,
  )
})

test('an unchanged data: hero refuses before the PUT', async (context: TestContext): Promise<void> => {
  const { tarball, slug, heroHash } = await templateShaped()
  const run = await open(context, tarball)
  run.server.state.catalogue.push({ slug, version: '0.0.2', heroHash })

  await assert.rejects(upload(run), /unchanged since .*: run wildshard hero/u)
  assert.equal(run.server.state.puts.length, 0)
  assert.equal(run.server.state.commits.length, 0)
})

test('a first data: hero version and its retry pass', async (context: TestContext): Promise<void> => {
  const { tarball, slug, heroHash } = await templateShaped()
  const run = await open(context, tarball)

  const first = await upload(run)
  run.server.state.catalogue.push({ slug, version: first.version, heroHash })
  const retry = await upload(run)

  assert.equal(first.alreadyStored, false)
  assert.equal(retry.alreadyStored, true)
})
