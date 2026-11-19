import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import type { TestContext } from 'node:test'

import {
  BUILT_WITH,
  COMMIT,
  TARBALL,
  VERSION,
  open,
  uploadWith,
} from '../../../../dev/src/test/helpers/upload-run.ts'
import { validateShardfile } from './validate.ts'

// A curated hero (`"curated": true` in the shard's hero.json: hand-picked
// art, never recaptured) may stay unchanged across versions: upload skips
// UP3's pre-check and the commit says `heroCurated` (meta NET-LAG NL12).

async function heroDigest(): Promise<string> {
  const { heroHash } = await validateShardfile(TARBALL)
  assert.ok(heroHash !== undefined)
  return heroHash
}

/** A single-shard project whose `src/hero.json` says `"curated"` as given (meta NET-LAG NL12). */
async function stampedProject(
  context: TestContext,
  curated: boolean,
): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'curated-hero-'))
  context.after(async (): Promise<void> => {
    await rm(root, { recursive: true, force: true })
  })
  await mkdir(path.join(root, 'src'))
  await writeFile(path.join(root, 'src', 'shard.config.ts'), '')
  const stamp = {
    content: 'c'.repeat(64),
    card: {},
    ...(curated ? { curated: true } : {}),
  }
  await writeFile(path.join(root, 'src', 'hero.json'), JSON.stringify(stamp))
  return root
}

test('a curated hero may stay unchanged: it passes the pre-check and says so in the commit', async (context: TestContext): Promise<void> => {
  const run = await open(context)
  run.server.state.catalogue.push({
    slug: 'upload-test',
    version: '0.0.2',
    heroHash: await heroDigest(),
  })

  const outcome = await uploadWith(run, {
    heroSource: await stampedProject(context, true),
  })

  assert.equal(outcome.revision, 1)
  assert.deepEqual(run.server.state.commits, [
    {
      contentEncoding: 'br',
      version: VERSION,
      commit: COMMIT,
      channel: 'staging',
      ...BUILT_WITH,
      heroCurated: true,
    },
  ])
})

test('a stamp without "curated" still refuses an unchanged hero', async (context: TestContext): Promise<void> => {
  const run = await open(context)
  run.server.state.catalogue.push({
    slug: 'upload-test',
    version: '0.0.2',
    heroHash: await heroDigest(),
  })

  await assert.rejects(
    uploadWith(run, { heroSource: await stampedProject(context, false) }),
    /the hero is unchanged since upload-test 0\.0\.2/u,
  )
  assert.equal(run.server.state.commits.length, 0)
})
