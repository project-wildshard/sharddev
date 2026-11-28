// Meta QA 11-25 row 156 (J505): sharddev's main sat red unseen twice on 11-26 (a4781ad9 until 3fc87d52, then 4cce4163
// to ab2e97b9, three hours), because engine's main-watch reads only project-wildshard/engine. This is the same watch for
// this repo, small: it follows one pushed SHA until main's `ci` judges it, then writes one receipt to the lanes' log.
//
//   node src/scripts/main-watch.mjs                         judge the newest finished main ci run, if nobody has
//   node src/scripts/main-watch.mjs --follow=<sha> [--after-push=<s>]
//                                                           wait for <sha> to reach origin main (up to <s> seconds),
//                                                           then for its verdict, and judge it
//
// The push gate starts a follow for every main push it passes (.githooks/run-checks.mjs); land starts one for its own
// main push (src/scripts/.kit/land.mjs), so nobody starts it by hand. The verdict for a SHA is the newest completed main `ci` run that isn't cancelled or
// skipped and whose head is that SHA or a descendant. Receipts (`HH:MM UTC main-watch <repo> ...`):
//   main green <sha> (run <id>; <range>; landed by <lanes>)       and, after a red, `LIFT <sha>: ...`
//   MAIN RED <range> run <id>: landers <lanes>; failed: <jobs>    and one `NOTE RED <lane>: ...` per lander
//   main still red <range> run <id>: ...                          a red after a red: prompts nobody
// Each run is reported once (an atomic mkdir under ~/.cache/wildshard/main-watch-<repo>/), however many follows see it.
// gh is polled once a minute at most (lanes' rule: gh polls sleep at least 60 s).
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

/** @typedef {{id:number,head_sha:string,status:string,conclusion:string|null,created_at:string,html_url?:string}} Run */
/** @typedef {{sha:string,subject:string,lane:string|null}} LaneCommit */
/**
 * @typedef {object} Io
 * @property {string} repo the repo's short name, as receipts say it
 * @property {() => Run[]} runs main's ci runs, newest first
 * @property {(id:number) => string[]} failedJobs
 * @property {() => void} fetch
 * @property {(sha:string) => boolean} onMain whether origin/main holds sha
 * @property {(ancestor:string, sha:string) => boolean} isAncestor
 * @property {(range:string) => LaneCommit[]} commits
 * @property {(sha:string) => string|null} receiptLane the lane a receipt names beside this sha, if any
 * @property {(id:number) => boolean} claim true once per run id, ever
 * @property {(line:string) => void} receipt
 * @property {(ms:number) => Promise<void>} sleep
 * @property {() => number} now
 */

export const POLL_MS = 60_000;
export const FOLLOW_MS = 3 * 60 * 60_000;
const IGNORED = new Set(['cancelled', 'skipped', 'neutral']);
const short = (/** @type {string} */ sha) => sha.slice(0, 10);

/** Completed runs that give a verdict, newest first. @param {Run[]} runs */
export function verdictRuns(runs) {
  return runs.filter((run) => run.status === 'completed' && !IGNORED.has(run.conclusion ?? ''));
}

/** The run that judges `sha`: the newest verdict run whose head is sha or a descendant, or null.
 * @param {Run[]} runs @param {string} sha @param {(ancestor:string, sha:string) => boolean} isAncestor */
export function verdictFor(runs, sha, isAncestor) {
  return verdictRuns(runs).find((run) => run.head_sha === sha || isAncestor(sha, run.head_sha)) ?? null;
}

/** The verdict run before `run`, or null. @param {Run[]} runs @param {Run} run */
export function previousVerdict(runs, run) {
  return verdictRuns(runs).find((other) => other.id !== run.id && other.created_at < run.created_at) ?? null;
}

/** The `Lane:` line a commit message names last, or null. @param {string} message */
export function messageLane(message) {
  return [...message.matchAll(/^Lane: ([a-z][a-z0-9_-]*)\s*$/gmu)].map((match) => match[1] ?? '').at(-1) ?? null;
}

/** The lane a receipts log names beside a sha: `HH:MM UTC <lane> ... <sha prefix>`, the newest such line.
 * @param {string} text @param {string} sha */
export function laneInReceipts(text, sha) {
  const prefix = sha.slice(0, 8);
  const lines = text.split('\n').filter((line) => line.includes(prefix) && !/ main-watch /u.test(line));
  for (const line of lines.reverse()) {
    const lane = /^(?:\S+Z|\d\d:\d\d UTC) ([a-z][a-z0-9_-]*) /u.exec(line)?.[1];
    if (lane !== undefined) return lane;
  }
  return null;
}

