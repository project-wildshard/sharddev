// oxlint-disable-next-line import/no-nodejs-modules -- The build host keys native compression by exact content.
import { createHash, randomBytes } from 'node:crypto';
// oxlint-disable-next-line import/no-nodejs-modules -- Optional build storage lives outside the authored product.
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- The default cache is the existing build-cache root.
import { homedir } from 'node:os';
// oxlint-disable-next-line import/no-nodejs-modules -- Cache paths use only trusted roots and hashes.
import { resolve } from 'node:path';
import { reportBuildCache } from '../buildCacheMetrics';
import { readBoundedFile } from '../sourceReader';
import { encodeBuildBytes } from './byteCodec';

const sha = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const codec = sha(JSON.stringify({ schema: 'native-zstd/1', node: process.version, zstd: process.versions['zstd'],
  zlib: process.versions.zlib, platform: process.platform, arch: process.arch, implementation: encodeBuildBytes.toString() }));

/** Exact native build Zstd bytes, shared only when the complete input, level and codec match.
 * Missing, damaged or unwritable storage recomputes with the original encoder. Every call returns owned bytes. */
export function encodeZstdBytesMemo(input: Uint8Array, level = 19): Uint8Array<ArrayBuffer> {
  if (!(input instanceof Uint8Array) || !(input.buffer instanceof ArrayBuffer) || input.byteLength > 256_000_000)
    throw new Error('Build codec requires bounded unshared bytes');
  if (!Number.isInteger(level) || level < 1 || level > 22) throw new Error('Zstd level must be an integer from 1 to 22');
  const owned = new Uint8Array(input);
  const root = process.env['WILDSHARD_ZSTD_BYTES_CACHE'] ?? resolve(homedir(), '.cache/wildshard/gen/native-zstd/1');
  const key = sha(`${codec}\0${level}\0${owned.byteLength}\0${sha(owned)}`);
  const body = resolve(root, `${key}.bin`), meta = resolve(root, `${key}.json`);
  reportBuildCache({cache:'zstd-bytes',event:'lookup',bytes:0});
  try {
    const saved: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readBoundedFile(meta, 1000)));
    if (typeof saved === 'object' && saved !== null && 'key' in saved && saved.key === key
      && 'hash' in saved && typeof saved.hash === 'string' && /^[a-f0-9]{64}$/u.test(saved.hash)) {
      const bytes = readBoundedFile(body, 256_000_000);
      if (sha(bytes) === saved.hash) {
        reportBuildCache({cache:'zstd-bytes',event:'disk-hit',bytes:bytes.byteLength});
        return Uint8Array.from(bytes);
      }
    }
  } catch { /* An optional memo never replaces the original encoder's admission. */ }
  reportBuildCache({cache:'zstd-bytes',event:'miss',bytes:0});
  const bytes = encodeBuildBytes(owned, 'zstd', level);
  reportBuildCache({cache:'zstd-bytes',event:'computed',bytes:bytes.byteLength});
  let populated=false;
  const suffix = `.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    mkdirSync(root, { recursive: true });
    writeFileSync(body + suffix, bytes, { flag: 'wx' }); renameSync(body + suffix, body);
    writeFileSync(meta + suffix, JSON.stringify({ key, hash: sha(bytes) }), { flag: 'wx' }); renameSync(meta + suffix, meta); populated=true;
  } catch { /* Storage availability does not change the build. */ }
  finally { for (const file of [body + suffix, meta + suffix]) try { rmSync(file, { force: true }); } catch { /* Own temporaries only. */ } }
  reportBuildCache({cache:'zstd-bytes',event:populated?'population':'write-failure',bytes:populated?bytes.byteLength:0});
  return Uint8Array.from(bytes);
}
