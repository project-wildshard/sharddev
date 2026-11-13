// oxlint-disable-next-line import/no-nodejs-modules -- The test runs the real `wildshard` entry point as an author would.
import { spawnSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the package's bin from this test.
import { resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- Pass the environment through with one key changed.
import process from 'node:process';
import { describe, expect, it } from 'vitest';

// The author CLI's build-cache counters line is for the build pool and for debugging, not for an author: every run,
// refusals included, printed a long `wildshard cache counters: {...}` JSON line. It now prints only when
// WILDSHARD_CACHE_REPORT=1 asks (the build pool sets it for its children, whose report it reads).
const BIN = resolve(import.meta.dirname, '../../bin/wildshard.mjs');
const run = (env: Record<string, string | undefined>): { status: number | null; stderr: string } => {
  // `--prepare-compiler x` refuses before it bundles anything, so this stays fast.
  const result = spawnSync(process.execPath, [BIN, '--prepare-compiler', 'x'], { encoding: 'utf8', env: { ...process.env, WILDSHARD_CACHE_REPORT: undefined, ...env } });
  return { status: result.status, stderr: result.stderr };
};

describe('wildshard cache counters line', () => {
  it('is hidden by default, refusals included, and printed when WILDSHARD_CACHE_REPORT=1', () => {
    const quiet = run({});
    expect(quiet.status).toBe(1);
    expect(quiet.stderr).toContain('Compiler preparation accepts no other arguments');
    expect(quiet.stderr).not.toContain('wildshard cache counters');
    const asked = run({ WILDSHARD_CACHE_REPORT: '1' });
    expect(asked.status).toBe(1);
    expect(asked.stderr).toMatch(/^wildshard cache counters: \{"version":1,/mu);
  });
});
