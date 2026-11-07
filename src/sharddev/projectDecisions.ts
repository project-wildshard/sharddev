import * as v from 'valibot';
import { nativeRuntimeActorIds } from '@wildshard/format/nativeRuntimePlan';
import { buildDecisionRegistries } from '@wildshard/format/decisionBindings';
import { DeclaredBodyOpsSchema, declaredBodyRegistries } from '@wildshard/format/bodySlots';
import { parseActorMoves } from '@wildshard/format/actorMoves';
import { readCreatureStrikes } from '@wildshard/format/creatures';
import type { Shardfile } from '@wildshard/format/shardSchema';
import type { OutputFile } from '@wildshard/format/outputIndex';
import { compileDecisionScripts, readDecisionSources, type DecisionBuildOptions } from './buildDecisionScripts';
import { outputDecisionScripts } from './outputProduct';
import { emitPlatformSections } from './platformSections';
import { parseWorldTargets } from '@wildshard/format/worldTargets';
import { hashAssetBytes } from './assetHandle';
import type { EmittedSections } from './sections';
import type { NamedBlob } from './blobs';

/** Standalone policy is an explicit author declaration, separate from shipped runtime/content. */
export function projectDecisionOptions(input: unknown, decisionLegacyLines?: number): DecisionBuildOptions {
  const options = v.parse(v.strictObject({ asLineCeiling: v.exactOptional(v.pipe(v.number(), v.safeInteger(), v.minValue(0))) }), input ?? {});
  return { ...options, ...(decisionLegacyLines === undefined ? {} : { decisionLegacyLines }) };
}
/** Replace the declared decision payload with freshly compiled rows; no old Wasm bytes are needed to build it. */
export async function prepareProjectDecisions(project: string, source: Shardfile, platform: EmittedSections | undefined, options: DecisionBuildOptions): Promise<{
  platform?: EmittedSections; blobs: readonly NamedBlob[]; replaced: ReadonlySet<string>;
}> {
  const rows = outputDecisionScripts(platform);
  if (rows.length === 0) return { ...(platform === undefined ? {} : { platform }), blobs: [], replaced: new Set() };
  const authored = readDecisionSources(project);
  const moveEntry = platform?.sections.find(row => row.name === 'actors/moves'), moveBytes = moveEntry === undefined ? undefined : platform?.files.get(moveEntry.path);
  const moves = moveBytes === undefined ? [] : parseActorMoves(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(moveBytes)));
  const targetEntry = platform?.sections.find(row => row.name === 'world/targets'), targetBytes = targetEntry === undefined ? undefined : platform?.files.get(targetEntry.path);
  if (targetEntry !== undefined && targetBytes === undefined) throw new Error('Missing declared world target section bytes');
  if (targetEntry !== undefined && targetBytes !== undefined && (targetBytes.length !== targetEntry.bytes || hashAssetBytes(targetBytes) !== targetEntry.hash)) throw new Error('World target section hash or size mismatch');
  const worldTargets = targetBytes === undefined ? undefined : parseWorldTargets(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(targetBytes)));
  const strikeEntry = platform?.sections.find(row => row.name === 'actors/strikes'), strikeBytes = strikeEntry === undefined ? undefined : platform?.files.get(strikeEntry.path);
  if (strikeEntry !== undefined && strikeBytes === undefined) throw new Error('Missing declared native strike section bytes');
  if (strikeEntry !== undefined && strikeBytes !== undefined && (strikeBytes.length !== strikeEntry.bytes || hashAssetBytes(strikeBytes) !== strikeEntry.hash)) throw new Error('Native strike section hash or size mismatch');
  const strikes = strikeBytes === undefined ? [] : readCreatureStrikes(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(strikeBytes)));
  const nativeEntry = platform?.sections.find(row => row.name === 'sim/runtime-plan');
  const nativeBytes = nativeEntry === undefined ? undefined : platform?.files.get(nativeEntry.path);
  if (nativeEntry !== undefined && (nativeBytes === undefined || nativeBytes.length !== nativeEntry.bytes || hashAssetBytes(nativeBytes) !== nativeEntry.hash)) throw new Error('Native plan section hash or size mismatch');
  const nativeActors = source.runtime === null && nativeBytes !== undefined
    ? nativeRuntimeActorIds(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(nativeBytes))) : [];
  // G566: the shard's declared bodies (sim/bodies) resolve the scripts' Body / Collider aliases, as the runtime host does
  const bodyEntry = platform?.sections.find(row => row.name === 'sim/bodies'), bodyBytes = bodyEntry === undefined ? undefined : platform?.files.get(bodyEntry.path);
  if (bodyEntry !== undefined && (bodyBytes === undefined || bodyBytes.length !== bodyEntry.bytes || hashAssetBytes(bodyBytes) !== bodyEntry.hash)) throw new Error('Declared body section hash or size mismatch');
  const bodies = bodyBytes === undefined ? {} : declaredBodyRegistries(v.parse(DeclaredBodyOpsSchema, JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bodyBytes))));
  const built = await compileDecisionScripts(rows, { ...buildDecisionRegistries(source, moves, worldTargets, strikes, rows, nativeActors), ...bodies }, authored, options);
  const emitted = emitPlatformSections(new Map([['sim/scripts', built.rows]])), sections = [...(platform?.sections ?? []).filter(row => row.name !== 'sim/scripts'), ...emitted.sections];
  const files = new Map(platform?.files);
  for (const row of platform?.sections ?? []) if (row.name === 'sim/scripts') files.delete(row.path);
  for (const [path, bytes] of emitted.files) files.set(path, bytes);
  return { platform: { sections, files }, blobs: built.blobs, replaced: new Set(rows.map(row => row.module.slice('blobs/wasm/'.length, -'.wasm'.length))) };
}
/** Source declarations previously emitted by a v1 producer are superseded by the official author compiler. */
export function replacedDecisionBlob(row: { kind: string; source: string }, replaced: ReadonlySet<string>): boolean {
  return row.kind === 'wasm' && replaced.has((row.source.split('/').at(-1) ?? '').replace(/\.wasm$/u, ''));
}
/** Preserve an authored logical name when its old hash declaration is replaced. */
export function decisionBlobNames(blobs: readonly NamedBlob[], files: readonly OutputFile[], sources: readonly { name: string; source: string; kind: string }[], oldRows: ReturnType<typeof outputDecisionScripts>): readonly NamedBlob[] {
  return blobs.map(blob => {
    const row = oldRows.find(candidate => blob.file.name === `behaviour/${candidate.id}.wasm`), hash = row?.module.slice('blobs/wasm/'.length, -'.wasm'.length);
    const name = hash === undefined ? undefined : files.find(file => file.hash === hash)?.name ?? sources.find(file => replacedDecisionBlob(file, new Set([hash])))?.name;
    return name === undefined ? blob : { ...blob, file: { ...blob.file, name } };
  });
}
