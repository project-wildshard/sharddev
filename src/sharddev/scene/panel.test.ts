import * as THREE from 'three';
import { expect, test } from 'vitest';
import { parseGlb } from '@wildshard/format/shardfileAssets';
import { solid } from './author';
import { lowerShard, SceneRefusalError } from './lower';
import { sceneShardfile } from './shardfile';
import { liveShell } from '../watch/protocol';

// SHARD-SOURCE AP16: a panel part (Brasscap's gate) is one library GLB and one collider of its id, so a `targets.panels`
// row hides both by state; its meshes leave the tiles.
const wood = new THREE.MeshStandardMaterial({ color: '#8a5a32', roughness: 0.85 });
const gated = lowerShard({ slug: 'ap16', name: 'AP16' }, (world) => {
  world.part('posts', (part) => { const post = solid(new THREE.Mesh(new THREE.BoxGeometry(0.7, 7, 0.7), wood)); post.position.set(-4, 3.5, -62); part.add(post); });
  world.part('gate', (part) => {
    // a door across the tile edge at x = 0 (the panel is still one GLB)
    const door = solid(new THREE.Mesh(new THREE.BoxGeometry(7.2, 5.6, 0.3), wood)); door.position.set(0, 2.8, -62); part.add(door);
  }, { panel: 'ap16.gate' });
});

test('a panel part is one library GLB and one collider of its id, outside every tile', () => {
  const { shard, assets } = sceneShardfile(gated);
  const props = shard.props; if (props === null || props === undefined) throw new Error('no props');
  expect(props.panels).toHaveLength(1);
  const panel = props.panels[0]; if (panel === undefined) throw new Error('no panel');
  expect(panel).toMatchObject({ id: 'ap16.gate', visible: true });
  expect(shard.library).toContain(panel.file);
  expect(props.tiles.map((t) => t.file)).not.toContain(panel.file);
  const bytes = assets.get(panel.file); if (bytes === undefined) throw new Error('no panel bytes');
  // the door's 12 triangles, cut where it crosses the tile edge, all in the panel
  expect(parseGlb(bytes).triangles).toBeGreaterThanOrEqual(12);
  expect(props.colliders.find((c) => c.id === 'ap16.gate')).toMatchObject({ panel: 'ap16.gate', initialActive: true });
  expect(props.colliders.find((c) => c.id === 'scene.posts')).toMatchObject({ panel: null });
  // the tiles hold the post only
  const tileTriangles = shard.files.filter((f) => props.tiles.some((t) => t.file === f.hash)).reduce((n, f) => n + f.triangles, 0);
  expect(tileTriangles).toBe(12);
  // the library budget covers the panel
  expect(shard.budgets.library.compressed).toBeGreaterThanOrEqual(bytes.length);
});

test('the watch shell keeps a panel part whole and empties the rest', () => {
  const shell = liveShell(gated);
  expect(shell.parts.find((p) => p.name === 'gate')?.draws.length).toBe(1);
  expect(shell.parts.find((p) => p.name === 'posts')?.draws.length).toBe(0);
  expect(sceneShardfile(shell).shard.props?.panels.map((p) => p.id)).toEqual(['ap16.gate']);
});

test('a panel id is a shardfile id, used once, and a panel holds meshes and solids only', () => {
  const box = (): THREE.Mesh => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), wood);
  expect(() => lowerShard({ slug: 'p', name: 'P' }, (world) => { world.part('gate', (p) => p.add(box()), { panel: 'Gate' }); })).toThrow(SceneRefusalError);
  expect(() => lowerShard({ slug: 'p', name: 'P' }, (world) => {
    world.part('a', (p) => p.add(box()), { panel: 'p.gate' }); world.part('b', (p) => p.add(box()), { panel: 'p.gate' });
  })).toThrow(/two parts are panel p.gate/u);
  expect(() => lowerShard({ slug: 'p', name: 'P' }, (world) => { world.part('lamp', (p) => p.add(box(), new THREE.PointLight()), { panel: 'p.lamp' }); })).toThrow(/meshes and solids only/u);
  const empty = lowerShard({ slug: 'p', name: 'P' }, (world) => { world.part('gate', (p) => { const m = solid(box()); m.visible = false; p.add(m); }, { panel: 'p.gate' }); });
  expect(() => sceneShardfile(empty)).toThrow(/draws nothing/u);
});
