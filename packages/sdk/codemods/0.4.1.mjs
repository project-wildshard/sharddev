// SDK-SPLIT SP13: a shard repo moves onto the split packages (meta docs/plans/SDK-SPLIT-PLAN.md, Q36). `update --pins`
// runs it after 0.4.0's kit move (see 0.2.5.mjs for the hook's shape).
// - The modules that left the sdk move to their new homes: the watch page, the script scenario, the map rest, the native raster, the boot
//   inventory and every `scripts/` file the sdk no longer ships to @wildshard/dev, the project builder and synth to
//   @wildshard/build; the repo pins each home it now imports.
// - The repo pins @wildshard/cli (the `wildshard` command) beside the sdk, at the release version (D5); a file that runs
//   the `wildshard` bin resolves it from the cli, and the author lint config loads the sdk's engine plugin.
// - The engine is no longer the repo's to pin for the build: a repo whose code imports it (sim tests) keeps it as a dev
//   dependency at the engine the release's dev runs; a repo that never imports it drops the pin and its override.
/* oxlint-disable node/no-sync, import/no-nodejs-modules -- A codemod is a one-shot synchronous edit of the shard repo on disk. */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const SKIP = new Set(['.git', '.worktrees', 'node_modules', 'tmp', 'out', 'dist', 'build', 'public']);
const HOMES = new Map([['bake/mapRest', 'dev'], ['watch/watch', 'dev'], ['watch/page', 'dev'], ['test/scriptScenario', 'dev'],
  ['bootInventory', 'dev'], ['bake/nativeRaster', 'dev'], ['project', 'build'], ['synth', 'build']]);
