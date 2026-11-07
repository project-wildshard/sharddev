// oxlint-disable-next-line import/no-nodejs-modules -- Trusted author tooling resolves only three's packaged transcoder artifacts.
import { createRequire } from 'node:module';
// oxlint-disable-next-line import/no-nodejs-modules -- Temporary CommonJS glue is the packaged transcoder, removed after loading.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- The loader owns this unique portable temporary directory.
import { tmpdir } from 'node:os';
// oxlint-disable-next-line import/no-nodejs-modules -- Local dependency artifacts, never an author-supplied path.
import { dirname, join } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- Level bodies take the same Zstandard supercompression KTX2 names.
import { constants, zstdCompressSync } from 'node:zlib';
import { parseKtx2 } from '../assets';

/**
 * DL9: a phone-tier UASTC KTX2 shipped already transcoded to ASTC 4×4. The phone's KTX2 loader has always turned these
 * files into ASTC 4×4 at load (three's Basis transcoder in a worker); this runs that same packaged transcoder at build
 * time, so the device uploads identical blocks with no transcode. Same dimensions, mips, transfer, orientation and
 * key/values; each level is Zstandard-supercompressed raw ASTC (vkFormat 157 linear / 158 sRGB). Only for files a tier
 * marks `phone`: ASTC samples on every iPhone, and a desktop tier keeps its Basis file.
 */
const UASTC_MODEL = 166, ASTC_MODEL = 162, ASTC_4X4_UNORM = 157, ASTC_4X4_SRGB = 158, TRANSCODE_ASTC_4X4 = 10, HEADER = 80, LEVEL_ROW = 24;
interface Ktx2File {
  isValid: () => boolean; startTranscoding: () => boolean; getLevels: () => number; close: () => void; delete: () => void;
  getImageTranscodedSizeInBytes: (level: number, layer: number, face: number, format: number) => number;
  transcodeImage: (out: Uint8Array, level: number, layer: number, face: number, format: number, alpha: number, channel0: number, channel1: number) => boolean;
}
interface Transcoder { initializeBasis: () => void; KTX2File: new (bytes: Uint8Array) => unknown }
type TranscoderFactory = (options: { wasmBinary: Uint8Array; print: (text: string) => void; printErr: (text: string) => void }) => Promise<unknown>;
const fileMethods = ['isValid', 'startTranscoding', 'getLevels', 'close', 'delete', 'getImageTranscodedSizeInBytes', 'transcodeImage'] as const;
const factory = (value: unknown): value is TranscoderFactory => typeof value === 'function';
const transcoderApi = (value: unknown): value is Transcoder => typeof value === 'object' && value !== null
  && typeof Reflect.get(value, 'initializeBasis') === 'function' && typeof Reflect.get(value, 'KTX2File') === 'function';
const fileApi = (value: unknown): value is Ktx2File => typeof value === 'object' && value !== null && fileMethods.every(key => typeof Reflect.get(value, key) === 'function');

let transcoder: Promise<Transcoder> | undefined;
async function loadTranscoder(): Promise<Transcoder> {
  const require = createRequire(join(import.meta.dirname, 'transcoder.cjs'));
  const directory = join(dirname(require.resolve('three')), '../examples/jsm/libs/basis');
  const glue = readFileSync(join(directory, 'basis_transcoder.js'), 'utf8'), wasm = Uint8Array.from(readFileSync(join(directory, 'basis_transcoder.wasm')));
  // three ships the Emscripten glue as a browser global script; give it a CommonJS export to load it in Node.
  const temporary = mkdtempSync(join(tmpdir(), 'wildshard-transcoder-'));
  try {
    const path = join(temporary, 'transcoder.cjs'); writeFileSync(path, `${glue}\nmodule.exports = BASIS;\n`);
    // oxlint-disable-next-line import/no-dynamic-require -- Only three's packaged transcoder glue is loaded here.
    const entry: unknown = require(path); if (!factory(entry)) throw new Error('Invalid packaged Basis transcoder');
    const loaded = await entry({ wasmBinary: wasm, print: () => undefined, printErr: () => undefined });
    if (!transcoderApi(loaded)) throw new Error('Invalid packaged Basis transcoder API');
    loaded.initializeBasis(); return loaded;
  } finally { rmSync(temporary, { recursive: true }); }
}

