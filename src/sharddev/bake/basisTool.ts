// oxlint-disable-next-line import/no-nodejs-modules -- Only the checked build host installs its pinned compiler tool.
import { execFileSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- Atomic tool installation and verification stay outside author bundles.
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- The trusted tool cache belongs to the build user.
import { homedir } from 'node:os';
// oxlint-disable-next-line import/no-nodejs-modules -- Only pinned relative source names enter these paths.
import { dirname, resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- Native compiler flags and tool cache keys name the actual host.
import process from 'node:process';
import * as v from 'valibot';
import { BASIS_INPUTS, BASIS_REVISION } from './basisToolInputs';
import { encodeCanonicalJson, hashImmutableBytes } from '../immutable';
import { readBoundedFile } from '../sourceReader';

const digest = v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/u));
const Receipt = v.strictObject({ key: digest, binary: digest });
const flags = ['-ffp-contract=on'];
const text = new TextEncoder();
/** Compiler recipe is part of the installed artifact identity, including the original fused arithmetic. */
export function basisToolRecipe(platform: string, arch: string): readonly string[] {
  if (!['darwin', 'linux'].includes(platform) || !['arm64', 'x64'].includes(arch)) throw new Error('Unsupported Basis build host');
  return [...flags, ...(arch === 'x64' ? ['-mfma'] : [])];
}
/** Pin source, compiler recipe and resulting executable. Missing/corrupt published tools refuse, never use PATH. */
export async function prepareBasisTool(cacheRoot: string = resolve(homedir(), '.cache/wildshard/basis')): Promise<{ readonly file: string; readonly identity: string }> {
  const recipe = { revision: BASIS_REVISION, inputs: BASIS_INPUTS, platform: process.platform, arch: process.arch,
    flags: basisToolRecipe(process.platform, process.arch), compiler: 'clang', configuration: 'Release', examples: false, sse: false };
  const key = hashImmutableBytes(text.encode(encodeCanonicalJson(recipe))), directory = resolve(cacheRoot, key), file = resolve(directory, 'source/bin/basisu');
  const verify = (): { readonly file: string; readonly identity: string } => {
    const receipt = v.parse(Receipt, JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readBoundedFile(resolve(directory, 'receipt.json'), 1024))));
    const binary = hashImmutableBytes(readBoundedFile(file, 64_000_000));
    if (receipt.key !== key || receipt.binary !== binary) throw new Error('Pinned Basis executable identity differs');
    return { file, identity: hashImmutableBytes(text.encode(encodeCanonicalJson({ key, binary }))) };
  };
  if (existsSync(directory)) return verify();
  mkdirSync(cacheRoot, { recursive: true });
  const temporary = mkdtempSync(resolve(cacheRoot, '.building-')), source = resolve(temporary, 'source');
  try {
    let cursor = 0;
    const downloads = await Promise.allSettled(Array.from({ length: 4 }, async () => {
      for (;;) {
        const row = BASIS_INPUTS[cursor++]; if (row === undefined) return;
        const [name, expected] = row;
        const response = await fetch(`https://raw.githubusercontent.com/BinomialLLC/basis_universal/${BASIS_REVISION}/${name}`, { signal: AbortSignal.timeout(30000) });
        if (!response.ok || response.body === null) throw new Error(`Missing pinned Basis source: ${name}`);
        const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
        try {
          for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.length;
            if (size > 4_000_000) throw new Error('Basis source exceeds file cap'); chunks.push(next.value); }
        } finally { await reader.cancel(); }
        const bytes = new Uint8Array(size); let at = 0;
        for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
        if (hashImmutableBytes(bytes) !== expected) throw new Error(`Pinned Basis source identity differs: ${name}`);
        const path = resolve(source, name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes);
      }
    }));
    for (const download of downloads) if (download.status === 'rejected') throw download.reason;
    const nativeFlags = recipe.flags.join(' '), build = resolve(temporary, 'build');
    execFileSync('cmake', ['-S', source, '-B', build, '-DCMAKE_BUILD_TYPE=Release', '-DBASISU_EXAMPLES=OFF', '-DBASISU_SSE=OFF',
      '-DCMAKE_C_COMPILER=clang', '-DCMAKE_CXX_COMPILER=clang++', `-DCMAKE_C_FLAGS=${nativeFlags}`, `-DCMAKE_CXX_FLAGS=${nativeFlags}`,
      ...(process.platform === 'darwin' ? [`-DCMAKE_OSX_ARCHITECTURES=${process.arch === 'x64' ? 'x86_64' : 'arm64'}`] : [])], { timeout: 120000, maxBuffer: 2_000_000 });
    // Cold clang builds exceed two minutes on the two-core Linux runner.
    // Ring 2 prepares this verified prerequisite; Ring 3 reuses its receipt.
    execFileSync('cmake', ['--build', build, '--target', 'basisu', '-j4'], { timeout: 300000, maxBuffer: 2_000_000 });
    const binary = hashImmutableBytes(readBoundedFile(resolve(source, 'bin/basisu'), 64_000_000));
    writeFileSync(resolve(temporary, 'receipt.json'), encodeCanonicalJson({ key, binary }));
    // Only the source, license and resulting executable are needed after compilation.
    rmSync(build, { recursive: true });
    try { renameSync(temporary, directory); }
    catch (error) { if (!(error instanceof Error && 'code' in error && ['EEXIST', 'ENOTEMPTY'].includes(String(error.code)))) throw error; }
    return verify();
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
