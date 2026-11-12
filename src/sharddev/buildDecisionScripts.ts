// oxlint-disable-next-line import/no-nodejs-modules -- Build-only author source intake is confined to the project.
import { existsSync, readdirSync, realpathSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve only project-owned AssemblyScript input paths.
import { posix, resolve, sep } from 'node:path';
import { parseDecisionScripts, type DecisionScriptRow } from '@wildshard/format/decisionScripts';
import { admitScriptContract } from '@wildshard/format/scriptContract';
import { buildDecisionRegistries, type DecisionRegistries } from '@wildshard/format/decisionBindings';
import { parseActorMoves } from '@wildshard/format/actorMoves';
import { CreaturesSchema } from '@wildshard/format/creatures';
import { parseRows } from '@wildshard/format/rows';
import * as v from 'valibot';
import { compileScript } from './bake/compileScript';
import { generateDecisionBindings } from './decisionScriptBindings';
import { inspectDecisionSource, checkDecisionHandlers } from './decisionSource';
import { nameBlob, type NamedBlob } from './blobs';
import { readBoundedFile } from './sourceReader';
import { hashImmutableBytes } from '@wildshard/engine/host/immutable';
import { hashAssetBytes } from './assetHandle';
import { WS_CORE } from './as/ws';
import { viewGameplayLine } from './productOutput';

import type { AssemblyScriptMemo } from './bake/assemblyscriptMemoPort';

/** Root adapters supply the sealed legacy count; standalone authors declare their explicit ceiling. */
export interface DecisionBuildOptions { compileMemo?: AssemblyScriptMemo; decisionLegacyLines?: number; asLineCeiling?: number; development?: boolean; singleSignal?: boolean }
/** No SDK import reaches repo policy. An explicit legacy denominator overrides a standalone declaration. */
export function decisionLineCeiling(options: DecisionBuildOptions): number {
  const count = options.decisionLegacyLines ?? options.asLineCeiling;
  if (count === undefined) throw new Error('Decision scripts require buildOptions.asLineCeiling for standalone projects');
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid authored AssemblyScript line budget');
  return options.decisionLegacyLines === undefined ? count : Math.floor(count / 10);
}
/** Compile actual author sources through generated capabilities and the defining v1 admission contract.
 * Bindings and glue stay virtual compiler inputs, so guest i32 globals never pollute host TypeScript. */
export async function compileDecisionScripts(input: unknown, registries: DecisionRegistries, authored: ReadonlyMap<string, string>, options: DecisionBuildOptions): Promise<{
  rows: readonly DecisionScriptRow[]; blobs: readonly NamedBlob[]; generated: ReadonlyMap<string, string>; lines: number; ceiling: number;
}> {
  // SERVER-PARITY SS8: a view row that writes gameplay names itself here, ahead of the schema's unnamed row rule.
  const viewWrites = (Array.isArray(input) ? input : []).flatMap((row: unknown) => viewGameplayLine(row));
  if (viewWrites.length > 0) throw new Error(viewWrites.join('\n'));
  const rows=parseDecisionScripts(input),captured=await captureDecisionSources(authored,options),{lines,ceiling}=captured;
  const generated=new Map<string,string>(),compiled:DecisionScriptRow[]=[],blobs=new Map<string,NamedBlob>();
  for(const row of rows){
    const binding=generateDecisionBindings(row,registries,options),sources={...binding.sources,...captured.entry(row,binding.path)};
    const bytes = await compileScript(binding.glue, { abi: 1, maximumPages: row.pages, sources, ...(options.compileMemo === undefined ? {} : { compileMemo: options.compileMemo }) });
    admitScriptContract(bytes, { abi: 1, pages: row.pages });
    const hash = hashAssetBytes(bytes), module = `blobs/wasm/${hash}.wasm`;
    const text = authored.get(row.source);
    if (text === undefined) throw new Error(`Missing decision source: ${row.source}`);
    compiled.push({ ...row, module, sourceHash: hashImmutableBytes(new TextEncoder().encode(text)) });
    if (!blobs.has(hash)) blobs.set(hash, nameBlob(`behaviour/${row.id}.wasm`, 'wasm', bytes, { critical: true, script: { abi: 1, pages: row.pages } }));
    generated.set(binding.path, binding.bindings); generated.set(`${binding.path.slice(0, -3)}.glue.ts`, binding.glue);
  }
  generated.set('sdk/as/ws.ts', WS_CORE);
  return { rows: compiled, blobs: [...blobs.values()], generated, lines, ceiling };
}
/** Compile from validated author registry rows and actual move data; no format/compiler import enters a build program. */
export function compileDeclaredDecisionScripts(input: unknown, source: Omit<Parameters<typeof buildDecisionRegistries>[0], 'creatures' | 'rows'> & { creatures: unknown; rows: unknown }, moves: unknown, authored: ReadonlyMap<string, string>, options: DecisionBuildOptions): ReturnType<typeof compileDecisionScripts> {
  return compileDecisionScripts(input, buildDecisionRegistries({ ...source, creatures: v.parse(CreaturesSchema, source.creatures), rows: parseRows(source.rows) }, parseActorMoves(moves)), authored, options);
}
/** Read every authored .as (including unreferenced files) for the budget, refusing symlinks and escapes. */
export function readDecisionSources(project: string): ReadonlyMap<string, string> {
  const root = realpathSync(project), files = new Map<string, string>(), behaviour = resolve(root, 'behaviour');
  if (!existsSync(behaviour)) return files;
  let entries = 0, bytes = 0;
  const visit = (directory: string): void => {
    if (realpathSync(directory) !== directory || !directory.startsWith(root + sep)) throw new Error('Decision source symlinks are not allowed');
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (++entries > 4096 || entry.isSymbolicLink()) throw new Error('Decision source tree exceeds bounds or contains symlinks');
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name.endsWith('.as')) {
        const value = readBoundedFile(path, 1_000_000); bytes += value.length;
        if (bytes > 4_000_000) throw new Error('Decision sources exceed byte cap');
        files.set(path.slice(root.length + 1).split(sep).join('/'), new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(value));
      }
    }
  };
  visit(behaviour); return files;
}
/** Project entry for the same virtual compiler, with no generated file writes or hidden policy reads. */
export function buildDecisionScripts(project: string, input: unknown, registries: DecisionRegistries, options: DecisionBuildOptions): ReturnType<typeof compileDecisionScripts> {
  return compileDecisionScripts(input, registries, readDecisionSources(project), options);
}

