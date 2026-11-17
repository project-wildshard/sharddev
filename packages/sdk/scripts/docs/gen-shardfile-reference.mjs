#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderReference, assertReferenceCoverage } from './schema-reference.mjs';

export const SHARDFILE_REFERENCE = 'docs/api/SHARDFILE.md';
/** Read actual schemas in an isolated Node process; preserve the caller's module loader. */
export function referenceData(root) {
  const result = spawnSync(process.execPath, ['--import', './scripts/sim-node-loader.mjs', 'scripts/docs/read-shardfile-reference.mjs'],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Shardfile reference extraction failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}
/** Deterministic field and ABI reference from compiled and SDK author-facing schemas. */
export function shardfileReference(root) {
  const { fields, abi, contract } = referenceData(root);
  return renderReference(fields, abi, contract);
}
/** A missing or stale reference is refused; generation belongs to the serialized pusher. */
export function checkShardfileReference(root) {
  const file = resolve(root, SHARDFILE_REFERENCE), { fields, abi, contract } = referenceData(root);
  if (!existsSync(file)) throw new Error(`Stale generated shardfile reference: ${SHARDFILE_REFERENCE}`);
  const document = readFileSync(file, 'utf8');
  try { assertReferenceCoverage(fields, abi, document); } catch (error) {
    throw new Error(`Stale generated shardfile reference: ${SHARDFILE_REFERENCE}; ${error instanceof Error ? error.message : String(error)}`);
  }
  if (document !== renderReference(fields, abi, contract)) throw new Error(`Stale generated shardfile reference: ${SHARDFILE_REFERENCE}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(import.meta.dirname, '../..');
  try {
    if (process.argv[2] === '--check') checkShardfileReference(root);
    else if (process.argv[2] === '--stdout') process.stdout.write(shardfileReference(root));
    else if (process.argv[2] === '--write') {
      const file = resolve(root, SHARDFILE_REFERENCE), text = shardfileReference(root);
      mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text);
    } else throw new Error('Use --check, --stdout, or --write inside an immutable export');
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
