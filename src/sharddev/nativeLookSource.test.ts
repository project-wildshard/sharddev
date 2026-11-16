import { expect, test, vi } from 'vitest';
import * as v from 'valibot';
import { HullLookBookSchema } from '@wildshard/format/speciesLooks';
import predecessor from '../../test/fixtures/m1-native-look-predecessor.json' with { type: 'json' };
import { expandNativeLookSource, expandNativeLookSections } from './nativeLookSource';
import { hashImmutableBytes } from './immutable';
import { prepareProjectOutput } from './projectOutput';

const fixture = () => ({ slug: 'fixture', definitions: {}, rows: ['boar', 'bear'].map(kind => ({
  id: `look.${kind}`, species: `fixture.native.${kind}`, kind, base: 'registered', required: true,
  variants: { own: { tint: { base: [0.1, 0.2, 0.3] } } },
})) });

test('normal native look expansion preserves every independently frozen predecessor value and authored override', () => {
  const source = fixture(), before = JSON.stringify(source), warnings: string[] = [];
  const result = v.parse(HullLookBookSchema, expandNativeLookSource(source, line => { warnings.push(line); }));
  expect(result.definitions).toEqual(predecessor.refs);
  expect(result.rows).toEqual(source.rows.map(row => ({ ...row, base: 'definition' })));
  expect(JSON.stringify(source)).toBe(before);
  expect(warnings).toHaveLength(2);
  expect(expandNativeLookSource(result, () => { throw new Error('Repeated expansion'); })).toBe(result);
  result.definitions['boar']?.body.bones.pop();
  expect(v.parse(HullLookBookSchema, expandNativeLookSource(source, () => undefined)).definitions).toEqual(predecessor.refs);
});

test('explicit definitions and unknown registered bases retain ownership; ambiguous definitions refuse by name', () => {
  const explicit = { ...fixture(), definitions: structuredClone(predecessor.refs), rows: fixture().rows.map(row => Object.assign(structuredClone(row), { base: 'definition' })) };
  expect(expandNativeLookSource(explicit, () => { throw new Error('Unexpected copy'); })).toBe(explicit);
  const unknown = { ...fixture(), rows: [{ ...fixture().rows[0], id: 'look.own', species: 'own.row', kind: 'own.kind', base: 'registered', required: true }] };
  expect(expandNativeLookSource(unknown, () => { throw new Error('Unknown kit lookup'); })).toBe(unknown);
  expect(() => expandNativeLookSource({ ...explicit, rows: fixture().rows }, () => undefined)).toThrow('select the definition base');
});

test('ordinary project output rehashes only verified hull metadata and retains packed body bytes', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify(fixture())), path = 'sections/look/hull-book.json';
  const section = { name: 'look/hull-book', path, schema: 'schemas/hulls.json', bytes: bytes.length, hash: hashImmutableBytes(bytes) };
  const packed = Uint8Array.of(3, 1, 4, 1, 5), platform = { sections: [section], files: new Map([[path, bytes], ['body.bin', packed]]) };
  const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    const output = await prepareProjectOutput('.', { platform }), built = output.options.platform;
    const wire = built?.files.get(path); if (wire === undefined || built === undefined) throw new Error('Missing expanded hulls');
    expect(built.sections[0]).toMatchObject({ hash: hashImmutableBytes(wire), bytes: wire.length });
    expect(v.parse(HullLookBookSchema, JSON.parse(new TextDecoder().decode(wire))).definitions).toEqual(predecessor.refs);
    expect(built.files.get('body.bin')).toEqual(packed);
    expect(platform.files.get(path)).toBe(bytes); expect(section.hash).toBe(hashImmutableBytes(bytes));
    expect(expandNativeLookSections(built)).toBe(built);
    expect(() => expandNativeLookSections({ ...platform, sections: [{ ...section, hash: 'f'.repeat(64) }] })).toThrow('declared bytes');
    expect(() => expandNativeLookSections({ ...platform, sections: [section, { ...section, name: 'other.section' }] })).toThrow('separate section path');
  } finally { warnings.mockRestore(); }
});
