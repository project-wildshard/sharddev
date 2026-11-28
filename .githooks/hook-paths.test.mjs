// Meta QA 11-25 row 159: the lean layout moved src/scripts/ but pre-push still tested `$top/scripts/...`, so the
// format-ceiling (CP3) and retired-vocabulary (FP58) gates silently never ran. Every script path a git hook names must
// exist, and a guarded step must test the same file it runs.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '..');
const HOOKS = ['pre-commit', 'pre-push', 'commit-msg'];

/** Every script path a hook names: `$top/<path>`, `$hooks/<file>`, and `node <relative path>`. @param {string} text */
export function hookPaths(text) {
  const code = text.split('\n').filter((line) => !line.trimStart().startsWith('#')).join('\n');
  /** @type {string[]} */ const paths = [];
  for (const match of code.matchAll(/\$top\/([\w./-]+\.m?[jt]s)/gu)) paths.push(match[1] ?? '');
  for (const match of code.matchAll(/\$hooks\/([\w./-]+\.m?[jt]s)/gu)) paths.push(`.githooks/${match[1] ?? ''}`);
  for (const match of code.matchAll(/\bnode ((?:src|scripts|packages)\/[\w./-]+\.m?[jt]s)/gu)) paths.push(match[1] ?? '');
  return [...new Set(paths)];
}

/** Each `if [ -f "$top/<a>" ]; then ... node <b>` pair: the file tested and the file run. @param {string} text */
export function guardedSteps(text) {
  return [...text.matchAll(/if \[ -f "\$top\/([\w./-]+)" \]; then [^\n]*?\bnode ([\w./-]+)/gu)].map((match) => ({ tested: match[1], run: match[2] }));
}

for (const hook of HOOKS) {
  test(`${hook}: every script path it names exists, and a guarded step tests the file it runs`, () => {
    const text = readFileSync(join(root, '.githooks', hook), 'utf8');
    const paths = hookPaths(text);
    assert.ok(paths.length > 0, `${hook} names its scripts`);
    for (const path of paths) assert.ok(existsSync(join(root, path)), `${hook} names ${path}, which does not exist`);
    for (const step of guardedSteps(text)) assert.equal(step.tested, step.run, `${hook} tests ${step.tested} but runs ${step.run}`);
  });
}

test('the old shape is caught: a guard on a moved path, or a missing script', () => {
  // the old path is built, not written, so the script-paths gate does not read this fixture as a stale reference
  const gone = ['scripts', 'format-api-gate.mjs'].join('/');
  const stale = `if [ -f "$top/${gone}" ]; then (cd "$top" && node src/${gone} refs); fi\n`;
  assert.deepEqual(guardedSteps(stale), [{ tested: gone, run: `src/${gone}` }]);
  assert.deepEqual(hookPaths(`# $top/${gone}\n${stale}`), [gone, `src/${gone}`]);
  assert.equal(existsSync(join(root, gone)), false);
});
