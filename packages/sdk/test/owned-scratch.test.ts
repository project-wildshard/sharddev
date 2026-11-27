// oxlint-disable-next-line import/no-nodejs-modules -- Two worker processes share one lane's scratch, as a push gate's do.
import { spawn, spawnSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- The test checks the folders the workers leave.
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Worker and scratch paths.
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

// Meta QA 11-26 row 34: a push gate sets WS_LANE_NAME, so every vitest worker's fixtures shared tmp/<lane>. A worker whose
// fixtures were all gone removed that folder in closeFixtures while another worker, already past its import, was about to
// make one: "ENOENT mkdtemp .../tmp/opus-sf22/node-author-XXXXXX" failed authorBundle.test.ts in the gate.
const owned = resolve(import.meta.dirname, '../src/sharddev/test/ownedScratch.ts');
const lane = `owned-scratch-test-${process.pid}`, laneDir = resolve(import.meta.dirname, '../tmp', lane);
const env = (pool: string): NodeJS.ProcessEnv => ({ ...process.env, WS_LANE_NAME: lane, VITEST_POOL_ID: pool });
// Each line on stdin: `make` prints a new fixture root, `close` runs closeFixtures, then the worker exits on `exit`.
const WORKER = `
import { createInterface } from 'node:readline';
const { fixtureRoot, closeFixtures } = await import(process.argv[1]);
console.log('ready');
for await (const line of createInterface({ input: process.stdin })) {
  if (line === 'make') console.log(fixtureRoot('fixture-'));
  else if (line === 'close') { closeFixtures(); console.log('closed'); }
  else break;
}`;

test('a worker closing its fixtures leaves another worker on the same lane able to make one', async () => {
  try {
    const b = spawn(process.execPath, ['--input-type=module', '-e', WORKER, owned], { env: env('2'), stdio: ['pipe', 'pipe', 'inherit'] });
    const lines: string[] = [];
    let wake: (() => void) | undefined;
    b.stdout.setEncoding('utf8').on('data', (chunk: string) => { lines.push(...chunk.split('\n').filter(Boolean)); wake?.(); });
    const next = async (): Promise<string> => {
      while (lines.length === 0) await new Promise<void>(_resolve => { wake = _resolve; });
      return lines.shift() ?? '';
    };
    expect(await next()).toBe('ready');
    // Worker 1 makes a fixture, removes it as its test's finally does, closes and exits while worker 2 is idle.
    const a = spawnSync(process.execPath, ['--input-type=module', '-e', WORKER, owned], { env: env('1'), input: 'make\nclose\nexit\n', encoding: 'utf8' });
    expect(a.status, a.stderr).toBe(0);
    const [, aRoot] = a.stdout.trim().split('\n');
    expect(aRoot !== undefined && !existsSync(aRoot)).toBe(true);
    b.stdin.write('make\n');
    const bRoot = await next();
    expect(existsSync(bRoot), bRoot).toBe(true);
    b.stdin.write('close\n');
    expect(await next()).toBe('closed');
    expect(existsSync(bRoot)).toBe(false);
    // Row 42: a lane's folder stays with its .owner (the lane or the gate copy removes it), never ownerless.
    expect(readdirSync(laneDir)).toEqual(['.owner']);
    b.stdin.end('exit\n');
  } finally { rmSync(laneDir, { recursive: true, force: true }); }
}, 30_000);

// Meta QA 11-26 row 42: scratchDir makes tmp/<lane>, then its .owner. A sibling worker importing in between found the
// folder ownerless and was refused: "tmp/codex-cookkeys already exists with no .owner" in codex-cookkeys' gate. Here
// the folder is left exactly as the first worker's scratchDir leaves it between those two steps.
test('a worker arriving while a sibling has made the lane folder but not its .owner still gets a fixture', () => {
  try {
    mkdirSync(laneDir, { recursive: true });
    const a = spawnSync(process.execPath, ['--input-type=module', '-e', WORKER, owned], { env: env('3'), input: 'make\nclose\nexit\n', encoding: 'utf8' });
    expect(a.status, a.stderr).toBe(0);
    expect(a.stdout.trim().split('\n')).toHaveLength(3);
    expect(readdirSync(laneDir)).toEqual(['.owner']);
  } finally { rmSync(laneDir, { recursive: true, force: true }); }
}, 30_000);
