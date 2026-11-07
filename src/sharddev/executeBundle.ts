// oxlint-disable-next-line import/no-nodejs-modules -- Trusted author execution owns and removes only its temporary module directory.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
// oxlint-disable-next-line import/no-nodejs-modules -- Keep execution scratch in the source workspace tmp, outside authored trees.
import { dirname, resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- Locate the enclosing source workspace without writing under src.
import { existsSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Native ESM loads the original UTF-8 source as a file.
import { pathToFileURL } from 'node:url';
// oxlint-disable-next-line import/no-nodejs-modules -- Preserve native ESM's previous content-addressed namespace identity.
import { createHash } from 'node:crypto';
// oxlint-disable-next-line import/no-nodejs-modules -- Pin trusted bundle execution to Node ESM rather than a transforming test host.
import { Script, constants } from 'node:vm';

// A data URL was the same ESM identity for the same source, including rejected
// evaluations. Keep that identity without retaining its 4/3-sized encoded URL.
const namespaces = new Map<string, Promise<unknown>>();

/** Execute one trusted single-chunk build bundle. Its non-builtin imports must
 * already be absolute, as for the previous data URL. The caller validates that
 * boundary and retains source/input receipts. Only this module's own scratch
 * is removed, after top-level await settles; exported closures remain usable. */
export function executeBundle(source: string, project: string): Promise<unknown> {
  const key = createHash('sha256').update(source, 'utf8').digest('hex');
  const present = namespaces.get(key);
  if (present !== undefined) return present;
  const pending = load(source, project);
  namespaces.set(key, pending);
  return pending;
}

async function load(source: string, project: string): Promise<unknown> {
  let root = resolve(project);
  for (let parent = root; ; parent = dirname(parent)) {
    if (existsSync(resolve(parent, '.git'))) { root = parent; break; }
    if (dirname(parent) === parent) break;
  }
  const scratch = resolve(root, 'tmp', 'sdk-execution');
  await mkdir(scratch, { recursive: true });
  const directory = await mkdtemp(resolve(scratch, 'module-'));
  try {
    const file = resolve(directory, 'bundle.mjs');
    await writeFile(file, source, 'utf8');
    // A host runner can rewrite import() and transform this multi-megabyte
    // bundle a second time. Only the tiny import expression is compiled here;
    // Node's native ESM loader evaluates the original file, just as the former
    // data URL did. Never evaluate the bundle as a script or change its code.
    const loader = new Script(`import(${JSON.stringify(pathToFileURL(file).href)})`, {
      filename: file, importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
    });
    const loaded: unknown = loader.runInThisContext();
    return await loaded;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
