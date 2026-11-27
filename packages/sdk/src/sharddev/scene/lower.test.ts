import * as THREE from 'three';
import { expect, test } from 'vitest';
import { lowerShard, WATER_SURFACE_SINK } from './lower';
import { SceneRefusalError } from './refusal';
import { solid, Water } from './author';
import { sceneShardfile } from './shardfile';

test('a re-run changes only the edited part\'s hash', () => {
  const run = (roof: string) => lowerShard({ slug: 'authoring-slice', name: 'Slice' }, (world) => {
    world.part('hut', (part) => { part.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: roof }))); });
    world.part('pond', (part) => { const lamp = new THREE.PointLight('#ffa850', 3.4, 6, 1.7); lamp.position.set(-19, 2, 2); part.add(lamp, new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2), new THREE.MeshStandardMaterial({ color: '#7a8a36' }))); });
  });
  const a = run('#ff0000'), b = run('#00ff00'), c = run('#ff0000');
  expect(a.parts[0]?.hash).not.toBe(b.parts[0]?.hash);
  expect(a.parts[1]?.hash).toBe(b.parts[1]?.hash);
  expect(a.parts[0]?.hash).toBe(c.parts[0]?.hash);
});

test('what has no lowering yet is refused by path and row, never dropped', () => {
  expect(() => lowerShard({ slug: 's', name: 's' }, (world) => {
    world.part('lines', (part) => { part.add(new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)))); });
  })).toThrow(SceneRefusalError);
  expect(() => lowerShard({ slug: 's', name: 's' }, (world) => {
    world.part('shader', (part) => { part.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.ShaderMaterial())); });
  })).toThrow(/shader\/Mesh 0: a ShaderMaterial is raw GLSL/u);
  const boxed = lowerShard({ slug: 's', name: 's' }, (world) => { world.part('wall', (part) => { const m = solid(new THREE.Mesh(new THREE.BoxGeometry(6, 3, 0.3))); m.position.set(1, 1.5, 2); m.rotation.y = Math.PI / 2; part.add(m); }); });
  const box = boxed.parts[0]?.colliders[0];
  expect(box?.half[0]).toBeCloseTo(3); expect(box?.centre).toEqual([1, 1.5, 2]);
});

test('a trigger and a use prompt take their node\'s world position, read after the build (AP25a, AP25b)', () => {
  const scene = lowerShard({ slug: 's', name: 's' }, (world) => {
    world.part('yard', (part) => {
      const shed = new THREE.Group(), door = new THREE.Object3D(), bank = new THREE.Object3D();
      door.position.set(0, 1, 2); shed.add(door); part.add(shed, bank); bank.position.set(-10.4, 0, 0.3);
      world.interact('yard.door', door, { label: 'Open the door', radius: 2, scene: 'yard.door.open' });
      world.trigger('yard.pond', bank, { radius: 4 });
      // moved after it was named: the row reads where it ends up
      shed.position.set(5, 0, -3);
    });
  });
  expect(scene.anchored.triggers).toEqual([{ id: 'yard.pond', kind: 'region', flag: 'yard.pond', x: -10.4, z: 0.3, radius: 4 }]);
  expect(scene.anchored.interactions).toEqual([{ id: 'yard.door', at: [5, 1, -1], radius: 2, label: 'Open the door', scene: 'yard.door.open' }]);
  expect(() => lowerShard({ slug: 's', name: 's' }, (world) => { world.trigger('lost', new THREE.Object3D(), { radius: 1 }); })).toThrow(/its node is not in the scene/u);
  expect(() => lowerShard({ slug: 's', name: 's' }, (world) => { const a = new THREE.Object3D(); world.scene.add(a); world.trigger('twice', a, { radius: 1 }); world.trigger('twice', a, { radius: 1 }); })).toThrow(/two triggers share this id/u);
  expect(() => lowerShard({ slug: 's', name: 's' }, (world) => { const a = new THREE.Object3D(); world.scene.add(a); world.interact('far', a, { label: 'x', radius: 9, scene: 's.x' }); })).toThrow(/outside 0.1 to 8 m/u);
});

