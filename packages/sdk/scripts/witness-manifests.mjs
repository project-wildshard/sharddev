#!/usr/bin/env node
// SF6b for the native witnesses: every test/proof/<slug>/checkpoints/manifest.json fences its committed payloads with an
// `inputs` hash of every module the witness loads (and pnpm-lock), so almost any landing leaves it stale. Builders no
// longer refresh that hash: the serialized pusher (scripts/regenerate-committed.mjs) re-records every stale witness with
// its real recorder on the clean export and commits the refreshed manifests only when every payload and recorded outcome
// is byte-identical. Any other byte is a behaviour change: the push fails, naming the shard and the payload, and the
// owner rebakes on purpose (`run.mjs checkpoints`, committed with the source).
//
//   node scripts/witness-manifests.mjs --refresh <export> <cache-dir> <result.json>   (regenerate-committed spawns it)
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compareWitnessManifests } from './witness-checkpoints.mjs';

export const WITNESS_MANIFEST = /^test\/proof\/[^/]+\/checkpoints\/manifest\.json$/u;
/** @param {string} file */
export const isWitnessManifest = (file) => WITNESS_MANIFEST.test(file);
const INPUTS = /^ {2}"inputs": "[^"\n]*"(,?)$/mu;
/** The manifest with its `inputs` value blanked: every byte a re-record must reproduce exactly. @param {string} text */
export function manifestOutcome(text) {
  if (text.split('\n').filter((line) => line.startsWith('  "inputs": ')).length !== 1 || !INPUTS.test(text)) throw new Error('Witness manifest has no single top-level "inputs" line');
  return text.replace(INPUTS, '  "inputs": ""$1');
}
/** @param {string} text @param {string} inputs */
export function withInputs(text, inputs) {
  manifestOutcome(text);
  if (!/^[0-9a-f]+$/u.test(inputs)) throw new Error(`Invalid witness inputs hash ${inputs}`);
  return text.replace(INPUTS, `  "inputs": "${inputs}"$1`);
}

/** Every witness with committed checkpoints: test/proof/<slug>/{run.mjs,checkpoints/manifest.json}. @param {string} root */
export function witnessSlugs(root) {
  const proof = resolve(root, 'test/proof');
  if (!existsSync(proof)) return [];
  return readdirSync(proof).filter((slug) => existsSync(resolve(proof, slug, 'run.mjs')) && existsSync(resolve(proof, slug, 'checkpoints/manifest.json'))).sort();
}

/** One witness mode in a fresh Node (the tests' own invocation; transform types for the Driftwood worker classes).
 * @param {string} root @param {string} slug @param {string} mode @param {string} logs */
async function witness(root, slug, mode, logs) {
  const out = resolve(logs, `${slug}-${mode}.out`), err = resolve(logs, `${slug}-${mode}.err`);
  const outFd = openSync(out, 'w'), errFd = openSync(err, 'w');
  try {
    const child = spawn(process.execPath, ['--experimental-transform-types', '--import', './scripts/sim-node-loader.mjs', `test/proof/${slug}/run.mjs`, mode], { cwd: root, stdio: ['ignore', outFd, errFd] });
    const [code] = await once(child, 'close');
    return { code, stdout: readFileSync(out, 'utf8'), stderr: readFileSync(err, 'utf8') };
  } finally { closeSync(outFd); closeSync(errFd); }
}
/** The `fresh` mode's JSON report: { status, inputs, recorded }.
 * @param {string} root @param {string} slug @param {string} logs */
async function freshness(root, slug, logs) {
  const run = await witness(root, slug, 'fresh', logs);
  const line = run.stdout.trim().split('\n').at(-1) ?? '';
  let report;
  try { report = JSON.parse(line); } catch { throw new Error(`${slug}: the witness's fresh mode printed no report (exit ${String(run.code)}):\n${run.stderr.slice(-2000)}`); }
  if ((report.status !== 'fresh' && report.status !== 'stale') || typeof report.inputs !== 'string') throw new Error(`${slug}: unexpected fresh report ${line}`);
  return report;
}
/** @param {string | Uint8Array} bytes */
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
/** name → bytes of every committed checkpoint file. @param {string} root @param {string} slug */
function payloads(root, slug) {
  const dir = resolve(root, 'test/proof', slug, 'checkpoints');
  return new Map(readdirSync(dir).sort().map((name) => [name, readFileSync(resolve(dir, name))]));
}

/** Prepare native witness caches before Vitest's bounded continuations; cold generation belongs outside their timeout.
 * @param {string} root @returns {Promise<void>} */
export async function prepareWitnesses(root) {
  const logs = mkdtempSync(resolve(tmpdir(), 'wildshard-witness-prepare-'));
  try {
    const results = await Promise.allSettled(witnessSlugs(root).map(async slug => {
      const committed = readFileSync(resolve(root, 'test/proof', slug, 'checkpoints/manifest.json'), 'utf8');
      if (!Object.hasOwn(JSON.parse(committed), 'cache')) return;
      const run = await witness(root, slug, 'cache-verify', logs);
      if (run.code !== 0) throw new Error(`${slug}: native cache preparation failed (exit ${String(run.code)}):\n${run.stderr.slice(-2000)}`);
      const result = JSON.parse(run.stdout.trim().split('\n').at(-1) ?? '');
      if (typeof result.manifest !== 'string') throw new Error(`${slug}: cache preparation returned no manifest`);
      compareWitnessManifests(committed, result.manifest);
    }));
    const failures = results.flatMap(result => result.status === 'rejected' ? [result.reason instanceof Error ? result.reason.message : String(result.reason)] : []);
    if (failures.length > 0) throw new Error(`Native cache preparation failed:\n${failures.join('\n')}`);
  } finally { rmSync(logs, { recursive: true, force: true }); }
}

