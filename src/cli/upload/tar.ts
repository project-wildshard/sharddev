// A strict reader for the shardfile tarball (J3): POSIX ustar, regular
// files and directories only. Anything else (links, devices, pax or GNU
// long-name headers) is refused, as are absolute and `..` paths and
// duplicate entries. Returns the files by `/`-separated path.

const BLOCK = 512
const NAME = { at: 0, length: 100 }
const SIZE = { at: 124, length: 12 }
const CHECKSUM = { at: 148, length: 8 }
const TYPE_AT = 156
const MAGIC = { at: 257, length: 5 }
const PREFIX = { at: 345, length: 155 }
const OCTAL = 8
const SPACE = 0x20
const NUL = 0
const END_BLOCKS = 2
const START = 0
const NOT_FOUND = -1
const REGULAR_TYPES = new Set(['0', '\0'])
const DIRECTORY_TYPE = '5'
const DIRECTORY_CODE = 0x35
const ROOT_ENTRIES = new Set(['.', './'])

interface Field {
  readonly at: number
  readonly length: number
}

const decoder = new TextDecoder('utf-8', { fatal: true })

function text(block: Readonly<Uint8Array>, field: Field): string {
  const raw = block.subarray(field.at, field.at + field.length)
  const end = raw.indexOf(NUL)
  return decoder.decode(end === NOT_FOUND ? raw : raw.subarray(START, end))
}

function octal(block: Readonly<Uint8Array>, field: Field): number {
  const digits = text(block, field).trim()
  if (!/^[0-7]+$/u.test(digits)) {
    throw new Error('tar: bad octal field')
  }
  return Number.parseInt(digits, OCTAL)
}

function isZero(block: Readonly<Uint8Array>): boolean {
  return block.every((byte: number): boolean => byte === NUL)
}

function checksumOk(block: Readonly<Uint8Array>): boolean {
  const expected = octal(block, CHECKSUM)
  const end = CHECKSUM.at + CHECKSUM.length
  const sum = block.reduce(
    (total: number, byte: number, index: number): number =>
      total + (index >= CHECKSUM.at && index < end ? SPACE : byte),
    START,
  )
  return sum === expected
}

function entryPath(block: Readonly<Uint8Array>): string {
  const prefix = text(block, PREFIX)
  const name = text(block, NAME)
  const full = prefix === '' ? name : `${prefix}/${name}`
  // `tar -C product .` opens with the root itself: a directory, ignored.
  if (block[TYPE_AT] === DIRECTORY_CODE && ROOT_ENTRIES.has(full)) {
    return ''
  }
  const trimmed = full.replace(/^\.\//u, '').replace(/\/$/u, '')
  const parts = trimmed.split('/')
  if (
    trimmed === '' ||
    full.startsWith('/') ||
    parts.some((part: string): boolean => part === '..' || part === '')
  ) {
    throw new Error(`tar: bad path ${JSON.stringify(full)}`)
  }
  return trimmed
}

interface Header {
  readonly path: string
  readonly type: string
  readonly size: number
}

function header(block: Readonly<Uint8Array>): Header {
  if (text(block, MAGIC) !== 'ustar' || !checksumOk(block)) {
    throw new Error('tar: not a ustar header')
  }
  const type = String.fromCodePoint(block[TYPE_AT] ?? NUL)
  if (!REGULAR_TYPES.has(type) && type !== DIRECTORY_TYPE) {
    throw new Error(`tar: unsupported entry type ${JSON.stringify(type)}`)
  }
  return { path: entryPath(block), type, size: octal(block, SIZE) }
}

function padded(size: number): number {
  return Math.ceil(size / BLOCK) * BLOCK
}

/** Where the next header starts, after reading the entry at `offset`. */
function readEntry(
  bytes: Readonly<Uint8Array>,
  offset: number,
  files: Map<string, Uint8Array>,
): number {
  const entry = header(bytes.subarray(offset, offset + BLOCK))
  const start = offset + BLOCK
  if (start + entry.size > bytes.length) {
    throw new Error(`tar: truncated entry ${entry.path}`)
  }
  if (REGULAR_TYPES.has(entry.type)) {
    if (files.has(entry.path)) {
      throw new Error(`tar: duplicate entry ${entry.path}`)
    }
    // A view, not a copy: a full shard is hundreds of megabytes.
    files.set(entry.path, bytes.subarray(start, start + entry.size))
  }
  return start + padded(entry.size)
}

function assertEnd(bytes: Readonly<Uint8Array>, offset: number): void {
  const rest = bytes.subarray(offset)
  if (rest.length < END_BLOCKS * BLOCK || !isZero(rest)) {
    throw new Error('tar: bad end-of-archive blocks')
  }
}

/** The tarball's regular files by path; throws on anything not strictly ustar. */
function readTar(bytes: Readonly<Uint8Array>): ReadonlyMap<string, Uint8Array> {
  const files = new Map<string, Uint8Array>()
  let offset = START
  for (;;) {
    const block = bytes.subarray(offset, offset + BLOCK)
    if (block.length < BLOCK) {
      throw new Error('tar: truncated (no end-of-archive blocks)')
    }
    if (isZero(block)) {
      assertEnd(bytes, offset)
      return files
    }
    offset = readEntry(bytes, offset, files)
  }
}

export { readTar }
