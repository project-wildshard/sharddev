// MIRROR-SALT-ZONE MSZ5: GUIDE.md's Vehicles snippet is guide/vehicles.example.ts (type-checked with the sdk), and it
// lowers to a world/vehicles section the format admits.
// oxlint-disable-next-line import/no-nodejs-modules -- Read the shipped guide and the example beside it.
import { readFileSync } from 'node:fs';
import { parseVehicles } from '@wildshard/format/vehicles';
import { expect, test } from 'vitest';
import { lowerShard } from './scene/lower';
import { GUIDE_SOURCE } from './agentFiles';
import { build } from './guide/vehicles.example';

test("GUIDE.md's Vehicles snippet is the example file, and it docks a two-seat buggy", () => {
  const guide = readFileSync(GUIDE_SOURCE, 'utf8'), section = guide.split('**Vehicles.**')[1] ?? '';
  const snippet = /^```ts\n([\s\S]*?)^```/mu.exec(section)?.[1];
  const file = readFileSync(new URL('guide/vehicles.example.ts', import.meta.url), 'utf8').split('\n').slice(1).join('\n');
  expect(snippet).toBe(file);
  const rows = parseVehicles(lowerShard({ slug: 'guide-vehicles', name: 'Guide Vehicles' }, build).anchored.vehicles);
  expect(rows.kinds[0]?.seats.map((seat) => seat.role)).toEqual(['driver', 'passenger']);
  expect(rows.docks).toEqual([{ id: 'yard.buggy', kind: 'salt.buggy', at: [-6, 0, 20], yaw: 0, per: 'player', respawn: 60 }]);
});
