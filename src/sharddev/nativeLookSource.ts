import { HullLookBookSchema } from '@wildshard/format/speciesLooks';
import { commonHullSpecies } from '@wildshard/kit/geometry/nativeLooks';
import * as v from 'valibot';
import { encodeCanonicalJson, hashImmutableBytes } from './immutable';
import type { EmittedSections } from './sections';

/** Copy the old kit bases into the product; packed bodies and authored look overrides retain their owners. */
export function expandNativeLookSource(input: unknown, warn: (message: string) => void = console.warn): unknown {
  const book = v.parse(HullLookBookSchema, input), definitions = { ...book.definitions };
  let changed = false;
  const rows = book.rows.map(row => {
    if (row.base !== 'registered' || row.kind !== 'boar' && row.kind !== 'bear') return row;
    if (Object.hasOwn(definitions, row.kind)) throw new Error(`Registered kit look \`${row.kind}\` conflicts with an explicit definition; select the definition base`);
    definitions[row.kind] = commonHullSpecies(row.kind, row.species);
    changed = true;
    warn(`look \`${row.id}\` uses an old registered kit base: copied its complete native definition`);
    return { ...row, base: 'definition' as const };
  });
  return changed ? v.parse(HullLookBookSchema, { ...book, definitions, rows }) : input;
}

/** Rewrite only verified hull metadata; every packed body file keeps its exact bytes. */
export function expandNativeLookSections(platform: EmittedSections): EmittedSections {
  const section = platform.sections.find(row => row.name === 'look/hull-book');
  if (section === undefined) return platform;
  const bytes = platform.files.get(section.path);
  if (bytes === undefined || bytes.length !== section.bytes || hashImmutableBytes(bytes) !== section.hash) throw new Error('Native hull section differs from its declared bytes');
  const input: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const expanded = expandNativeLookSource(input);
  if (expanded === input) return platform;
  if (platform.sections.some(row => row !== section && row.path === section.path)) throw new Error('Native hull expansion requires a separate section path');
  const output = new TextEncoder().encode(encodeCanonicalJson(expanded)), files = new Map(platform.files);
  files.set(section.path, output);
  return { files, sections: platform.sections.map(row => row === section ? { ...row, hash: hashImmutableBytes(output), bytes: output.length } : row) };
}
