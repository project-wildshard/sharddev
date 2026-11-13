import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import type { TestContext } from 'node:test'

import {
  prepareFolder,
  sha256,
  shardfileFiles,
} from '../../test/helpers/shardfile.ts'
import { openUploadServer } from '../../test/helpers/upload-server.ts'
import { uploadShardfile } from '../upload/upload.ts'
import { writeShardfile } from './shardfile.ts'

import type { ShardfileOutcome } from './shardfile.ts'

// A real product folder on disk, the real validator, and the system's `tar`
// as a reader that owes this repo nothing.

const SLUG = 'upload-test'

interface Workspace {
  readonly root: string
  readonly product: string
  readonly out: string
}

async function workspace(context: TestContext): Promise<Workspace> {
  const root = await mkdtemp(path.join(tmpdir(), 'sharddev-pack-'))
  context.after(async (): Promise<void> => {
    await rm(root, { recursive: true })
  })
  const product = path.join(root, 'product')
  const files = await shardfileFiles({ slug: SLUG })
  await Promise.all(
    [...files].map(
      async ([name, bytes]: readonly [
        string,
        Readonly<Uint8Array> | string,
      ]): Promise<void> => {
        const file = path.join(product, name)
        await mkdir(path.dirname(file), { recursive: true })
        await writeFile(file, bytes)
      },
    ),
  )
  return { root, product, out: path.join(root, 'shard.tar') }
}

async function pack(
  space: Workspace,
  out = space.out,
  report: (line: string) => void = (): void => undefined,
): Promise<ShardfileOutcome> {
  return await writeShardfile({ dir: space.product, out, report })
}

async function uploadTo(
  context: TestContext,
  file: string,
): Promise<
  Readonly<{
    send: () => ReturnType<typeof uploadShardfile>
    requests: () => number
  }>
> {
  const server = await openUploadServer(context)
  const send = async (): ReturnType<typeof uploadShardfile> =>
    await uploadShardfile({
      file,
      server: server.url,
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
  return { send, requests: (): number => server.state.apiRequests.length }
}

test('packs a product the system tar reads back', async (context: TestContext): Promise<void> => {
  const space = await workspace(context)
  const outcome = await pack(space)
  const listed = execFileSync('tar', ['-tf', space.out], {
    encoding: 'utf8',
  })
  const extracted = path.join(space.root, 'extracted')
  await mkdir(extracted)
  execFileSync('tar', ['-xf', space.out, '-C', extracted])

  assert.equal(outcome.slug, SLUG)
  assert.ok(listed.split('\n').includes('shard.json'))
  assert.deepEqual(
    await readFile(path.join(extracted, 'shard.json')),
    await readFile(path.join(space.product, 'shard.json')),
  )
})

test('the same product packs to the same hash', async (context: TestContext): Promise<void> => {
  const space = await workspace(context)
  const first = await pack(space)
  const second = await pack(await workspace(context))

  assert.equal(first.hash, second.hash)
  assert.equal(first.hash, sha256(await readFile(space.out)))
})

test('refuses a link and writes nothing', async (context: TestContext): Promise<void> => {
  const space = await workspace(context)
  await symlink('shard.json', path.join(space.product, 'link.json'))

  await assert.rejects(pack(space), /not a regular file/u)
  assert.deepEqual(await readdir(space.root), ['product'])
})

test('format refuses a file the index does not list', async (context: TestContext): Promise<void> => {
  const space = await workspace(context)
  await writeFile(path.join(space.product, 'stray.bin'), 'x')

  await assert.rejects(pack(space), /Unlisted output file/u)
  assert.deepEqual(await readdir(space.root), ['product'])
})

test('format refuses a section whose bytes changed', async (context: TestContext): Promise<void> => {
  const space = await workspace(context)
  const section = path.join(space.product, 'sections/ui/card.json')
  await writeFile(section, '{"accent":"sand"}')

  await assert.rejects(pack(space))
  assert.deepEqual(await readdir(space.root), ['product'])
})

test('names the shard file <slug>.shardfile beside its folder by default (SA3)', async (context: TestContext): Promise<void> => {
  const space = await workspace(context)
  const lines: string[] = []
  const outcome = await writeShardfile({
    dir: space.product,
    report: (line: string): void => {
      lines.push(line)
    },
  })
  const file = path.join(space.root, `${SLUG}.shardfile`)

  assert.equal(outcome.file, file)
  assert.equal(outcome.hash, sha256(await readFile(file)))
  assert.match(lines.join('\n'), /^valid: upload-test /mu)
  assert.match(lines.join('\n'), /^shard file: .*upload-test\.shardfile, /mu)
})

test('what build writes once prepared, upload sends', async (context: TestContext): Promise<void> => {
  const space = await workspace(context)
  await prepareFolder(space.product)
  const lines: string[] = []
  const packed = await pack(space, space.out, (line: string): void => {
    lines.push(line)
  })
  const upload = await uploadTo(context, packed.file)
  const outcome = await upload.send()

  assert.doesNotMatch(lines.join('\n'), /draft/u)
  assert.equal(outcome.hash, packed.hash)
  assert.equal(outcome.shard, SLUG)
  assert.equal(outcome.alreadyStored, false)
})

// QA 11-13 row 2 (J198, J259): a fresh build is a draft, sdk 0.2, which
// api-server answers 422 at commit. Build warns and still writes it; upload
// refuses it before the first request.
test('build warns on a draft and still writes it; upload refuses it unsent', async (context: TestContext): Promise<void> => {
  const space = await workspace(context)
  const lines: string[] = []
  const packed = await pack(space, space.out, (line: string): void => {
    lines.push(line)
  })
  const upload = await uploadTo(context, packed.file)

  assert.match(
    lines.join('\n'),
    /^warning: upload-test is an unprepared draft \(sdk 0\.2\): api-server refuses a draft at commit, so prepare its folder and build it again before upload\n {2}\[shardfile-draft\] fix: Run `wildshard prepare .*\(GUIDE\.md#shardfile-draft\)$/mu,
  )
  assert.equal(packed.hash, sha256(await readFile(space.out)))
  await assert.rejects(
    upload.send(),
    /upload-test is an unprepared draft \(sdk 0\.2\)/u,
  )
  assert.equal(upload.requests(), 0)
})
