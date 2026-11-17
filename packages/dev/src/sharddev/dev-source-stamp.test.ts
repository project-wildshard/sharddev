import { afterAll, afterEach, expect, test, vi } from 'vitest';
// oxlint-disable-next-line import/no-nodejs-modules -- The test owns bounded local author fixtures.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Fixtures remain under the ignored test scratch root.
import { dirname, resolve } from 'node:path';
import { createDevScratch, projectSourceStamp } from './dev';
import { closeFixtures, fixtureRoot } from '../../../sdk/src/sharddev/test/ownedScratch';

const directories: string[] = [];
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true }); vi.unstubAllEnvs(); });
afterAll(closeFixtures);
const put = (root: string, path: string, body: string): void => { mkdirSync(dirname(resolve(root, path)), { recursive: true }); writeFileSync(resolve(root, path), body); };

test('a plan worktree inside a shard repo never changes its dev source stamp (DEV-SPEED DS11)', () => {
  const root = fixtureRoot('source-stamp-'); directories.push(root);
  put(root, 'shard.config.ts', 'export default {};\n');
  const before = projectSourceStamp(root);
  put(root, '.worktrees/plan/shard.config.ts', 'export default { other: true };\n');
  expect(projectSourceStamp(root)).toBe(before);
  put(root, 'tmp/test-dev/dev-123/build/output.ts', 'export const generated = 1;\n');
  expect(projectSourceStamp(root)).toBe(before);
  put(root, 'generators/output.ts', 'export const output = {};\n');
  expect(projectSourceStamp(root)).not.toBe(before);
});

test('dev scratch carries a live pid and owner inside the project lane folder', () => {
  const root = fixtureRoot('owner-'); directories.push(root);
  put(root, 'package.json', '{}');
  put(root, 'src/index.ts', 'export {};\n');
  const scratch = createDevScratch(resolve(root, 'src'));
  expect(resolve(scratch, '../..')).toBe(resolve(root, 'tmp'));
  expect(JSON.parse(readFileSync(resolve(scratch, '.owner'), 'utf8')).pid).toBe(process.pid);
  expect(readFileSync(resolve(scratch, 'server.pid'), 'utf8')).toBe(String(process.pid));
});

test('flat shard scratch stays in its own repository', () => {
  const root = fixtureRoot('flat-'); directories.push(root);
  put(root, 'package.json', '{}');
  put(root, 'shard.config.ts', 'export default {};\n');
  const scratch = createDevScratch(root);
  expect(resolve(scratch, '../..')).toBe(resolve(root, 'tmp'));
});

test('dev scratch records a Codex runtime identity instead of just its lane', () => {
  vi.stubEnv('CLAUDE_SESSION_ID', undefined); vi.stubEnv('CLAUDE_CODE_SESSION_ID', undefined);
  vi.stubEnv('CODEX_THREAD_ID', 'test-runtime-thread'); vi.stubEnv('WS_LANE_NAME', 'test-codex');
  const root = fixtureRoot('runtime-owner-'); directories.push(root);
  put(root, 'package.json', '{}'); put(root, 'shard.config.ts', 'export default {};\n');
  const scratch = createDevScratch(root);
  const owner = JSON.parse(readFileSync(resolve(scratch, '.owner'), 'utf8')) as {session: string; agent: string};
  expect(owner.session).toBe('test-runtime-thread'); expect(owner.agent).toBe('codex');
});

test('Vitest watch mode and the injected-builder tree hash both skip plan worktrees (DEV-SPEED DS11)', () => {
  expect(readFileSync('vitest.config.ts', 'utf8')).toMatch(/server: \{ watch: \{ ignored: worktreeWatchIgnored\(\) \} \}/u);
  expect(readFileSync('scripts/build-shardfiles.mjs', 'utf8')).toMatch(/treeHashes\(root\)\]\.filter\(\(\[path\]\) => !isWorktreePath\(path\)\)/u);
});