// AP32c: world.detail turns an InstancedMesh's copies into one look.details row: counts per cell, not matrices
function meadow(count: number): THREE.InstancedMesh {
  const card = new THREE.PlaneGeometry(0.6, 0.8, 1, 1).translate(0, 0.4, 0), cross = card.clone().rotateY(Math.PI / 2);
  const geometry = new THREE.BufferGeometry();
  const positions = [...card.getAttribute('position').array, ...cross.getAttribute('position').array];
  const normals = [...card.getAttribute('normal').array, ...cross.getAttribute('normal').array];
  const uvs = [...card.getAttribute('uv').array, ...cross.getAttribute('uv').array];
  const index = [...(card.getIndex()?.array ?? []), ...[...(cross.getIndex()?.array ?? [])].map((i) => i + 4)];
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)).setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)).setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)).setIndex(index);
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ color: '#6f8f3a', side: THREE.DoubleSide }), count);
  let seed = 7; const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    // denser to the west: x is the larger of two draws, so the east half holds about three quarters of the clumps
    const x = -30 + 60 * Math.max(random(), random()), z = -30 + 60 * random(), k = 0.6 + 0.6 * random();
    m.compose(p.set(x, 2 + 0.05 * x, z), q.setFromEuler(e.set((random() - 0.5) * 0.3, random() * Math.PI * 2, 0)), s.set(k, k, k));
    mesh.setMatrixAt(i, m); mesh.setColorAt(i, c.setRGB(0.7 + 0.3 * random(), 0.8 + 0.2 * random(), 0.6));
  }
  return mesh;
}

test('world.detail lowers 9,000 clumps to one row: the same count per cell, under a tenth of the baked bytes (AP32c)', () => {
  const clumps = meadow(9000);
  const detail = lowerShard({ slug: 'meadow', name: 'Meadow' }, (world) => { world.part('field', (part) => { part.add(clumps); }); world.detail('grass', clumps, { cell: 2, radius: 40, sway: { amount: 0.3, rate: 0.8 } }); });
  const baked = lowerShard({ slug: 'meadow', name: 'Meadow' }, (world) => { world.part('field', (part) => { part.add(meadow(9000)); }); });
  expect(detail.parts[0]?.draws).toHaveLength(0);
  const layer = detail.details?.[0];
  expect(detail.details).toHaveLength(1);
  if (layer === undefined) return;
  // the copies counted again per cell, against what the mask says
  const counts = new Uint32Array(layer.region.columns * layer.region.rows), m = new THREE.Matrix4(), p = new THREE.Vector3();
  for (let i = 0; i < clumps.count; i++) {
    clumps.getMatrixAt(i, m); p.setFromMatrixPosition(m);
    const at = Math.floor((p.z - layer.region.corner[1]) / 2) * layer.region.columns + Math.floor((p.x - layer.region.corner[0]) / 2);
    counts[at] = (counts[at] ?? 0) + 1;
  }
  const off = [...counts].map((n, at) => Math.abs((layer.mask[at] ?? 0) / 255 * layer.clumps - n));
  expect(Math.max(...off)).toBeLessThanOrEqual(1);
  expect(layer.scale[0]).toBeGreaterThanOrEqual(0.6); expect(layer.scale[1]).toBeLessThanOrEqual(1.2);
  expect(layer.tilt).toBeLessThanOrEqual(0.16);
  // the shard file: one look.details row, three plain binary files, valid
  const { shard, assets } = sceneShardfile(detail), row = shard.look.details?.[0];
  expect(shard.look.details).toHaveLength(1);
  expect(row?.sway).toEqual({ amount: 0.3, rate: 0.8 });
  const files = [row?.mesh.file, row?.mask, row?.heights].map((hash) => shard.files.find((f) => f.hash === hash));
  expect(files.map((f) => f?.kind)).toEqual(['binary', 'binary', 'binary']);
  const detailBytes = [row?.mesh.file, row?.mask, row?.heights].reduce((n, hash) => n + (assets.get(hash ?? '')?.length ?? 0), 0);
  const bakedRun = sceneShardfile(baked), terrain = new Set(bakedRun.shard.tiles.flatMap((t) => t.files).filter((hash) => bakedRun.shard.files.find((f) => f.hash === hash)?.kind === 'binary'));
  const bakedBytes = [...bakedRun.assets].filter(([hash]) => !terrain.has(hash) && bakedRun.shard.files.find((f) => f.hash === hash)?.kind === 'glb').reduce((n, [, bytes]) => n + bytes.length, 0);
  expect(detailBytes * 10).toBeLessThan(bakedBytes);
});

