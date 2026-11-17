import { createHash } from 'node:crypto'
import { crc32, deflateSync } from 'node:zlib'

// Hero images for tests (meta HERO-GATE HG2): real, decodable PNGs of one
// grey at the sizes a hero takes (thumb 640x360, portrait 804x1626,
// landscape 1600x900) or any other, and a scene shard's card made of them:
// three image mounts and a discovery mount whose `data.card` names them, as
// `withDiscovery` (packages/sdk/src/sharddev/project.ts) writes it.

type Slot = 'thumb' | 'portrait' | 'landscape'
type HeroImages = Readonly<Record<Slot, Readonly<Uint8Array>>>

const SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])
const GREY = 8
const RGB = 2
const CHANNELS = 3
const SLOTS: readonly Slot[] = ['thumb', 'portrait', 'landscape']
const DEFAULT_SHADE = 128

function sha256(bytes: Readonly<Uint8Array>): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function chunk(type: string, data: Readonly<Uint8Array>): Uint8Array {
  const out = Buffer.alloc(data.length + 12)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'latin1')
  out.set(data, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return new Uint8Array(out)
}

/** The IHDR chunk of an 8-bit RGB image. */
function ihdr(width: number, height: number): Uint8Array {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([GREY, RGB, 0, 0, 0], 8)
  return chunk('IHDR', header)
}

/** A valid `width` x `height` RGB PNG of one shade. */
function heroPng(
  width: number,
  height: number,
  shade = DEFAULT_SHADE,
): Uint8Array {
  const row = width * CHANNELS + 1
  const raw = Buffer.alloc(row * height, shade)
  for (let line = 0; line < height; line += 1) {
    raw[line * row] = 0
  }
  const pixels = chunk('IDAT', deflateSync(raw))
  const end = chunk('IEND', new Uint8Array(0))
  return new Uint8Array(
    Buffer.concat([SIGNATURE, ihdr(width, height), pixels, end]),
  )
}

/** The three hero images at their sizes. */
function heroImages(shade = DEFAULT_SHADE): HeroImages {
  return {
    thumb: heroPng(640, 360, shade),
    portrait: heroPng(804, 1626, shade),
    landscape: heroPng(1600, 900, shade),
  }
}

/** A mounted hero image's URL in `folder`. */
function mountedUrl(folder: string, bytes: Readonly<Uint8Array>): string {
  return `/shardfiles/${folder}/blobs/image/${sha256(bytes)}.png`
}

/** The card naming the three mounted images, or the generated placeholder. */
function heroCardOf(
  folder: string,
  images: HeroImages | 'generated',
): Readonly<Record<Slot, string>> {
  const url = (slot: Slot): string =>
    images === 'generated'
      ? 'data:image/svg+xml,%3Csvg%2F%3E'
      : mountedUrl(folder, images[slot])
  return {
    thumb: url('thumb'),
    portrait: url('portrait'),
    landscape: url('landscape'),
  }
}

/** What a hero mount names: its folder, its images and the discovery document it cards (default: a bare one). */
interface HeroMount {
  readonly folder: string
  readonly images: HeroImages | 'generated'
  readonly discovery?: unknown
}

/** An object's own fields, or none. */
function fieldsOf(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
    ? Object.fromEntries(Object.entries(value))
    : {}
}

/** `files` with a scene shard's hero mounted in `folder`: the images, then a discovery document carding them. */
function withHero(
  files: Map<string, Readonly<Uint8Array>>,
  { folder, images, discovery }: Readonly<HeroMount>,
): Map<string, Readonly<Uint8Array>> {
  if (images !== 'generated') {
    for (const slot of SLOTS) {
      files.set(`mounts${mountedUrl(folder, images[slot])}`, images[slot])
    }
  }
  const document = fieldsOf(discovery ?? { version: 1, slug: folder })
  const data = {
    ...fieldsOf(document['data']),
    card: heroCardOf(folder, images),
  }
  const text = JSON.stringify({ ...document, data })
  files.set(
    `mounts/shardfiles/${folder}/discovery.json`,
    new TextEncoder().encode(text),
  )
  return files
}

export {
  type HeroImages,
  heroCardOf,
  heroImages,
  heroPng,
  mountedUrl,
  sha256 as heroHash,
  withHero,
}
