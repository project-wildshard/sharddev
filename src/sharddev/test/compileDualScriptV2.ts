// Test-only setup for the retained real ABI2 protocol contracts.
/** H13's unshipped dual-admission artifacts. Both wrappers receive the same
 * authored closure; neither artifact replaces the public v0/v1 product. */
import { admitScriptContract } from '@wildshard/format/scriptContract';
import { admitScriptV2,parseScriptArtifactV2,SCRIPT_V2_REVISIONS,type ScriptArtifactV2 } from '@wildshard/format/scriptAdmissionV2';
import type { V2Lane } from '@wildshard/format/scriptFuelV2';
import { inspectDecisionSource } from '../decisionSource';
import { hashImmutableBytes } from '../immutable';
import { compileScript } from '../bake/compileScript';
import { compileScriptV2 } from '../bake/compileScriptV2';

interface Wrapper { readonly source: string; readonly sources?: Readonly<Record<string,string>> }
function checkSource(path: string,text: string): void {
  if (path === 'main.ts' || !/^(?:[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\/)*[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.ts$/u.test(path) || typeof text !== 'string') throw new Error('Invalid dual script virtual source');
}
function resolve(from: string,specifier: string): string {
  if (!specifier.startsWith('.')) throw new Error('Dual script imports must be captured and relative');
  const parts = from.split('/');parts.pop();
  for (const part of specifier.split('/')) {
    if (part === '.' || part.length === 0) continue;
    if (part === '..') { if (parts.length === 0) throw new Error('Dual script import escapes its closure');parts.pop(); }
    else parts.push(part);
  }
  return `${parts.join('/').replace(/\.(?:as|ts)$/u,'')}.ts`;
}
function capture(authors: ReadonlyMap<string,string>,wrapper: Wrapper): Readonly<Record<string,string>> {
  const sources: Record<string,string> = Object.fromEntries(authors);
  for (const [path,text] of Object.entries(wrapper.sources ?? {})) {
    checkSource(path,text);
    if (authors.has(path)) throw new Error('Dual wrapper overrides an authored source');sources[path] = text;
  }
  if (Object.keys(sources).length > 64) throw new Error('Too many dual script virtual sources');
  return sources;
}
async function reachable(source: string,sources: Readonly<Record<string,string>>,authors: ReadonlyMap<string,string>): Promise<void> {
  const pending = ['main.ts'], seen = new Set<string>();
  while (pending.length > 0) {
    const path = pending.pop();if (path === undefined || seen.has(path)) continue;seen.add(path);
    const text = path === 'main.ts' ? source : sources[path];if (text === undefined) throw new Error('Missing dual script source');
    const info = await inspectDecisionSource(text,path);
    for (const name of info.imports) pending.push(resolve(path,name));
  }
  for (const path of authors.keys()) if (!seen.has(path)) throw new Error(`Dual wrapper omits authored source: ${path}`);
}

/** Adapter sources may differ; authored bodies cannot. Full source reachability
 * prevents a fake second wrapper from silently omitting a port's helper files.
 * Callers publish only their explicitly selected candidate, never this v1
 * shadow artifact. The existing public producer remains untouched. */
export async function compileDualScriptV2(input: {
  readonly authored: ReadonlyMap<string,string>; readonly legacy: Wrapper;
  readonly candidate: Wrapper & { readonly lane: V2Lane; readonly ioBytes: number };
  readonly pages: number;
}): Promise<{
  readonly legacy: { readonly bytes: Uint8Array; readonly hash: string };
  readonly candidate: { readonly bytes: Uint8Array; readonly artifact: ScriptArtifactV2 };
  readonly authors: readonly { readonly path: string; readonly hash: string }[];
}> {
  const authored = new Map(input.authored), legacy = input.legacy.source, candidate = input.candidate.source;
  const pages = input.pages, ioBytes = input.candidate.ioBytes, lane = input.candidate.lane;
  if (authored.size === 0 || authored.size > 64 || authored.has('main.ts')) throw new Error('Dual build requires a bounded authored closure outside its wrappers');
  for (const [path,text] of authored) checkSource(path,text);
  const oldSources = capture(authored,input.legacy), newSources = capture(authored,input.candidate);
  await reachable(legacy,oldSources,authored);await reachable(candidate,newSources,authored);
  const oldBytes = await compileScript(legacy,{ abi: 1,maximumPages: pages,sources: oldSources });admitScriptContract(oldBytes,{ abi: 1,pages });
  const newBytes = await compileScriptV2(candidate,{ maximumPages: pages,ioBytes,lane,sources: newSources,compilerRevision: SCRIPT_V2_REVISIONS.compiler });
  admitScriptV2(newBytes,{ ioBytes,lane,compilerRevision: SCRIPT_V2_REVISIONS.compiler,admissionRevision: SCRIPT_V2_REVISIONS.admission });
  return { legacy: { bytes: oldBytes,hash: hashImmutableBytes(oldBytes) },candidate: {
    bytes: newBytes,artifact: parseScriptArtifactV2({ abi: 2,minor: 0,compilerRevision: SCRIPT_V2_REVISIONS.compiler,admissionRevision: SCRIPT_V2_REVISIONS.admission,hash: hashImmutableBytes(newBytes),lane,pages,ioBytes }),
  },authors: [...authored].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([path,text]) => ({ path,hash: hashImmutableBytes(new TextEncoder().encode(text)) })) };
}
