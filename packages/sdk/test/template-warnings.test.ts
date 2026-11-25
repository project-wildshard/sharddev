import { expect, test } from 'vitest';
import { builtSceneShardfile } from '@wildshard/sdk/scene/shardfile';
import { compileScript } from '@wildshard/sdk/compileScript';
import { mossgate } from '../src/shards/mossgate/generators/shard';
import { gameplay } from '../src/shards/mossgate/generators/gameplay';
import { expandCombatSource } from '../src/sharddev/combatSource';
import { expandHarvestSource } from '../src/sharddev/harvestSource';

// meta QA 11-25 row 26: `wildshard new` copies Mossgate, so an author's first `check` prints whatever the template leaves
// to the kit's old-source copies. Mossgate declares every species' cap policy and the boar's harvest itself, so the build
// copies nothing in and warns about nothing.
test('the new-repo template declares its species policies: no old-source warning', { timeout: 120_000 }, async () => {
  const { shard } = await builtSceneShardfile(mossgate.describe(), compileScript, { extend: gameplay });
  const warnings: string[] = [], warn = (message: string) => { warnings.push(message); };
  const harvested = expandHarvestSource(shard, warn);
  const settled = expandCombatSource(harvested, warn);
  expect(warnings).toEqual([]);
  expect(settled).toBe(shard);
  expect(shard.rows.species.map((row) => [row.id, row.capExempt])).toEqual(shard.rows.species.map((row) => [row.id, false]));
});