/**
 * Refresh every stale witness manifest in an immutable export. Returns { file: refreshed manifest text } for the stale
 * ones; throws, naming each shard and its differing payloads, when a re-record changes any byte but the inputs hash.
 * `cache` remembers (slug, inputs, payloads) triples a recorder already reproduced, so a retried push skips the replay.
 * @param {string} root @param {string} cache @returns {Promise<Record<string, string>>}
 */
export async function refreshWitnesses(root, cache) {
  const logs = mkdtempSync(resolve(tmpdir(), 'wildshard-witness-'));
  mkdirSync(cache, { recursive: true });
  try {
    const results = await Promise.allSettled(witnessSlugs(root).map(async (slug) => {
      const file = `test/proof/${slug}/checkpoints/manifest.json`, before = payloads(root, slug);
      const committed = (before.get('manifest.json') ?? Buffer.alloc(0)).toString('utf8');
      const report = await freshness(root, slug, logs);
      if (Object.hasOwn(JSON.parse(committed), 'cache')) {
        const run = await witness(root, slug, 'cache-record', logs);
        if (run.code !== 0) throw new Error(`${slug}: cached recorder failed (exit ${String(run.code)}):\n${run.stderr.slice(-2000)}`);
        const result = JSON.parse(run.stdout.trim().split('\n').at(-1) ?? '');
        if (typeof result.manifest !== 'string') throw new Error(`${slug}: cached recorder returned no manifest`);
        compareWitnessManifests(committed, result.manifest);
        if (result.manifest !== withInputs(committed, report.inputs)) throw new Error(`${slug}: cached recorder changed its recorded outcome or input fence`);
        if (result.manifest === committed) return null;
        writeFileSync(resolve(root, file), result.manifest);
        const check = await freshness(root, slug, logs);
        if (check.status !== 'fresh') throw new Error(`${slug}: cached manifest is still stale`);
        return [file, result.manifest];
      }
      if (report.status === 'fresh') return null;
      const key = sha([slug, report.inputs, manifestOutcome(committed), ...[...before].filter(([name]) => name !== 'manifest.json').map(([name, bytes]) => `${name}:${sha(bytes)}`)].join('\0'));
      const receipt = resolve(cache, key);
      let refreshed = withInputs(committed, report.inputs);
      if (!existsSync(receipt)) {
        const run = await witness(root, slug, 'checkpoints', logs);
        if (run.code !== 0) throw new Error(`${slug}: the recorder failed (exit ${String(run.code)}):\n${run.stderr.slice(-2000)}`);
        const after = payloads(root, slug), differing = [...new Set([...before.keys(), ...after.keys()])].filter((name) => {
          const a = before.get(name), b = after.get(name);
          if (a === undefined || b === undefined) return true;
          return name === 'manifest.json' ? manifestOutcome(a.toString('utf8')) !== manifestOutcome(b.toString('utf8')) : !a.equals(b);
        });
        if (differing.length > 0) throw new Error(`${slug}: the re-record on clean HEAD changed ${differing.map((name) => name === 'manifest.json' ? 'manifest.json (recorded outcome)' : name).join(', ')}; a behaviour change needs its owner to rebake on purpose (run.mjs checkpoints, committed with the source)`);
        refreshed = (after.get('manifest.json') ?? Buffer.alloc(0)).toString('utf8');
        if (refreshed !== withInputs(committed, report.inputs)) throw new Error(`${slug}: the recorder wrote inputs ${JSON.stringify(INPUTS.exec(refreshed)?.[0])} but fresh reported ${report.inputs}`);
      }
      writeFileSync(resolve(root, file), refreshed);
      const check = await freshness(root, slug, logs);
      if (check.status !== 'fresh') throw new Error(`${slug}: the refreshed manifest is still stale (${JSON.stringify(check)})`);
      writeFileSync(receipt, `${file} ${report.inputs}\n`);
      return [file, refreshed];
    }));
    const failures = results.flatMap((result) => result.status === 'rejected' ? [result.reason instanceof Error ? result.reason.message : String(result.reason)] : []);
    if (failures.length > 0) throw new Error(`witness-manifests: payloads changed; the push refuses them:\n${failures.map((line) => `  ${line}`).join('\n')}`);
    return Object.fromEntries(results.flatMap((result) => result.status === 'fulfilled' && result.value !== null ? [result.value] : []));
  } finally { rmSync(logs, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), [flag = '', root = '', cache = '', result = ''] = args;
  try {
    if (args.length === 2 && flag === '--prepare') {
      await prepareWitnesses(resolve(root)); console.log('witness-manifests: native checkpoint caches verified');
    } else {
      if (args.length !== 4 || flag !== '--refresh') throw new Error('Use --prepare <export> or --refresh <export> <cache-dir> <result.json>');
      const from = performance.now(), refreshed = await refreshWitnesses(resolve(root), resolve(cache));
      writeFileSync(resolve(result), JSON.stringify(refreshed));
      console.log(`witness-manifests: ${String(Object.keys(refreshed).length)} of ${String(witnessSlugs(resolve(root)).length)} re-recorded in ${((performance.now() - from) / 1000).toFixed(1)} s, payloads byte-identical`);
    }
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
