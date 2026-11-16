import { readSpeciesPrograms, type SpeciesData } from '@wildshard/format/speciesPrograms';
import { legacyHuntTuning } from '@wildshard/kit/legacySpecies';
import { legacyHarvest } from '@wildshard/kit/legacyHarvest';
import { encodeCanonicalJson, hashImmutableBytes } from './immutable';
import type { EmittedSections } from './sections';

/** Expand the old native hunt owner, including its custom policies, without changing policy parameters or callbacks. */
export function expandNativeHuntSource(input: unknown, warn: (message: string) => void = console.warn): unknown {
  const source = readSpeciesPrograms(input);
  const messages = new Set<string>();
  const fill = <T extends SpeciesData>(row: T): T => {
    const tuning = source.hunt !== undefined && row.tuning === undefined ? legacyHuntTuning(row.aggressive === true) : undefined;
    const variants = [...new Set([...row.variants, ...row.spawnOnly ?? []].map(variant => variant.id))];
    const harvest = row.harvest === undefined ? legacyHarvest(row.kind, variants) : undefined;
    if (tuning === undefined && harvest === undefined) return row;
    if (tuning !== undefined) messages.add(`species \`${row.id}\` uses the old native hunt owner: copied kit tuning from its explicit aggressive flag`);
    if (harvest !== undefined) messages.add(`species \`${row.id}\` uses the old harvest law: copied explicit drops for its complete variant roster`);
    return { ...row, ...(tuning === undefined ? {} : { tuning }), ...(harvest === undefined ? {} : { harvest }) };
  };
  const expanded = { ...source, native: source.native.map(fill), page: source.page.map(fill),
    ...(source.program === undefined ? {} : { program: { ...source.program, species: source.program.species.map(fill) } }) };
  if (messages.size === 0) return input;
  const result = readSpeciesPrograms(expanded);
  for (const message of messages) warn(message);
  return result;
}

/** Read verified producer bytes, expand the old owner and rehash its section before admission or decision compilation. */
export function expandNativeHuntSections(platform: EmittedSections): EmittedSections {
  const section = platform.sections.find(row => row.name === 'actors/species-programs');
  if (section === undefined) return platform;
  const bytes = platform.files.get(section.path);
  if (bytes === undefined || bytes.length !== section.bytes || hashImmutableBytes(bytes) !== section.hash) throw new Error('Native species section differs from its declared bytes');
  const input: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const expanded = expandNativeHuntSource(input);
  if (expanded === input) return platform;
  if (platform.sections.some(row => row !== section && row.path === section.path)) throw new Error('Native species expansion requires a separate section path');
  const output = new TextEncoder().encode(encodeCanonicalJson(expanded)), files = new Map(platform.files);
  files.set(section.path, output);
  return { files, sections: platform.sections.map(row => row === section ? { ...row, hash: hashImmutableBytes(output), bytes: output.length } : row) };
}
