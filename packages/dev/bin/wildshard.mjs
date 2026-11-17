#!/usr/bin/env node
// `wildshard`: the author commands run through scripts/wildshard.mjs, which bundles the CLI once; pack, upload and serve are
// this repo's own, and so is `build <folder>` (SA3): a built shard file folder needs no author bundle, only its shard file.
// Node strips no types under node_modules, so J82's hook goes first and every import below it is dynamic.
import '@wildshard/sdk/internal/threeGate';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import '@wildshard/sdk/internal/bake/format-hook';
import { homedir } from 'node:os';
// SP-NE1: an install that landed in the home folder (no package.json here) says so before any verb runs.
const { homeInstallWarning } = await import('../src/cli/install-home.ts');
const homeWarning = homeInstallWarning({ sdk: resolve(import.meta.dirname, '..'), cwd: process.cwd(), home: homedir() });
if (homeWarning !== undefined) process.stderr.write(homeWarning);

const AUTHOR = new Set(['new', 'update', 'check', 'synth', 'build', 'validate', 'prove', 'dev', 'watch', 'schema', '--prepare-compiler']);
const [command, operand] = process.argv.slice(2);
// SA2: `wildshard <verb> --help` and `wildshard help [verb]` print help (src/cli/help.ts) before any verb runs.
const verbHelp = command === 'help' || (command !== undefined && !command.startsWith('-') && process.argv.slice(3).some(arg => arg === '--help' || arg === '-h'));
const builtFolder = command === 'build' && operand !== undefined && !operand.startsWith('--')
  && existsSync(resolve(operand, 'shard.json')) && !existsSync(resolve(operand, 'shard.config.ts'));
if (verbHelp) {
  const help = await import('../src/cli/help.ts');
  const verb = command === 'help' ? operand : command;
  const text = verb === undefined ? help.USAGE : help.verbHelp(verb);
  if (text === undefined) { process.stderr.write(`wildshard: unknown command ${verb}\n\n${help.USAGE}`); process.exitCode = 1; }
  else process.stdout.write(text);
} else if (command === 'prove' && /\.m?js$/u.test(process.argv[4] ?? '')) {
  // F27: a walk proof (a script, not a tape) plays the shard on a `wildshard dev` page in headless Chromium.
  const script = resolve(import.meta.dirname, '../scripts/prove-walk.mjs');
  process.argv.splice(1, 2, script);
  await import(pathToFileURL(script).href);
} else if (AUTHOR.has(command) && !builtFolder) {
  const script = resolve(import.meta.dirname, '../scripts/wildshard.mjs');
  process.argv[1] = script;
  await import(pathToFileURL(script).href);
} else if (command === 'prepare') {
  const script = resolve(import.meta.dirname, '../scripts/prepare-product.mjs');
  process.argv.splice(1, 2, script);
  await import(pathToFileURL(script).href);
} else if (command === 'hero') {
  const script = resolve(import.meta.dirname, '../scripts/capture-hero.mjs');
  process.argv.splice(1, 2, script);
  await import(pathToFileURL(script).href);
} else if (command === 'build-shards') {
  const script = resolve(import.meta.dirname, '../scripts/build-shardfiles.mjs');
  process.argv.splice(1, 2, script);
  await import(pathToFileURL(script).href);
} else if (command === 'grid') {
  const script = resolve(import.meta.dirname, '../src/cli/grid/command.ts');
  process.argv.splice(1, 2, script);
  await import(pathToFileURL(script).href);
} else if (command === 'content') {
  const script = resolve(import.meta.dirname, '../src/cli/content-command.ts');
  process.argv.splice(1, 2, script);
  await import(pathToFileURL(script).href);
} else await import('../src/cli/main.ts');
