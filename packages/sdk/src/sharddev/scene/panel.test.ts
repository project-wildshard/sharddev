import * as THREE from 'three';
import { expect, test } from 'vitest';
import { parseGlb } from '@wildshard/format/shardfileAssets';
import { animate, solid, sway } from './author';
import { lowerShard } from './lower';
import { SceneRefusalError } from './refusal';
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
  // review SHOULD: one material across the tile edge is still one draw
  expect(parseGlb(bytes).draws).toBe(1);
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

test('a panel id is a shardfile id, used once, and a panel holds meshes, solids and point lights only', () => {
  const box = (): THREE.Mesh => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), wood);
  expect(() => lowerShard({ slug: 'p', name: 'P' }, (world) => { world.part('gate', (p) => p.add(box()), { panel: 'Gate' }); })).toThrow(SceneRefusalError);
  expect(() => lowerShard({ slug: 'p', name: 'P' }, (world) => {
    world.part('a', (p) => p.add(box()), { panel: 'p.gate' }); world.part('b', (p) => p.add(box()), { panel: 'p.gate' });
  })).toThrow(/two parts are panel p.gate/u);
  expect(() => lowerShard({ slug: 'p', name: 'P' }, (world) => { world.part('lamp', (p) => p.add(box(), new THREE.DirectionalLight()), { panel: 'p.lamp' }); })).toThrow(/point lights only/u);
  expect(() => lowerShard({ slug: 'p', name: 'P' }, (world) => { world.part('lamp', (p) => p.add(box(), new THREE.Sprite()), { panel: 'p.lamp' }); })).toThrow(/point lights only/u);
  expect(() => lowerShard({ slug: 'p', name: 'P' }, (world) => { world.part('gate', (p) => p.add(box()), { panel: 'scene.posts' }); })).toThrow(SceneRefusalError);
  expect(() => lowerShard({ slug: 'p', name: 'P' }, (world) => {
    world.part('gate', (p) => { const m = solid(box()); animate(m, sway({ rate: 0.6, amount: 0.08 })); p.add(m); }, { panel: 'p.gate' });
  })).toThrow(/cannot move/u);
  const empty = lowerShard({ slug: 'p', name: 'P' }, (world) => { world.part('gate', (p) => { const m = solid(box()); m.visible = false; p.add(m); }, { panel: 'p.gate' }); });
  expect(() => sceneShardfile(empty)).toThrow(/draws nothing/u);
});

test('review SHOULD: a panel past the 18 MB a panel GLB holds is refused by name', () => {
  const huge = lowerShard({ slug: 'p', name: 'P' }, (world) => {
    world.part('gate', (p) => p.add(new THREE.Mesh(new THREE.SphereGeometry(5, 720, 600), wood)), { panel: 'p.gate' });
  });
  expect(() => sceneShardfile(huge)).toThrow(/over the 18 MB a panel GLB holds/u);
}, 60_000);

// MZ34 (for MZ7's braziers): a panel's point light is a look lamp naming that panel (format 0.51 `lamps[].panel`), so the
// engine lights it only while the panel shows; a light outside a panel names none.
test('a point light in a panel part is a lamp that follows the panel', () => {
  const lit = lowerShard({ slug: 'mz34', name: 'MZ34' }, (world) => {
    world.part('yard', (part) => { const light = new THREE.PointLight('#ffffff', 2, 8); light.position.set(10, 3, 0); part.add(light, solid(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), wood))); });
    world.part('brazier-fire', (part) => {
      const coals = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.6), wood); coals.position.set(0, 1, 0);
      const light = new THREE.PointLight('#ffa040', 4, 9); light.position.set(0, 1.6, 0); part.add(coals, light);
    }, { panel: 'mz34.brazier' });
  });
  expect(lit.parts.find((p) => p.name === 'brazier-fire')?.lights[0]?.panel).toBe('mz34.brazier');
  const lamps = sceneShardfile(lit).shard.look.light.lamps ?? [];
  expect(lamps).toHaveLength(2);
  expect(lamps.find((l) => l.at[0] === 0)).toMatchObject({ at: [0, 1.6, 0], panel: 'mz34.brazier' });
  expect(lamps.find((l) => l.at[0] === 10)).not.toHaveProperty('panel');
});
