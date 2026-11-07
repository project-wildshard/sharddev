import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Execute one trusted, single-chunk Node bundle without a base64 copy.
 * All non-builtin imports must already be absolute. The loaded module remains
 * usable after its owned source file is removed, including absolute imports.
 * @param {string} source @returns {Promise<unknown>} */
export async function importBundle(source) {
  const scratch = resolve(process.cwd(), 'tmp'); // P4: never inside an installed package.
  await mkdir(scratch, { recursive: true });
  const directory = await mkdtemp(resolve(scratch, 'author-module-'));
  try {
    const file = resolve(directory, 'bundle.mjs');
    await writeFile(file, source, 'utf8');
    return await import(pathToFileURL(file).href);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
