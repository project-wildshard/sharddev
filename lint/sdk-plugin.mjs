// The SDK's own authoring lint rules, loaded beside engine's plugin by `.oxlintrc.author.json` (here as
// `./lint/sdk-plugin.mjs`, in a shard repo from `node_modules/@wildshard/sdk/lint/sdk-plugin.mjs`, or the old
// `@wildshard/sharddev` folder until SHARD-COMPAT SA7b).
// SHARD-AUTHORING SA6: `generator-imports` moved here from engine's plugin so the rule an author runs comes with the SDK
// pin, not the engine pin.
// SHARD-AUTHORING SA38 (J319): generators are arbitrary Node code, so in `generators/` the rule is a denylist of
// Wildshard cheats (the engine, sdk paths outside its exports, another shard's source, a second three); any npm
// package, valibot and node:* pass. data/, quests/ and shard.config.ts keep the authoring allowlist, minus the engine.
import { readFileSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RULE = 'generator-imports';
// Not visible to a lint, left for later: `#` subpath imports and tsconfig `paths` aliases (they name no package), and
// `createRequire(...)(...)` calls.
// The authoring surface for data/, quests/ and shard.config.ts (DS0.3, J170): three; the SDK and commons; the shard
// format and valibot, the language the format's schemas are written in; and Node's built-ins.
const AUTHOR_PACKAGE = /^(?:three|valibot|@wildshard\/(?:format|shard-format|sdk|sharddev|commons))(?:\/|$)/u;
const SDK_PACKAGE = /^@wildshard\/(?:sdk|sharddev)(?:\/(.*))?$/u;
// Another shard's repo package (`@wildshard/shard-dunes`); the shard format is not a shard.
const SHARD_PACKAGE = /^@wildshard\/shard-(?!format(?:\/|$))[^/]+/u;

// The pinned sdk's public subpaths: the exports of the package.json this file ships in.
const SDK_EXPORTS = Object.keys(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).exports ?? {});
const sdkExports = (subpath) => SDK_EXPORTS.some((key) => {
  const star = key.indexOf('*');
  return star === -1 ? key === subpath
    : subpath.length >= key.length && subpath.startsWith(key.slice(0, star)) && subpath.endsWith(key.slice(star + 1));
});

const ENGINE = `${RULE}: shard source may not import @wildshard/engine (any subpath, host included); import the sdk or `
  + 'format export instead, e.g. @wildshard/sdk/immutable or @wildshard/format/shardSchema';
const secondThree = (source) => `${RULE}: ${source} loads a second copy of three beside the shard's peer three; `
  + "import from 'three' (or 'three/addons/...')";
const otherShard = (name) => `${RULE}: this import reaches into another shard's source (${name}); copy what the shard `
  + 'needs into its own folder, or ask for it in @wildshard/sdk';
const notExported = (source) => `${RULE}: ${source} is not in the sdk's package.json exports; import one of the `
  + 'listed exports (node_modules/@wildshard/sdk/package.json "exports")';

/** The Wildshard cheats, refused in every author folder: null when `source` is none of them. */
function cheat(source, local, required) {
  if (/^@wildshard\/engine(?:\/|$)/u.test(source)) return ENGINE;
  // three's ESM build is the one copy; its sources, its build files by name and a require() of three (the CJS build)
  // are each a second copy. Still open: an aliased three (`npm:three@x` under another name) and `three/webgpu`.
  if (/^three\/(?:src|build)(?:\/|$)/u.test(source) || (required && /^three(?:\/|$)/u.test(source))) return secondThree(source);
  const shard = SHARD_PACKAGE.exec(source);
  if (shard !== null) return otherShard(shard[0]);
  const sdk = SDK_PACKAGE.exec(source);
  if (sdk !== null) {
    if (/^runtime(?:\/|$)/u.test(sdk[1] ?? '')) {
      return `${RULE}: trusted SDK runtime code is not an authoring import; import an exported sdk subpath instead`;
    }
    if (/(?:^|\/)\.\.?(?:\/|$)/u.test(sdk[1] ?? '')) return notExported(source);
    return sdkExports(sdk[1] === undefined ? '.' : `./${sdk[1]}`) ? null : notExported(source);
  }
  // A path into installed packages: the part after the last node_modules names the package.
  const at = local.lastIndexOf('/node_modules/');
  const installed = at === -1 ? null : /^\/node_modules\/((?:@[^/]+\/)?[^/]+)/u.exec(local.slice(at))?.[1];
  if (installed === '@wildshard/engine') return ENGINE;
  if (installed === 'three') return secondThree(source);
  if (installed !== undefined && installed !== null && SHARD_PACKAGE.test(installed)) return otherShard(installed);
  // The sdk's own source, by path (this repo's src/sharddev, or an installed copy).
  if (installed === '@wildshard/sdk' || installed === '@wildshard/sharddev' || /\/src\/sharddev(?:\/|$)/u.test(local)) {
    return `${RULE}: ${source} reaches @wildshard/sdk files by path; import the package by name through one of its `
      + 'package.json exports';
  }
  return null;
}

const plainly = (source) => `${RULE}: ${JSON.stringify(source)} names one file to Node (a URL) and another to Vite; `
  + 'no percent-escape, backslash, tab, newline or edge space in an import path, write the path plainly';