/** The sdk's own folder: a `scripts/` path the installed sdk no longer has moved to dev's `scripts/` (SP8). */
const SDK_ROOT = new URL('../', import.meta.url);
const LITERAL = /(["'`])@wildshard\/(?:sdk|sharddev)\/([^"'`\s]+)\1/gu;
const ENGINE = /["'`]@wildshard\/engine(?:\/[^"'`\s]*)?["'`]/u;
const VERSION = /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/u;
const FIELDS = ['dependencies', 'devDependencies'];

/** Module literals only: each moved sdk module becomes the same path under its new package. */
export function rewriteSplitImports(source) {
  return source.replaceAll(LITERAL, (whole, quote, path) => {
    const query = path.indexOf('?'), subpath = query === -1 ? path : path.slice(0, query);
    if (subpath.startsWith('scripts/') && !existsSync(new URL(subpath, SDK_ROOT))) return `${quote}@wildshard/dev/${path}${quote}`;
    const home = HOMES.get(subpath);
    return home === undefined ? whole : `${quote}@wildshard/${home}/${path}${quote}`;
  });
}

/** SDK-SPLIT SP13: the `wildshard` bin is the cli's (the sdk has none since 0.4.0); each shard's CI tests that run it
 * resolved it from the sdk's package. Only a file that runs `bin/wildshard.mjs` changes. */
const SDK_PACKAGE = /(["'`])@wildshard\/(?:sdk|sharddev)\/package\.json\1/gu;
export function rewriteCliBin(source) {
  return source.includes('bin/wildshard.mjs') ? source.replaceAll(SDK_PACKAGE, (_whole, quote) => `${quote}@wildshard/cli/package.json${quote}`) : source;
}

/** The engine the release's dev runs: the sdk pins the same one as its dev dependency (test/dev-engine-pin). */
function devEngine() {
  const sdk = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const engine = sdk.devDependencies?.['@wildshard/engine'];
  if (typeof engine !== 'string' || !VERSION.test(engine)) throw new Error('the installed sdk names no engine for dev');
  return engine;
}

// oxlint-disable-next-line import/no-default-export -- update --pins loads release codemods by their default export.
export default function codemod({ project, to }) {
  if (!VERSION.test(to)) throw new Error('The split migration needs the installed SDK version');
  const root = resolve(project), changes = [], homes = new Set();
  let usesEngine = false;
  const visit = folder => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || SKIP.has(entry.name)) continue;
      const file = join(folder, entry.name);
      if (entry.isDirectory()) { visit(file); continue; }
      if (!entry.isFile() || !/\.(?:[cm]?[jt]sx?)$/u.test(entry.name)) continue;
      const before = readFileSync(file, 'utf8'), after = rewriteCliBin(rewriteSplitImports(before));
      for (const home of ['dev', 'build']) if (after.includes(`@wildshard/${home}/`)) homes.add(home);
      if (ENGINE.test(after)) usesEngine = true;
      if (before === after) continue;
      writeFileSync(file, after);
      changes.push(`${relative(root, file)}: import moved sdk modules from their new packages`);
    }
  };
  visit(root);
  // The repo's author lint config loaded engine's plugin itself, so the sdk's layer rule (which knows build and dev) never
  // ran and every moved import was refused; it loads the sdk's wrapper of it, as `new` writes it.
  const sdkName = (() => {
    try {
      const listed = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
      return ['@wildshard/sharddev', '@wildshard/sdk'].find(name => FIELDS.some(field => listed[field]?.[name] !== undefined));
    } catch { return undefined; }
  })();
  for (const name of ['.oxlintrc.author.json', '.oxlintrc.json']) {
    const config = join(root, name);
    if (sdkName === undefined || !existsSync(config)) continue;
    const before = readFileSync(config, 'utf8');
    const after = before.replaceAll(/(?:\.\/)?node_modules\/@wildshard\/engine\/lint\/wildshard-plugin\.js/gu, `./node_modules/${sdkName}/lint/engine-plugin.mjs`);
    if (before === after) continue;
    writeFileSync(config, after);
    changes.push(`${name}: lint with the sdk's engine plugin`);
  }
  const file = join(root, 'package.json');
  if (!existsSync(file)) return changes;
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  const field = FIELDS.find(name => ['@wildshard/sdk', '@wildshard/sharddev'].some(sdk => pkg[name]?.[sdk] !== undefined)) ?? 'devDependencies';
  // The sdk pin update --pins just moved names the release; the split packages share its version (D5).
  const sdkSpec = ['@wildshard/sdk', '@wildshard/sharddev'].map(name => pkg[field]?.[name]).find(spec => typeof spec === 'string') ?? '';
  const release = /^(?:npm:@wildshard\/sdk@)?(\d+\.\d+\.\d+(?:-[\w.-]+)?)$/u.exec(sdkSpec)?.[1] ?? to;
  /** Pin `name` beside the sdk unless the repo lists it already (update --pins moves a listed one with the sdk). */
  const pin = name => {
    if (FIELDS.some(other => pkg[other]?.[name] !== undefined)) return;
    pkg[field] = { ...pkg[field], [name]: release };
    changes.push(`package.json: pin ${name} ${release}`);
  };
  pin('@wildshard/cli');
  for (const home of homes) pin(`@wildshard/${home}`);
  const overrides = pkg.pnpm?.overrides;
  const listed = FIELDS.filter(name => pkg[name]?.['@wildshard/engine'] !== undefined);
  if (usesEngine) {
    const engine = devEngine();
    const done = listed.length === 1 && listed[0] === 'devDependencies' && pkg.devDependencies['@wildshard/engine'] === engine
      && [undefined, engine].includes(overrides?.['@wildshard/engine']);
    if (!done) {
      for (const name of listed) delete pkg[name]['@wildshard/engine'];
      pkg.devDependencies = { ...pkg.devDependencies, '@wildshard/engine': engine };
      if (overrides?.['@wildshard/engine'] !== undefined) overrides['@wildshard/engine'] = engine;
      changes.push(`package.json: the engine is a dev dependency at dev's ${engine} (sim tests import it)`);
    }
  } else if (listed.length > 0 || overrides?.['@wildshard/engine'] !== undefined) {
    for (const name of listed) delete pkg[name]['@wildshard/engine'];
    if (overrides !== undefined) delete overrides['@wildshard/engine'];
    changes.push('package.json: drop the engine pin (nothing imports it; the cli brings it)');
  }
  // Only a run that changed a pin rewrites package.json, so a no-op run leaves its bytes (and the lock) alone.
  if (changes.some(line => line.startsWith('package.json: '))) {
    const indent = /^\{\r?\n([ \t]+)"/u.exec(readFileSync(file, 'utf8'))?.[1] ?? 2;
    writeFileSync(file, `${JSON.stringify(pkg, null, indent)}\n`);
  }
  return changes;
}
