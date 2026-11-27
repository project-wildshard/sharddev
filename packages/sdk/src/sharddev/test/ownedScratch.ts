// oxlint-disable-next-line import/no-nodejs-modules -- Tests own their bounded repository scratch.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmdirSync, rmSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Tests never use the system temp directory.
import { join, resolve } from 'node:path';
import { scratchDir } from '../../../scripts/scratch-dir.mjs';

const task = process.env['WS_LANE_NAME'] ?? `test-dev-${process.pid}`;
// scratch-dir.mjs makes <packages/sdk>/tmp/<task>, whatever the working directory.
const existed = existsSync(resolve(import.meta.dirname, '../../../tmp', task));
const parent = scratchDir(task, 'SDK dev fixture', { env: { ...process.env, WS_LANE_NAME: task } });
// Meta QA 11-26 row 34: with WS_LANE_NAME set (every main-push gate), all vitest workers share tmp/<lane>, and one file's
// closeFixtures removed it while another was mid-test (ENOENT mkdtemp .../tmp/opus-sf22/node-author-…). Each worker now
// keeps its fixtures in its own folder and removes only that; the shared parent goes only when empty, never under a worker.
const worker = join(parent, `worker-${process.env['VITEST_POOL_ID'] ?? 'main'}-${process.pid}`);

export const fixtureRoot = (prefix: string): string => {
  // A sibling worker may have removed the shared parent once it held only .owner: make both again.
  mkdirSync(worker, { recursive: true });
  return mkdtempSync(join(worker, prefix));
};
export function closeFixtures(): void {
  rmSync(worker, { recursive: true, force: true });
  if (existed) return;
  try {
    if (!readdirSync(parent).every(name => name === '.owner')) return;
    rmSync(join(parent, '.owner'), { force: true });
    rmdirSync(parent);
  } catch {
    // Another worker made its folder in between (rmdir refuses a non-empty folder) or already removed the parent.
  }
}
