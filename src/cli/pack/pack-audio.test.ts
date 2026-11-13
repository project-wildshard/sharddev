import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import type { TestContext } from 'node:test'

import { installFormatHook } from '@wildshard/format/formatHook'

import { sha256, shardfileFiles } from '../../test/helpers/shardfile.ts'
import { openUploadServer } from '../../test/helpers/upload-server.ts'
import { uploadShardfile } from '../upload/upload.ts'
import { packProduct } from './pack.ts'

// AUDIO AU5 (J299, J303): pack prints format's audio rules as AMBER with
// the numbers and still packs, even a red; upload refuses the red before it
// sends a byte, as api-server's admission will.

type Files = Map<string, Uint8Array | string>

interface Mount {
  readonly url: string
  readonly path: string
  readonly hash: string
  readonly bytes: number
}

const SLUG = 'loud-test'
const MB = 1_000_000
const RATE = 48_000
const FRAME = 4
const LOUD = [
  { url: '/assets/music/loud/a.wav', bytes: 6 * MB },
  { url: '/assets/sfx/loud/b.wav', bytes: 5 * MB },
]

const TAGS = [
  ['RIFF', 0],
  ['WAVEfmt ', 8],
  ['data', 36],
] as const
const HALVES = [
  [20, 1],
  [22, 2],
  [32, FRAME],
  [34, 16],
] as const

/** The header's 32-bit fields of a WAV of `bytes` bytes, as [offset, value]. */
function words(bytes: number): readonly (readonly [number, number])[] {
  return [
    [4, bytes - 8],
    [16, 16],
    [24, RATE],
    [28, RATE * FRAME],
    [40, bytes - 44],
  ]
}

/** A stereo 16-bit 48 kHz PCM WAV of `bytes` bytes (31 s for 6 MB). */
function wav(bytes: number): Uint8Array {
  const file = Buffer.alloc(bytes)
  for (const [text, at] of TAGS) {
    file.write(text, at, 'latin1')
  }
  for (const [at, value] of words(bytes)) {
    file.writeUInt32LE(value, at)
  }
  for (const [at, value] of HALVES) {
    file.writeUInt16LE(value, at)
  }
  return new Uint8Array(file)
}

function jsonObject(files: Readonly<Files>, name: string): object {
  const value: unknown = JSON.parse(
    Buffer.from(files.get(name) ?? '').toString('utf8'),
  )
  assert.ok(typeof value === 'object' && value !== null)
  return value
}

/** One WAV mounted at `row.url`. */
function mountWav(
  files: Files,
  row: Readonly<{ url: string; bytes: number }>,
): Mount {
  const bytes = wav(row.bytes)
  files.set(`mounts${row.url}`, bytes)
  return {
    url: row.url,
    path: `mounts${row.url}`,
    hash: sha256(bytes),
    bytes: row.bytes,
  }
}

/** Template 2's files with 11 MB of its own audio mounted: red by J303. */
async function loudFiles(): Promise<Files> {
  installFormatHook()
  const { validationSourceBytes } =
    await import('@wildshard/format/validationReceipt')
  const { readCookData } = await import('@wildshard/format/cookData')
  const files: Files = new Map(await shardfileFiles({ slug: SLUG }))
  const mounts = LOUD.map(
    (row: Readonly<{ url: string; bytes: number }>): Mount =>
      mountWav(files, row),
  )
  const held = readCookData(jsonObject(files, 'cook.json'))
  const cook = validationSourceBytes({
    ...held,
    mounts: [...held.mounts, ...mounts],
  })
  const row = { path: 'cook.json', hash: sha256(cook), bytes: cook.length }
  const index = { ...jsonObject(files, 'shard.json'), cook: row }
  return new Map([
    ...files,
    ['cook.json', cook],
    ['shard.json', validationSourceBytes(index)],
  ])
}

/** The loud product on disk; returns its folder. */
async function loudProduct(context: TestContext): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'sharddev-pack-audio-'))
  context.after(async (): Promise<void> => {
    await rm(root, { recursive: true })
  })
  const product = path.join(root, 'product')
  const files = await loudFiles()
  await Promise.all(
    [...files].map(
      // oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the file's bytes, only written out
      async ([name, bytes]: readonly [
        string,
        Uint8Array | string,
      ]): Promise<void> => {
        const file = path.join(product, name)
        await mkdir(path.dirname(file), { recursive: true })
        await writeFile(file, bytes)
      },
    ),
  )
  return product
}

test('pack prints a red shard as AMBER with the numbers and still packs', async (context: TestContext): Promise<void> => {
  const product = await loudProduct(context)
  const lines: string[] = []
  const out = path.join(path.dirname(product), 'loud.tar')
  const outcome = await packProduct({
    dir: product,
    out,
    report: (line: string): void => {
      lines.push(line)
    },
  })
  const text = lines.join('\n')
  assert.match(
    text,
    /^audio AMBER: loud-test 2 recordings, 11\.00 MB \(AMBER over 6\.00 MB, red over 10\.00 MB\)$/mu,
  )
  assert.match(
    text,
    /^AMBER audio budget: loud-test holds 11\.00 MB of its own audio, over the 10\.00 MB red line \(red: api-server refuses this at upload\)$/mu,
  )
  assert.match(text, /^packed: /mu)
  assert.equal(outcome.hash, sha256(await readFile(out)))
})

test('upload refuses the red shard before it sends a byte', async (context: TestContext): Promise<void> => {
  const product = await loudProduct(context)
  const out = path.join(path.dirname(product), 'loud.tar')
  await packProduct({ dir: product, out, report: (): void => undefined })
  const server = await openUploadServer(context)
  await assert.rejects(
    uploadShardfile({
      file: out,
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
    }),
    /Audio rules \(AU5\) refuse loud-test: loud-test holds 11\.00 MB of its own audio, over the 10\.00 MB red line$/u,
  )
})
