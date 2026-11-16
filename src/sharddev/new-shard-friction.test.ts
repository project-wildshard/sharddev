// oxlint-disable-next-line import/no-nodejs-modules -- Read the Template's own items rows.
import { readFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the Template's data folder.
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { checkEntryRoad } from './bake/terrain';
import { STARTER_ITEMS, STARTER_SWORD } from './scene/shardfile';

// Meta NEW-SHARD-E2E F13 and F23 (SHARD-SOURCE SS-NE13, SS-NE23).
const flat = (): number[] => Array.from({ length: 257 }, () => 0);

test('the entry-road refusal names the edge, the point and the height', () => {
  expect(() => { checkEntryRoad('north', flat(), 3); }).not.toThrow();
  const middle = flat();
  middle[128] = 1.25;
  expect(() => { checkEntryRoad('east', middle, 0); }).toThrow(/1\.25 m high at \(250, 0\) on the east entry road\. The ground is exactly 0 m at the middle/u);
  const side = flat();
  side[130] = -0.5;
  // the middle sample alone passes; a ground road is flat 3 samples each way
  expect(() => { checkEntryRoad('south', side, 0); }).not.toThrow();
  expect(() => { checkEntryRoad('south', side, 3); }).toThrow(/-0\.5 m high at \(3\.9, -250\) on the south entry road\. The ground is exactly 0 m within 6 m of/u);
});

test('a scene shard starts with the Template\'s iron sword in hand', () => {
  const template = JSON.parse(readFileSync(resolve(import.meta.dirname, '../shards/pastel-plain/data/items.json'), 'utf8')) as { rows: { id: string }[] };
  expect(template.rows.find(row => row.id === STARTER_SWORD.id)).toEqual(STARTER_SWORD);
  expect(STARTER_ITEMS.loadout.primary).toBe('weapon.sword-iron');
  expect(STARTER_ITEMS.rows).toEqual([STARTER_SWORD]);
});
