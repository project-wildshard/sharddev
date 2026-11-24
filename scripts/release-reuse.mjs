#!/usr/bin/env node
// FAST-RELEASE FR1/FR2 (meta docs/plans/FAST-RELEASE-PLAN.md; Jake 2026-11-24 ~18:15 Cancún: "Wow SDK release take
// forever why lol", "make a mini plan to fix the release process and build it and ship it").
//
// A release commit (repo-kit `release.sh --prepare`) changes only release-written files: the `version` of the root and
// the six package manifests (release:stamp), and new CHANGELOG.md notes. Its parent is a cut that main's `ci` already
// passed. SDK 0.4.32 still reran main's whole suite on release/v0.4.32 (21.5 min) and `pnpm check` in the pre-push gate
// for the branch and again for the tag (about 6 min each). This module proves when that work is a duplicate:
//
//   node scripts/release-reuse.mjs ci   in ci.yml's release-gate job: writes reuse=true|false to $GITHUB_OUTPUT.
//                                       True only when HEAD has one parent, the diff is stamp-only, and main's `ci`
//                                       push run concluded success at that parent. It never fails the job: anything it
//                                       cannot prove runs the full suite, as before.
//   releaseOnlyPush(root, refs)         for .githooks/run-checks.mjs: a push that sends no new code (a tag on a commit
//                                       origin has, a stamp-only release branch over origin/main, a stamp-only
//                                       merge-back, a release branch delete) skips the push lane.
//
// The exact-SHA release proof stays: ci.yml's packed-install packs all six packages at the release version, installs
// them outside the checkout, runs the CLI and typechecks a real shard on the packed graph.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** The manifests release:stamp writes (scripts/release-workspace.mjs), and the notes file prepare writes. */
export const RELEASE_MANIFESTS = [
  'package.json',
  'packages/kit/package.json',
  'packages/upload/package.json',
  'packages/sdk/package.json',
  'packages/build/package.json',
  'packages/dev/package.json',
  'packages/cli/package.json',
];
export const RELEASE_NOTES = 'CHANGELOG.md';
const ZERO = /^0+$/u;

