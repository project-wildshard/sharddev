import { afterEach, expect, test } from 'vitest';
// oxlint-disable-next-line import/no-nodejs-modules -- The test owns bounded local author fixtures.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Fixtures remain under the ignored test scratch root.
import { dirname, resolve } from 'node:path';
import { projectSourceStamp } from './dev';

const directories: string[] = [];
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true }); });
const put = (root: string, path: string, body: string): void => { mkdirSync(dirname(resolve(root, path)), { recursive: true }); writeFileSync(resolve(root, path), body); };

test('a plan worktree inside a shard repo never changes its dev source stamp (DEV-SPEED DS11)', () => {
  mkdirSync('tmp', { recursive: true });
  const root = mkdtempSync(resolve('tmp', 'dev-source-stamp-')); directories.push(root);
  put(root, 'shard.config.ts', 'export default {};\n');
  const before = projectSourceStamp(root);
  put(root, '.worktrees/plan/shard.config.ts', 'export default { other: true };\n');
  expect(projectSourceStamp(root)).toBe(before);
  put(root, 'generators/output.ts', 'export const output = {};\n');
  expect(projectSourceStamp(root)).not.toBe(before);
});

test('Vitest watch mode and the injected-builder tree hash both skip plan worktrees (DEV-SPEED DS11)', () => {
  expect(readFileSync('vitest.config.ts', 'utf8')).toMatch(/server: \{ watch: \{ ignored: worktreeWatchIgnored\(\) \} \}/u);
  expect(readFileSync('scripts/build-shardfiles.mjs', 'utf8')).toMatch(/treeHashes\(root\)\]\.filter\(\(\[path\]\) => !isWorktreePath\(path\)\)/u);
});
