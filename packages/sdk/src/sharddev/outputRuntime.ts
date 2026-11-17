// oxlint-disable-next-line import/no-nodejs-modules -- The author build owns the generated runtime copy.
import { existsSync, lstatSync, readdirSync, realpathSync, rmSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Runtime inventory paths are local project-relative paths.
import { dirname, relative, resolve, sep } from 'node:path';
import { parseSync } from 'vite';
import { runtimeMirrorIssues, type RuntimeMirror } from './runtimeMirrors';
import type { OutputIndex } from '@wildshard/format/outputIndex';

export interface RuntimeCopyFile { readonly path: string; readonly hash: string; readonly bytes: number; readonly lines: number }
export interface RuntimeCopy { readonly files: readonly RuntimeCopyFile[]; readonly lines: number }

/** Validate declared constant mirrors without a custom runtime registry. */
export function validateRuntimeData(mirrors: readonly RuntimeMirror[], copiedConstants: Readonly<Record<string, unknown>> | undefined): void {
  if (mirrors.length > 0 && copiedConstants === undefined) throw new Error('Declared mirrors require runtime/const.ts');
  const issues = runtimeMirrorIssues(mirrors, copiedConstants ?? {});
  if (issues.length > 0) throw new Error(issues.join('\n'));
}

/** Client-plan products contain no copied executable runtime. Platform data
 * and registered named files retain their original output-owner validation. */
export function proveRuntimeData(_destination: string, index: OutputIndex, mirrors: readonly RuntimeMirror[]): void {
  if (index.runtime !== null && index.runtime.files.length > 0) throw new Error('Runtime proof requires a client-plan output with no copied TypeScript');
  if (index.schemas.length > 0 || index.sections.some(row => row.name.startsWith('custom/'))) throw new Error('Custom runtime registries are retired');
  validateRuntimeData(mirrors, undefined);
}

/** Parser comment ranges preserve strings, regexes and template literal text.
 * Only nonblank lines after comment removal count; byte output is never edited. */
export function runtimeCodeLines(source: string, path = 'runtime/index.ts'): number {
  const parsed = parseSync(path, source);
  if (parsed.errors.length > 0) throw new Error(`Invalid runtime TypeScript: ${path}`);
  const chunks: string[] = []; let cursor = 0;
  for (const { start, end } of parsed.comments) {
    chunks.push(source.slice(cursor, start), source.slice(start, end).replaceAll(/[^\n]/gu, ' ')); cursor = end;
  }
  chunks.push(source.slice(cursor));
  return chunks.join('').split('\n').filter(line => line.trim()).length;
}

/** A client-plan product ships no runtime TypeScript (LD9 retired the copied-runtime entry): runtime/ may hold only
 * declaration files (`.d.ts`), never executable source, and the owned destination/runtime directory is cleared so no
 * earlier copy can linger. Symlinks and non-TypeScript files are refused before anything is deleted. */
export function writeRuntimeFiles(project: string, destination: string): RuntimeCopy {
  const root = realpathSync(project), target = resolve(destination);
  if (target === root || target.startsWith(`${root}${sep}`) || root.startsWith(`${target}${sep}`)) throw new Error('Runtime output must be separate from its author project');
  const runtime = resolve(root, 'runtime'), output = resolve(target, 'runtime');
  const walk = (folder: string): void => {
    if (lstatSync(folder).isSymbolicLink()) throw new Error('Runtime cannot contain symlinks');
    for (const item of readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const file = resolve(folder, item.name), path = relative(root, file).split(sep).join('/');
      if (item.isSymbolicLink()) throw new Error(`Runtime cannot contain symlinks: ${path}`);
      if (item.isDirectory()) { walk(file); continue; }
      if (!item.isFile() || !/^(?:[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\/)*[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.ts$/u.test(path)) throw new Error(`Runtime accepts TypeScript files only: ${path}`);
      if (path === 'runtime/sections.ts' || path.endsWith('/productSections.d.ts')) throw new Error(`Custom runtime registries are retired: ${path}`);
      if (!path.endsWith('.d.ts')) throw new Error(`Client-plan runtime cannot contain executable source: ${path}`);
    }
  };
  if (existsSync(runtime)) walk(runtime);
  // Reject symlinked output ancestors before deleting anything.
  for (let folder = output; ; folder = dirname(folder)) {
    if (existsSync(folder) && lstatSync(folder).isSymbolicLink()) throw new Error('Runtime output cannot contain symlinks');
    if (folder === dirname(folder)) break;
  }
  if (existsSync(output)) rmSync(output, { recursive: true });
  return { files: [], lines: 0 };
}
