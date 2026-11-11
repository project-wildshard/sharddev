// DEV-SPEED DS11 guard, repo-kit copy (J221, J240): a plan worktree under <repo>/.worktrees/<plan> is invisible to
// the parent checkout's tools. It plants a worktree-shaped tree under this checkout's own .worktrees/ holding a lint
// error, failing tests, an index.html and a secret-shaped string, then runs the parent's tools and fails if any of
// them sees a planted file:
//   - Git ignores it, so nothing of it can be staged: the kit hooks' secrets and size checks read staged blobs only;
//   - oxlint, with every root lint config the repo has, and oxfmt over the whole root;
//   - test discovery: `vitest list` when the repo runs Vitest, and every `node --test` glob in package.json;
//   - Vite's dependency-scan crawl (`**/*.html`, Vite's own globber and options) when the repo has Vite.
// Ships byte-identical in every org repo beside scripts/worktree-ignore.mjs; run it with
// `node --test test/tooling/worktree-guard.test.mjs`. Engine keeps its own, wider guard
// (test/tooling/worktree-ignore.test.mjs: its watchers, its shardfile walk).
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, globSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join, resolve} from 'node:path';
import {after, before, describe, test} from 'node:test';
import {WORKTREES, isWorktreePath} from '../../scripts/worktree-ignore.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const PLANT = `${WORKTREES}/ds11-guard-${String(process.pid)}-${Date.now().toString(36)}`;
const LINT_ERROR = 'export const zzGuard = (value: any) => { debugger; return value }\n';
const FAILING = "import {expect, test} from 'vitest';\ntest('planted', () => { expect(1).toBe(2); });\n";
const FILES = {
  'zz-guard.ts': LINT_ERROR,
  'src/zz-guard.ts': LINT_ERROR,
  'scripts/zz-guard.mjs': 'debugger;\n',
  'src/zz-guard.test.ts': FAILING,
  'test/zz-guard.test.ts': FAILING,
  'test/tooling/zz-guard.test.mjs': "import {test} from 'node:test';\ntest('planted', () => { throw new Error('planted'); });\n",
  'index.html': '<!doctype html><script type="module" src="./zz-entry.ts"></script>\n',
  'zz-entry.ts': "import 'zz-missing-package';\n",
  // Built at run time, so this file itself carries no secret-shaped string.
  'scripts/zz-secret.mjs': `export const key = '${['AKIA', 'IOSFODNN7', 'EXAMPLE'].join('')}';\n`,
};
const PLANTED = Object.keys(FILES).map(path => `${PLANT}/${path}`);

/** A plain child run: no parent test-runner state. */
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('VITEST') && !key.startsWith('NODE_TEST') && key !== 'TEST'));
/** @param {string} command @param {string[]} args */
const run = (command, args) => spawnSync(command, args, {cwd: ROOT, encoding: 'utf8', env, maxBuffer: 1 << 28, timeout: 120_000});
/** The planted paths a tool's output names. @param {string} text */
const seen = text => PLANTED.filter(path => text.includes(path) || text.includes(join(ROOT, path)));
/** @param {string} name */
const bin = name => join(ROOT, 'node_modules/.bin', name);
const scripts = /** @type {Record<string, string>} */ (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts ?? {});

before(() => {
  for (const [path, body] of Object.entries(FILES)) {
    mkdirSync(dirname(join(ROOT, PLANT, path)), {recursive: true});
    writeFileSync(join(ROOT, PLANT, path), body);
  }
});
after(() => {
  rmSync(join(ROOT, PLANT), {recursive: true, force: true});
  // Leave no empty .worktrees/ behind in a checkout that had none.
  try { if (readdirSync(join(ROOT, WORKTREES)).length === 0) rmSync(join(ROOT, WORKTREES), {recursive: true}); } catch { /* Gone. */ }
});