test('world.detail refuses what the format cannot hold, by id', () => {
  expect(() => lowerShard({ slug: 's', name: 's' }, (world) => { world.detail('grass', meadow(10), { cell: 0.1, radius: 40 }); })).toThrow(/detail grass: its cell 0.1 m/u);
  expect(() => lowerShard({ slug: 's', name: 's' }, (world) => { world.detail('Grass', meadow(10), { cell: 2, radius: 40 }); })).toThrow(/a detail id is not a look id/u);
  expect(() => lowerShard({ slug: 's', name: 's' }, (world) => { const mesh = meadow(10); mesh.material = new THREE.MeshStandardMaterial({ map: new THREE.DataTexture(new Uint8Array(4), 1, 1) }); world.detail('grass', mesh, { cell: 2, radius: 40 }); })).not.toThrow();
  expect(() => lowerShard({ slug: 's', name: 's' }, (world) => { const mesh = meadow(10); mesh.material = new THREE.MeshBasicMaterial(); world.detail('grass', mesh, { cell: 2, radius: 40 }); })).toThrow(/detail grass: its card's MeshBasicMaterial has no detail lowering/u);
});

test('world.detail takes the format\'s widest grid, and its mark lasts one lowering only', () => {
  // 512 × 512 cells of 0.5 m: two clumps at opposite corners
  const wide = meadow(2), m = new THREE.Matrix4();
  wide.setMatrixAt(0, m.makeTranslation(0.1, 0, 0.1)); wide.setMatrixAt(1, m.makeTranslation(255.9, 0, 255.9));
  const scene = lowerShard({ slug: 's', name: 's' }, (world) => { world.detail('grass', wide, { cell: 0.5, radius: 40 }); });
  expect([scene.details?.[0]?.region.columns, scene.details?.[0]?.region.rows]).toEqual([512, 512]);
  // the same mesh in a later lowering, in a part and never handed to world.detail, is drawn
  const again = lowerShard({ slug: 's', name: 's' }, (world) => { world.part('field', (part) => { part.add(wide); }); });
  expect(again.parts[0]?.draws.length).toBeGreaterThan(0);
});

test('a textured detail card draws its map: the look entry\'s colour map, a library image (SF18), the uvs carrying its repeat (AP32d)', () => {
  const mesh = meadow(200), map = new THREE.DataTexture(new Uint8Array([90, 140, 60, 255, 80, 120, 50, 0, 90, 140, 60, 255, 80, 120, 50, 0]), 2, 2);
  map.repeat.set(2, 1); map.needsUpdate = true;
  mesh.material = new THREE.MeshStandardMaterial({ map, alphaTest: 0.35, side: THREE.DoubleSide });
  const { shard, assets } = sceneShardfile(lowerShard({ slug: 'fronds', name: 'Fronds' }, (world) => { world.detail('ferns', mesh, { cell: 2, radius: 30 }); }));
  const row = shard.look.details?.[0], entry = row === undefined ? undefined : shard.look.materials[row.material];
  const colour = entry !== undefined && entry.family === 'pbr' ? entry.maps.colour : null;
  expect(entry).toMatchObject({ family: 'pbr', alphaCutoff: 0.35, doubleSided: true, vertexColours: false });
  expect(colour).toMatch(/^[a-f0-9]{64}$/u);
  expect(shard.files.find((f) => f.hash === colour)?.kind).toBe('image');
  expect(shard.library).toContain(colour);
  // the card's uvs: u spans 0 to 2 (repeat 2), v 0 to 1
  const bytes = assets.get(row?.mesh.file ?? ''), vertices = row?.mesh.vertices ?? 0;
  const uv = bytes === undefined ? new Float32Array() : new Float32Array(bytes.buffer, bytes.byteOffset + vertices * 6 * 4, vertices * 2);
  expect(Math.max(...uv.filter((_, i) => i % 2 === 0))).toBeCloseTo(2); expect(Math.max(...uv.filter((_, i) => i % 2 === 1))).toBeCloseTo(1);
});

test('a Water lowers to its water row and a drawn surface in its tint on every tier (MOSSGATE-ZONE MZ6)', () => {
  const scene = lowerShard({ slug: 's', name: 's' }, (world) => {
    world.part('pond', (part) => {
      const shape = new THREE.Shape([new THREE.Vector2(-2, -1), new THREE.Vector2(2, -1), new THREE.Vector2(2, 1), new THREE.Vector2(-2, 1)]);
      const water = new Water(shape, { tint: '#2f4a46', reflect: 'planar' });
      water.position.set(-19, -0.12, 0); part.add(water);
    });
  });
  const pond = scene.parts[0];
  expect(pond?.water).toHaveLength(1);
  expect(pond?.water[0]?.level).toBeCloseTo(-0.12);
  const surface = pond?.draws.find((d) => d.path.endsWith('#surface'));
  expect(surface).toBeDefined();
  // laid flat at the pond, just under the row's level, so a mirror the page draws covers it
  expect(surface?.matrix[12]).toBeCloseTo(-19);
  expect(surface?.matrix[13]).toBeCloseTo(-0.12 - WATER_SURFACE_SINK);
  // in the Water's own tint, a little see-through: water you can see, never a bare pit
  const material = scene.materials[surface?.material ?? ''];
  expect(material?.transparent).toBe(true);
  expect(material?.opacity ?? 0).toBeGreaterThan(0.5);
});