/** The lanes behind a range's commits, in order, once each; a commit naming none is `unnamed <sha8>`.
 * @param {Io} io @param {string} range */
export function landers(io, range) {
  const names = io.commits(range).map((commit) => commit.lane ?? io.receiptLane(commit.sha) ?? `unnamed ${commit.sha.slice(0, 8)}`);
  return [...new Set(names)];
}

/** Report one run's verdict, once. Returns the receipt lines written (empty when another watch reported it).
 * @param {Io} io @param {Run[]} runs @param {Run} run */
export function judge(io, runs, run) {
  if (!io.claim(run.id)) return [];
  const before = previousVerdict(runs, run);
  const range = before === null ? short(run.head_sha) : `${short(before.head_sha)}..${short(run.head_sha)}`;
  const lanes = before === null ? [] : landers(io, `${before.head_sha}..${run.head_sha}`);
  const named = lanes.join(', ') || 'none named';
  const url = run.html_url ?? `https://github.com/project-wildshard/${io.repo}/actions/runs/${run.id}`;
  const wasRed = before !== null && before.conclusion !== 'success';
  /** @type {string[]} */ const lines = [];
  if (run.conclusion === 'success') {
    lines.push(`main-watch ${io.repo} main green ${short(run.head_sha)} (run ${run.id}; ${range}; landed by ${named})`);
    if (wasRed) lines.push(`main-watch ${io.repo} LIFT ${short(run.head_sha)}: main green again after red run ${before.id} at ${short(before.head_sha)}`);
  } else {
    const failed = io.failedJobs(run.id).join(' | ') || run.conclusion || 'see the run';
    if (wasRed) lines.push(`main-watch ${io.repo} main still red ${range} run ${run.id}: landers ${named}; failed: ${failed}; ${url}`);
    else {
      lines.push(`main-watch ${io.repo} MAIN RED ${range} run ${run.id}: landers ${named}; failed: ${failed}; ${url}`);
      for (const lane of lanes.filter((name) => !name.startsWith('unnamed '))) {
        lines.push(`main-watch NOTE RED ${lane}: ${io.repo} run ${run.id} ${range} failed: ${failed} (fix it forward at once, J422)`);
      }
    }
  }
  for (const line of lines) io.receipt(line);
  return lines;
}

/** Follow `sha` until main's ci judges it. @param {Io} io @param {{sha:string, afterPushMs?:number, followMs?:number}} options
 * @returns {Promise<string>} what happened, for the log */
export async function follow(io, { sha, afterPushMs = 0, followMs = FOLLOW_MS }) {
  const start = io.now();
  io.fetch();
  while (!io.onMain(sha)) {
    if (io.now() - start >= afterPushMs) return `${short(sha)} never reached origin main; nothing to judge`;
    await io.sleep(Math.min(POLL_MS, Math.max(1, afterPushMs)));
    io.fetch();
  }
  while (io.now() - start < followMs) {
    const runs = io.runs();
    const run = verdictFor(runs, sha, (ancestor, head) => {
      if (!io.onMain(head)) io.fetch();
      return io.isAncestor(ancestor, head);
    });
    if (run !== null) {
      const lines = judge(io, runs, run);
      return lines.length > 0 ? lines.join('\n') : `run ${run.id} already reported`;
    }
    await io.sleep(POLL_MS);
  }
  const line = `main-watch ${io.repo} main unjudged ${short(sha)}: no finished ci run in ${Math.round(followMs / 60_000)} min; run node src/scripts/main-watch.mjs by hand`;
  io.receipt(line);
  return line;
}

/** By hand: judge the newest finished verdict run, unless a watch already did. @param {Io} io */
export function sweep(io) {
  const runs = io.runs(), run = verdictRuns(runs)[0];
  if (run === undefined) return 'no finished main ci run';
  io.fetch();
  const lines = judge(io, runs, run);
  return lines.length > 0 ? lines.join('\n') : `run ${run.id} already reported`;
}

/** The pushed main SHA in a pre-push's ref lines (`<local ref> <local sha> <remote ref> <remote sha>`), or null.
 * @param {string} refs */
export function pushedMain(refs) {
  for (const line of refs.split('\n')) {
    const [, local = '', remote = ''] = line.trim().split(/\s+/u);
    if (remote === 'refs/heads/main' && /^[0-9a-f]{40}$/u.test(local) && !/^0+$/u.test(local)) return local;
  }
  return null;
}

