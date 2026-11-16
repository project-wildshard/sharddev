// Engine's lint plugin as the SDK's authoring lint loads it (`.oxlintrc.author.json`). SHARD-AUTHORING SA7a (J154,
// J317) named this package `@wildshard/sdk`, but engine's `public-index` still reads `@wildshard/sdk/<sub>` as engine's
// old host layer and looks for `./host/<sub>` in engine's own exports. Until engine's plugin learns the new name, this
// wrapper drops that one report when `./<sub>` is a real export of the installed SDK; every other rule and report is
// engine's, unchanged.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Engine exports no `./lint` path; the config always loaded this file from the working directory's node_modules.
const { default: engine } = await import(pathToFileURL(resolve(process.cwd(), 'node_modules/@wildshard/engine/lint/wildshard-plugin.js')).href);

const SDK_IMPORT = /^Cross-layer imports use the public index: @wildshard\/sdk\/(.+)$/u;
let exports;
/** `./<sub>` is listed in the installed SDK's package.json `exports` (here, the repo's own, linked by pnpm). */
function sdkExports(sub) {
  if (exports === undefined) {
    const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'node_modules/@wildshard/sdk/package.json'), 'utf8'));
    exports = new Set(Object.keys(manifest.exports ?? {}));
  }
  return exports.has(`./${sub}`);
}

const publicIndex = engine.rules['public-index'];
const wrapped = {
  ...publicIndex,
  create(context) {
    const report = (descriptor) => {
      const match = SDK_IMPORT.exec(descriptor.message ?? '');
      if (match !== null && sdkExports(match[1])) return;
      context.report(descriptor);
    };
    // oxlint freezes its context, so the view is a proxy over an empty object that reads everything else from it.
    const view = new Proxy({}, { get: (_view, key) => key === 'report' ? report : Reflect.get(context, key, context), has: (_view, key) => key in context });
    return publicIndex.create(view);
  },
};

// J366 restores kit as a public content package. Validate its actual export map
// before accepting its name; unknown subpaths must still refuse.
function kitExports(source) {
  if (!source.startsWith('@wildshard/kit/')) return false;
  const sub = `.${source.slice('@wildshard/kit'.length)}`;
  const root = resolve(process.cwd(), 'node_modules/@wildshard/kit');
  if (sub.includes('..') || !existsSync(resolve(root, 'package.json'))) return false;
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  return Object.entries(manifest.exports).some(([key, target]) => {
    if (typeof target !== 'string') return false;
    const [prefix, suffix] = key.split('*');
    if (suffix === undefined) return key === sub && existsSync(resolve(root, target));
    if (!sub.startsWith(prefix) || !sub.endsWith(suffix)) return false;
    const match = sub.slice(prefix.length, suffix.length === 0 ? undefined : -suffix.length);
    return existsSync(resolve(root, target.replace('*', match)));
  });
}
const layer = engine.rules.layer;
const kitLayer = {
  ...layer,
  create(context) {
    const report = descriptor => {
      const match = /^No such layer package: (.+)$/u.exec(descriptor.message ?? '');
      if (match !== null && kitExports(match[1])) return;
      context.report(descriptor);
    };
    const view = new Proxy({}, { get: (_view, key) => key === 'report' ? report : Reflect.get(context, key, context), has: (_view, key) => key in context });
    return layer.create(view);
  },
};
const plugin = { ...engine, rules: { ...engine.rules, 'public-index': wrapped, layer: kitLayer } };
export default plugin; // oxlint loads a JS plugin from its default export