/** Inspect every authored source once; entries capture only their checked relative
 * closure. ABI2 uses the same budget/handler/import law without executing ABI1. */
export async function captureDecisionSources(authored:ReadonlyMap<string,string>,options:DecisionBuildOptions):Promise<{
  lines:number;ceiling:number;entry:(row:DecisionScriptRow,bindingPath:string,helpers?:ReadonlySet<string>)=>Record<string,string>;
}>{
  const ceiling=decisionLineCeiling(options),virtual:Record<string,string>={},inspected=new Map<string,Awaited<ReturnType<typeof inspectDecisionSource>>>();
  let lines = 0;
  if (authored.size > 60) throw new Error('Too many authored AssemblyScript sources');
  for (const [path, text] of authored) {
    if (!/^behaviour\/(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\.as$/u.test(path) || path.startsWith('behaviour/generated/')) throw new Error('Invalid authored AssemblyScript path');
    const info = await inspectDecisionSource(text, path); inspected.set(path, info); lines += info.lines;
    virtual[`${path.slice(0, -3)}.ts`] = text;
  }
  if (lines > ceiling) throw new Error(`Authored AssemblyScript budget exceeded: ${lines} > ${ceiling}`);
  return {lines,ceiling,entry:(row,bindingPath,helpers)=>{
    const source=inspected.get(row.source);if(source===undefined)throw new Error(`Missing decision source: ${row.source}`);checkDecisionHandlers(row,source.handlers);
    const sources:Record<string,string>={};
    const pending = [row.source], seen = new Set<string>();
    // Only the entry's transitive AS imports reach this module; other authored AS still counts above.
    while (pending.length > 0) {
      const path = pending.pop(); if (path === undefined || seen.has(path)) continue;
      seen.add(path);
      const info = inspected.get(path), text = authored.get(path);
      if (info === undefined || text === undefined) throw new Error(`Missing decision source: ${path}`);
      const virtualPath = `${path.slice(0, -3)}.ts`; sources[virtualPath] = text;
      for (const specifier of info.imports) {
        if (!specifier.startsWith('.')) throw new Error('Decision source imports must be relative');
        const target = `${posix.normalize(posix.join(posix.dirname(path), specifier)).replace(/\.(?:as|ts)$/u, '')}.ts`;
        // the generated bindings, and SDK helper sources the caller declares (a projection's group helpers)
        if (target === bindingPath || helpers?.has(target) === true) continue;
        if (!Object.hasOwn(virtual, target)) throw new Error(`Undeclared decision source import: ${specifier}`);
        pending.push(`${target.slice(0, -3)}.as`);
      }
    }
    return sources;
  }};
}
