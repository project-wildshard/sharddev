import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TestContext } from 'node:test'

import {
  heroImages,
  heroPng,
  mountedUrl,
  withHero,
} from '../../../../dev/src/test/helpers/hero.ts'
import { makeShardfile } from '../../../../dev/src/test/helpers/shardfile.ts'
import { open, upload } from '../../../../dev/src/test/helpers/upload-run.ts'
import { refusalNote } from '../../sharddev/refusals.ts'
import { heroVerdict } from './hero-gate.ts'

import type { HeroVerdict } from './hero-gate.ts'

// Meta HERO-GATE HG2 (Jake, 2026-11-17 ~14:32 Cancún: "in zone select there
// are zones without hero images that's bad, that should be failing at
// either the sharddev cli or the api-server level or both"). `wildshard
// upload` refuses, before a byte is sent, a shard file whose hero is
// missing, the generated placeholder, not carried, not an image or the
// wrong size: the same rules api-server's commit runs (its
// `shardfile/hero-gate.ts`), with the fix `wildshard hero`.

const SLUG = 'upload-test'
const IDENTITY = { identity: { slug: SLUG } }
const GOOD = heroImages()

function refusal(
  verdict: HeroVerdict,
): Readonly<{ rule: string; reason: string }> {
  assert.ok(!verdict.ok, 'refused')
  return verdict
}

test('a scene card of three mounted images at the hero sizes passes', (): void => {
  const verdict = heroVerdict(
    IDENTITY,
    withHero(new Map(), { folder: SLUG, images: GOOD }),
  )
  assert.ok(verdict.ok, verdict.ok ? '' : verdict.reason)
})

test('no card anywhere refuses: hero-missing, naming wildshard hero', (): void => {
  const { rule, reason } = refusal(heroVerdict(IDENTITY, new Map()))
  assert.equal(rule, 'hero-missing')
  assert.match(reason, /wildshard hero <shard> --base <url>/u)
})

test('the generated placeholder refuses: hero-generated', (): void => {
  const card = { thumb: 'data:x', portrait: 'data:x', landscape: 'data:x' }
  const shard = { ...IDENTITY, manifest: { card } }
  const verdict = heroVerdict(shard, new Map())
  assert.equal(refusal(verdict).rule, 'hero-generated')
})

test('an image the shard file lacks refuses: hero-image', (): void => {
  const files = withHero(new Map(), { folder: SLUG, images: GOOD })
  files.delete(`mounts${mountedUrl(SLUG, GOOD.thumb)}`)
  assert.equal(refusal(heroVerdict(IDENTITY, files)).rule, 'hero-image')
})

test('an image of the wrong size refuses: hero-size', (): void => {
  const small = { ...GOOD, thumb: heroPng(320, 180) }
  const files = withHero(new Map(), { folder: SLUG, images: small })
  const { rule, reason } = refusal(heroVerdict(IDENTITY, files))
  assert.equal(rule, 'hero-size')
  assert.match(reason, /thumb is 320x180, not 640x360/u)
})

test('upload refuses a hero of the wrong size before a byte is sent', async (context: TestContext): Promise<void> => {
  const tarball = await makeShardfile({
    slug: SLUG,
    hero: { portrait: heroPng(402, 813) },
  })
  const run = await open(context, tarball)
  await assert.rejects(
    upload(run),
    /\[hero-size\] upload-test's hero portrait is 402x813, not 804x1626/u,
  )
  assert.deepEqual(run.server.state.puts, [])
  assert.match(refusalNote('upload', '[hero-size] x').fix, /804x1626/u)
})

test('upload refuses the generated placeholder card', async (context: TestContext): Promise<void> => {
  const run = await open(
    context,
    await makeShardfile({ slug: SLUG, hero: 'generated' }),
  )
  await assert.rejects(upload(run), /\[hero-generated\]/u)
  assert.deepEqual(run.server.state.puts, [])
  assert.match(
    refusalNote('upload', '[hero-generated] x').fix,
    /wildshard hero/u,
  )
})
