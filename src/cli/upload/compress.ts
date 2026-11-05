import { promisify } from 'node:util'
import { brotliCompress, constants } from 'node:zlib'

// J96: the author's machine compresses. The whole tarball is one Brotli
// stream, because that is what `Content-Encoding: br` means to R2 and to a
// browser, so a tar member cannot opt out. It does not need to: the encoder
// stores incompressible runs raw, so KTX2 costs almost nothing.

const compress = promisify(brotliCompress)

// Measured on a 271 MB tarball of real game assets mixed to save what Pine
// Hollow saves at level 5: level 6 stores 216.9 MB in about 2 s, the last
// cheap step. Level 7 takes three times as long to shed 0.4 MB; level 11 sheds
// 5.4 MB for 278 s. docs/design.md has the table.
const DEFAULT_BROTLI_LEVEL = 6
const MIN_BROTLI_LEVEL = 0
const MAX_BROTLI_LEVEL = 11
// A larger window saved nothing at the default level, and every decoder
// reads this one.
const WINDOW_BITS = 22
// Below this, Brotli only adds a decode for every reader of the object.
const WORTHWHILE_SAVING = 0.01
const WHOLE = 1

interface StoredForm {
  /** What the PUT carries. */
  readonly body: Readonly<Uint8Array>
  /** `br` when `body` is the tarball's Brotli; absent for the tarball. */
  readonly contentEncoding?: 'br'
}

/** The tarball's Brotli, or the tarball when that saves next to nothing. */
async function storedForm(
  tarball: Readonly<Uint8Array>,
  level: number,
): Promise<StoredForm> {
  const brotli = await compress(tarball, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: level,
      [constants.BROTLI_PARAM_LGWIN]: WINDOW_BITS,
      [constants.BROTLI_PARAM_SIZE_HINT]: tarball.length,
    },
  })
  return brotli.length < tarball.length * (WHOLE - WORTHWHILE_SAVING)
    ? { body: brotli, contentEncoding: 'br' }
    : { body: tarball }
}

export {
  DEFAULT_BROTLI_LEVEL,
  MAX_BROTLI_LEVEL,
  MIN_BROTLI_LEVEL,
  type StoredForm,
  storedForm,
}
