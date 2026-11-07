// oxlint-disable-next-line import/no-nodejs-modules -- Only the trusted host executes its verified native encoder.
import { execFileSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- Fingerprint actual installed decoder binaries and shared libraries.
import { readdirSync, realpathSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the installed decoder from the trusted SDK, never an author path.
import { createRequire } from 'node:module';
// oxlint-disable-next-line import/no-nodejs-modules -- Package-relative names, not installation paths, enter the fingerprint.
import { basename, dirname, relative, resolve, sep } from 'node:path';
import sharp from 'sharp';
import * as v from 'valibot';
import { compilerPackageInputs } from '../projectCompilerIdentity';
import { encodeCanonicalJson, hashImmutableBytes } from '@wildshard/engine/host/immutable';
import { readBoundedFile } from '../sourceReader';
import { readImagePixels, writeImagePixels } from './image';
import { bakeColourTexture } from './texture';
import { prepareBasisTool } from './basisTool';
import type { GlbBasisEncoder, GlbBasisImage } from './basisGlb';

/** Build-only capability; its identity covers actual encoder/decoder artifacts and executable recipe. */
export interface BasisEncoder { readonly identity: string; readonly encode: GlbBasisEncoder }
const text = new TextEncoder();
interface DecoderIdentityHost {
  readonly require: typeof createRequire;
  readonly names: (path: string) => readonly string[];
  readonly entries: (path: string) => readonly { readonly name: string; readonly directory: boolean }[];
  readonly realpath: (path: string) => string;
  readonly read: typeof readBoundedFile;
}
const decoderHost: DecoderIdentityHost = {
  require: createRequire, names: path => readdirSync(path),
  entries: path => readdirSync(path, { withFileTypes: true }).map(row => ({ name: row.name, directory: row.isDirectory() })),
  realpath: path => realpathSync(path), read: readBoundedFile,
};
/** Internal host identity, independent of an isolated worker's module-cache view.
 * The factory always uses its concrete host; injected ports exercise strict artifact refusals. */
export function decoderIdentity(host: DecoderIdentityHost = decoderHost): string {
  const require = host.require(resolve(import.meta.dirname, 'basis-decoder.cjs')), entry = require.resolve('sharp');
  const installed = host.require(entry);
  const platform = v.parse(v.object({ runtimePlatformArch: v.custom<() => unknown>(value => typeof value === 'function') }), installed(resolve(dirname(entry), 'libvips.js')));
  const runtime = v.parse(v.pipe(v.string(), v.regex(/^[a-z0-9]+-[a-z0-9]+$/u)), platform.runtimePlatformArch());
  let binary: string;
  try { binary = host.realpath(installed.resolve(`@img/sharp-${runtime}/sharp.node`)); }
  catch (error: unknown) { throw new Error('Missing exact packaged Sharp decoder', { cause: error }); }
  const binaries = host.names(dirname(binary)).filter(name => /^sharp-[^/]+\.node$/u.test(name));
  if (binaries.length !== 1 || binaries[0] !== basename(binary)
    || !binary.endsWith(`/@img/sharp-${runtime}/lib/sharp-${runtime}.node`)) throw new Error('Missing exact packaged Sharp decoder');
  const binding: unknown = installed(resolve(dirname(entry), 'sharp.js'));
  if (installed(binary) !== binding) throw new Error('Sharp decoder binding differs');
  const roots = [dirname(binary), dirname(installed.resolve(`@img/sharp-libvips-${runtime}/lib`))];
  const files: [string, string][] = [...compilerPackageInputs([{ name: 'sharp', from: entry }])];
  let total = 0, count = 0;
  for (const [index, root] of roots.entries()) {
    const base = host.realpath(root);
    const walk = (directory: string): void => {
      for (const row of host.entries(directory)) {
        const path = host.realpath(resolve(directory, row.name));
        if (!path.startsWith(base + sep)) throw new Error('Sharp dependency escaped package');
        if (row.directory) walk(path);
        else {
          const bytes = host.read(path, 64_000_000); total += bytes.length;
          if (++count > 256 || total > 128_000_000) throw new Error('Sharp artifact identity exceeds cap');
          files.push([`native-${String(index)}/${relative(base, path).replaceAll('\\', '/')}`, hashImmutableBytes(bytes)]);
        }
      }
    };
    walk(base);
  }
  files.sort(([a], [b]) => a.localeCompare(b));
  return hashImmutableBytes(text.encode(encodeCanonicalJson({ files, versions: sharp.versions })));
}
async function encodeImage(image: GlbBasisImage, encoder: string): Promise<Uint8Array> {
  const decoded = await readImagePixels(new Uint8Array(image.bytes));
  if (decoded.width !== image.width || decoded.height !== image.height) throw new Error('Basis source dimensions differ');
  return bakeColourTexture(await writeImagePixels(decoded), encoder);
}
/** Supply the original native UASTC recipe without adding file/process/decoder imports to authored programs.
 * The checked host installs only pinned upstream sources. Corrupt artifacts and missing build tools refuse. */
export async function createBasisEncoder(): Promise<BasisEncoder> {
  const tool = await prepareBasisTool(), binary = hashImmutableBytes(readBoundedFile(tool.file, 64_000_000));
  const version = execFileSync(tool.file, ['-version'], { timeout: 10000, maxBuffer: 1_000_000 }).toString();
  if (!/v2\.50\.0\b/u.test(version)) throw new Error('Basis encoder version differs');
  const decoder = decoderIdentity();
  const identity = hashImmutableBytes(text.encode(encodeCanonicalJson({ tool: tool.identity, binary, version, decoder,
    recipe: [encodeImage.toString(), readImagePixels.toString(), writeImagePixels.toString(), bakeColourTexture.toString()] })));
  return { identity, encode: async image => {
    if (hashImmutableBytes(readBoundedFile(tool.file, 64_000_000)) !== binary || decoderIdentity() !== decoder) throw new Error('Basis encoder dependencies changed');
    const result = await encodeImage(image, tool.file);
    if (hashImmutableBytes(readBoundedFile(tool.file, 64_000_000)) !== binary) throw new Error('Basis executable changed during encode');
    return result;
  } };
}
