import { expect, test } from 'vitest';
import creatures from '../data/creatures.json' with { type: 'json' };

// TEMPLATE-E2E TC-M2b (J361): the mossling pack and the grey blobs come back on a timer (`respawn`, seconds, shard-format
// 0.5.8; engine TC-E2 revives the body at its spawn). The sows, the wisps, the Greyback and the Warden stay dead.
test('the pack and the blobs respawn; the rest stay dead', () => {
  const timed = Object.fromEntries(creatures.spawns.map(row => [row.id, 'respawn' in row ? row.respawn : undefined]));
  for (const id of ['mossling:1', 'mossling:2', 'mossling:3', 'mossling:4']) expect(timed[id]).toBe(45);
  for (const id of ['grey-blob:1', 'grey-blob:2', 'grey-blob:3', 'grey-blob:4']) expect(timed[id]).toBe(60);
  for (const id of ['sow:1', 'bog-wisp:1', 'greyback', 'barrow-warden']) expect(timed[id]).toBeUndefined();
});
