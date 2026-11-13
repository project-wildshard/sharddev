import { expect, test } from 'vitest';
import { platformFileFamily, validatePlatformFile } from '@wildshard/format/platformFileFamilies';
import { registeredJsonContract } from '@wildshard/format/registeredJson';
import { nameBlob } from '@wildshard/sdk/blobs';
import { registeredJsonSchema } from '@wildshard/sdk/formatJsonSchema';

const documents = [
  ['combat/roaming.json', 'roamingCombat#RoamingCombatSchema', 'src/game/combat/roamingSession.ts'],
  ['client/ranged-page.json', 'rangedPage#RangedPageSchema', 'src/game/loadout/rangedPage.ts'],
  ['combat/room-entry.json', 'arenaRoomDocument#ArenaRoomDocumentSchema', 'src/game/shardfile/worldAssembly.ts'],
  ['combat/timed-encounters.json', 'encounterRows#TimedEncountersSchema', 'src/game/boss/timedEncounters.ts'],
  ['combat/titan-fight.json', 'arenaScriptRows#ArenaScriptFightFileSchema', 'src/game/boss/openArenaFight.ts'],
  ['combat/titan-geometry.json', 'arenaScriptRows#ArenaScriptGeometrySchema', 'src/game/boss/openArenaFight.ts'],
  ['models/cloud-specimen.json', 'encounterRows#CloudSpecimenSchema', 'src/game/boss/encounterView.ts'],
  ['riding/mounted-figure.json', 'mountedSpecimenRows#MountedSpecimenSeatSchema', 'src/game/riding/seatedFigure.ts'],
  ['riding/session.json', 'riding#ClientRidingSessionSchema', 'src/game/riding/client.ts'],
] as const;

test.each(documents)('G1004 registers only the exact complete %s document and its native reader', (name, suffix, reader) => {
  const contract = registeredJsonContract(name), source = `@wildshard/format/${suffix}`;
  expect(contract.source).toBe(source);
  expect(platformFileFamily(name, source)).toMatchObject({ schema: contract.schema, source, reader });
  expect(registeredJsonSchema(name)).toMatchObject({ $comment: source });
  expect(() => validatePlatformFile(name, source, {})).toThrow();
  const bytes = new TextEncoder().encode('{}');
  expect(() => nameBlob(name, 'json', bytes)).toThrow('requires its defining schema');
  expect(() => nameBlob(name, 'json', bytes, { jsonSchema: { $schema: 'http://json-schema.org/draft-07/schema#', type: 'object', $comment: source } })).toThrow('exact defining format contract');
  expect(platformFileFamily(name, undefined)).toBeUndefined();
  expect(platformFileFamily(name, `${source}-private`)).toBeUndefined();
  expect(platformFileFamily(name.replace('.json', '-private.json'), source)).toBeUndefined();
});
