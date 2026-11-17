import { isJsonData } from '@wildshard/format/json';
import { encodeCanonicalJson } from './immutable';

/**
 * A value the shard's standalone `runtime/` keeps its own copy of in `runtime/const.ts` (G449: whatever the runtime needs
 * is duplicated into it). `data/` declares the mirror next to the source value; the build checks the copy against it.
 */
export interface RuntimeMirror {
  readonly name: string;
  readonly value: unknown;
}

const NAME = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;

/** Declare in `data/` that `runtime/const.ts` exports `name` with exactly this value (plain JSON, compared canonically). */
export function defineMirror(name: string, value: unknown): RuntimeMirror {
  if (!NAME.test(name)) throw new Error(`Runtime mirror name must be an export identifier: ${name}`);
  if (!isJsonData(value)) throw new Error(`Runtime mirror ${name} must be plain JSON`);
  return { name, value };
}

/**
 * Build step 5 (P2a spec §2.3): compare the mirrors `data/` declares with the module namespace of the copied
 * `out/<slug>/runtime/const.ts`. Returns every issue (empty = consistent): a duplicate mirror, a missing export, or a
 * value that differs from its source. Exports `data/` does not mirror (runtime-only numbers) are allowed.
 */
export function runtimeMirrorIssues(mirrors: readonly RuntimeMirror[], runtimeConst: Readonly<Record<string, unknown>>): readonly string[] {
  const issues: string[] = [], seen = new Set<string>();
  for (const mirror of mirrors) {
    if (seen.has(mirror.name)) { issues.push(`${mirror.name}: declared twice in data/`); continue; }
    seen.add(mirror.name);
    if (!Object.hasOwn(runtimeConst, mirror.name)) { issues.push(`${mirror.name}: runtime/const.ts does not export it`); continue; }
    const copy = runtimeConst[mirror.name];
    if (!isJsonData(copy) || encodeCanonicalJson(copy) !== encodeCanonicalJson(mirror.value)) {
      issues.push(`${mirror.name}: runtime/const.ts has ${JSON.stringify(copy)}, data/ has ${JSON.stringify(mirror.value)}`);
    }
  }
  return issues;
}
