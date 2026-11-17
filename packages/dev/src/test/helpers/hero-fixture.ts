import { createHash } from 'node:crypto'

import { heroImages, withHero } from './hero.ts'

import type { HeroImages } from './hero.ts'

// Meta HERO-GATE HG2: Template 2 carries one 600x1400 card image for all
// three slots, which upload now refuses (`hero-size`). The test shard file
// gets a real hero instead: three images at the hero sizes, mounted beside
// its discovery document and named by its discovery card (the card upload
// and api-server check first), with the cook rows to match.

/** What a test asks of the hero: by default three images at the hero sizes, shaded by seed. */
type HeroOption = 'generated' | Readonly<Partial<HeroImages>>

type Files = Map<string, Uint8Array | string>
type MountRow = Readonly<
  Record<'url' | 'path' | 'hash', string> & { bytes: number }
>
type Row = Readonly<{ path: string; hash: string; bytes: number }>

const COOK = 'cook.json'
const MOUNTS = 'mounts'
const SHADES = 200
/** Template 2's product folder, where its discovery mount sits. */
const FOLDER = 'blender-template'

function sha256(bytes: Readonly<Uint8Array>): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function jsonOf(files: Files, file: string): unknown {
  const value: unknown = JSON.parse(
    Buffer.from(files.get(file) ?? '').toString('utf8'),
  )
  return value
}

function imagesOf(
  hero: HeroOption | undefined,
  seed: number,
): HeroImages | 'generated' {
  if (hero === 'generated') {
    return 'generated'
  }
  return { ...heroImages((seed % SHADES) + 1), ...hero }
}

/** `mounts` with each file of `mounted` put in `files` and given its cook row. */
function mountRows(
  files: Files,
  mounts: readonly MountRow[],
  mounted: ReadonlyMap<string, Readonly<Uint8Array>>,
): readonly MountRow[] {
  const rows = new Map(
    mounts.map((row: MountRow): readonly [string, MountRow] => [row.path, row]),
  )
  for (const [file, bytes] of mounted) {
    files.set(file, new Uint8Array(bytes))
    const url = file.slice(MOUNTS.length)
    rows.set(file, {
      url,
      path: file,
      hash: sha256(bytes),
      bytes: bytes.length,
    })
  }
  return [...rows.values()].toSorted(
    (left: MountRow, right: MountRow): number =>
      left.url.localeCompare(right.url),
  )
}

/** HG2: Template 2's discovery card swapped for the hero a test asks for; the new cook row. */
async function heroFixture(
  files: Files,
  hero: HeroOption | undefined,
  seed: number,
): Promise<Row> {
  const { readCookData } = await import('@wildshard/format/cookData')
  const { validationSourceBytes } =
    await import('@wildshard/format/validationReceipt')
  const images = imagesOf(hero, seed)
  const discovery = jsonOf(
    files,
    `${MOUNTS}/shardfiles/${FOLDER}/discovery.json`,
  )
  const mounted = withHero(new Map(), { folder: FOLDER, images, discovery })
  const cook = readCookData(jsonOf(files, COOK))
  const bytes = validationSourceBytes({
    ...cook,
    mounts: mountRows(files, cook.mounts, mounted),
  })
  files.set(COOK, bytes)
  return { path: COOK, hash: sha256(bytes), bytes: bytes.length }
}

export { type HeroOption, heroFixture }
