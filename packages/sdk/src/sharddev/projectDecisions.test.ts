// ONE-FORMAT OF19b: a converted species program writes each strike twice, its plain row (`rows.strikes`) and its exact row
// (`actors/strikes`, OF11b1). The decision catalogue names each id once, as engine `ShardDecisions` does (`3774bb13f`).
import { expect, test } from 'vitest';
import { buildDecisionRegistries } from '@wildshard/format/decisionBindings';
import { readCreatureStrikes } from '@wildshard/format/creatures';
import { emptyShardfile } from '@wildshard/engine/host/author';
import DUNES from '../../test/fixtures/dunes-species-program.json' with { type: 'json' };
import type { BrainedSpecies } from './speciesBrains';
import type { StrikeData } from './species';
import { speciesProgramToRows, withConvertedRows, type ProgramLook, type SpeciesProgramInput } from './species/toRows';
import { decisionStrikeRows } from './projectDecisions';

const program = DUNES.program as unknown as SpeciesProgramInput & { species: BrainedSpecies[]; strikes: StrikeData[] };
const physics = DUNES.physics as Record<string, { spec: unknown }>;
const looks = new Map(Object.entries(physics).map(([kind, row]) =>
  [kind, { look: `sunscar.look.${kind}`, dims: (row.spec as { dims: ProgramLook['dims'] }).dims }] as const));

test('a converted program names each strike once in the decision catalogue', () => {
  const converted = speciesProgramToRows(program, looks), base = emptyShardfile({ slug: 'of19b', name: 'Rows', author: 'Test', revision: 1, seed: 7 });
  const source = { ...base, rows: withConvertedRows(base.rows, converted) }, exact = readCreatureStrikes(converted.catalogue);
  expect(converted.strikes.length).toBeGreaterThan(0);
  expect(() => buildDecisionRegistries(source, [], undefined, exact)).toThrow(/Duplicate decision catalogue identity/u);
  const strikes = buildDecisionRegistries(source, [], undefined, decisionStrikeRows(source, exact)).strikes;
  expect([...strikes?.keys() ?? []].sort()).toEqual([...new Set([...source.rows.strikes, ...exact].map(row => row.id))].sort());
});
