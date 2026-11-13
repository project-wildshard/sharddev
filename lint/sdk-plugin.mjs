// The SDK's own authoring lint rules, loaded beside engine's plugin by `.oxlintrc.author.json` (here as
// `./lint/sdk-plugin.mjs`, in a shard repo from `node_modules/@wildshard/sdk/lint/sdk-plugin.mjs`, or the old
// `@wildshard/sharddev` folder until SHARD-COMPAT SA7b).
// SHARD-AUTHORING SA6: `generator-imports` moved here from engine's plugin so the rule an author runs comes with the SDK
// pin, not the engine pin.
import { isBuiltin } from 'node:module';
import { dirname, isAbsolute, resolve } from 'node:path';

// The authoring surface (DS0.3, J170): three; the SDK, commons and engine's host contract; the shard format and valibot,
// the language the format's schemas are written in; and Node's built-ins (J170: generators may use node:*).
const AUTHOR_PACKAGE = /^(?:three|valibot|@wildshard\/(?:format|shard-format|sdk|sharddev|commons|engine\/host))(?:\/|$)/u;

/** DS0.3 author folders import the authoring surface and their own shard files only. */
export function generatorImportViolation(filename, source) {
  const path = resolve(filename).replaceAll('\\', '/'), match = /(?:^|\/)src\/shards\/([^/]+)\/(.+)$/u.exec(path);
  if (match === null || !(/^(?:generators|data|quests)\//u.test(match[2]) || match[2] === 'shard.config.ts')) return null;
  if (typeof source !== 'string') return null;
  // Test runners and Node fixture tools never become producer imports.
  if (path.endsWith('.test.ts') && source !== '<computed>' && !source.startsWith('.')
    && !isAbsolute(source) && !source.startsWith('@wildshard/')) return null;
  if (/^@wildshard\/(?:sdk|sharddev)\/runtime(?:\/|$)/u.test(source)) return 'trusted SDK runtime code is not an authoring import';
  if (AUTHOR_PACKAGE.test(source) || (source !== '<computed>' && isBuiltin(source))) return null;
  const local = source.startsWith('.') ? resolve(dirname(filename), source).replaceAll('\\', '/') : '';
  if (local.startsWith(path.slice(0, path.length - match[2].length))) return null;
  return 'author folders import only three, the sdk, commons, the shard format, valibot, node:* or their own shard files';
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
  meta: { type: 'problem', docs: { description: 'Generator and data imports stay on the authoring surface (DS0.3, J170)' }, schema: [] },
  create(context) {
    const check = (node, specifier) => {
      const source = importPrefix(specifier), computed = computedSpecifier(specifier);
      const reason = (computed || source === null) && generatorImportViolation(context.filename, '<computed>') !== null
        ? 'author imports require a literal module path' : generatorImportViolation(context.filename, source);
      if (reason !== null) context.report({ node, message: `${reason}: ${source}` });
    };
    return {
      ImportDeclaration(node) { check(node, node.source); },
      ExportNamedDeclaration(node) { if (node.source) check(node, node.source); },
      ExportAllDeclaration(node) { check(node, node.source); },
      ImportExpression(node) { check(node, node.source); },
      TSImportType(node) { check(node, node.source ?? node.argument); },
      TSExternalModuleReference(node) { check(node, node.expression); },
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'require') check(node, node.arguments[0]);
      },
    };
  },
};

const plugin = { meta: { name: 'wildshard-sdk' }, rules: { 'generator-imports': generatorImports } };
export default plugin; // oxlint loads a JS plugin from its default export
