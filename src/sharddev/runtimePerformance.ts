// oxlint-disable-next-line import/no-nodejs-modules -- Author CLI inspects bounded local runtime source before building.
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Only canonical checkout paths may consume reviewed transition debt.
import { basename, relative, resolve } from 'node:path';
import { runtimePerformanceViolations, type RuntimePerformanceDebt } from '../../lint/runtime-performance.mjs';
import { readRuntimeFiles, runtimeFileCeiling, RUNTIME_FILE_DEFAULT } from '../../lint/runtime-files.mjs';
import { readBoundedFile } from './sourceReader';

/**
 * Most runtime/ source files a project may hold. Outside projects, the Template and any shard without a line refuse above
 * 128. A first-party checkout shard (policy 'warn', see performancePolicy.ts) reads its shrink-only ceiling from
 * lint/runtime-files.json, seeded for the W2 client moves (G450 (5)) and lowered as W3 converts sim and data out.
 */
export function projectRuntimeFileCeiling(project: string, policy: 'warn' | 'refuse', root: string = resolve(import.meta.dirname, '../..')): number {
  return policy === 'warn' ? runtimeFileCeiling(readRuntimeFiles(root), basename(realpathSync(project))) : RUNTIME_FILE_DEFAULT;
}

/** Syntax-only author guard: outside projects have zero allowance for unsafe custom runtime. */
export function checkProjectRuntime(project: string, policy: 'warn' | 'refuse', root: string = resolve(import.meta.dirname, '../..')): void {
  const directory = resolve(project, 'runtime'); if (!existsSync(directory)) return;
  const ceiling = projectRuntimeFileCeiling(project, policy, root);
  const baseline = policy === 'warn' ? (JSON.parse(readFileSync(resolve(root, 'lint/runtime-performance.json'), 'utf8')) as { sites: Record<string, RuntimePerformanceDebt> }).sites : {};
  const pending = [directory], decoder = new TextDecoder('utf-8', { fatal: true }); let files = 0, directories = 0;
  while (pending.length > 0) {
    const folder = pending.pop(); if (folder === undefined) break;
    if (++directories > 128) throw new Error('Custom runtime exceeds source directory bound');
    for (const entry of readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = resolve(folder, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Custom runtime cannot escape through a symlink');
      if (entry.isDirectory()) { pending.push(path); continue; }
      if (!/\.[cm]?[jt]sx?$/u.test(entry.name) || entry.name.endsWith('.d.ts')) continue;
      if (++files > ceiling) throw new Error(`Custom runtime exceeds source file bound (${ceiling}; lint/runtime-files.json)`);
      const filename = relative(root, path).replaceAll('\\', '/');
      const failures = runtimePerformanceViolations(decoder.decode(readBoundedFile(path, 1_000_000)), filename, baseline);
      if (failures.length > 0) throw new Error(failures.map(site => `${filename}:${site.line}: ${site.kind}: ${site.message}`).join('\n'));
    }
  }
}
