import { describe, expect, test } from 'vitest';
import { parseShardfile } from '@wildshard/format/shardSchema';
import { parseRows } from '@wildshard/format/rows';
import { emptyShardfile } from '@wildshard/engine/host/author';
import { bakedSpec, seedHash, speciesResolver } from '@wildshard/engine/game/plugin/brain';
import DUNES from '../../../test/fixtures/dunes-species-program.json' with { type: 'json' };
import type { BrainedSpecies } from '../speciesBrains';
import type { StrikeData } from '../species';
import { programSpawnPhase, speciesProgramToRows, withConvertedRows, type ProgramLook, type SpeciesProgramInput } from './toRows';

// Dunes' four species, as its built `actors/species-programs` program and physics bake carry them (shard-dunes 959969f).
const program = DUNES.program as unknown as SpeciesProgramInput & { species: BrainedSpecies[]; strikes: StrikeData[] };
const physics = DUNES.physics as Record<string, { scale: [number, number]; spec: unknown }>;
const looks = new Map(Object.entries(physics).map(([kind, row]) =>
  [kind, { look: `sunscar.look.${kind}`, dims: (row.spec as { dims: ProgramLook['dims'] }).dims }] as const));
const lookRows = program.species.map(row => ({ id: `sunscar.look.${row.kind}`, species: row.id, recipe: 'sunscar.rig', material: null,
  parameters: {}, animation: { recipe: 'sunscar.clips', parameters: {} } }));

/** The converted rows in a full shardfile: `kinds` picks the species, `spawned` adds one home spawn per brained species. */
function shard(kinds: ReadonlySet<string>, spawned = false) {
  const converted = speciesProgramToRows(program, looks), base = emptyShardfile({ slug: 'of11-dunes', name: 'Dunes rows', author: 'Test', revision: 1, seed: 7 });
  const picked = { ...converted, species: converted.species.filter(row => kinds.has(row.kind)) };
  const rows = parseRows({ ...withConvertedRows(base.rows, picked), looks: lookRows.filter(row => picked.species.some(entry => entry.id === row.species)) });
  const spawns = !spawned ? [] : program.species.flatMap((row, index) => {
    const brain = converted.species[index]?.temperament?.brain;
    if (brain === undefined || brain === 'none' || !kinds.has(row.kind)) return [];
    const seed = 11 + index, phaseOffset = programSpawnPhase(row.brain, seed);
    return [{ id: `home.${row.kind.toLowerCase()}`, species: row.id, variant: row.variants[0]?.id ?? '', brain, strike: null, seed, scale: 1,
      at: [index * 10, 0, 0] as [number, number, number], yaw: 0, ...(phaseOffset === undefined ? {} : { phaseOffset }) }];
  });
  const brains = converted.brains.filter(row => picked.species.some(entry => entry.temperament?.brain === row.id));
  return { converted, rows, file: parseShardfile({ ...base, rows, creatures: { ...base.creatures, brains, spawns } }) };
}
/** Every converted row, past the pinned format's dimension check (the engine resolver reads them as they are). */
function allRows() {
  const converted = speciesProgramToRows(program, looks), base = emptyShardfile({ slug: 'of11-dunes', name: 'Dunes rows', author: 'Test', revision: 1, seed: 7 });
  return { converted, rows: { ...withConvertedRows(base.rows, converted), looks: lookRows } as ReturnType<typeof parseRows> };
}

