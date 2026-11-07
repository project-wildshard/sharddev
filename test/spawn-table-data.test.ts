import { expect, test } from 'vitest';
import { Scope } from '../src/shared/engine/app/scope';
import { EncounterRegistry, declaredSpawnTables, type SpawnTableRow } from '../src/shared/engine/ai/encounters';
import { Rng } from '../src/shared/engine/core/rng';
import { readSpawnTables } from '@wildshard/format/spawnTables';
import { readSpeciesPrograms } from '@wildshard/format/speciesPrograms';
import { PINE_SPECIES_PROGRAMS } from '../src/shards/pine-hollow/generators/speciesPrograms';
import { DRIFTWOOD_SPECIES_PROGRAMS } from '../src/shards/driftwood-isle/generators/speciesPrograms';

const weighted = { id: 'spawn.weighted', table: { mode: 'weighted', rows: [
  { item: { kind: 'elk' }, weight: 2, count: [1, 3] },
  { item: { kind: 'boar' }, weight: 1, count: 2 },
] } } as const;
const previous: SpawnTableRow[] = [
  { id: 'pine.spawn.thrall', table: { mode: 'each', rows: [
    { item: { kind: 'elk', variant: 'thrall' }, weight: 1, when: ctx => ctx.kind === 'elk' },
    { item: { kind: 'boar', variant: 'thrall' }, weight: 1, when: ctx => ctx.kind === 'boar' },
  ] } },
  { id: 'spawn.driftwood.enemies', table: { mode: 'each', rows: [
    { item: { kind: 'crab' }, weight: 1, count: [3, 5], when: ctx => ctx.tags.includes('tidepool') },
    { item: { kind: 'monkey' }, weight: 1, count: [3, 4], when: ctx => ctx.tags.includes('grove') },
    { item: { kind: 'sailor', variant: 'sailor' }, weight: 1, count: 1, when: ctx => ctx.tags.includes('hold') },
  ] } },
];

test('both product tables preserve actual registry spawn order and random continuation', () => {
  const scope = new Scope('spawn-data-test'), registry = new EncounterRegistry(() => scope), before = new EncounterRegistry(() => scope);
  for (const row of declaredSpawnTables([...PINE_SPECIES_PROGRAMS.spawns, ...DRIFTWOOD_SPECIES_PROGRAMS.spawns, weighted])) registry.registerSpawn(row, scope);
  for (const row of [...previous, weighted]) before.registerSpawn(row, scope);
  const random = new Rng(357), old = new Rng(357), point = { x: 1, z: 2, yaw: 3 };
  const ports = { create: (entry: { kind: string; variant?: string }) => ({ ...entry }), retire: () => undefined };
  try {
    for (const row of [...previous, weighted]) {
      const actual = registry.spawn(row.id, scope, ports), expected = before.spawn(row.id, scope, ports);
      for (const context of [{ kind: 'elk', tags: ['night'] }, { kind: 'boar', tags: ['tidepool', 'grove'] }, { kind: 'other', tags: ['hold'] }, { tags: [] }]) {
        expect(actual.spawn(context, point, () => random.next())).toEqual(expected.spawn(context, point, () => old.next()));
        expect(random.snapshot()).toEqual(old.snapshot());
      }
    }
    const practice = DRIFTWOOD_SPECIES_PROGRAMS.spawns.find(row => row.id === 'spawn.driftwood.practice');
    expect(practice?.respawn).toEqual({ delay: 45, away: 30 });
  } finally { scope.dispose(); }
});

test('data gates refuse callbacks and invalid counts before any registration', () => {
  const input = structuredClone(PINE_SPECIES_PROGRAMS.spawns), first = input[0];
  if (first === undefined) throw new Error('Missing authored thrall table');
  expect(() => readSpawnTables([...input, first])).toThrow();
  expect(() => declaredSpawnTables([{ ...first, table: { mode: 'each', rows: [{ item: { kind: 'elk' }, weight: 1, when: () => true }] } }])).toThrow();
  expect(() => declaredSpawnTables([{ ...first, table: { mode: 'weighted', rows: [{ item: { kind: 'elk' }, weight: 1, count: [4, 2] }] } }])).toThrow();
  for (const catalogue of [PINE_SPECIES_PROGRAMS, DRIFTWOOD_SPECIES_PROGRAMS]) {
    const admitted = readSpeciesPrograms(structuredClone(catalogue));
    expect(admitted.hunt).toEqual(catalogue.hunt);
    expect(() => readSpeciesPrograms({ ...catalogue, hunt: { ...catalogue.hunt, limit: 0 } })).toThrow();
  }
});
