#!/usr/bin/env node
// `wildshard`: the author commands run through scripts/wildshard.mjs, which bundles the CLI once; pack, upload and serve are
// this repo's own, and so is `build <folder>` (SA3): a built shard file folder needs no author bundle, only its shard file.
// Node strips no types under node_modules, so J82's hook goes first and every import below it is dynamic.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import '../src/sharddev/bake/format-hook.mjs';

const AUTHOR = new Set(['new', 'check', 'synth', 'build', 'validate', 'prove', 'dev', 'schema', '--prepare-compiler']);
const [command, operand] = process.argv.slice(2);
const builtFolder = command === 'build' && operand !== undefined && !operand.startsWith('--')
  && existsSync(resolve(operand, 'shard.json')) && !existsSync(resolve(operand, 'shard.config.ts'));
if (AUTHOR.has(command) && !builtFolder) {
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
} else await import('../src/cli/main.ts');
