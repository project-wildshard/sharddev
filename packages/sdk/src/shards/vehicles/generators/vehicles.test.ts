import { expect, test } from 'vitest';
import { parseVehicles } from '@wildshard/format/vehicles';
import { sceneShardfile } from '@wildshard/sdk/scene/shardfile';
import { vehicles } from './shard';

// MIRROR-SALT-ZONE MSZ5: the example's two kinds and two docks lower to rows the format admits, with their seats and hulls.
test('the example docks a two-seat buggy and a land-sail', () => {
  const scene = vehicles.describe();
  const rows = parseVehicles(scene.anchored.vehicles);
  expect(rows.kinds.map((kind) => [kind.id, kind.seats.map((seat) => seat.role), kind.hull.length])).toEqual([
    ['salt.buggy', ['driver', 'passenger'], 1], ['salt.land-sail', ['driver'], 1]]);
  expect(rows.docks.map((dock) => [dock.id, dock.kind, dock.per])).toEqual([['yard.buggy', 'salt.buggy', 'player'], ['line.sail', 'salt.land-sail', 'shared']]);
  const { shard } = sceneShardfile(scene);
  expect(shard.props?.panels.filter((panel) => !panel.visible).map((panel) => panel.id)).toEqual(['salt.buggy', 'salt.land-sail']);
});
