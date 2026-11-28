// Meta QA 11-25 row 156: sharddev's main ci verdict is watched like engine's. A red gives one MAIN RED naming the
// landers and a NOTE RED per lane, a green after it a LIFT, each run is reported once, and the push gate starts it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { follow, judge, laneInReceipts, pushedMain, startFollow, sweep, verdictFor } from '../scripts/main-watch.mjs';

const A = 'a'.repeat(40), B = 'b'.repeat(40), C = 'c'.repeat(40), D = 'd'.repeat(40);
/** Main's history A < B < C < D. */
const ORDER = [A, B, C, D];
const isAncestor = (/** @type {string} */ x, /** @type {string} */ y) => ORDER.indexOf(x) <= ORDER.indexOf(y);
const run = (id, sha, conclusion, minute, status = 'completed') =>
  ({ id, head_sha: sha, status, conclusion, created_at: `2026-11-26T11:${String(minute).padStart(2, '0')}:00Z` });

/** A fake io: `runsSeq` is what each successive runs() call returns. */
function fakeIo({ runsSeq, failed = ['unit tests'], lanes = {}, onMain = () => true, receiptLanes = {} }) {
  /** @type {string[]} */ const receipts = [];
  const claimed = new Set();
  let clock = 0, calls = 0;
  return {
    receipts,
    io: {
      repo: 'sharddev',
      runs: () => runsSeq[Math.min(calls++, runsSeq.length - 1)],
      failedJobs: () => failed,
      fetch: () => {},
      onMain,
      isAncestor,
      commits: (range) => {
        const [from, to] = range.split('..');
        return ORDER.slice(ORDER.indexOf(from) + 1, ORDER.indexOf(to) + 1).map((sha) => ({ sha, subject: 's', lane: lanes[sha] ?? null }));
      },
      receiptLane: (sha) => receiptLanes[sha] ?? null,
      claim: (id) => (claimed.has(id) ? false : (claimed.add(id), true)),
      receipt: (line) => receipts.push(line),
      sleep: async (ms) => { clock += ms; },
      now: () => clock,
    },
  };
}

test('the verdict for a SHA is the newest finished run on it or a descendant, never a cancelled one', () => {
  const runs = [run(4, D, 'cancelled', 4), run(3, C, 'failure', 3), run(2, B, 'success', 2)];
  assert.equal(verdictFor(runs, B, isAncestor)?.id, 3);
  assert.equal(verdictFor(runs, D, isAncestor), null);
  assert.equal(verdictFor([run(5, D, null, 5, 'in_progress')], D, isAncestor), null);
});

test('a red names its landers once each, with a NOTE RED per lane; an unnamed commit falls back to the receipts', () => {
  const runs = [run(3, D, 'failure', 3), run(2, A, 'success', 2)];
  const { io, receipts } = fakeIo({ runsSeq: [runs], lanes: { [B]: 'opus-sdk139', [D]: 'opus-sdk139' }, receiptLanes: { [C]: 'opus-still155' } });
  judge(io, runs, runs[0]);
  assert.match(receipts[0], /^main-watch sharddev MAIN RED aaaaaaaaaa\.\.dddddddddd run 3: landers opus-sdk139, opus-still155; failed: unit tests; /u);
  assert.deepEqual(receipts.slice(1).map((line) => line.split(':')[0]), ['main-watch NOTE RED opus-sdk139', 'main-watch NOTE RED opus-still155']);
  assert.deepEqual(judge(io, runs, runs[0]), [], 'a run is reported once');
});

test('a red after a red is still red and prompts nobody; the green after it lifts', () => {
  const runs = [run(4, D, 'success', 4), run(3, C, 'failure', 3), run(2, B, 'failure', 2), run(1, A, 'success', 1)];
  const { io, receipts } = fakeIo({ runsSeq: [runs], lanes: { [C]: 'opus-a', [D]: 'opus-b' } });
  judge(io, runs, runs[1]);
  assert.match(receipts[0], /^main-watch sharddev main still red bbbbbbbbbb\.\.cccccccccc run 3: landers opus-a;/u);
  assert.equal(receipts.length, 1);
  judge(io, runs, runs[0]);
  assert.equal(receipts[1], 'main-watch sharddev main green dddddddddd (run 4; cccccccccc..dddddddddd; landed by opus-b)');
  assert.equal(receipts[2], 'main-watch sharddev LIFT dddddddddd: main green again after red run 3 at cccccccccc');
});

