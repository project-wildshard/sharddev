import * as THREE from 'three';
import { expect, test } from 'vitest';
import { animate, flicker, hang } from './author';
import { lowerShard, SceneRefusalError } from './lower';
import { sceneShardfile } from './shardfile';

// SHARD-SOURCE SS8d: `hang(group, { rate, amount, reach })` hangs a lantern from its group's origin. It lowers to one
// `look.light.swings` row; its glass and halo draw with `_SWING` (row + 1) and `swing: true`; its lamp names the row and
// still flickers. A still copy of the same material stays a plain entry.
const glow = new THREE.DataTexture(new Uint8Array(16 * 16 * 4).fill(255), 16, 16);
const brass = new THREE.MeshStandardMaterial({ color: '#a07a3a', roughness: 0.5, metalness: 0.8 });
const yard = lowerShard({ slug: 'ss8d', name: 'SS8d' }, (world) => {
  world.part('posts', (part) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 0.2), brass); post.position.set(3, 1.5, 3); part.add(post);
    const rope = hang(new THREE.Group(), { rate: 0.7, amount: 0.12, reach: 0.5 }); rope.position.set(3.4, 2.8, 3);
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.3), brass); lantern.position.y = -0.6;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(1.4, 1.1, 0.7), transparent: true, depthWrite: false }));
    halo.position.y = -0.6;
    const light = animate(new THREE.PointLight('#ffb060', 6, 8, 2), flicker({ rate: 1.2, amount: 0.1 })); light.position.y = -0.6;
    rope.add(lantern, halo, light); part.add(rope);
  });
});

const glbJson = (bytes: Uint8Array): string => new TextDecoder().decode(bytes.subarray(20, 20 + new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true)));

test('a hung lantern lowers to one swing row, its draws and halo carry _SWING, its lamp names the row', () => {
  const { shard, assets } = sceneShardfile(yard);
  const swings = shard.look.light?.swings ?? [];
  expect(swings).toHaveLength(1);
  expect(swings[0]).toEqual({ pivot: [3.4, 2.8, 3], length: 0.6, rate: 0.7, amount: 0.12, reach: 0.5 });
  const lamps = shard.look.light?.lamps ?? [];
  expect(lamps).toHaveLength(1);
  expect(lamps[0]).toMatchObject({ swing: 0, flicker: { rate: 1.2, amount: 0.1 } });
  const entries = Object.values(shard.look.materials) as Record<string, unknown>[];
  // the post's brass is still; the lantern's brass and its halo card swing
  expect(entries.filter((e) => e['family'] === 'pbr' && e['swing'] === true)).toHaveLength(1);
  expect(entries.filter((e) => e['family'] === 'pbr' && e['swing'] === undefined && e['metalness'] === 0.8)).toHaveLength(1);
  expect(entries.filter((e) => e['card'] === true && e['swing'] === true)).toHaveLength(1);
  const swinging = [...assets.values()].map(glbJson).filter((t) => t.includes('"_SWING"'));
  expect(swinging).toHaveLength(1);
  expect(swinging[0]?.match(/"_SWING"/gu)?.length).toBe(2); // the glass and the halo, one primitive each
  expect(swinging[0]?.match(/"_CORNER"/gu)?.length).toBe(1);
});

test('a hung body in a panel, or 33 of them, refuses', () => {
  expect(() => lowerShard({ slug: 's', name: 's' }, (world) => {
    world.part('gate', (part) => { const rope = hang(new THREE.Group(), { rate: 1, amount: 0.1 }); rope.add(new THREE.Mesh(new THREE.BoxGeometry(), brass)); part.add(rope); }, { panel: 'yard.gate' });
  })).toThrow(/panel part cannot swing/u);
  const many = lowerShard({ slug: 's', name: 's' }, (world) => {
    world.part('lamps', (part) => {
      for (let i = 0; i < 33; i++) { const rope = hang(new THREE.Group(), { rate: 1, amount: 0.1 }); rope.position.set(i, 3, 0); const box = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), brass); box.position.y = -0.5; rope.add(box); part.add(rope); }
    });
  });
  expect(() => sceneShardfile(many)).toThrow(SceneRefusalError);
});

test('SS8f: a watched part sends its swings, numbered in the part, on its draws, cards and lamps', async () => {
  const { encodePart } = await import('../watch/protocol');
  const { lampRows } = await import('./shardfile');
  const part = yard.parts.find((p) => p.name === 'posts');
  if (part === undefined) throw new Error('no posts part');
  const wire = encodePart(yard, part, { lamps: lampRows(part.lights, true), water: [] });
  expect(wire.swings).toEqual([{ pivot: [3.4, 2.8, 3], length: 0.6, rate: 0.7, amount: 0.12, reach: 0.5 }]);
  expect(wire.draws.map((d) => d.swing)).toEqual([undefined, 0]);
  expect((wire.sprites as { swing?: number }[]).map((s) => s.swing)).toEqual([0]);
  expect((wire.lamps as { swing?: number }[])[0]?.swing).toBe(0);
});
