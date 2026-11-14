import { expect, test } from 'vitest';
import { sceneSummary } from '@wildshard/sdk/scene/lower';
import { slice } from './shard';

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

