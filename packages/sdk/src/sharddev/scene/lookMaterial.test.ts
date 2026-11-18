import * as THREE from 'three';
import { expect, test } from 'vitest';
import { parseGlb } from '@wildshard/format/shardfileAssets';
import type { MaterialEntry } from '@wildshard/format/materials';
import { LookMaterial } from '../materials';
import { lowerShard } from './lower';
import { sceneShardfile } from './shardfile';

// SHARD-SOURCE AP36a1: a `LookMaterial` bakes to the look entry it is given, whole (the Template's stone `pbr` with its
// procedural detail), and the meshes drawn in it share one draw, their colours riding the vertices.
const STONE = { family: 'pbr', vertexColours: true, metalness: 0, faceted: false,
  detail: { scale: 0.7, mottle: 0.22, grain: 0.12, relief: 0.6, moss: { colour: [0.32, 0.42, 0.2], amount: 0.22 } } } as unknown as MaterialEntry;

test('a part drawn in a LookMaterial writes that entry, and its meshes merge into one draw', () => {
  const stone = new LookMaterial(STONE);
  expect(stone.vertexColors).toBe(true);
  const scene = lowerShard({ slug: 'ap36a1', name: 'AP36a1' }, (world) => {
    world.part('walls', (part) => {
      for (const [x, colour] of [[3, [1, 0, 0]], [7, [0, 0, 1]]] as const) {
        const geometry = new THREE.BoxGeometry(2, 2, 2), count = geometry.getAttribute('position').count;
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: count }, () => colour).flat(), 3));
        const wall = new THREE.Mesh(geometry, stone); wall.position.set(x, 1, -40); part.add(wall);
      }
    });
  });
  const { shard, assets } = sceneShardfile(scene);
  // the shard's parse writes each entry's key order and defaults; the stone is the entry with its detail layer
  const entries = Object.values(shard.look.materials).filter((entry) => 'detail' in entry && entry.detail !== null && entry.detail !== undefined);
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject(STONE);
  const props = shard.props; if (props === null || props === undefined) throw new Error('no props');
  const tile = props.tiles.find((t) => t.lod === 0 && assets.has(t.file)); if (tile === undefined) throw new Error('no tile');
  const bytes = assets.get(tile.file); if (bytes === undefined) throw new Error('no tile bytes');
  expect(parseGlb(bytes)).toMatchObject({ triangles: 24, draws: 1 });
  // the entry is a copy: changing the given object after does not reach the shard
  expect(stone.toMaterialEntry()).not.toBe(stone.entry);
});
