// SDK-SPLIT SP10: which program a `wildshard` invocation runs. Kept apart from the bin so tests can import it.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
/** @param {string} name @param {string} file @returns {string} `file` inside the installed package `name`. */
export const inPackage = (name, file) => resolve(dirname(require.resolve(`${name}/package.json`)), file);

/** @param {readonly string[]} args @returns {string | undefined} build's compiled bin, when this `build` is its to run. */
export function buildBin(args) {
  const [command, operand] = args;
  if (command !== 'build' || operand === undefined || operand.startsWith('-')) return undefined;
  if (args.some(arg => arg === '--help' || arg === '-h' || arg === '--behaviour-only' || arg.startsWith('--input-receipt='))) return undefined;
  // `build <folder>` of a built shard file folder (SA3) is dev's: it writes the shard file, no generators run.
  if (existsSync(resolve(operand, 'shard.json')) && !existsSync(resolve(operand, 'shard.config.ts'))) return undefined;
  const script = inPackage('@wildshard/build', 'dist/build.mjs');
  return existsSync(script) ? script : undefined;
}

/** @param {readonly string[]} args @returns {string} the script this invocation runs. */
export function route(args) {
  return buildBin(args) ?? inPackage('@wildshard/dev', 'bin/wildshard.mjs');
}