describe('a planted plan worktree is invisible to the parent checkout', () => {
  test('the ignore list names the root folder only', () => {
    assert.equal(isWorktreePath('.worktrees/plan/src/a.ts'), true);
    assert.equal(isWorktreePath('src/.worktrees/a.ts'), false);
    assert.ok(readFileSync(join(ROOT, '.gitignore'), 'utf8').split('\n').includes('/.worktrees/'), '.gitignore lacks /.worktrees/');
  });

  test('Git ignores it, so nothing of it can be staged for the secrets and size checks', () => {
    assert.deepEqual(run('git', ['check-ignore', '--', ...PLANTED]).stdout.trim().split('\n').sort(), [...PLANTED].sort());
    assert.deepEqual(seen(run('git', ['status', '--porcelain', '--untracked-files=all']).stdout), []);
    const staged = run('git', ['add', '--all', '--dry-run']);
    assert.equal(staged.status, 0, staged.stderr);
    assert.deepEqual(seen(staged.stdout), []);
  });

  test('oxlint, with every lint config at the root and in src/, reports nothing from it', () => {
    const configs = [...readdirSync(ROOT).filter(name => /^\.oxlintrc.*\.json$/u.test(name)), ...existsSync(join(ROOT, 'src/.oxlintrc.json')) ? ['src/.oxlintrc.json'] : []];
    assert.ok(configs.length > 0, 'no oxlint config');
    for (const config of configs) {
      const lint = run(bin('oxlint'), ['-c', config, '-f', 'json', '.']);
      assert.equal(lint.error, undefined);
      const report = JSON.parse(lint.stdout.slice(lint.stdout.indexOf('{')));
      assert.ok(report.number_of_files > 0, `${config} linted no files: ${lint.stderr}`);
      assert.deepEqual(seen(lint.stdout), [], config);
    }
  });

  test('a whole-root oxfmt check lists nothing from it', {skip: !existsSync(join(ROOT, 'src/.oxfmtrc.json')) && 'no src/.oxfmtrc.json'}, () => {
    const format = run(bin('oxfmt'), ['-c', 'src/.oxfmtrc.json', '--list-different', '.']);
    // --list-different exits 1 when some file differs; anything else, or any stderr, is a broken run.
    assert.equal(format.error, undefined);
    assert.ok([0, 1].includes(format.status ?? -1), format.stderr);
    assert.deepEqual(seen(format.stdout + format.stderr), []);
  });

  test('Vitest discovers none of its tests', {skip: !existsSync(join(ROOT, 'node_modules/vitest/vitest.mjs')) && 'no Vitest'}, () => {
    const list = run(process.execPath, ['node_modules/vitest/vitest.mjs', 'list', '--filesOnly', '--json']);
    assert.equal(list.status, 0, list.stderr);
    assert.ok(JSON.parse(list.stdout.slice(list.stdout.indexOf('['))).length > 0, 'vitest listed no files');
    assert.deepEqual(seen(list.stdout), []);
  });

  test('no `node --test` glob in package.json reaches it', () => {
    const globs = Object.values(scripts).flatMap(script => [...script.matchAll(/node\s+(?:--\S+\s+)*--test\s+((?:'[^']+'\s*|"[^"]+"\s*|[^\s&|;]+\s*)+)/gu)]
      .flatMap(match => [...(match[1] ?? '').matchAll(/'([^']+)'|"([^"]+)"|(\S+)/gu)].map(part => part[1] ?? part[2] ?? part[3] ?? '')))
      .filter(glob => !glob.startsWith('-'));
    for (const glob of globs) assert.deepEqual(seen(globSync(glob, {cwd: ROOT}).join('\n')), [], glob);
  });

  test("Vite's dependency-scan crawl finds none of its HTML", {skip: !existsSync(join(ROOT, 'node_modules/vite/package.json')) && 'no Vite'}, async () => {
    // Vite 8's globEntries: tinyglobby over **/*.html from the root, ignoring node_modules, the build output, tests and coverage.
    const {glob} = await import(createRequire(realpathSync(join(ROOT, 'node_modules/vite/package.json'))).resolve('tinyglobby'));
    const pages = await glob('**/*.html', {cwd: ROOT, absolute: true, ignore: ['**/dist/**', '**/__tests__/**', '**/coverage/**', '**/node_modules/**']});
    assert.deepEqual(seen(pages.join('\n')), []);
  });
});
