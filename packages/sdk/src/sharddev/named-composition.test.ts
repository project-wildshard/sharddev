import { expect, test } from 'vitest';
import * as v from 'valibot';
import { BuildingLifeRowsSchema, BuildingLifeLookSchema } from '@wildshard/format/buildings';
import { DirectorSchema } from '@wildshard/format/director';
import { DirectorStagesSchema } from '@wildshard/format/directorStages';
import { NumericPoseSchema } from '@wildshard/format/clientChannels';
import { ReturnProgramSchema } from '@wildshard/format/namedJsonContracts';
import { MixedPopulationSchema } from '@wildshard/format/mixedPopulation';
import { PopulationKeeperRowsSchema } from '@wildshard/format/populationKeeper';
import { composeNamedJsonSchema, namedJsonSchema, namedFormatJsonSchema } from './formatJsonSchema';

const number = v.number(), text = v.string();
const module = v.strictObject({ module: text, bytes: text,
  file: v.exactOptional(v.pipe(v.string(), v.minLength(1), v.maxLength(240))) });

test('composed building and director contracts preserve every original schema byte', () => {
  const life = composeNamedJsonSchema({ kind: 'object', entries: {
    look: 'buildings.BuildingLifeLook', life: 'buildings.BuildingLifeRows', initialDusk: number,
  } });
  expect(JSON.stringify(life)).toBe(JSON.stringify(namedJsonSchema(v.strictObject({ look: BuildingLifeLookSchema, life: BuildingLifeRowsSchema, initialDusk: number }))));
  const director = composeNamedJsonSchema({ kind: 'object', entries: {
    declaration: 'director.Director', module, stages: 'directorStages.DirectorStages', bindings: v.null(), seed: number,
  } });
  expect(JSON.stringify(director)).toBe(JSON.stringify(namedJsonSchema(v.strictObject({ declaration: DirectorSchema, module, stages: DirectorStagesSchema, bindings: v.null(), seed: number }))));
});

test('mixed local fields and named tuples preserve order, arity and original pose schema bytes', () => {
  const actual = composeNamedJsonSchema({ kind: 'object', entries: {
    clips: { kind: 'tuple', items: ['clientChannels.NumericPose', 'clientChannels.NumericPose'] },
    program: ReturnProgramSchema, perch: MixedPopulationSchema.entries.perch,
  } });
  const original = namedJsonSchema(v.strictObject({ clips: v.tuple([NumericPoseSchema, NumericPoseSchema]),
    program: ReturnProgramSchema, perch: MixedPopulationSchema.entries.perch }));
  expect(JSON.stringify(actual)).toBe(JSON.stringify(original));
  expect(actual['$comment']).toBeUndefined();
});

test.each(['strict', 'strip', 'loose'] as const)('%s object composition keeps the defining extra-field policy', mode => {
  const entries = { x: number, label: v.exactOptional(text) };
  const original = mode === 'strict' ? v.strictObject(entries) : mode === 'strip' ? v.object(entries) : v.looseObject(entries);
  expect(JSON.stringify(composeNamedJsonSchema({ kind: 'object', entries, mode }))).toBe(JSON.stringify(namedJsonSchema(original)));
});

test('keeper identity and all named/check/transform refusals remain exact', () => {
  expect(namedFormatJsonSchema('populationKeeper.PopulationKeeperRows')).toBe(namedJsonSchema(PopulationKeeperRowsSchema));
  for (const name of ['toString', '__proto__', 'foreign.NumericPose', 'clientChannels.NumericPos']) {
    expect(() => composeNamedJsonSchema({ kind: 'tuple', items: [name] })).toThrow('Unknown named format contract');
  }
  expect(() => composeNamedJsonSchema(v.pipe(v.number(), v.check(value => value === 7)))).toThrow();
  expect(() => composeNamedJsonSchema(v.pipe(v.number(), v.transform(String)))).toThrow();
});
