import { expect, test } from 'vitest';
import { sceneSummary } from '@wildshard/sdk/scene/lower';
import { sceneLook, sceneShardfile } from '@wildshard/sdk/scene/shardfile';
import { lookSkyErrors } from '@wildshard/format/look-sky';
import { SLICE_QUESTS, slice } from './shard';

/** AP1's done-when: the cleanroom's lantern() and hut block (mossgate-cleanroom eac5bb8 src/world.js 286-309, 398-530),
 *  copied into this slice (world.ts), lower with no refusal, and the description lists
 *  their materials, textures and instance counts. */
test('the cleanroom hut and its lanterns lower with no refusal', () => {
  const t0 = performance.now();
  const shard = slice.describe();
  console.info(`lowered in ${(performance.now() - t0).toFixed(0)} ms`, sceneSummary(shard));
  const hutPart = shard.parts.find((p) => p.name === 'hut');
  expect(hutPart).toBeDefined();
  if (hutPart === undefined) return;
  const materials = hutPart.materials.map((key) => shard.materials[key]);
  // stone, wood, shingle and the lamp glass, each with its own fields
  expect(materials.some((m) => m?.map !== null && m?.roughness === 0.93)).toBe(true); // stone
  expect(materials.some((m) => m?.map !== null && m?.roughness === 0.95)).toBe(true); // shingle
  const glass = materials.find((m) => m?.emissiveIntensity === 2.6);
  expect(glass?.emissive[0]).toBeGreaterThan(0.5);
  expect(materials.some((m) => m?.alphaTest === 0.45 && m.side === 'double')).toBe(true); // ivy
  expect(materials.some((m) => m?.kind === 'sprite' && m.blending === 'additive')).toBe(true); // the lamp halo
  // painted textures carry their pixels
  for (const key of hutPart.textures) { const t = shard.textures[key]; expect(t?.rgba.length).toBe((t?.width ?? 0) * (t?.height ?? 0) * 4); }
  expect(hutPart.textures.length).toBeGreaterThanOrEqual(6);
  // instance counts: the coursed blocks, the shingles (with their colours), the moss caps
  const roof = hutPart.draws.find((d) => d.path.endsWith('roof'));
  expect(roof?.instances?.count).toBeGreaterThan(100);
  expect(roof?.instances?.colours?.length).toBe((roof?.instances?.count ?? 0) * 3);
  expect(hutPart.draws.filter((d) => d.instances !== null).length).toBeGreaterThanOrEqual(3);
  // lights: the bracket lamp and the two room lights; colliders: five wall boxes and three barrels
  expect(hutPart.lights.filter((l) => l.kind === 'point')).toHaveLength(3);
  expect(hutPart.colliders).toHaveLength(8);
  const pondPart = shard.parts.find((p) => p.name === 'pond');
  expect(pondPart?.water).toHaveLength(1);
  expect(pondPart?.water[0]?.outline.length).toBeGreaterThan(20);
  expect(shard.look.fog?.kind).toBe('exp2');
  expect(shard.look.post?.bloom?.strength).toBe(0.42);
  expect(shard.ground).not.toBeNull();
});


/** AP14's done-when: the cleanroom's makeSky compiles to the look's dome sky (not a post pass), and its environment rides
 *  the same dome. */
test('the cleanroom sky compiles to look.sky with its environment', () => {
  const shard = slice.describe(), sky = shard.look.sky;
  expect(sky?.graph.kind).toBe('material');
  if (sky === undefined || sky === null) return;
  expect(lookSkyErrors(sky.graph)).toEqual([]);
  console.info(`sky: ${Object.keys(sky.graph.nodes).length} nodes`);
  const look = sceneLook(shard, shard.parts.flatMap((p) => p.lights), {});
  expect(look.sky?.graph).toBe(sky.graph);
  expect(look.post).toBeUndefined();
  expect(look.light?.environment?.intensity).toBe(0.4);
});

test('the pond trigger is the bank node\'s, typed once, and builds the row it was (AP25a)', () => {
  const scene = slice.describe();
  expect(SLICE_QUESTS.triggers).toEqual([]);
  const { shard } = sceneShardfile(scene, { extend: (s) => ({ ...s, quests: SLICE_QUESTS }) });
  expect(shard.quests.triggers).toEqual([{ id: 'slice.pond', kind: 'region', flag: 'slice.pond', x: -10.4, z: 0.3, radius: 4 }]);
  expect(shard.quests.quests[0]?.id).toBe('slice.walk');
});

// AP9c: the back end writes the L1 copies itself (the slice keeps no hand coarse list): each L1 tile over still meshes
// carries a simplified copy of its four fine tiles, far fewer triangles than they hold.
test('every L1 tile over the slice\'s meshes gets a generated coarse copy (AP9c)', () => {
  const { shard } = sceneShardfile(slice.describe());
  const coarse = shard.props.tiles.filter((t) => t.lod === 1), tiles = shard.tiles;
  expect(coarse.length).toBeGreaterThan(0);
  for (const row of coarse) {
    const l1 = tiles.find((t) => t.lod === 1 && t.x === row.x && t.z === row.z), fine = tiles.filter((t) => t.lod === 0 && Math.floor(t.x / 2) === row.x && Math.floor(t.z / 2) === row.z);
    expect(l1?.files).toContain(row.file);
    const fineTriangles = fine.reduce((n, t) => n + t.triangles, 0);
    expect(l1?.triangles ?? Infinity).toBeLessThan(fineTriangles / 2);
  }
});
