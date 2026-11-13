// Engine's lint plugin as the SDK's authoring lint loads it (`.oxlintrc.author.json`). SHARD-AUTHORING SA7a (J154,
// J317) named this package `@wildshard/sdk`, but engine's `public-index` still reads `@wildshard/sdk/<sub>` as engine's
// old host layer and looks for `./host/<sub>` in engine's own exports. Until engine's plugin learns the new name, this
// wrapper drops that one report when `./<sub>` is a real export of the installed SDK; every other rule and report is
// engine's, unchanged.
import { readFileSync } from 'node:fs';
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

const plugin = { ...engine, rules: { ...engine.rules, 'public-index': wrapped } };
export default plugin; // oxlint loads a JS plugin from its default export
