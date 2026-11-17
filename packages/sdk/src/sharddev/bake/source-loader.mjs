// Node authoring resolution only: no app identity, service installers, simulation bindings or browser shims.
import '@wildshard/engine/scripts/format-hook.mjs';
// oxlint-disable-next-line import/no-nodejs-modules -- The authoring CLI installs only Node source resolution.
import { registerHooks } from 'node:module';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve regular files in the isolated authoring tree.
import { existsSync, statSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Confine recipe imports to their source tree.
import { relative, resolve, sep } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- Inspect resolved module URLs before loading source.
import { fileURLToPath } from 'node:url';
// oxlint-disable-next-line import/no-nodejs-modules -- The generator argument identifies its single shard owner.
import process from 'node:process';

const root = process.cwd(); // P4: the shard repo. A tool in an installed package passes the /node_modules/ rule below.
// Node normalises the script argument to an absolute path before preloads run.
const script = process.argv.at(1);
const driver = script === undefined ? '' : relative(root, resolve(script)).split(sep).join('/');
// Confined SDK drivers name their source explicitly; direct producers own their script path.
const source = /src\/sharddev\/bake\/(?:navigation-)?json\.mjs$/u.test(driver) ? process.argv.at(2) : script;
const candidate = source === undefined ? '' : relative(root, resolve(source)).split(sep).join('/');
const entry = /^src\/shards\/[^/]+\/generators\//u.test(candidate) ? candidate : undefined;
const shard = entry?.split('/')[2];
if (shard === undefined) throw new Error('Authoring loader requires an explicit shard-owned generator');
const folders = new Set(['generators', 'data', 'quests', 'blender', 'assets', 'behaviour']);

/** Refuse even computed imports into trusted code after Node resolves workspace links. @param {string} url */
function authoringOnly(url) {
  if (!url.startsWith('file:')) return;
  const file = relative(root, fileURLToPath(url)).split(sep).join('/');
  if (file.startsWith('../') && !file.includes('/node_modules/')) throw new Error(`Authoring dependency escapes the source tree: ${file}`);
  if (!file.startsWith('src/')) return; // Node and installed third-party dependencies are build infrastructure.
  const parts = file.split('/'), layer = parts[1];
  if (parts.includes('runtime') || parts.some(part => part.endsWith('-legacy')) ||
      (layer === 'shards' ? parts[2] !== shard || !folders.has(parts[3]) : !['sdk', 'sharddev', 'commons', 'format'].includes(layer))) {
    throw new Error(`Non-authoring dependency refused: ${file}`);
  }
}

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      const base = new URL(specifier, context.parentURL);
      for (const suffix of ['', '.ts', '.mjs', '.js']) {
        const url = new URL(base.href + suffix);
        if (existsSync(fileURLToPath(url)) && statSync(fileURLToPath(url)).isFile()) {
          authoringOnly(url.href);
          return { url: url.href, shortCircuit: true };
        }
      }
    }
    const result = next(specifier, context);
    authoringOnly(result.url);
    return result;
  },
});
