// A checkout may still have a dist/build.mjs compiled before its format
// or SDK changed. Compile the current dependencies beside dist, then run
// the same engine-free entry shipped by prepack.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const scratchRoot = join(root, 'tmp');
mkdirSync(scratchRoot, { recursive: true });
const scratch = mkdtempSync(join(scratchRoot, 'build-source-'));
try {
  const bin = join(scratch, 'build.mjs');
  execFileSync(process.execPath, [join(import.meta.dirname, 'compile.mjs'), bin], { stdio: ['ignore', 'ignore', 'inherit'] });
  await import(pathToFileURL(bin).href);
} finally { rmSync(scratch, { recursive: true, force: true }); }
