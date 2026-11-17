// oxlint-disable-next-line import/no-nodejs-modules -- The build-only memo keys the exact transform by content.
import { createHash, randomBytes } from 'node:crypto';
// oxlint-disable-next-line import/no-nodejs-modules -- The memo lives in the CI-cached gen root, outside the product.
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- The default memo root is the user's cache folder.
import { homedir } from 'node:os';
// oxlint-disable-next-line import/no-nodejs-modules -- Memo paths are joined, never read from input.
import { resolve } from 'node:path';
import { encodeGainKey } from './keyedSky';

const sha = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
// CI6: the gzip is most of a keyed sky's bake (1.4 s of Pine's product worker, on its critical path) and its input is the
// sky art, which rarely changes. Every byte the transform depends on is in the key; a hit re-hashes its body. The memo is a
// build capability (ProjectGenerationContext.encodeGainKey): a shard.config.ts bundle never reaches file access itself.
const codec = sha(JSON.stringify({ schema: 'gain-key-gzip/1', node: process.version, zlib: process.versions.zlib, platform: process.platform,
  arch: process.arch, level: 9, implementation: encodeGainKey.toString() }));

/** `encodeGainKey` with an exact memo in the gen cache: the same bytes for the same planes; a missing, corrupt or
 *  unwritable memo runs the gzip. */
export function encodeGainKeyMemo(data: Uint16Array): Uint8Array {
  const memoRoot = process.env['WILDSHARD_GAIN_KEY_CACHE'] ?? resolve(homedir(), '.cache/wildshard/gen/gain-key/1');
  const input = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const key = sha(`${codec}\0${input.byteLength}\0${sha(input)}`), body = resolve(memoRoot, `${key}.bin`), meta = resolve(memoRoot, `${key}.json`);
  try {
    const saved: unknown = JSON.parse(readFileSync(meta, 'utf8'));
    if (typeof saved === 'object' && saved !== null && 'key' in saved && saved.key === key && 'hash' in saved && typeof saved.hash === 'string') {
      const bytes = readFileSync(body);
      if (sha(bytes) === saved.hash) return new Uint8Array(bytes);
    }
  } catch { /* no memo yet, or a damaged one: compute */ }
  const bytes = encodeGainKey(data), suffix = `.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    mkdirSync(memoRoot, { recursive: true });
    writeFileSync(body + suffix, bytes, { flag: 'wx' }); renameSync(body + suffix, body);
    writeFileSync(meta + suffix, JSON.stringify({ key, hash: sha(bytes) }), { flag: 'wx' }); renameSync(meta + suffix, meta);
  } catch { /* the memo is optional: storage never changes the build */ }
  finally { for (const file of [body + suffix, meta + suffix]) try { rmSync(file, { force: true }); } catch { /* own temporaries only */ } }
  return bytes;
}
