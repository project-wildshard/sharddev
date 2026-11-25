import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import { writeReferenceProject } from '../src/sharddev/newProject';

// The sdk's own tsconfig never compiles the template, so a type error in Mossgate reached main green and failed only
// the packed-install job's `tsc` on a new repo (661da3e7: BOAR_ITEMS' icons inferred as string). This runs that same
// check in the push lane: `new`'s repo files and source, its scaffold tsconfig, the sdk's TypeScript, the workspace's
// format and sdk.
test('a new reference repo typechecks under its own tsconfig', { timeout: 120_000 }, () => {
  const scratch = resolve(import.meta.dirname, '../../../tmp');
  mkdirSync(scratch, { recursive: true });
  const dir = mkdtempSync(join(scratch, 'template-tsc-'));
  try {
    const project = join(dir, 'packed-isle');
    writeReferenceProject(project, 'packed-isle');
    symlinkSync(resolve(import.meta.dirname, '../node_modules'), join(project, 'node_modules'), 'dir');
    const ts = dirname(createRequire(import.meta.url).resolve('@typescript/typescript6/package.json'));
    let output = '';
    try {
      execFileSync(process.execPath, [join(ts, 'bin/tsc6'), '-p', 'tsconfig.json'], { cwd: project, encoding: 'utf8', stdio: 'pipe' });
    } catch (error) {
      output = String((error as { stdout?: unknown }).stdout ?? error);
    }
    expect(output).toBe('');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
