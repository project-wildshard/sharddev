#!/usr/bin/env node
// Meta MOSSGATE-ZONE MZ3 (J452, J453): Mossgate's staging slot follows the template. The slot drifted once: the
// template's gameplay landed on main (TR-12a/b) while staging kept serving rev 3, and nothing noticed.
// `.github/workflows/mossgate-slot.yml` republishes on every template change and runs `drift` after it and daily.
//   node src/scripts/mossgate-slot.mjs version              the declared shard version, refused unless above staging
//   node src/scripts/mossgate-slot.mjs drift [--staging=<sha>] [--ref=<ref>]
//       red (exit 1) when staging's Mossgate commit does not contain the template's last change on <ref> (default
//       HEAD); --staging= checks a given commit instead of reading the API (rev 3's f97831a8 is red)
import { agentFetch as fetch } from '../../packages/dev/scripts/wildshard-agent-requests.mjs';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const API = (process.env.WILDSHARD_API_URL ?? 'https://api.wildshard.io').replace(/\/$/u, '');
const SLUG = 'mossgate', TEMPLATE = 'packages/sdk/src/shards/mossgate';
const flag = (/** @type {string} */ name) => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const git = (/** @type {string[]} */ ...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

/** @returns {Promise<{ version: string, commit: string, channel: string }>} */
async function staging() {
  const response = await fetch(`${API}/api/catalogue/shards/${SLUG}`);
  if (!response.ok) throw new Error(`GET /api/catalogue/shards/${SLUG}: ${String(response.status)}`);
  const row = /** @type {{ version?: unknown, commit?: unknown, channel?: unknown }} */ (await response.json());
  if (typeof row.version !== 'string' || typeof row.commit !== 'string') throw new Error(`${SLUG}: the catalogue names no version or commit`);
  return { version: row.version, commit: row.commit, channel: String(row.channel) };
}

const command = process.argv[2];
if (command === 'version') {
  const { version } = await staging();
  const own = JSON.parse(readFileSync(new URL(`../../${TEMPLATE}/package.json`, import.meta.url), 'utf8')).version;
  const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
  if (typeof own !== 'string' || !semver.test(own) || !semver.test(version)) throw new Error(`${SLUG}: declared and staging versions must be X.Y.Z`);
  const live = version.split('.').map(Number);
  const delta = own.split('.').map((part, index) => Number(part) - live[index]).find(value => value !== 0) ?? 0;
  if (delta <= 0) throw new Error(`${SLUG}: declared version ${own} is not above staging ${version}; bump ${TEMPLATE}/package.json`);
  console.log(own);
} else if (command === 'drift') {
  const ref = flag('ref') ?? 'HEAD', last = git('log', '-1', '--format=%H', ref, '--', TEMPLATE);
  const live = flag('staging') ?? (await staging()).commit;
  let contains = false;
  try { git('cat-file', '-e', `${live}^{commit}`); contains = (() => { try { git('merge-base', '--is-ancestor', last, live); return true; } catch { return false; } })(); }
  catch { console.error(`staging's commit ${live} is not in this clone (fetch with full history)`); }
  console.log(`${contains ? 'green' : 'RED'}: staging Mossgate is ${live.slice(0, 10)}; the template's last change is ${last.slice(0, 10)} (${git('log', '-1', '--format=%s', last)})`);
  if (!contains) {
    console.log(`the slot drifted: republish with \`gh workflow run mossgate-slot.yml -R project-wildshard/sharddev\``);
    process.exitCode = 1;
  }
} else {
  console.error('usage: mossgate-slot.mjs version | drift [--staging=<sha>] [--ref=<ref>]');
  process.exitCode = 2;
}