test('a follow waits for the push to reach main, then for a finished run, polling once a minute', async () => {
  let reached = 0;
  const { io, receipts } = fakeIo({
    runsSeq: [[run(9, C, null, 9, 'in_progress'), run(1, A, 'success', 1)], [run(9, C, 'success', 9), run(1, A, 'success', 1)]],
    lanes: { [B]: 'opus-x', [C]: 'opus-x' },
    onMain: (sha) => sha !== C || ++reached > 1,
  });
  const said = await follow(io, { sha: C, afterPushMs: 600_000 });
  assert.equal(said, 'main-watch sharddev main green cccccccccc (run 9; aaaaaaaaaa..cccccccccc; landed by opus-x)');
  assert.deepEqual(receipts, [said]);
  assert.equal(io.now(), 120_000, 'one wait for the push, one for the run');
});

test('a push that never reaches main is not judged; a follow with no verdict says so after its window', async () => {
  const { io, receipts } = fakeIo({ runsSeq: [[]], onMain: () => false });
  assert.match(await follow(io, { sha: D, afterPushMs: 120_000 }), /never reached origin main/u);
  assert.deepEqual(receipts, []);
  const late = fakeIo({ runsSeq: [[run(9, D, null, 9, 'queued')]] });
  assert.match(await follow(late.io, { sha: D, followMs: 300_000 }), /^main-watch sharddev main unjudged dddddddddd/u);
  assert.equal(late.receipts.length, 1);
});

test('by hand, the newest finished run is judged unless a watch already reported it', () => {
  const runs = [run(2, B, 'success', 2), run(1, A, 'success', 1)];
  const { io, receipts } = fakeIo({ runsSeq: [runs], lanes: { [B]: 'opus-y' } });
  assert.match(sweep(io), /main green bbbbbbbbbb/u);
  assert.equal(sweep(io), 'run 2 already reported');
  assert.equal(receipts.length, 1);
});

test('the receipts name a lane beside a sha, never main-watch itself', () => {
  const log = [
    `02:42 UTC opus-sdk139 PUSHED sharddev ${C.slice(0, 8)} fix`,
    `02:50 UTC main-watch sharddev main green ${C.slice(0, 10)} (run 1)`,
    `2026-11-28T02:42:06Z opus-memfoot QA71 PUSHED engine 5d97ff7ad fix`,
  ].join('\n');
  assert.equal(laneInReceipts(log, C), 'opus-sdk139');
  assert.equal(laneInReceipts(log, '5d97ff7ad'.padEnd(40, '0')), 'opus-memfoot');
  assert.equal(laneInReceipts(log, D), null);
});

test('the push gate starts a detached follow for a main push only', () => {
  /** @type {unknown[][]} */ const started = [];
  const start = (...args) => { started.push(args); return { unref: () => {} }; };
  const root = new URL('../..', import.meta.url).pathname;
  assert.equal(startFollow(root, { WS_PUSH_REFS: `refs/heads/plan/x ${C} refs/heads/plan/x ${'0'.repeat(40)}` }, start), '');
  assert.equal(startFollow(root, { WS_PUSH_REFS: `refs/heads/main ${C} refs/heads/main ${B}`, WS_MAIN_WATCH: '0' }, start), '');
  assert.match(startFollow(root, { WS_PUSH_REFS: `refs/heads/main ${C} refs/heads/main ${B}`, GIT_DIR: '/x' }, start), /main-watch follows cccccccccc/u);
  assert.equal(startFollow(root, { WS_PUSH_REFS: `refs/heads/main ${C} refs/heads/main ${B}`, WS_LAND_MAIN_PUSH: `exact:${C}` }, start), '', 'land follows its own');
  assert.equal(started.length, 1);
  const [, args, options] = started[0];
  assert.deepEqual(args.slice(1), [`--follow=${C}`, '--after-push=600']);
  assert.equal(options.detached, true);
  assert.equal(options.env.GIT_DIR, undefined, "the hook's git env stays behind");
  assert.equal(pushedMain(`refs/heads/main ${'0'.repeat(40)} refs/heads/main ${B}`), null, 'a delete is no push');
});

test("the push gate wires the follow into every exit a main push passes", () => {
  const gate = readFileSync(new URL('../../.githooks/run-checks.mjs', import.meta.url), 'utf8');
  assert.equal(gate.match(/await followMain\(\);/gu)?.length, 3, 'release-only, SKIP_CHECK and green');
  assert.match(gate.trimEnd(), /lane green in .*\nawait followMain\(\);$/u);
});

test("land starts the repo's own main-watch, from src/scripts/ in the lean layout", () => {
  const land = readFileSync(new URL('../scripts/.kit/land.mjs', import.meta.url), 'utf8');
  assert.match(land, /\['src\/scripts','scripts'\]\.find\(dir=>existsSync\(join\(this\.root,dir,'main-watch\.mjs'\)\)\)/u);
});
