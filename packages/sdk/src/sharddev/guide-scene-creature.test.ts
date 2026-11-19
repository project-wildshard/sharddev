// meta ONE-FORMAT OF-NE20 (NEW-SHARD-E2E F20): GUIDE section 2b's worked scene shard with a creature is the checked
// example file, and it builds: the jackal's species, look, skin and bite, two spawns, a shard file whose rules pass.
// oxlint-disable-next-line import/no-nodejs-modules -- Read the shipped guide and the example beside it.
import { readFileSync } from 'node:fs';
import { prepareAssetDecoders } from '@wildshard/format/shardfileAssets';
import { shardfileRules } from '@wildshard/format/shardSchema';
import { validateSkinAssets } from '@wildshard/format/skinAssets';
import { expect, test } from 'vitest';
import { GUIDE_SOURCE } from './agentFiles';
import jackalDen from './guide/scene-creature.example';
import { hashImmutableBytes } from './immutable';
import type { ProjectGenerationContext } from './projectGeneration';

test("GUIDE's scene shard with a creature is the example file, and it builds a shard whose jackals can be fought", async () => {
  const guide = readFileSync(GUIDE_SOURCE, 'utf8'), example = readFileSync(new URL('guide/scene-creature.example.ts', import.meta.url), 'utf8');
  expect(guide).toContain(`\`\`\`ts\n${example}\`\`\``);
  await prepareAssetDecoders();
  const assets = new Map<string, Uint8Array>();
  const ctx = { asset: (bytes: Uint8Array): string => { const hash = hashImmutableBytes(bytes); assets.set(hash, bytes); return hash; },
    compileScript: () => { throw new Error('the example has no script'); } } as unknown as ProjectGenerationContext;
  const { shard } = await jackalDen(ctx);
  if (shard === undefined) throw new Error('the example built no shard file');
  expect(shardfileRules(shard)).toEqual([]);
  expect(() => { validateSkinAssets(shard, assets); }).not.toThrow();
  const jackal = shard.rows.species.find(row => row.id === 'jackal');
  expect(jackal?.abilities?.map(ability => ability.use)).toEqual(['jackal.bite']);
  expect(shard.rows.strikes.map(row => row.id)).toContain('jackal.bite');
  expect(shard.rows.looks.find(row => row.id === jackal?.body?.look)?.recipe).toBe('platform.skin');
  expect(shard.creatures.spawns.map(row => [row.id, row.species])).toEqual([['jackal-1', 'jackal'], ['jackal-2', 'jackal']]);
  // the starter sword is in every player's hand, so `fight('jackal')` in a walk proof has something to swing
  expect(shard.items?.loadout.primary).toBe('weapon.sword-iron');
});