/** The file Node loads for relative `source` (a URL resolve), without a trailing slash; null when it cannot. */
const nodePath = (filename, source) => {
  try {
    return fileURLToPath(new URL(source, pathToFileURL(resolve(filename)))).replaceAll('\\', '/').replace(/(?<=.)\/$/u, '');
  } catch { return null; }
};

/** Why `source` may not be imported from `filename` under a shard's author folders, or null when it may. */
export function generatorImportViolation(filename, rawSource, required = false) {
  // The last src/shards/ in the path names the shard, so a checkout under some other src/shards/ still matches.
  const path = resolve(filename).replaceAll('\\', '/'), match = /^.*\/src\/shards\/([^/]+)\/(.+)$/u.exec(path);
  if (match === null || !(/^(?:generators|data|quests)\//u.test(match[2]) || match[2] === 'shard.config.ts')) return null;
  if (typeof rawSource !== 'string') return null;
  // Vite resolves the path before the first `?` or `#` through the package exports and keeps the rest (`?raw`, `?url`,
  // `?worker&inline`) as a postfix, as engine's import rules read it; a leading `#` is a subpath import, not a postfix.
  // Node keeps a bare specifier's `?` in the subpath, so there the stripped path is only ever the stricter read.
  const postfix = rawSource.slice(1).search(/[?#]/u) + 1;
  const bare = postfix > 0 ? rawSource.slice(0, postfix) : rawSource;
  // Node resolves a relative path as a URL (`./%2e%2e/` is `..`, `\\` is `/`, tabs and newlines drop out, `%2f` is
  // refused) and Vite decodes nothing, while path.resolve keeps them all as folder names: the lint and build disagree.
  if (/%[0-9a-f]{2}|[\\\t\n\r]/iu.test(bare)) return plainly(bare);
  let source = bare;
  if (bare.startsWith('file:')) {
    try { source = fileURLToPath(bare); } catch { return `${RULE}: ${bare} is not a local file: URL; import a relative path`; }
  }
  if (source === '<computed>') return `${RULE}: author imports require a literal module path; write the path as a string`;
  const root = path.slice(0, path.length - match[2].length);
  const local = source.startsWith('.') || isAbsolute(source) ? resolve(dirname(filename), source).replaceAll('\\', '/') : '';
  // The catch-all for a rewrite not listed above: the path must name the same file as a URL (how Node loads it).
  if (local !== '' && source.startsWith('.') && nodePath(filename, source) !== local) return plainly(bare);
  const denied = cheat(source, local, required);
  if (denied !== null) return denied;
  const own = local !== '' && local.startsWith(root);
  const other = local === '' || own ? null : /^.*\/src\/shards\/([^/]+)\//u.exec(local);
  if (other) return otherShard(other[1]);
  if (match[2].startsWith('generators/')) return null;
  // Test runners and Node fixture tools never become producer imports.
  if (path.endsWith('.test.ts') && local === '' && !source.startsWith('@wildshard/')) return null;
  if (own || AUTHOR_PACKAGE.test(source) || isBuiltin(source)) return null;
  return `${RULE}: data, quests and shard.config.ts import only three, the sdk, commons, the shard format, valibot, `
    + 'node:* or their own shard files; move this import into generators/';
}

const unwrap = (node) => {
  let x = node;
  while (x && ['ChainExpression', 'TSNonNullExpression', 'TSAsExpression', 'TSSatisfiesExpression', 'ParenthesizedExpression'].includes(x.type)) x = x.expression;
  return x;
};
// A template literal or a '+' chain resolves by its leading string; anything else is not a literal path.
const importPrefix = (node) => {
  const x = unwrap(node);
  if (x?.type === 'BinaryExpression' && x.operator === '+') return importPrefix(x.left);
  if (x?.type === 'Literal' && typeof x.value === 'string') return x.value;
  return x?.type === 'TemplateLiteral' ? x.quasis[0]?.value.cooked ?? null : null;
};
const computedSpecifier = (node) => {
  const x = unwrap(node);
  return (x?.type === 'TemplateLiteral' && x.expressions.length > 0) || (x?.type === 'BinaryExpression' && x.operator === '+');
};

const generatorImports = {
  meta: { type: 'problem', docs: { description: 'Generators import anything but Wildshard cheats (J319); data and quests stay on the authoring surface (DS0.3, J170)' }, schema: [] },
  create(context) {
    const check = (node, specifier, required = false) => {
      const prefix = importPrefix(specifier), source = computedSpecifier(specifier) || prefix === null ? '<computed>' : prefix;
      const reason = generatorImportViolation(context.filename, source, required);
      if (reason !== null) context.report({ node, message: `${reason} (import: ${source})` });
    };
    return {
      ImportDeclaration(node) { check(node, node.source); },
      ExportNamedDeclaration(node) { if (node.source) check(node, node.source); },
      ExportAllDeclaration(node) { check(node, node.source); },
      ImportExpression(node) { check(node, node.source); },
      TSImportType(node) { check(node, node.source ?? node.argument); },
      TSExternalModuleReference(node) { check(node, node.expression); },
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'require') check(node, node.arguments[0], true);
      },
    };
  },
};

const plugin = { meta: { name: 'wildshard-sdk' }, rules: { 'generator-imports': generatorImports } };
export default plugin; // oxlint loads a JS plugin from its default export
