// oxlint-disable-next-line import/no-nodejs-modules -- Trusted author tooling resolves only its pinned dependency artifacts.
import { createRequire } from 'node:module';
// oxlint-disable-next-line import/no-nodejs-modules -- Temporary CommonJS glue is a verified third-party module, removed after loading.
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- The encoder owns this unique portable temporary directory.
import { tmpdir } from 'node:os';
// oxlint-disable-next-line import/no-nodejs-modules -- Local dependency artifacts, never an author-supplied path or URL.
import { dirname, join } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- The trusted build runner opts into its private transform cache.
import process from 'node:process';
import { readImagePixels } from './image';
import { worldImageInfo } from './worldImage';
import { hashImmutableBytes } from '../immutable';
import { parseKtx2 } from '../assets';
import { cachedWorldTexture } from './worldTextureMemo';

/** Exact packaged encoder artifacts; lockfile integrity pins the containing dependency as well. */
export const WORLD_TEXTURE_TOOL: Readonly<{ package: "@loaders.gl/textures"; version: "4.5.3"; decoder: "sharp@0.34.5"; glue: "d204cc62dfdf910f92bce616872a6d6057b6d2b45bbaffbc0ef047375351e4a6"; wasm: "62ce0364ea8f4969e1e4277ce275213dcce5b234c8c96586da06e3879010341c"; }> = Object.freeze({
  package: '@loaders.gl/textures', version: '4.5.3', decoder: 'sharp@0.34.5',
  glue: 'd204cc62dfdf910f92bce616872a6d6057b6d2b45bbaffbc0ef047375351e4a6',
  wasm: '62ce0364ea8f4969e1e4277ce275213dcce5b234c8c96586da06e3879010341c',
});
const settings = Object.freeze({ktx2:true,supercompression:true,quality:128,uastc:true,mips:true,sourceIsPng:false});
interface Encoder {
  setCreateKTX2File: (value: boolean) => void; setKTX2UASTCSupercompression: (value: boolean) => void;
  setKTX2SRGBTransferFunc: (value: boolean) => void; setSliceSourceImage: (slice: number, data: Uint8Array, width: number, height: number, png: boolean) => void;
  setPerceptual: (value: boolean) => void; setMipSRGB: (value: boolean) => void; setQualityLevel: (value: number) => void;
  setUASTC: (value: boolean) => void; setMipGen: (value: boolean) => void; encode: (output: Uint8Array) => number; delete: () => void;
}
interface BasisModule { initializeBasis: () => void; BasisEncoder: new () => unknown }
type BasisFactory = (options: { wasmBinary: Uint8Array; print: (text: string) => void; printErr: (text: string) => void }) => Promise<unknown>;
const methods = ['setCreateKTX2File', 'setKTX2UASTCSupercompression', 'setKTX2SRGBTransferFunc', 'setSliceSourceImage', 'setPerceptual', 'setMipSRGB', 'setQualityLevel', 'setUASTC', 'setMipGen', 'encode', 'delete'] as const;
function factory(value: unknown): value is BasisFactory { return typeof value === 'function'; }
function moduleApi(value: unknown): value is BasisModule { return typeof value === 'object' && value !== null && typeof Reflect.get(value, 'initializeBasis') === 'function' && typeof Reflect.get(value, 'BasisEncoder') === 'function'; }
function encoderApi(value: unknown): value is Encoder { return typeof value === 'object' && value !== null && methods.every(key => typeof Reflect.get(value, key) === 'function'); }
let basis: Promise<BasisModule> | undefined;
async function loadBasis(): Promise<BasisModule> {
  const require = createRequire(join(import.meta.dirname, 'encoder.cjs')), directory = dirname(require.resolve(WORLD_TEXTURE_TOOL.package));
  const glue = Uint8Array.from(readFileSync(join(directory, 'libs/basis_encoder.js'))), wasm = Uint8Array.from(readFileSync(join(directory, 'libs/basis_encoder.wasm')));
  if (hashImmutableBytes(glue) !== WORLD_TEXTURE_TOOL.glue || hashImmutableBytes(wasm) !== WORLD_TEXTURE_TOOL.wasm) throw new Error('Pinned world texture encoder artifact mismatch');
  // The package publishes its CommonJS Emscripten glue beneath type:module. Give those exact verified bytes
  // a .cjs suffix; normal Node module loading executes them, with the WASM already supplied and no network.
  const temporary = mkdtempSync(join(tmpdir(), 'wildshard-basis-'));
  try {
    const path = join(temporary, 'encoder.cjs'); writeFileSync(path, glue);
    // oxlint-disable-next-line import/no-dynamic-require -- Only the SHA-verified pinned dependency bytes above are loaded here.
    const entry: unknown = require(path); if (!factory(entry)) throw new Error('Invalid pinned encoder factory');
    const loaded = await entry({ wasmBinary: wasm, print: () => undefined, printErr: () => undefined });
    if (!moduleApi(loaded)) throw new Error('Invalid pinned encoder API');
    loaded.initializeBasis(); return loaded;
  } finally { rmSync(temporary, { recursive: true }); }
}
/** Encode embedded PNG/JPEG/WebP to deterministic single-threaded UASTC KTX2 with a complete mip chain.
 * Colour/emissive uses sRGB; normal/ORM uses linear transfer. Source flipY is baked into raster rows for the glTF/KTX2 convention; atlas UVs stay unchanged. No system binary, CDN or author code is executed. */
