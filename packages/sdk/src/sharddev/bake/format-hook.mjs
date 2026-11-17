// SDK-SPLIT SP8c: the sdk's own copy of the engine's J82 hook (engine scripts/format-hook.mjs), so the sdk loads no engine
// module; byte for byte below this header. It imports nothing of ours.
// J82: Node refuses to strip types under node_modules, and @wildshard/format ships raw .ts from the shardfile repo (J42).
// This strips our own packages there and nothing else. A script takes it with `--import`, through a loader that imports
// it, or by importing it first and reaching format with `await import()`: a static import links before this module runs.
// oxlint-disable-next-line import/no-nodejs-modules -- a Node module hook registers its loader.
import { createRequire, registerHooks, stripTypeScriptTypes } from 'node:module';
// oxlint-disable-next-line import/no-nodejs-modules -- the hook reads the package source it strips.
import { readFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- module URLs map to files.
import { fileURLToPath } from 'node:url';
// oxlint-disable-next-line import/no-nodejs-modules -- it restores the warning emitter it borrows.
import process from 'node:process';

const OURS = /\/node_modules\/@wildshard\/[^/]+\/.+\.ts$/u;
// Node warns once on first use. Tools read stderr, so take that warning here and leave every later one alone.
// oxlint-disable-next-line typescript/unbound-method -- Held only to put back on the same object.
const { emitWarning } = process;
process.emitWarning = () => undefined;
let nativeTransform = true;
try { stripTypeScriptTypes('', { mode: 'transform' }); }
catch (error) {
  if (!(error instanceof TypeError) || !('code' in error) || error.code !== 'ERR_INVALID_ARG_VALUE') throw error;
  nativeTransform = false; // Node 26 removed transform mode; installed packages still use enums/parameter properties.
} finally { process.emitWarning = emitWarning; }
const require = createRequire(import.meta.url);
let compiler;
/** @param {string} source */
function transform(source) {
  if (nativeTransform) return stripTypeScriptTypes(source, { mode: 'transform' });
  compiler ??= require('@typescript/typescript6');
  return compiler.transpileModule(source, { compilerOptions: { target: compiler.ScriptTarget.ESNext, module: compiler.ModuleKind.ESNext, verbatimModuleSyntax: true } }).outputText;
}

registerHooks({ load(url, context, next) {
  if (!url.startsWith('file:') || !OURS.test(url)) return next(url, context);
  return { format: 'module', source: transform(readFileSync(fileURLToPath(url), 'utf8')), shortCircuit: true };
} });
