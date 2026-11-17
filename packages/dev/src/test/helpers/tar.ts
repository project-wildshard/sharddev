// A minimal ustar writer for tests: regular files only; a path past 100
// bytes splits at a slash into ustar's 155-byte prefix and its name.

const BLOCK = 512
const OCTAL = 8
const END_BLOCKS = 2
const CHECKSUM_AT = 148
const CHECKSUM_WIDTH = 6
const START = 0

function octal(value: number, width: number): string {
  return `${value.toString(OCTAL).padStart(width - 1, '0')}\0`
}

const NAME = 100

/** Ustar's [prefix, name] for a path: the name is the last part that fits. */
function split(path: string): readonly [string, string] {
  if (path.length <= NAME) {
    return ['', path]
  }
  const at = path.indexOf('/', path.length - NAME - 1)
  return [path.slice(START, at), path.slice(at + 1)]
}

/** [offset, width, value] of each header field before the checksum. */
function fields(
  path: string,
  size: number,
): readonly (readonly [number, number, string])[] {
  const [prefix, name] = split(path)
  return [
    [0, 100, name],
    [100, 8, octal(0o644, 8)],
    [108, 8, octal(0, 8)],
    [116, 8, octal(0, 8)],
    [124, 12, octal(size, 12)],
    [136, 12, octal(0, 12)],
    [148, 8, '        '],
    [156, 1, '0'],
    [257, 6, 'ustar\0'],
    [263, 2, '00'],
    [345, 155, prefix],
  ]
}

function headerBlock(path: string, size: number): Uint8Array {
  const block = new Uint8Array(BLOCK)
  for (const [at, width, value] of fields(path, size)) {
    block.set(new TextEncoder().encode(value).subarray(START, width), at)
  }
  const sum = block.reduce(
    (total: number, byte: number): number => total + byte,
    START,
  )
  const checksum = `${sum.toString(OCTAL).padStart(CHECKSUM_WIDTH, '0')}\0 `
  block.set(new TextEncoder().encode(checksum), CHECKSUM_AT)
  return block
}

function padded(size: number): number {
  return Math.ceil(size / BLOCK) * BLOCK
}

/** A tarball of `files` (path → bytes or UTF-8 text), in insertion order. */
function makeTar(
  files: ReadonlyMap<string, Readonly<Uint8Array> | string>,
): Uint8Array {
  const parts: Uint8Array[] = []
  for (const [path, content] of files) {
    const bytes =
      typeof content === 'string' ? new TextEncoder().encode(content) : content
    const body = new Uint8Array(padded(bytes.length))
    body.set(bytes)
    parts.push(headerBlock(path, bytes.length), body)
  }
  parts.push(new Uint8Array(BLOCK * END_BLOCKS))
  return new Uint8Array(Buffer.concat(parts))
}

export { makeTar }