describe('species programs become layered rows (ONE-FORMAT OF11a)', () => {
  test("Dunes' four species admit as plain rows and brains in a full shardfile, spawned", () => {
    // Format 0.41.0 (shard-format d493da7a) admits the ray's and the Matriarch's legless bake (legLen 0) and a spawn
    // naming a camelCase species id (`sunscar.creature.duneStrider`).
    const { converted, file } = shard(new Set(['duneRay', 'sandSkitterer', 'duneStrider', 'duneMatriarch']), true);
    expect(converted.species.map(row => row.kind)).toEqual(['duneRay', 'sandSkitterer', 'duneStrider', 'duneMatriarch']);
    expect(file.rows.species.map(row => row.kind)).toEqual(['duneRay', 'sandSkitterer', 'duneStrider', 'duneMatriarch']);
    expect(file.rows.species.every(row => row.temperament !== undefined && row.body?.size === 'medium')).toBe(true);
    expect(file.creatures.brains.map(row => row.id)).toEqual(['sunscar.brain.ray', 'sunscar.brain.strider']);
    expect(file.creatures.spawns.map(row => row.species)).toEqual(['sunscar.creature.duneRay', 'sunscar.creature.duneStrider']);
  });

  test('each converted row resolves to the native spec its physics bake already uses', () => {
    const { converted, rows } = allRows(), resolve = speciesResolver(rows, converted.brains);
    for (const row of program.species) {
      const species = converted.species.find(entry => entry.kind === row.kind), baked = bakedSpec(physics[row.kind]?.spec);
      expect(resolve(species?.id ?? '', baked.variant), row.kind).toEqual(baked);
    }
  });

  test("brains keep the program's exact declarations; decision brains stay their bindings", () => {
    const { converted } = allRows(), byKind = new Map(converted.species.map(row => [row.kind, row]));
    const ray = program.species.find(row => row.kind === 'duneRay'), strider = program.species.find(row => row.kind === 'duneStrider');
    expect(converted.brains).toEqual([ray?.brain?.data, strider?.brain?.data]);
    expect(byKind.get('duneRay')?.temperament).toMatchObject({ brain: 'sunscar.brain.ray', reaction: 'aggressive', leash: 500 });
    expect(byKind.get('duneStrider')?.temperament?.brain).toBe('sunscar.brain.strider');
    expect(converted.decisions).toEqual(['sandSkitterer', 'duneMatriarch'].map(kind => {
      const row = program.species.find(entry => entry.kind === kind);
      return { species: row?.id, decision: row?.brain?.data };
    }));
    for (const kind of ['sandSkitterer', 'duneMatriarch']) expect(byKind.get(kind)?.temperament?.brain).toBe('none');
    expect(byKind.get('duneStrider')?.abilities?.map(row => row.use)).toEqual(['sunscar.strider.charge', 'sunscar.strider.horns']);
    expect(byKind.get('duneMatriarch')?.abilities?.map(row => row.use)).toContain('sunscar.matriarch.dive');
  });

  test('strikes keep every number; the circling phase is the engine seed slot', () => {
    const { converted } = allRows();
    for (const strike of program.strikes) {
      const row = converted.strikes.find(entry => entry.id === strike.id);
      expect(row).toMatchObject({ windup: strike.windup, active: strike.active, recover: strike.recover, cooldown: strike.cooldown,
        range: strike.range, damage: strike.damage, shape: strike.shape, speed: strike.motion?.speed ?? 0 });
      expect(row?.weight).toBe(strike.weight.kind === 'constant' ? strike.weight.value : 1);
      expect(row?.units).toBe(strike.units);
    }
    // OF11b: the ray's and strider's keeper bodies land every brain strike as a blow, its cover checked; decision
    // strikes keep their own tags (their encounter owns contact)
    const tags = (id: string) => converted.strikes.find(row => row.id === id)?.tags;
    for (const id of ['sunscar.ray.swoop', 'sunscar.strider.charge', 'sunscar.strider.horns']) {
      expect(tags(id)).toEqual([...program.strikes.find(strike => strike.id === id)?.tags ?? [], 'feel.blow', 'cover.checked']);
    }
    for (const strike of program.strikes.filter(row => !row.id.startsWith('sunscar.ray.') && !row.id.startsWith('sunscar.strider.'))) {
      expect(tags(strike.id)).toEqual(strike.tags);
    }
    expect(converted.strikes.find(row => row.id === 'sunscar.ray.swoop')?.units).toBe('world');
    // OF11b: the strider's charge keeps its overshoot as a row field; its distance score is the challenge brain's tuning.
    expect(converted.lossy).toEqual([{ strike: 'sunscar.strider.charge', fields: ['weight'] }]);
    expect(converted.strikes.find(row => row.id === 'sunscar.strider.charge')?.overshoot).toBe(3);
    expect(converted.catalogue).toEqual(program.strikes);
    const strider = program.species.find(row => row.kind === 'duneStrider');
    for (const seed of [0, 1, 7, 12345, 0.5]) expect(programSpawnPhase(strider?.brain, seed)).toBe(seedHash(seed) % 6);
    expect(programSpawnPhase(program.species[0]?.brain, 3)).toBeUndefined();
  });

  test('refuses what a layered row cannot carry, naming the species or strike', () => {
    const [ray] = program.species;
    if (ray === undefined) throw new Error('fixture');
    expect(() => speciesProgramToRows({ ...program, species: [{ ...ray, brain: { archetype: 'script', data: {} } as unknown as BrainedSpecies['brain'] }] }, looks))
      .toThrow(/sunscar\.creature\.duneRay.*script brain/u);
    expect(() => speciesProgramToRows({ ...program, species: [{ ...ray, variants: [{ ...ray.variants[0], hp: undefined } as never] }] }, looks))
      .toThrow(/variant `dusk` has no hp/u);
    expect(() => speciesProgramToRows({ ...program, strikes: [...program.strikes, ...program.strikes.slice(0, 1)] }, looks))
      .toThrow(/duplicate strike ids/u);
    expect(() => speciesProgramToRows(program, new Map())).toThrow(/no look for kind `duneRay`/u);
  });
});