/** @param {string} cwd */
function gitIn(cwd) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  /** @param {string[]} args */
  return (args) => execFileSync('git', args, { cwd, env, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** @param {(args: string[]) => string} git @param {string[]} args */
function tryGit(git, args) {
  try {
    return git(args);
  } catch {
    return null;
  }
}

/** Whether `head`'s tree differs from `base`'s only in release-written bytes.
 * @param {string} cwd @param {string} base @param {string} head @returns {{ ok: boolean, reason: string }} */
export function stampOnly(cwd, base, head) {
  const git = gitIn(cwd);
  const rows = git(['diff', '--no-renames', '--name-status', '-z', base, head]).split('\0').filter(Boolean);
  for (let i = 0; i < rows.length; i += 2) {
    const status = rows[i];
    const path = rows[i + 1];
    if (path === RELEASE_NOTES) {
      if (status !== 'M' && status !== 'A') return { ok: false, reason: `${path} was ${status}, not added to` };
      const [, deleted] = git(['diff', '--numstat', base, head, '--', path]).split('\t');
      if (deleted !== '0') return { ok: false, reason: `${path} lost ${deleted} line(s); notes are only added` };
    } else if (RELEASE_MANIFESTS.includes(path)) {
      if (status !== 'M') return { ok: false, reason: `${path} was ${status}, not stamped` };
      const before = JSON.parse(git(['show', `${base}:${path}`]));
      const after = JSON.parse(git(['show', `${head}:${path}`]));
      delete before.version;
      delete after.version;
      if (JSON.stringify(before) !== JSON.stringify(after)) return { ok: false, reason: `${path} changes more than its version` };
    } else return { ok: false, reason: `${path} is not a release-written file` };
  }
  return { ok: true, reason: `stamp-only over ${base.slice(0, 10)}` };
}

/** The one parent of a release commit, when the commit is stamp-only over it.
 * @param {string} cwd @param {string} head @returns {{ ok: boolean, reason: string, base?: string }} */
export function releaseCommit(cwd, head) {
  const git = gitIn(cwd);
  const parents = git(['rev-list', '--parents', '-n', '1', head]).split(' ').slice(1);
  if (parents.length !== 1) return { ok: false, reason: `${head.slice(0, 10)} has ${parents.length} parents` };
  const base = parents[0];
  const verdict = stampOnly(cwd, base, head);
  return verdict.ok ? { ...verdict, base } : verdict;
}

/** @param {(args: string[]) => string} git @param {string} commit @param {string} ref */
const contains = (git, commit, ref) => tryGit(git, ['merge-base', '--is-ancestor', commit, ref]) !== null;
/** @param {(args: string[]) => string} git @param {string} commit */
const onOrigin = (git, commit) => (tryGit(git, ['for-each-ref', '--contains', commit, '--format=%(refname)', 'refs/remotes/origin']) ?? '') !== '';

/** Whether a push (git's pre-push stdin lines) sends no new code, so the push lane has nothing to gate.
 * @param {string} root @param {string} refs @returns {{ ok: boolean, reason: string }} */
export function releaseOnlyPush(root, refs) {
  const git = gitIn(root);
  const lines = refs.split('\n').map((line) => line.trim().split(/\s+/u)).filter((row) => row[0] !== '' && row.length === 4);
  if (lines.length === 0) return { ok: false, reason: 'no refs' };
  const said = [];
  for (const [, local, remoteRef, remote] of lines) {
    if (ZERO.test(local)) {
      if (!/^refs\/heads\/release\/v\d+\.\d+\.\d+$/u.test(remoteRef)) return { ok: false, reason: `deletes ${remoteRef}` };
      said.push(`deletes ${remoteRef}`);
      continue;
    }
    const commit = tryGit(git, ['rev-parse', '--verify', '--quiet', `${local}^{commit}`]);
    if (commit === null) return { ok: false, reason: `${remoteRef} is not a commit` };
    if (/^refs\/tags\/v\d+\.\d+\.\d+$/u.test(remoteRef)) {
      if (!onOrigin(git, commit)) return { ok: false, reason: `${remoteRef} tags a commit origin lacks` };
      said.push(`${remoteRef} tags ${commit.slice(0, 10)}, already on origin`);
    } else if (/^refs\/heads\/release\/v\d+\.\d+\.\d+$/u.test(remoteRef)) {
      const verdict = releaseCommit(root, commit);
      if (!verdict.ok || verdict.base === undefined) return verdict;
      if (!contains(git, verdict.base, 'refs/remotes/origin/main')) return { ok: false, reason: `${remoteRef}'s cut is not on origin/main` };
      said.push(`${remoteRef} is ${verdict.reason}`);
    } else if (remoteRef === 'refs/heads/main' && !ZERO.test(remote)) {
      // A merge-back: one merge on origin's main tip whose other new commits origin already has.
      const parents = git(['rev-list', '--parents', '-n', '1', commit]).split(' ').slice(1);
      if (parents.length !== 2 || parents[0] !== remote) return { ok: false, reason: 'main gets more than a release merge' };
      const fresh = git(['rev-list', `${remote}..${commit}`]).split('\n').filter((sha) => sha !== '' && sha !== commit);
      if (fresh.some((sha) => !onOrigin(git, sha))) return { ok: false, reason: 'the merge brings commits origin lacks' };
      const verdict = stampOnly(root, remote, commit);
      if (!verdict.ok) return verdict;
      said.push(`main gets a release merge, ${verdict.reason}`);
    } else return { ok: false, reason: `${remoteRef} is not a release ref` };
  }
  return { ok: true, reason: `release-only push (${said.join('; ')})` };
}

/** Whether main's `ci` push run concluded success at `sha`.
 * @param {string} repository @param {string} sha @param {string} token @param {typeof fetch} [get] */
export async function mainGreen(repository, sha, token, get = fetch) {
  const url = `https://api.github.com/repos/${repository}/actions/workflows/ci.yml/runs?head_sha=${sha}&branch=main&event=push&status=success&per_page=5`;
  const response = await get(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' } });
  if (!response.ok) return { ok: false, reason: `the Actions API answered ${response.status}` };
  const body = /** @type {{ workflow_runs: { id: number, head_sha: string, head_branch: string, event: string, conclusion: string }[] }} */ (await response.json());
  const run = body.workflow_runs.find((row) => row.head_sha === sha && row.head_branch === 'main' && row.event === 'push' && row.conclusion === 'success');
  return run === undefined ? { ok: false, reason: `main's ci never passed at ${sha.slice(0, 10)}` } : { ok: true, reason: `main's ci run ${run.id} passed at ${sha.slice(0, 10)}` };
}

/** The release-gate verdict for HEAD. @param {string} cwd @param {{ repository: string, token: string, get?: typeof fetch }} api */
export async function ciVerdict(cwd, api) {
  try {
    const head = gitIn(cwd)(['rev-parse', 'HEAD']);
    const commit = releaseCommit(cwd, head);
    if (!commit.ok || commit.base === undefined) return commit;
    const green = await mainGreen(api.repository, commit.base, api.token, api.get);
    return green.ok ? { ok: true, reason: `${commit.reason}; ${green.reason}` } : green;
  } catch (error) {
    return { ok: false, reason: `could not prove reuse: ${error instanceof Error ? error.message : String(error)}` };
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv[2] !== 'ci') {
    console.error('usage: node scripts/release-reuse.mjs ci');
    process.exit(2);
  }
  const verdict = await ciVerdict(process.cwd(), { repository: process.env.GITHUB_REPOSITORY ?? '', token: process.env.GH_TOKEN ?? '' });
  const line = verdict.ok ? `reuse main's green run: ${verdict.reason}` : `full suite: ${verdict.reason}`;
  console.log(`release-reuse: ${line}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `reuse=${verdict.ok}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Release gate\n\n${line}\n`);
}
