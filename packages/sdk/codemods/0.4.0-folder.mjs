// SHARD-SOURCE SA25b: engine SA25 took `product` out of its exports (J317). This codemod moves a shard repo's imports of
// the renamed engine modules and names onto the new ones. `update --pins` runs it (see 0.2.5.mjs for the hook's shape).
// It is named 0.4.0-folder, a prerelease of 0.4.0, so a move to 0.4.0 runs it just before 0.4.0.mjs.
// Only files that import from `@wildshard/engine` change, and only the names each file imports from it.
/* oxlint-disable node/no-sync, import/no-nodejs-modules -- A codemod is a one-shot synchronous edit of the shard repo on disk. */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Old engine module specifier to new (engine SA25a, plan/ss16q). @type {Readonly<Record<string, string>>} */
const MODULES = {
  '@wildshard/engine/game/population/productCreatures': '@wildshard/engine/game/population/folderCreatures',
  '@wildshard/engine/game/shardfile/productData': '@wildshard/engine/game/shardfile/folderData',
  '@wildshard/engine/game/shardfile/runtimeProduct': '@wildshard/engine/game/shardfile/runtimeFolder',
  '@wildshard/engine/game/shardfile/shardProduct': '@wildshard/engine/game/shardfile/shardFolder',
  '@wildshard/engine/game/shardfile/product': '@wildshard/engine/game/shardfile/folder',
  '@wildshard/engine/host/headlessProduct': '@wildshard/engine/host/headlessFolder',
  '@wildshard/engine/scripts/app-build/outputProducts.mjs': '@wildshard/engine/scripts/app-build/outputFolders.mjs',
  '@wildshard/engine/scripts/built-product.mjs': '@wildshard/engine/scripts/built-folder.mjs',
  '@wildshard/engine/scripts/product-build-times.mjs': '@wildshard/engine/scripts/folder-build-times.mjs',
  '@wildshard/engine/test/builtProduct': '@wildshard/engine/test/builtFolder',
  '@wildshard/engine/test/headless/productSession': '@wildshard/engine/test/headless/folderSession',
};
/** Old exported name to new, each one a consumer imports today. @type {Readonly<Record<string, string>>} */
const NAMES = {
  ProductError: 'FolderError', ProductFile: 'FolderFile', ProductOptions: 'FolderOptions', ShardProduct: 'ShardFolder',
  ShardProductInput: 'ShardFolderInput', absentShardProduct: 'absentShardFolder', admitProduct: 'admitFolder',
  captureProductInputs: 'captureFolderInputs', copyOutputProducts: 'copyOutputFolders', createShardProduct: 'createShardFolder',
  loadCookedProduct: 'loadCookedFolder', loadHeadlessProduct: 'loadHeadlessFolder', matchingProductInputKey: 'matchingFolderInputKey',
  orderProductBuilds: 'orderFolderBuilds', prepareProductRuntimePlan: 'prepareFolderRuntimePlan', productAudioInventory: 'folderAudioInventory',
  productFixedDraws: 'folderFixedDraws', productFlags: 'folderFlags', productHeadlessSections: 'folderHeadlessSections',
  productInputKey: 'folderInputKey', productManifestPath: 'folderManifestPath', productMapInput: 'folderMapInput',
  productRecipe: 'folderRecipe', productSpeciesCatalogue: 'folderSpeciesCatalogue', productToolchainKey: 'folderToolchainKey',
  productVerdict: 'folderVerdict', programDiscoveryProducts: 'programDiscoveryFolders', provideRuntimeProduct: 'provideRuntimeFolder',
  publishProductInputs: 'publishFolderInputs', publishProductMap: 'publishFolderMap', readProductBuildTimes: 'readFolderBuildTimes',
  readProductDescriptor: 'readFolderDescriptor', recordProductBuildTimes: 'recordFolderBuildTimes', replayProductInputs: 'replayFolderInputs',
  representativeProduct: 'representativeFolder', retainProductInputs: 'retainFolderInputs', shardProductData: 'shardFolderData',
  shardProducts: 'builtShardFolders', builtProduct: 'builtFolder',
};

const SKIP = new Set(['.git', '.worktrees', 'dist', 'node_modules', 'out', 'public', 'tmp']);
const SOURCE = /\.(?:ts|tsx|mts|cts|mjs|js)$/u;
const IMPORTED = /(?:import\s*(?:type\s*)?\{(?<statics>[^}]*)\}\s*from\s*|\{(?<dynamics>[^}]*)\}\s*=\s*await\s+import\(\s*)(?<quote>['"])(?<module>@wildshard\/engine\/[^'"]+)\k<quote>/gu;
/** @param {string} text */
const escape = text => text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);

/** The renamed names a file imports from the engine. @param {string} text @returns {Set<string>} */
function importedNames(text) {
  /** @type {Set<string>} */
  const names = new Set();
  for (const { groups } of text.matchAll(IMPORTED)) {
    for (const part of (groups?.statics ?? groups?.dynamics ?? '').split(',')) {
      const [name = ''] = part.trim().replace(/^type\s+/u, '').split(/\s+as\s+|\s*:\s*/u);
      if (Object.hasOwn(NAMES, name)) { names.add(name); }
    }
  }
  return names;
}

/** One file's text moved onto the new names, or the same text when it imports nothing renamed.
 * @param {string} text @returns {string} */
function moveSource(text) {
  let out = text;
  for (const [from, to] of Object.entries(MODULES)) {
    out = out.replaceAll(new RegExp(`(?<quote>['"\`])${escape(from)}(?=['"\`])`, 'gu'), `$<quote>${to}`);
  }
  for (const name of importedNames(text)) {
    out = out.replaceAll(new RegExp(`(?<![\\w$])${escape(name)}(?![\\w$])`, 'gu'), NAMES[name] ?? name);
  }
  return out;
}

/** Every source file under `folder`, outside installs, builds and scratch. @param {string} folder @returns {string[]} */
function sources(folder) {
  /** @type {string[]} */
  const found = [];
  for (const { name } of readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, name);
    const skipped = SKIP.has(name);
    if (!skipped && statSync(file).isDirectory()) { found.push(...sources(file)); }
    else if (!skipped && SOURCE.test(name)) { found.push(file); }
  }
  return found;
}

/** @param {Readonly<{ project: string, from: string, to: string }>} move @returns {string[]} */
// oxlint-disable-next-line import/no-default-export -- `update --pins` loads each codemod by its default export.
export default function codemod(move) {
  /** @type {string[]} */
  const changed = [];
  for (const file of sources(move.project)) {
    const before = readFileSync(file, 'utf8');
    const after = before.includes('@wildshard/engine/') ? moveSource(before) : before;
    if (after !== before) {
      writeFileSync(file, after);
      changed.push(`${path.relative(move.project, file)}: engine product names are folder names (SA25)`);
    }
  }
  return changed;
}

export { moveSource };
