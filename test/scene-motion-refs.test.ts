import { expect, test } from 'vitest';
import { Group } from 'three';
import { Scope } from '../src/shared/engine/app/scope';
import { parseSceneMotion } from '@wildshard/format/sceneMotion';
import { ClientChannels } from '../src/sharddev/clientChannels';
import { createClientChannels } from '../src/shared/game/plugin/channels';
import { SceneHandles } from '../src/client/game/shardfile/sceneHandles';
import { SceneMotionBinding } from '../src/client/game/shardfile/sceneMotion';
import { createShardProduct } from '../src/shared/game/shardfile/shardProduct';
import { emptyShardfile } from '../src/sharddev/author';
import type { ShardContext } from '../src/client/game/plugin/context';
import { SKY_DRESSING_PROGRAMS } from '../src/shards/far-reach/generators/sceneDressing';
import { SIGNAL_BUCKET_MOVERS } from '../src/shards/sunscar-dunes/generators/bucket';

test('the dressing rows preserve the original frame arithmetic as flags and modes change', () => {
  const lanes = SKY_DRESSING_PROGRAMS.map(row => ({ row, lane: createClientChannels(row) }));
  const angles = new Map<string, number>();
  for (let frame = 0; frame < 180; frame++) {
    const delta = [1 / 30, 1 / 60, 0.017][frame % 3] ?? 0;
    const time = frame / 30, riding = frame % 17 < 8, turned = frame > 57;
    for (const { row, lane } of lanes) {
      const previous = angles.get(row.id) ?? 0.137;
      lane.evaluate({ time, delta, values: row.reads.map(name => name === 'angle' ? previous : name === 'turned' ? Number(turned) : Number(riding)) });
      if (row.id === 'far.dressing.deck') {
        expect(lane.frame.value).toBe(riding ? 0.9 + Math.sin(time * 4) * 0.15 : 0.25);
        expect(lane.frame.turn).toBe(riding ? 0.75 : 0.16);
      } else {
        const expected = previous + delta * (row.id.includes('.mill-') ? 0.35 : turned ? 6 : 0.25);
        expect(lane.frame.roll ?? lane.frame.yaw).toBe(expected);
        angles.set(row.id, expected);
      }
    }
  }
});

test('a missing typed frame material refuses before copied poses touch a scene', () => {
  const scope = new Scope('scene-motion-refs'), handles = new SceneHandles(), target = new Group();
  handles.publish('place.mover', target);
  const mover = SIGNAL_BUCKET_MOVERS[0]; if (mover === undefined) throw new Error('Missing native mover fixture');
  const copied = new ClientChannels('copied'); copied.fromMover(mover.id);
  copied.output('y', copied.read('position.y')); copied.bind('y', 'body');
  const material = new ClientChannels('material'); material.output('value', material.constant(0.16));
  const rows = parseSceneMotion({ version: 1, owner: 'native', installation: { systemId: 'native', frameSystemId: 'dressing' },
    groups: [{ id: 'native', programs: ['copied'], targets: { body: 'place.mover' }, copiedOwners: [mover.id],
      rest: [{ id: mover.id, position: { x: 0, y: 42, z: 0 }, euler: { x: 0, y: 0, z: 0 }, enabled: true }] }],
    frames: [{ id: 'material', program: 'material', targets: {}, inputs: {},
      materials: [{ channel: 'value', material: 'place.missing', property: 'opacity' }] }],
  });
  const source = { ...emptyShardfile({ slug: 'motion-fixture', name: 'Motion', author: 'Fixture', revision: 1, seed: 1 }),
    movers: SIGNAL_BUCKET_MOVERS, clientChannels: [copied.build(), material.build()] };
  const product = createShardProduct({ slug: source.identity.slug, revision: 1, shardfile: source,
    sections: new Map(), files: new Map(), read: () => Promise.reject(new Error('The motion fixture declares no asset')) });
  const ctx = { scope, cube: null, product, app: {} } as ShardContext;
  try {
    expect(() => new SceneMotionBinding(ctx, rows, handles)).toThrow('Missing world scene handle');
    expect(target.position.y).toBe(0);
    expect(() => parseSceneMotion({ ...rows, groups: [{ ...rows.groups[0], nativeOwners: Array.from({ length: 33 }, (_, i) => `mover.${String(i)}`) }] })).toThrow();
  } finally { scope.dispose(); }
});
