import { expect, test } from 'vitest';
import { emptyShardfile } from '@wildshard/sdk/author';
import { authorManifest } from '@wildshard/sdk/internal/authorManifest';
import { liftDiscoveryStart, withoutMovedWords } from './discoveryStart';

const shard = (slug: string) => emptyShardfile({ slug, name: slug, author: 'Fixture', saveRevision: 1, seed: 7 });

// Shaped like an Open Plots output: the folder's manifest.json composed with its row's audio override.
const openPlot = {
  slug: 'open-plot-thin-ice', name: 'Thin Ice', bindings: {}, minimap: { image: '/assets/open-plot-thin-ice/map/top.webp' },
  spawn: { x: 0, y: 0.1, yaw: Math.PI, z: -45 }, loadout: { start: [], tools: [], weapons: [] }, weapon: 'custom',
  audio: { ambience: 'wind', score: 'none' }, species: [], spawns: [], sky: { sunIntensity: 1 },
};

test('FP36: an Open Plots shaped product keeps its start in its sections, and its discovery carries none of it', () => {
  const lifted = liftDiscoveryStart(shard('open-plot-thin-ice'), openPlot);
  expect(lifted.manifest).toBeUndefined();
  expect(lifted.spawn).toEqual({ x: 0, y: 0.1, yaw: Math.PI, z: -45 });
  expect(lifted.items.loadout.level).toEqual({ start: [], tools: [], weapons: [] });
  expect(lifted.audio.level).toEqual({ ambience: 'wind', score: 'none' });
  const discovery = withoutMovedWords(openPlot) as Record<string, unknown>;
  for (const word of ['spawn', 'loadout', 'weapon', 'audio', 'species', 'spawns']) expect(discovery).not.toHaveProperty(word);
  expect(discovery['minimap']).toEqual(openPlot.minimap);
  expect(discovery['sky']).toEqual(openPlot.sky);
});

test('FP36: a Mirror Salt shaped product (no manifest, the plain author one) lifts its plain audio; a declared spawn wins', () => {
  const declared = { ...shard('mirror-salt'), spawn: { x: 12, y: 3, z: -4, yaw: 1 } };
  const lifted = liftDiscoveryStart(declared, authorManifest(declared));
  expect(lifted.spawn).toEqual({ x: 12, y: 3, z: -4, yaw: 1 });
  expect(lifted.audio.level).toEqual({ ambience: 'none', score: 'none' });
  expect(lifted.items.loadout.level).toBeUndefined();
  const discovery = withoutMovedWords(authorManifest(lifted)) as Record<string, unknown>;
  for (const word of ['spawn', 'weapon', 'audio']) expect(discovery).not.toHaveProperty(word);
});

test('FP36: a section\'s own audio wins, and a product with a level manifest is left to the OF9b3 door', () => {
  const own = { ...shard('own-audio'), audio: { ...shard('own-audio').audio, level: { ambience: 'sea', score: 'tide' } } };
  expect(liftDiscoveryStart(own, openPlot).audio.level).toEqual({ ambience: 'sea', score: 'tide' });
  const withLevel = { ...shard('with-level'), manifest: authorManifest(shard('with-level')) } as never;
  expect(liftDiscoveryStart(withLevel, openPlot)).toBe(withLevel);
  expect(withoutMovedWords(null)).toBeNull();
});
