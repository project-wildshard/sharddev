import { createHash, randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { STAMP, cardHashes, field, readJson } from './stamp.ts'

import type { HeroState } from './stamp.ts'

// NB10 / PR6 (meta SHARD-COMPAT, audit 11-21): a hero shows the built world, not the source text. The stamp's
// `content` hashes every source file, so an SDK codemod, a pin move or a refactor that builds the same world still
// made the hero stale and refused publishes. The stamp now also records `look`: one hash over the built product's
// section and blob hashes, the hero's own images left out. A hero is current when either the source or the built
// world is the one it was stamped with; the cut re-stamps the other half itself and says to commit it.

const INDENT = 2

type Row = Readonly<{ name?: unknown; hash?: unknown }>

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

function rowsOf(value: unknown): readonly Row[] {
  return Array.isArray(value)
    ? value.map((row: unknown): Row => ({
        name: field(row, 'name'),
        hash: field(row, 'hash'),
      }))
    : []
}

async function productIndex(product: string): Promise<unknown> {
  try {
    const text = await readFile(path.join(product, 'shard.json'), 'utf8')
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

/** The built world a hero shows: its sections and blobs by hash, without the hero's own images. */
async function productLook(
  product: string,
  heroHashes: ReadonlySet<string>,
): Promise<string | undefined> {
  const index = await productIndex(product)
  const sections = field(index, 'sections')
  if (!Array.isArray(sections)) {
    return undefined
  }
  const rows = [
    ...rowsOf(sections).map(
      (row: Row): string => `s\0${String(row.name)}\0${String(row.hash)}`,
    ),
    ...rowsOf(field(index, 'files'))
      .map((row: Row): string => String(row.hash))
      .filter((hash: string): boolean => !heroHashes.has(hash))
      .map((hash: string): string => `f\0${hash}`),
  ]
  return sha256(rows.toSorted().join('\n'))
}

/** Merge `content` and `look` into the stamp, keeping everything else it says. */
async function writeLook(
  shard: string,
  values: Readonly<{ content: string; look: string }>,
): Promise<void> {
  const previous = await readJson(path.join(shard, STAMP))
  const stamp = {
    ...(typeof previous === 'object' && previous !== null ? previous : {}),
    content: values.content,
    look: values.look,
  }
  const partial = path.join(shard, `${STAMP}.${randomUUID()}.partial`)
  try {
    await writeFile(partial, `${JSON.stringify(stamp, undefined, INDENT)}\n`)
    await rename(partial, path.join(shard, STAMP))
  } finally {
    await rm(partial, { force: true })
  }
}

/** The look of this product, when the hero has stamped art to compare it with. */
async function currentLook(
  product: string,
  shard: string,
  hero: HeroState,
): Promise<string | undefined> {
  const comparable =
    hero.sameArt === true && (hero.state === 'fresh' || hero.state === 'stale')
  if (!comparable) {
    return undefined
  }
  const art = await cardHashes(shard)
  return await productLook(product, new Set(Object.values(art)))
}

/** What the cut does with the built world: nothing, record it, or call a source-stale hero current. */
async function heroLook(
  product: string,
  shard: string,
  hero: HeroState,
): Promise<'none' | 'recorded' | 'kept'> {
  const look = await currentLook(product, shard, hero)
  if (look === undefined) {
    return 'none'
  }
  const stamped = field(await readJson(path.join(shard, STAMP)), 'look')
  const fresh = hero.state === 'fresh'
  if (fresh === (stamped === look)) {
    return 'none'
  }
  await writeLook(shard, { content: hero.content, look })
  return fresh ? 'recorded' : 'kept'
}

export { heroLook, productLook, writeLook }
