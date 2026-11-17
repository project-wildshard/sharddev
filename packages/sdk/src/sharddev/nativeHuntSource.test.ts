import { expect, test, vi } from 'vitest';
import { readSpeciesPrograms } from '@wildshard/format/speciesPrograms';
import { legacyHuntTuning } from '@wildshard/kit/legacySpecies';
import { commonSpeciesRows } from '@wildshard/kit/bake/species';
import { expandNativeHuntSource, expandNativeHuntSections } from './nativeHuntSource';
import { hashImmutableBytes } from './immutable';
import { prepareProjectOutput } from './projectOutput';

function fixture() {
  const native = { ...commonSpeciesRows('boar', 'fixture.native'), kind: 'own.native', aggressive: false };
  const policy = { ...commonSpeciesRows('boar', 'fixture.policy'), kind: 'own.policy', aggressive: true };
  delete native.tuning; delete policy.tuning;
  return { page: [native], native: [native], program: { species: [policy], strikes: [] },
    hunt: { limit: 8, player: 'host', fight: {}, bands: { states: [], legacyKinds: [] }, hit: { namespace: 'creature', tags: [] } } };
}

test('only an explicit old hunt owner copies former numbers, preserving its policy and row data', () => {
  const source = fixture(), before = JSON.stringify(source), warnings: string[] = [];
  const expanded = readSpeciesPrograms(expandNativeHuntSource(source, line => { warnings.push(line); }));
  expect(expanded.native[0]?.tuning).toEqual(legacyHuntTuning(false));
  expect(expanded.page[0]?.tuning).toEqual(legacyHuntTuning(false));
  expect(expanded.program?.species[0]?.tuning).toEqual(legacyHuntTuning(true));
  expect(expanded.program?.strikes).toEqual(source.program.strikes);
  expect(expanded.native[0]?.variants).toEqual(source.native[0]?.variants);
  expect(expanded.hunt).toEqual({ ...source.hunt, fight: { capExemptTags: [] } });
  expect(expanded.native[0]?.capExempt).toBeUndefined();
  expect(expanded.program?.species[0]?.capExempt).toBeUndefined();
  expect(warnings).toHaveLength(3);
  expect(JSON.stringify(source)).toBe(before);
  expect(expandNativeHuntSource(expanded, line => { warnings.push(line); })).toBe(expanded);
  expect(warnings).toHaveLength(3);
  const { hunt: _hunt, ...withoutOwner } = source;
  expect(expandNativeHuntSource(withoutOwner, () => { throw new Error('Unexpected expansion'); })).toBe(withoutOwner);
});

test('normal project output admits rehashed native section bytes without mutating its input', async () => {
  const wire = new TextEncoder().encode(JSON.stringify(fixture())), path = 'sections/actors/species-programs.json';
  const section = { name: 'actors/species-programs', path, schema: 'schemas/species.json', bytes: wire.length, hash: hashImmutableBytes(wire) };
  const platform = { sections: [section], files: new Map([[path, wire]]) };
  const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    const output = await prepareProjectOutput('.', { platform });
    const built = output.options.platform;
    const bytes = built?.files.get(path); if (bytes === undefined) throw new Error('Missing expanded bytes');
    expect(built?.sections[0]).toMatchObject({ path, hash: hashImmutableBytes(bytes), bytes: bytes.length });
    expect(readSpeciesPrograms(JSON.parse(new TextDecoder().decode(bytes))).native[0]?.tuning).toEqual(legacyHuntTuning(false));
    expect(platform.files.get(path)).toBe(wire); expect(section.hash).toBe(hashImmutableBytes(wire));
    expect(expandNativeHuntSections(built ?? platform)).toBe(built);
    expect(() => expandNativeHuntSections({ ...platform, sections: [{ ...section, hash: 'f'.repeat(64) }] })).toThrow('declared bytes');
  } finally { warnings.mockRestore(); }
});

test('native cap policy preserves dynamic tags and explicit overrides', () => {
  const source = fixture(), tagged = { ...source, hunt: { ...source.hunt, fight: { capExempt: ['own.native', 'creature.own.policy', 'state.rage', 'effect.hot'] } } };
  const result = readSpeciesPrograms(expandNativeHuntSource(tagged, () => undefined));
  expect(result.native[0]?.capExempt).toBeUndefined(); expect(result.program?.species[0]?.capExempt).toBeUndefined();
  expect(result.hunt?.fight.capExemptTags).toEqual(['own.native', 'creature.own.native', 'creature.own.policy', 'creature.creature.own.policy', 'state.rage', 'creature.state.rage', 'effect.hot', 'creature.effect.hot']);
  expect(expandNativeHuntSource(result, () => { throw new Error('Repeated policy expansion'); })).toBe(result);
  const native = tagged.native[0]; if (native === undefined) throw new Error('Missing native row');
  const explicit = { ...tagged, native: [{ ...native, capExempt: false }] };
  expect(readSpeciesPrograms(expandNativeHuntSource(explicit, () => undefined)).native[0]?.capExempt).toBe(false);
  const enabled = { ...tagged, native: [{ ...native, capExempt: true }] };
  expect(readSpeciesPrograms(expandNativeHuntSource(enabled, () => undefined)).native[0]?.capExempt).toBe(true);
});

test('native policy admission refuses inconsistent declarations before rewriting', () => {
  const source = fixture();
  expect(() => expandNativeHuntSource({ ...source, hunt: { ...source.hunt, fight: { capExempt: ['bear'], capExemptTags: [] } } })).toThrow();
});

test('an empty hunt list cannot negate an exemption owned by the level fight', () => {
  const result = readSpeciesPrograms(expandNativeHuntSource(fixture(), () => undefined));
  expect([...result.page, ...result.native, ...result.program?.species ?? []].map(row => row.capExempt))
    .toEqual([undefined, undefined, undefined]);
});
