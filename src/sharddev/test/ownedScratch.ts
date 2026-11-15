// oxlint-disable-next-line import/no-nodejs-modules -- Tests own their bounded repository scratch.
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Tests never use the system temp directory.
import { join, resolve } from 'node:path';
import { scratchDir } from '../../../scripts/scratch-dir.mjs';

const task = process.env['WS_LANE_NAME'] ?? `test-dev-${process.pid}`;
const existed = existsSync(resolve('tmp', task));
const parent = scratchDir(task, 'SDK dev fixture', { env: { ...process.env, WS_LANE_NAME: task } });

export const fixtureRoot = (prefix: string): string => mkdtempSync(join(parent, prefix));
export function closeFixtures(): void {
  if (!existed && readdirSync(parent).every(name => name === '.owner')) rmSync(parent, { recursive: true });
}
