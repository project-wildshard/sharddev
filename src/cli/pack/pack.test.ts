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

import { sha256, shardfileFiles } from '../../test/helpers/shardfile.ts'
import { openUploadServer } from '../../test/helpers/upload-server.ts'
import { uploadShardfile } from '../upload/upload.ts'
import { packProduct } from './pack.ts'

import type { PackOutcome } from './pack.ts'

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

async function pack(space: Workspace, out = space.out): Promise<PackOutcome> {
  return await packProduct({
    dir: space.product,
    out,
    report: (): void => undefined,
  })
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

test('names the tarball for its shard by default', async (context: TestContext): Promise<void> => {
  const space = await workspace(context)
  const lines: string[] = []
  const previous = process.cwd()
  process.chdir(space.root)
  context.after((): void => {
    process.chdir(previous)
  })
  const outcome = await packProduct({
    dir: space.product,
    report: (line: string): void => {
      lines.push(line)
    },
  })

  assert.equal(outcome.file, `${SLUG}.tar`)
  assert.match(lines.join('\n'), /^valid: upload-test /mu)
  assert.match(lines.join('\n'), /^packed: upload-test\.tar, /mu)
})

test('what pack writes, upload sends', async (context: TestContext): Promise<void> => {
  const space = await workspace(context)
  const packed = await pack(space)
  const server = await openUploadServer(context)
  const outcome = await uploadShardfile({
    file: packed.file,
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

  assert.equal(outcome.hash, packed.hash)
  assert.equal(outcome.shard, SLUG)
  assert.equal(outcome.alreadyStored, false)
})
