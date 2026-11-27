import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import type { TestContext } from 'node:test'

import { installFormatHook } from '@wildshard/format/formatHook'

import {
  sha256,
  shardfileFiles,
} from '../../../../dev/src/test/helpers/shardfile.ts'
import { writeShardfile } from './shardfile.ts'

import type { readCookData as readCook } from '@wildshard/format/cookData'

const SLUG = 'standalone-fixture'
const VERSION = '1.2.3'
const MISSING = '/assets/tex/leafy_grass/'
const DISCOVERY = `mounts/shardfiles/${SLUG}/discovery.json`
type Mount = ReturnType<typeof readCook>['mounts'][number]

function jsonRecord(
  bytes: Readonly<Uint8Array> | string | undefined,
): Readonly<Record<string, unknown>> {
  const parsed: unknown = JSON.parse(Buffer.from(bytes ?? '').toString('utf8'))
  assert.ok(
    typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed),
  )
  return { ...parsed }
}

async function filesWithMissingArt(): Promise<
  ReadonlyMap<string, Uint8Array | string>
> {
  const { readCookData } = await import('@wildshard/format/cookData')
  const { validationSourceBytes } =
    await import('@wildshard/format/validationReceipt')
  const files = await shardfileFiles({ slug: SLUG, shardVersion: VERSION })
  const asset = validationSourceBytes({
    ...jsonRecord(files.get(DISCOVERY)),
    missingArt: MISSING,
  })
  const source = readCookData(jsonRecord(files.get('cook.json')))
  const mounts = source.mounts.map((row: Readonly<Mount>): Mount =>
    row.path === DISCOVERY
      ? { ...row, bytes: asset.length, hash: sha256(asset) }
      : row,
  )
  const cook = validationSourceBytes({ ...source, mounts })
  const index = validationSourceBytes({
    ...jsonRecord(files.get('shard.json')),
    cook: { path: 'cook.json', bytes: cook.length, hash: sha256(cook) },
  })
  return new Map([
    ...files,
    [DISCOVERY, asset],
    ['cook.json', cook],
    ['shard.json', index],
  ])
}

async function writeFiles(
  root: string,
  files: ReadonlyMap<string, Uint8Array | string>,
): Promise<void> {
  await Promise.all(
    [...files].map(
      async ([name, bytes]: readonly [
        string,
        string | Readonly<Uint8Array>,
      ]): Promise<void> => {
        const file = path.join(root, name)
        await mkdir(path.dirname(file), { recursive: true })
        await writeFile(file, bytes)
      },
    ),
  )
}

test('SDK pack refuses a shardfile that names ground art it does not carry', async (context: TestContext): Promise<void> => {
  installFormatHook()
  const root = await mkdtemp(path.join(tmpdir(), 'sharddev-art-'))
  context.after(async (): Promise<void> => {
    await rm(root, { recursive: true })
  })
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ version: VERSION }),
  )
  const dir = path.join(root, 'product')
  await writeFiles(dir, await filesWithMissingArt())
  await assert.rejects(
    writeShardfile({ dir, report: (): void => undefined }),
    /Missing shardfile asset \/assets\/tex\/leafy_grass\//u,
  )
})