/** The push gate's hand-off: a main push starts a detached follow of its SHA, which waits for the push to reach
 * origin. WS_MAIN_WATCH=0 turns it off. Returns the line to print, or '' when the push is not a main push.
 * @param {string} root @param {NodeJS.ProcessEnv} env @param {typeof spawn} [start] */
export function startFollow(root, env, start = spawn) {
  const sha = pushedMain(env.WS_PUSH_REFS ?? '');
  const script = join(root, 'src/scripts/main-watch.mjs');
  if (sha === null || env.WS_MAIN_WATCH === '0' || !existsSync(script)) return '';
  // An exact or carried land push: land starts its own follow (src/scripts/.kit/land.mjs startWatcher).
  if (/^(?:exact|carried):/u.test(env.WS_LAND_MAIN_PUSH ?? '')) return '';
  const clean = Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith('GIT_')));
  try {
    start(process.execPath, [script, `--follow=${sha}`, '--after-push=600'], { cwd: root, env: clean, detached: true, stdio: 'ignore' }).unref();
    return `  - main-watch follows ${short(sha)} once it reaches main and writes main's ci verdict to the receipts (QA 11-25 row 156)`;
  } catch (error) {
    return `  !! main-watch not started (${error instanceof Error ? error.message : String(error)}); run node src/scripts/main-watch.mjs by hand`;
  }
}

/** The live io for the checkout at `root`. @param {string} root @param {NodeJS.ProcessEnv} [env] @returns {Io} */
export function liveIo(root, env = process.env) {
  const clean = Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith('GIT_')));
  const sh = (/** @type {string} */ command, /** @type {string[]} */ args) =>
    execFileSync(command, args, { cwd: root, env: clean, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000, maxBuffer: 32 << 20 });
  const ok = (/** @type {string[]} */ args) => { try { sh('git', args); return true; } catch { return false; } };
  const url = sh('git', ['remote', 'get-url', 'origin']).trim();
  const slug = /github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/u.exec(url)?.[1];
  if (slug === undefined) throw new Error(`origin ${url} is not a GitHub repo; main-watch reads its Actions`);
  const repo = slug.split('/')[1] ?? slug;
  const log = resolve(env.WS_LANE_RECEIPTS ?? join(homedir(), '.cache/wildshard/lane-receipts.log'));
  const state = resolve(env.WS_MAIN_WATCH_STATE ?? join(homedir(), '.cache/wildshard', `main-watch-${repo}`));
  return {
    repo,
    runs: () => JSON.parse(sh('gh', ['api', `repos/${slug}/actions/workflows/ci.yml/runs?branch=main&per_page=30`])).workflow_runs,
    failedJobs: (id) => JSON.parse(sh('gh', ['api', `repos/${slug}/actions/runs/${id}/jobs?per_page=100`])).jobs
      .filter((/** @type {{conclusion:string|null}} */ job) => job.conclusion !== null && !['success', 'skipped', 'neutral'].includes(job.conclusion))
      .map((/** @type {{name:string}} */ job) => job.name),
    fetch: () => { ok(['fetch', '--quiet', 'origin', 'main']); },
    onMain: (sha) => ok(['merge-base', '--is-ancestor', sha, 'origin/main']),
    isAncestor: (ancestor, sha) => ok(['merge-base', '--is-ancestor', ancestor, sha]),
    commits: (range) => sh('git', ['log', '--reverse', '--format=%H%x00%s%x00%B%x1e', range]).split('\u001E')
      .map((entry) => entry.replace(/^\n+/u, '')).filter((entry) => entry.trim() !== '')
      .map((entry) => { const [sha = '', subject = '', body = ''] = entry.split('\0'); return { sha, subject, lane: messageLane(body) }; }),
    receiptLane: (sha) => { try { return laneInReceipts(readFileSync(log, 'utf8'), sha); } catch { return null; } },
    claim: (id) => {
      mkdirSync(state, { recursive: true });
      try { mkdirSync(join(state, String(id))); return true; } catch { return false; }
    },
    receipt: (line) => {
      const now = new Date();
      const stamp = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')} UTC`;
      appendFileSync(log, `${stamp} ${line}\n`);
    },
    sleep: (ms) => sleep(ms),
    now: () => Date.now(),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const flag = (/** @type {string} */ name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: import.meta.dirname, encoding: 'utf8' }).trim();
  const io = liveIo(root);
  const sha = flag('follow');
  const said = sha === undefined ? sweep(io) : await follow(io, { sha, afterPushMs: Number(flag('after-push') ?? 0) * 1000 });
  console.log(said);
}
