// Meta QA 11-25 row 149: a gate red a local run does not show is reproduced the gate's way (push-gate-copy.mjs's CLI):
// the command runs in a clean copy of the commit, never in the checkout with its untracked and uncommitted files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ENV, roots } from './test-helpers.mjs';

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

test('the push gate keeps the watch parity frames outside the copy it deletes', () => {
  const source = readFileSync(join(import.meta.dirname, 'run-checks.mjs'), 'utf8');
  assert.match(source, /if \(copy !== null\) env\.WS_PARITY_FRAMES \?\?= join\(root, 'tmp', 'push-gate', 'watch-parity'\);/u);
});
