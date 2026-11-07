// oxlint-disable-next-line import/no-nodejs-modules -- Optional compiler storage is owned only by the trusted build host.
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Unique temporary names never enter the compiler key.
import { randomBytes } from 'node:crypto';
// oxlint-disable-next-line import/no-nodejs-modules -- Reuse the existing CI-cached generation root.
import { homedir } from 'node:os';
// oxlint-disable-next-line import/no-nodejs-modules -- Construct paths from trusted roots and content hashes.
import { resolve } from 'node:path';
import { reportBuildCache } from '../buildCacheMetrics';
import { projectCompilerIdentity, rawAssemblyScriptCompilerIdentity } from '../projectCompilerIdentity';
import { encodeCanonicalJson, hashImmutableBytes } from '@wildshard/engine/host/immutable';
import { readBoundedFile } from '../sourceReader';
import type { AssemblyScriptMemo } from './assemblyscriptMemoPort';

const text = new TextEncoder(), maximum = 16_000_000;

/** Preserve the original raw AssemblyScript output for exact source/flags/compiler inputs.
 * This host-only optional cache never stores source admission, instrumentation or executable verdicts. */
export const memoAssemblyScript: AssemblyScriptMemo = async (args, sources, generate) => {
  const files = [...sources];
  // Unusually large direct tool callers retain their original uncached path.
  if (args.length > 64 || files.length > 65 || files.reduce((sum, [, value]) => sum + text.encode(value).byteLength, 0) > maximum)
    { reportBuildCache({cache:'assemblyscript-raw',event:'bypass',bytes:0}); return generate(); }
  // Preserve the original full compiler/source guard even on a raw-key hit.
  const fullCompiler = await projectCompilerIdentity();
  const compiler = await rawAssemblyScriptCompilerIdentity();
  const inputs = { node: process.version, platform: process.platform, arch: process.arch, args: [...args], sources: files };
  const keyOf = (version: number, identity: string): string => hashImmutableBytes(text.encode(encodeCanonicalJson({ version, compiler: identity, ...inputs })));
  const key = keyOf(2, compiler);
  // The directory and metadata format stay unchanged; both key generations remain valid.
  const root = process.env['WILDSHARD_AS_RAW_CACHE'] ?? resolve(homedir(), '.cache/wildshard/gen/as-raw/1');
  reportBuildCache({cache:'assemblyscript-raw',event:'lookup',bytes:0});
  const read = (candidate: string): Uint8Array | undefined => {
    const body = resolve(root, `${candidate}.wasm`), meta = resolve(root, `${candidate}.json`);
    try {
      const saved: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readBoundedFile(meta, 1000)));
      if (typeof saved === 'object' && saved !== null && 'key' in saved && saved.key === candidate
        && 'hash' in saved && typeof saved.hash === 'string' && /^[a-f0-9]{64}$/u.test(saved.hash)
        && 'bytes' in saved && typeof saved.bytes === 'number' && Number.isSafeInteger(saved.bytes) && saved.bytes > 0 && saved.bytes <= maximum) {
        const bytes = readBoundedFile(body, saved.bytes);
        if (bytes.byteLength === saved.bytes && hashImmutableBytes(bytes) === saved.hash) {
          return Uint8Array.from(bytes);
        }
      }
    } catch { /* An absent or damaged memo recompiles, without changing caller admission. */ }
    return undefined;
  };
  const current = read(key);
  if (current !== undefined) {
    reportBuildCache({cache:'assemblyscript-raw',event:'disk-hit',bytes:current.byteLength}); return current;
  }
  // An exact old full-compiler key is stronger than this raw-only identity.
  // Validate its original body/hash before promoting; unrelated or damaged old entries miss.
  const legacy = read(keyOf(1, fullCompiler));
  let bytes: Uint8Array;
  if (legacy !== undefined) {
    bytes = legacy; reportBuildCache({cache:'assemblyscript-raw',event:'disk-hit',bytes:bytes.byteLength});
  } else {
    reportBuildCache({cache:'assemblyscript-raw',event:'miss',bytes:0});
    bytes = Uint8Array.from(await generate());
    reportBuildCache({cache:'assemblyscript-raw',event:'computed',bytes:bytes.byteLength});
  }
  if (bytes.byteLength === 0 || bytes.byteLength > maximum) return bytes;
  const body = resolve(root, `${key}.wasm`), meta = resolve(root, `${key}.json`);
  let populated=false;
  const suffix = `.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    mkdirSync(root, { recursive: true });
    writeFileSync(body + suffix, bytes, { flag: 'wx' }); renameSync(body + suffix, body);
    writeFileSync(meta + suffix, JSON.stringify({ key, bytes: bytes.byteLength, hash: hashImmutableBytes(bytes) }), { flag: 'wx' });
    renameSync(meta + suffix, meta); populated=true;
  } catch { /* Optional storage cannot change the compiler result. */ }
  finally { for (const file of [body + suffix, meta + suffix]) try { rmSync(file, { force: true }); } catch { /* Own temporary only. */ } }
  reportBuildCache({cache:'assemblyscript-raw',event:populated?'population':'write-failure',bytes:populated?bytes.byteLength:0});
  return bytes;
};
