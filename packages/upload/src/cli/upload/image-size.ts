// oxlint-disable eslint/no-magic-numbers, eslint/no-bitwise, unicorn/number-literal-case -- a byte-format reader: its offsets and masks are the PNG, JPEG and WebP specs' own

// An image's pixel size from its first bytes (meta HERO-GATE HG3): PNG's
// IHDR, JPEG's first SOF segment, WebP's VP8X, VP8 or VP8L header. Anything
// else is not an image a hero may be.

interface Size {
  readonly width: number
  readonly height: number
}

const at8 = (bytes: Readonly<Uint8Array>, at: number): number => bytes[at] ?? 0
const be16 = (bytes: Readonly<Uint8Array>, at: number): number =>
  (at8(bytes, at) << 8) | at8(bytes, at + 1)
const le16 = (bytes: Readonly<Uint8Array>, at: number): number =>
  at8(bytes, at) | (at8(bytes, at + 1) << 8)
const le24 = (bytes: Readonly<Uint8Array>, at: number): number =>
  le16(bytes, at) | (at8(bytes, at + 2) << 16)
const be32 = (bytes: Readonly<Uint8Array>, at: number): number =>
  be16(bytes, at) * 0x1_00_00 + be16(bytes, at + 2)
const ascii = (
  bytes: Readonly<Uint8Array>,
  at: number,
  length: number,
): string => String.fromCodePoint(...bytes.subarray(at, at + length))

function pngSize(bytes: Readonly<Uint8Array>): Size | undefined {
  return ascii(bytes, 1, 3) === 'PNG' && ascii(bytes, 12, 4) === 'IHDR'
    ? { width: be32(bytes, 16), height: be32(bytes, 20) }
    : undefined
}

/** SOF0 to SOF15, less DHT (C4), JPG (C8) and DAC (CC). */
function isFrame(marker: number): boolean {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    marker !== 0xc4 &&
    marker !== 0xc8 &&
    marker !== 0xcc
  )
}

function jpegSize(bytes: Readonly<Uint8Array>): Size | undefined {
  let at = 2
  while (at + 9 <= bytes.length && at8(bytes, at) === 0xff) {
    if (isFrame(at8(bytes, at + 1))) {
      return { width: be16(bytes, at + 7), height: be16(bytes, at + 5) }
    }
    at += 2 + be16(bytes, at + 2)
  }
  return undefined
}

function webpSize(bytes: Readonly<Uint8Array>): Size | undefined {
  const kind = ascii(bytes, 12, 4)
  if (kind === 'VP8X') {
    return { width: le24(bytes, 24) + 1, height: le24(bytes, 27) + 1 }
  }
  if (kind === 'VP8 ') {
    return {
      width: le16(bytes, 26) & 0x3f_ff,
      height: le16(bytes, 28) & 0x3f_ff,
    }
  }
  if (kind === 'VP8L') {
    const bits = le16(bytes, 21) + le16(bytes, 23) * 0x1_00_00
    return {
      width: (bits & 0x3f_ff) + 1,
      height: ((bits >>> 14) & 0x3f_ff) + 1,
    }
  }
  return undefined
}

/** An image's size, or undefined when the bytes are not a PNG, JPEG or WebP (or too few to tell). */
function imageSize(bytes: Readonly<Uint8Array>): Size | undefined {
  if (at8(bytes, 0) === 0x89) {
    return pngSize(bytes)
  }
  if (at8(bytes, 0) === 0xff && at8(bytes, 1) === 0xd8) {
    return jpegSize(bytes)
  }
  return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP'
    ? webpSize(bytes)
    : undefined
}

export { type Size, imageSize }
