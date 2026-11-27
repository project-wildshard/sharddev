// oxlint-disable-next-line import/no-nodejs-modules -- Tests own their bounded repository scratch.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmdirSync, rmSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Tests never use the system temp directory.
import { join, resolve } from 'node:path';
import { scratchDir } from '../../../scripts/scratch-dir.mjs';

const lane = process.env['WS_LANE_NAME'];
const task = lane ?? `test-dev-${process.pid}`;
const env = { ...process.env, WS_LANE_NAME: task };
// scratch-dir.mjs makes <packages/sdk>/tmp/<task>, whatever the working directory.
const tmp = resolve(import.meta.dirname, '../../../tmp');
const existed = existsSync(join(tmp, task));

// Meta QA 11-26 row 42: scratchDir makes the folder, then writes its .owner, so a sibling worker arriving in between
// was refused ("tmp/codex-cookkeys already exists with no .owner", codex-cookkeys' sharddev gate). The shared folder
// now appears with its .owner already inside: staged under its own name, then renamed into place in one step. A rename
// that finds the folder there (a sibling won, or the lane made it) keeps that one, and scratchDir checks it is ours.
function ownedParent(): string {
  if (!existsSync(join(tmp, task, '.owner'))) {
    const stage = scratchDir(`${task}-stage-${process.pid}`, 'SDK dev fixture, staged', { env });
    try {
      renameSync(stage, join(tmp, task));
    } catch (error) {
      rmSync(stage, { recursive: true, force: true });
      const code = error instanceof Error && 'code' in error ? error.code : '';
      if (code !== 'EEXIST' && code !== 'ENOTEMPTY') throw error;
    }
  }
  return scratchDir(task, 'SDK dev fixture', { env });
}

const parent = ownedParent();
// Meta QA 11-26 row 34: with WS_LANE_NAME set (every main-push gate), all vitest workers share tmp/<lane>, and one
// file's closeFixtures removed it while another was mid-test. Each worker keeps its fixtures in its own folder and
// removes only that.
const worker = join(parent, `worker-${process.env['VITEST_POOL_ID'] ?? 'main'}-${process.pid}`);

export const fixtureRoot = (prefix: string): string => {
  if (!existsSync(join(parent, '.owner'))) ownedParent();
  mkdirSync(worker, { recursive: true });
  return mkdtempSync(join(worker, prefix));
};
export function closeFixtures(): void {
  rmSync(worker, { recursive: true, force: true });
  // A lane's folder is shared by its workers and is the lane's to remove (a gate copy goes whole): removing its .owner
  // then the folder left a window where a sibling found it ownerless (row 42). Only this process's own folder goes.
  if (existed || lane !== undefined) return;
  try {
    if (!readdirSync(parent).every(name => name === '.owner')) return;
    rmSync(join(parent, '.owner'), { force: true });
    rmdirSync(parent);
  } catch {
    // Already gone, or not empty.
  }
}
