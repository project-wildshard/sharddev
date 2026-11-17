// Engine's lint plugin as the SDK's authoring lint loads it (`.oxlintrc.author.json`). SHARD-AUTHORING SA7a (J154,
// J317) named this package `@wildshard/sdk`, but engine's `public-index` still reads `@wildshard/sdk/<sub>` as engine's
// old host layer and looks for `./host/<sub>` in engine's own exports. Until engine's plugin learns the new name, this
// wrapper drops that one report when `./<sub>` is a real export of the installed SDK; every other rule and report is
// engine's, unchanged.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** An installed package's folder: the working directory's node_modules first (a shard repo, the sdk package), else as
 * this file resolves it (sharddev's workspace root, which lints upload's and kit's author code: SDK-SPLIT SP2b). */
function installed(name) {
  const local = resolve(process.cwd(), 'node_modules', name);
  if (existsSync(local)) return local;
  try { return dirname(createRequire(import.meta.url).resolve(`${name}/package.json`)); }
  catch (error) {
    // SDK-SPLIT SP10: a shard repo pins @wildshard/cli, not the engine; the engine is dev's, which the cli brings.
    const cli = resolve(process.cwd(), 'node_modules/@wildshard/cli/package.json');
    if (!existsSync(cli)) throw error;
    const dev = createRequire(cli).resolve('@wildshard/dev/package.json');
    return dirname(createRequire(dev).resolve(`${name}/package.json`));
  }
}

// Engine exports no `./lint` path; the config always loaded this file from the working directory's node_modules.
const { default: engine } = await import(pathToFileURL(resolve(installed('@wildshard/engine'), 'lint/wildshard-plugin.js')).href);

const SDK_IMPORT = /^Cross-layer imports use the public index: @wildshard\/sdk\/(.+)$/u;
let exports;
/** `./<sub>` is listed in the installed SDK's package.json `exports` (here, the repo's own, linked by pnpm). */
function sdkExports(sub) {
  if (exports === undefined) {
    const manifest = JSON.parse(readFileSync(resolve(installed('@wildshard/sdk'), 'package.json'), 'utf8'));
    exports = new Set(Object.keys(manifest.exports ?? {}));
  }
  // SDK-SPLIT SP8c: @wildshard/dev reaches the sdk's tool scripts through its `./scripts/*` pattern export.
  return exports.has(`./${sub}`) || [...exports].some(key => {
    const [prefix, suffix] = key.split('*');
    return suffix !== undefined && `./${sub}`.startsWith(prefix) && `./${sub}`.endsWith(suffix) && `./${sub}`.length >= prefix.length + suffix.length;
  });
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

// J366 restores kit as a public content package, and SDK-SPLIT SP2b makes upload the sdk's workspace sibling. Validate
// the package's actual export map before accepting its name; unknown subpaths must still refuse.
// SP9c: @wildshard/build (project, synth) is dev's sibling too.
const LAYER_PACKAGES = ['@wildshard/kit', '@wildshard/upload', '@wildshard/build'];
function packageExports(source) {
  const name = LAYER_PACKAGES.find(candidate => source === candidate || source.startsWith(`${candidate}/`));
  if (name === undefined) return false;
  const sub = source === name ? '.' : `.${source.slice(name.length)}`;
  const root = installed(name);
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
      if (match !== null && packageExports(match[1])) return;
      context.report(descriptor);
    };
    const view = new Proxy({}, { get: (_view, key) => key === 'report' ? report : Reflect.get(context, key, context), has: (_view, key) => key in context });
    return layer.create(view);
  },
};
const plugin = { ...engine, rules: { ...engine.rules, 'public-index': wrapped, layer: kitLayer } };
export default plugin; // oxlint loads a JS plugin from its default export
