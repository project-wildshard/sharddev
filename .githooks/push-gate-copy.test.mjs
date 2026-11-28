// Meta QA 11-26 row 29: the gate copy's install never runs without a limit. A `pnpm install` that stalls fails the copy
// within WS_GATE_STEP_S, naming the step and its last output, and leaves no copy behind. Real Git; `pnpm` is a stand-in
// on PATH that says what it is doing and then never exits.
// Meta QA 11-25 row 149: a gate red a local run does not show is reproduced the gate's way (push-gate-copy.mjs's CLI):
// the command runs in a clean copy of the commit, never in the checkout with its untracked and uncommitted files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ENV, roots } from './test-helpers.mjs';
import { GATE_DIR, installLimit, makeGateCopy } from './push-gate-copy.mjs';

const git = (cwd, args) => {
  const result = spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.com', ...args], { cwd, env: ENV, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
};

test('a stalled install fails the gate copy within its limit, naming the step and its last output', () => {
  const root = mkdtempSync(join(tmpdir(), 'push-gate-limit-'));
  try {
    git(root, ['init', '-q', '-b', 'main']);
    writeFileSync(join(root, '.gitignore'), '/tmp/\n/bin/\n');
    writeFileSync(join(root, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n");
    git(root, ['add', '.gitignore', 'pnpm-lock.yaml']);
    git(root, ['commit', '-q', '-m', 'seed']);
    mkdirSync(join(root, 'bin'));
    writeFileSync(join(root, 'bin/pnpm'), '#!/bin/sh\n[ -n "$STAND_IN_WARM" ] && exit 0\necho "Progress: resolved 12, reused 11, downloaded 0"\nexec sleep 600\n');
    chmodSync(join(root, 'bin/pnpm'), 0o755);
    // macOS checks a new executable on its first run, which can take seconds: run the stand-in once before the clock
    spawnSync(join(root, 'bin/pnpm'), [], { env: { ...ENV, STAND_IN_WARM: '1' } });
    const head = git(root, ['rev-parse', 'HEAD']), env = { ...ENV, PATH: `${join(root, 'bin')}:${ENV.PATH ?? ''}`, WS_GATE_STEP_S: '3' };
    const began = performance.now();
    assert.throws(() => makeGateCopy(root, head, { say: () => {}, env }),
      /^Error: gate step install stuck: no exit after 3 s, stopped \(limit: WS_GATE_STEP_S\); last output: Progress: resolved 12, reused 11, downloaded 0$/u);
    assert.ok((performance.now() - began) / 1000 < 12);
    const left = existsSync(join(root, GATE_DIR)) ? readdirSync(join(root, GATE_DIR)).filter((name) => !name.endsWith('.trash')) : [];
    assert.deepEqual(left, []);
    assert.equal(installLimit({}), 300);
    assert.equal(installLimit({ WS_GATE_STEP_S: '7' }), 7);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

const CLI = join(import.meta.dirname, 'push-gate-copy.mjs');
// The push gate itself sets WS_PARITY_FRAMES for the check it runs (run-checks.mjs); the case reads the CLI's own default.
const { WS_PARITY_FRAMES: _gateFrames, ...env } = ENV;

function repo() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'gate-copy-')));
  roots.push(root);
  const git = (/** @type {string[]} */ args) => spawnSync('git', args, { cwd: root, encoding: 'utf8', env: ENV });
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.name', 'Test']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(root, '.gitignore'), 'tmp/\n');
  writeFileSync(join(root, 'kept.txt'), 'committed\n');
  git(['add', '.gitignore', 'kept.txt']);
  git(['commit', '-q', '-m', 'first']);
  return { root, git };
}

/** @param {string} root @param {string[]} args */
const cli = (root, args) => spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8', env });

test('the command runs in a clean copy of HEAD: committed bytes, no dirt, the parity frames outside the copy', () => {
  const { root } = repo();
  writeFileSync(join(root, 'kept.txt'), 'edited, not committed\n');
  writeFileSync(join(root, 'stray.txt'), 'untracked\n');
  const probe = `const fs = require('node:fs'); console.log(JSON.stringify({ cwd: process.cwd(), kept: fs.readFileSync('kept.txt', 'utf8'), stray: fs.existsSync('stray.txt'), frames: process.env.WS_PARITY_FRAMES }))`;
  const run = cli(root, ['--', process.execPath, '-e', probe]);
  assert.equal(run.status, 0, run.stderr);
  const seen = JSON.parse(run.stdout.trim().split('\n').at(-1) ?? '{}');
  assert.equal(seen.kept, 'committed\n');
  assert.equal(seen.stray, false);
  assert.notEqual(seen.cwd, root);
  assert.equal(seen.frames, join(root, 'tmp/push-gate/watch-parity'));
  assert.match(run.stderr, /push-gate copy \(M1\)/u);
});

test('it exits with the command\'s status and leaves no copy registered', () => {
  const { root, git } = repo();
  const run = cli(root, ['HEAD', '--', process.execPath, '-e', 'process.exit(3)']);
  assert.equal(run.status, 3, run.stderr);
  const copies = existsSync(join(root, 'tmp/push-gate')) ? readdirSync(join(root, 'tmp/push-gate')).filter((name) => !name.endsWith('.trash')) : [];
  assert.deepEqual(copies, []);
  assert.equal(git(['worktree', 'list']).stdout.trim().split('\n').length, 1);
});

test('no command is a usage error', () => {
  const { root } = repo();
  assert.equal(cli(root, []).status, 2);
  assert.equal(cli(root, ['--']).status, 2);
});

// Only a repo with a watch parity build (sharddev's `check:watch-build`) writes parity frames for the gate to keep.
const manifest = join(import.meta.dirname, '..', 'package.json');
const scripts = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')).scripts ?? {} : {};
test('the push gate keeps the watch parity frames outside the copy it deletes', { skip: scripts['check:watch-build'] === undefined && 'no watch parity build here' }, () => {
  const source = readFileSync(join(import.meta.dirname, 'run-checks.mjs'), 'utf8');
  assert.match(source, /if \(copy !== null\) env\.WS_PARITY_FRAMES \?\?= join\(root, 'tmp', 'push-gate', 'watch-parity'\);/u);
});
