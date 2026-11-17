// oxlint-disable-next-line import/no-nodejs-modules -- The build-only memo keys the exact comparison by content.
import { createHash, randomBytes } from 'node:crypto';
// oxlint-disable-next-line import/no-nodejs-modules -- The memo lives in the CI-cached gen root, outside the product.
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- The default memo root is the user's cache folder.
import { homedir } from 'node:os';
// oxlint-disable-next-line import/no-nodejs-modules -- Memo paths are joined, never read from input.
import { resolve } from 'node:path';
import { meshoptNoLarger } from '../blobs';

const sha = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
// CI6: the two level-9 gzips that choose a meshopt GLB (nameMeshoptBlob) are most of its cost (Driftwood's foliage batches:
// ~0.5 s of its product worker) and their inputs rarely change. The answer depends only on the two byte arrays and the
// gzip, so the key is both arrays' hashes, Node, zlib, platform and the comparison's own source; a damaged entry recomputes.
const codec = sha(JSON.stringify({ schema: 'meshopt-choice/1', node: process.version, zlib: process.versions.zlib, platform: process.platform,
  arch: process.arch, level: 9, implementation: meshoptNoLarger.toString() }));

/** `meshoptNoLarger` with an exact memo in the gen cache: the same answer for the same packed and source bytes; a missing,
 *  corrupt or unwritable memo runs the comparison. */
export async function meshoptNoLargerMemo(packed: Uint8Array, input: Uint8Array): Promise<boolean> {
  const memoRoot = process.env['WILDSHARD_MESHOPT_CHOICE_CACHE'] ?? resolve(homedir(), '.cache/wildshard/gen/meshopt-choice/1');
  const key = sha(`${codec}\0${sha(packed)}\0${sha(input)}`), file = resolve(memoRoot, `${key}.json`);
  try {
    const saved: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (typeof saved === 'object' && saved !== null && 'key' in saved && saved.key === key && 'packed' in saved && typeof saved.packed === 'boolean') return saved.packed;
  } catch { /* no memo yet, or a damaged one: compare */ }
  const answer = await meshoptNoLarger(packed, input), temporary = `${file}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    mkdirSync(memoRoot, { recursive: true });
    writeFileSync(temporary, JSON.stringify({ key, packed: answer }), { flag: 'wx' }); renameSync(temporary, file);
  } catch { /* the memo is optional: storage never changes the build */ }
  finally { try { rmSync(temporary, { force: true }); } catch { /* own temporary only */ } }
  return answer;
}
