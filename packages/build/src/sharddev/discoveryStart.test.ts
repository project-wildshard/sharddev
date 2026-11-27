import { expect, test } from 'vitest';
import { emptyShardfile } from '@wildshard/sdk/author';
import { authorManifest } from '@wildshard/sdk/internal/authorManifest';
// oxlint-disable-next-line import/no-nodejs-modules -- SF9's outputManifest case reads a made-up shard folder on disk.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- the folder lives under the system temp directory.
import { tmpdir } from 'node:os';
// oxlint-disable-next-line import/no-nodejs-modules -- its paths are joined, not concatenated.
import { join } from 'node:path';
import { outputManifest } from '../../scripts/shard-outputs.mjs';
import { liftDiscoveryStart, withGeneratedMinimap, withoutMovedWords } from './discoveryStart';

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
  // FP47b: nor its level look; a partial one has no level to give (format `liftLevelLook`), so the look keeps none
  expect(discovery).not.toHaveProperty('sky');
  expect(lifted.look.level).toBeUndefined();
});

test('FP47b: an Open Plots shaped product\'s whole level look moves into look.level; a look\'s own level wins', () => {
  const composed = authorManifest(shard('open-plot-thin-ice')) as Record<string, unknown>;
  const level = { sky: { ...composed['sky'] as object, sunIntensity: 2.5 }, atmosphere: composed['atmosphere'], grade: composed['grade'] };
  const lifted = liftDiscoveryStart(shard('open-plot-thin-ice'), { ...openPlot, ...level });
  expect(lifted.look.level).toEqual(level);
  expect(lifted.manifest).toBeUndefined();
  const own = { ...shard('own-look'), look: { ...shard('own-look').look, level: { ...level, sky: { ...level.sky, sunIntensity: 9 } } } } as never;
  expect(liftDiscoveryStart(own, { ...openPlot, ...level }).look.level?.sky.sunIntensity).toBe(9);
  const discovery = withoutMovedWords({ ...openPlot, ...level, horizon: { rings: [] } }) as Record<string, unknown>;
  for (const word of ['sky', 'atmosphere', 'grade', 'horizon']) expect(discovery).not.toHaveProperty(word);
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

// Standalone shardfiles SF9: SDK 0.9.0 refused every open plot, "Missing shardfile asset /assets/open-plot-<idea>/map/top.webp":
// an output's composed discovery named a public map copy no product mounts. It names its generated map's blob instead.
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
test('SF9: a composed discovery names its generated map blob, and keeps every other minimap word', () => {
  const hash = 'a'.repeat(64), manifest = { ...openPlot, minimap: { ...openPlot.minimap, outside: 'sand' } };
  const named = withGeneratedMinimap(manifest, 'open-plot-thin-ice', { hash, bytes: WEBP }) as typeof manifest;
  expect(named.minimap).toEqual({ image: `/shardfiles/open-plot-thin-ice/blobs/image/${hash}.webp`, outside: 'sand' });
  expect(manifest.minimap.image).toBe('/assets/open-plot-thin-ice/map/top.webp');
  expect(withGeneratedMinimap(manifest, 'open-plot-thin-ice', undefined)).toBe(manifest);
  const noImage = { ...openPlot, minimap: {} };
  expect(withGeneratedMinimap(noImage, 'open-plot-thin-ice', { hash, bytes: WEBP })).toBe(noImage);
  expect(() => withGeneratedMinimap(manifest, 'open-plot-thin-ice', { hash, bytes: new Uint8Array(12) })).toThrow('not WebP, PNG or JPEG');
});

test('SF9: an output keeps the minimap its folder declares; nothing forces a public map copy', () => {
  const root = mkdtempSync(join(tmpdir(), 'sf9-outputs-')), folder = join(root, 'src/shards/plots');
  try {
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'manifest.json'), JSON.stringify({ slug: 'plots', name: 'Plots', minimap: { image: '/assets/plots/map.webp' } }));
    const composed = outputManifest(root, 'plots', { slug: 'plot-a', manifest: { name: 'Plot A' } }) as { slug: string; name: string; minimap: { image: string } };
    expect(composed).toMatchObject({ slug: 'plot-a', name: 'Plot A', shardfile: '/shardfiles/plot-a/shard.json' });
    expect(composed.minimap).toEqual({ image: '/assets/plots/map.webp' });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