export async function bakeWorldTexture(image: Uint8Array, colourSpace: 'srgb' | 'linear', options: { flipY?: boolean } = {}): Promise<Uint8Array> {
  if (!['srgb', 'linear'].includes(colourSpace)) throw new Error('World texture transfer must be srgb or linear');
  const info = await worldImageInfo(image), size: [number, number] = [info.width, info.height];
  const decoded = await readImagePixels(image, options);
  // Even a memo hit loads and verifies the exact pinned encoder artifacts.
  basis ??= loadBasis(); const module = await basis;
  const pixels = new Uint8Array(decoded.pixels.buffer, decoded.pixels.byteOffset, decoded.pixels.byteLength);
  const key = hashImmutableBytes(new TextEncoder().encode(JSON.stringify({schema:1,tool:WORLD_TEXTURE_TOOL,settings,colourSpace,size,pixels:hashImmutableBytes(pixels)})));
  return cachedWorldTexture(process.env['WILDSHARD_WORLD_TEXTURE_CACHE'],key,()=>{
  const raw = new module.BasisEncoder();
  if (!encoderApi(raw)) throw new Error('Invalid pinned encoder methods');
  try {
    const srgb = colourSpace === 'srgb';
    raw.setCreateKTX2File(settings.ktx2); raw.setKTX2UASTCSupercompression(settings.supercompression); raw.setKTX2SRGBTransferFunc(srgb);
    raw.setSliceSourceImage(0, pixels, size[0], size[1], settings.sourceIsPng); raw.setPerceptual(srgb); raw.setMipSRGB(srgb);
    raw.setQualityLevel(settings.quality); raw.setUASTC(settings.uastc); raw.setMipGen(settings.mips);
    const output = new Uint8Array(size[0] * size[1] * 4 + 1_048_576), length = raw.encode(output);
    if (!Number.isSafeInteger(length) || length < 1 || length > output.length || length > 25_000_000) throw new Error('World texture encoding failed or exceeded wire cap');
    return output.slice(0, length);
  } finally { raw.delete(); }
  },bytes=>{
    parseKtx2(bytes);
    const header = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),dfd = header.getUint32(48,true);
    if(header.getUint32(20,true)!==size[0]||header.getUint32(24,true)!==size[1]
      ||header.getUint32(40,true)!==1+Math.floor(Math.log2(Math.max(...size)))||bytes[dfd+14]!== (colourSpace==='srgb'?2:1)) throw new Error('World texture memo dimensions, mips or transfer differ');
  });
}
