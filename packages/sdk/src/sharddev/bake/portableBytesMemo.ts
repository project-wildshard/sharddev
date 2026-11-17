// oxlint-disable-next-line import/no-nodejs-modules -- The build-only memo keys the exact transform by content.
import { createHash, randomBytes } from 'node:crypto';
// oxlint-disable-next-line import/no-nodejs-modules -- The memo lives in the CI-cached gen root, outside the product.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- The deflate's own package files are part of the memo key.
import { createRequire } from 'node:module';
// oxlint-disable-next-line import/no-nodejs-modules -- The default memo root is the user's cache folder.
import { homedir } from 'node:os';
// oxlint-disable-next-line import/no-nodejs-modules -- Memo paths are joined, never read from input.
import { dirname, resolve } from 'node:path';
import { encodePortableBytes } from './portableBytes';

const sha = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
// CI6: a level-9 portable deflate of a large baked payload (Nine Dragon's eight light volumes: 1.3 s of its product
// worker) whose input rarely changes. The key holds every byte the transform depends on: the deflate package's version and
// entry files, this wrapper and the level, and the input; a hit re-hashes its body. Null: the package is not resolvable
// from here, so there is no memo. A build capability (ProjectGenerationContext.encodePortableBytes): a shard.config.ts
// bundle never reaches file access itself.
const codec = ((): string | null => {
  try {
    const require = createRequire(import.meta.url), manifest = require.resolve('fflate/package.json'), root = dirname(manifest);
    const version: unknown = (JSON.parse(readFileSync(manifest, 'utf8')) as { version?: unknown }).version;
    const files = ['esm/index.mjs', 'lib/node.cjs'].map(file => resolve(root, file));
    if (typeof version !== 'string' || files.some(file => !existsSync(file))) return null;
    return sha(JSON.stringify({ schema: 'portable-deflate/1', version, files: files.map(file => sha(readFileSync(file))), wrapper: encodePortableBytes.toString() }));
  } catch { return null; }
})();

/** `encodePortableBytes` with an exact memo in the gen cache: the same bytes for the same input and level; a missing,
 *  corrupt or unwritable memo runs the deflate. */
export function encodePortableBytesMemo(input: Uint8Array, level = 9): Uint8Array<ArrayBuffer> {
  if (codec === null) return encodePortableBytes(input, level);
  const memoRoot = process.env['WILDSHARD_PORTABLE_DEFLATE_CACHE'] ?? resolve(homedir(), '.cache/wildshard/gen/portable-deflate/1');
  const key = sha(`${codec}\0${String(level)}\0${input.byteLength}\0${sha(input)}`), body = resolve(memoRoot, `${key}.bin`), meta = resolve(memoRoot, `${key}.json`);
  try {
    const saved: unknown = JSON.parse(readFileSync(meta, 'utf8'));
    if (typeof saved === 'object' && saved !== null && 'key' in saved && saved.key === key && 'hash' in saved && typeof saved.hash === 'string') {
      const bytes = readFileSync(body);
      if (sha(bytes) === saved.hash) return new Uint8Array(bytes);
    }
  } catch { /* no memo yet, or a damaged one: compute */ }
  const bytes = encodePortableBytes(input, level), suffix = `.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    mkdirSync(memoRoot, { recursive: true });
    writeFileSync(body + suffix, bytes, { flag: 'wx' }); renameSync(body + suffix, body);
    writeFileSync(meta + suffix, JSON.stringify({ key, hash: sha(bytes) }), { flag: 'wx' }); renameSync(meta + suffix, meta);
  } catch { /* the memo is optional: storage never changes the build */ }
  finally { for (const file of [body + suffix, meta + suffix]) try { rmSync(file, { force: true }); } catch { /* own temporaries only */ } }
  return bytes;
}
