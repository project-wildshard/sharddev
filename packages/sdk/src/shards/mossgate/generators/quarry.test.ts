// MOSSGATE-ZONE MZ15: the Old Quarry in the built shard: Gritmaw on the pit's floor as an elite its own decision script
// drives (its tell a shared field and a panel), four grey blobs at the camp, the bridge's solid deck, and the region triggers.
import { expect, test } from 'vitest';
import { builtSceneShardfile } from '@wildshard/sdk/scene/shardfile';
import { compileScript } from '@wildshard/sdk/compileScript';
import { parseShardfile } from '@wildshard/format/shardSchema';
import { DECISIONS, ENCOUNTERS, GRITMAW_FIELDS, GRITMAW_PANELS } from './fights';
import { gameplay } from './gameplay';
import { inside, REGIONS } from './layout';
import { QUARRY, QUARRY_FLAGS } from './quarry';
import { mossgate } from './shard';

test('the Old Quarry has its elite, its camp, its bridge and its places', { timeout: 120_000 }, async () => {
  const scene = mossgate.describe();
  const { shard } = await builtSceneShardfile(scene, compileScript, { extend: gameplay });
  // oxlint-disable-next-line unicorn/prefer-structured-clone -- JSON wire normalization, as the build writes it
  expect(() => parseShardfile(JSON.parse(JSON.stringify(shard)))).not.toThrow();
  const quarry = REGIONS.find((region) => region.id === 'quarry')?.rect;
  if (quarry === undefined) throw new Error('no quarry');
  const gritmaw = shard.creatures.spawns.find((row) => row.id === 'gritmaw');
  expect(gritmaw).toMatchObject({ species: 'quarry.gritmaw', brain: null });
  expect(inside(quarry, gritmaw?.at[0] ?? 0, gritmaw?.at[2] ?? 0)).toBe(true);
  const blobs = shard.creatures.spawns.filter((row) => row.id.startsWith('quarry-blob-'));
  expect(blobs).toHaveLength(4);
  for (const row of blobs) expect(inside(quarry, row.at[0], row.at[2]), row.id).toBe(true);
  expect(shard.encounters.find((row) => row.id === ENCOUNTERS.gritmaw)).toMatchObject({ kind: 'elite', entity: 'gritmaw' });
  // its own script, bound to its encounter, writing its tell
  const script = DECISIONS.find((row) => row.id === 'mossgate.gritmaw.decision') as { binding?: unknown; fields?: Record<string, string> } | undefined;
  expect(script?.binding).toEqual({ encounter: ENCOUNTERS.gritmaw });
  expect(script?.fields).toEqual({ tell: GRITMAW_FIELDS.tell.name });
  expect(shard.targets.panels.find((p) => p.panel === GRITMAW_PANELS.ring)).toMatchObject({ fieldId: GRITMAW_FIELDS.tell.id });
  for (const flag of Object.values(QUARRY_FLAGS)) expect(shard.quests.triggers.find((t) => t.id === flag), flag).toMatchObject({ kind: 'region' });
  // the bridge's deck is a collider over the cut, its top near the banks' height
  const part = scene.parts.find((p) => p.name === 'quarry');
  const deck = part?.colliders?.find((c) => Math.hypot(c.centre[0] - QUARRY.BRIDGE.x, c.centre[2] - QUARRY.BRIDGE.z) < 1 && c.half[2] > 0.5 && c.half[0] > 1.4);
  expect(deck, 'the bridge deck collider').toBeDefined();
});