/** The phone tier's KTX2 for `input`: ASTC 4×4 for a UASTC file, any other file as it is. */
export async function phoneAstcKtx2(input: Uint8Array): Promise<Uint8Array> {
  parseKtx2(input);
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const width = view.getUint32(20, true), height = view.getUint32(24, true), levels = view.getUint32(40, true);
  const dfdOffset = view.getUint32(48, true), dfdLength = view.getUint32(52, true), kvdOffset = view.getUint32(56, true), kvdLength = view.getUint32(60, true);
  if (view.getUint32(12, true) !== 0 || input[dfdOffset + 12] !== UASTC_MODEL || view.getUint32(44, true) === 1) return input;
  if (view.getUint32(28, true) > 1 || view.getUint32(32, true) > 1 || view.getBigUint64(72, true) !== 0n) throw new Error('Phone ASTC takes one 2D UASTC image');
  const srgb = input[dfdOffset + 14] === 2;
  transcoder ??= loadTranscoder();
  const module = await transcoder, file = new module.KTX2File(Uint8Array.from(input));
  if (!fileApi(file)) throw new Error('Invalid packaged Basis transcoder file');
  const bodies: Uint8Array[] = [], raw: number[] = [];
  try {
    if (!file.isValid() || !file.startTranscoding() || file.getLevels() !== levels) throw new Error('Basis transcoder refused the UASTC file');
    for (let level = 0; level < levels; level++) {
      const expected = Math.ceil(Math.max(1, width >> level) / 4) * Math.ceil(Math.max(1, height >> level) / 4) * 16;
      if (file.getImageTranscodedSizeInBytes(level, 0, 0, TRANSCODE_ASTC_4X4) !== expected) throw new Error('ASTC 4x4 level size differs');
      const blocks = new Uint8Array(expected);
      if (!file.transcodeImage(blocks, level, 0, 0, TRANSCODE_ASTC_4X4, 0, -1, -1)) throw new Error('UASTC to ASTC transcode failed');
      bodies.push(Uint8Array.from(zstdCompressSync(blocks, { params: { [constants.ZSTD_c_compressionLevel]: 19 } }))); raw.push(expected);
    }
  } finally { file.close(); file.delete(); }
  // Header, level index, the source's descriptor (colour model ASTC) and key/values, then levels smallest first.
  const dfdAt = HEADER + levels * LEVEL_ROW, kvdAt = dfdAt + dfdLength, dataAt = kvdAt + kvdLength;
  const total = dataAt + bodies.reduce((sum, body) => sum + body.length, 0), output = new Uint8Array(total), out = new DataView(output.buffer);
  output.set(input.subarray(0, HEADER));
  out.setUint32(12, srgb ? ASTC_4X4_SRGB : ASTC_4X4_UNORM, true); out.setUint32(44, 2, true);
  out.setUint32(48, dfdAt, true); out.setUint32(56, kvdLength === 0 ? 0 : kvdAt, true);
  out.setBigUint64(64, 0n, true); out.setBigUint64(72, 0n, true);
  output.set(input.subarray(dfdOffset, dfdOffset + dfdLength), dfdAt); output[dfdAt + 12] = ASTC_MODEL;
  output.set(input.subarray(kvdOffset, kvdOffset + kvdLength), kvdAt);
  let at = dataAt;
  for (let level = levels - 1; level >= 0; level--) {
    const body = bodies[level], row = HEADER + level * LEVEL_ROW, size = raw[level];
    if (body === undefined || size === undefined) throw new Error('Missing ASTC level');
    output.set(body, at);
    out.setBigUint64(row, BigInt(at), true); out.setBigUint64(row + 8, BigInt(body.length), true); out.setBigUint64(row + 16, BigInt(size), true);
    at += body.length;
  }
  parseKtx2(output);
  return output;
}
