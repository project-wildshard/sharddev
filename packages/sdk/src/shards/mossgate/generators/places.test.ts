// MOSSGATE-ZONE MZ16: the twelve places in the built shard: each a region trigger at its place raising
// `mossgate.place.<id>`, each a marker of "The lay of the Hollow" (the full map's names), a fingerpost at both ends of every
// road and on every entry road, and Lookout Ridge's dais, steps and view stone.
import { expect, test } from 'vitest';
import { builtSceneShardfile } from '@wildshard/sdk/scene/shardfile';
import { compileScript } from '@wildshard/sdk/compileScript';
import { parseShardfile } from '@wildshard/format/shardSchema';
import { gameplay } from './gameplay';
import { ENTRIES, PATHS, PLACES } from './layout';
import { roadDistance } from './ground';
import { fingerposts, placeFlag } from './places';
import { RIDGE, RIDGE_TALKS } from './ridge';
import { mossgate } from './shard';
import { groundHeight } from './world';

test('every place is a region trigger and a marker on the map; the roads carry fingerposts', { timeout: 120_000 }, async () => {
  const scene = mossgate.describe();
  const { shard } = await builtSceneShardfile(scene, compileScript, { extend: gameplay });
  // oxlint-disable-next-line unicorn/prefer-structured-clone -- JSON wire normalization, as the build writes it
  expect(() => parseShardfile(JSON.parse(JSON.stringify(shard)))).not.toThrow();
  expect(PLACES).toHaveLength(12);
  for (const place of PLACES) {
    const trigger = shard.quests.triggers.find((t) => t.kind === 'region' && t.flag === placeFlag(place.id));
    expect(trigger, place.id).toBeDefined();
    if (trigger?.kind === 'region') expect(Math.hypot(trigger.x - place.x, trigger.z - place.z), place.id).toBeLessThan(1);
  }
  const lay = shard.quests.quests.find((q) => q.id === 'mossgate.places');
  expect(lay?.track).toBe(false);
  const markers = lay?.steps[0]?.markers ?? [];
  expect(markers.map((m) => m.label)).toEqual(PLACES.map((p) => p.name));
  expect(lay?.steps[0]?.done.all).toEqual(PLACES.map((p) => placeFlag(p.id)));
  expect(lay?.onComplete).toMatchObject({ fact: 'mossgate.places', coins: 20 });

  // two posts a road and one on each entry road, each beside its road (not on it) and naming a place
  const posts = fingerposts();
  expect(posts).toHaveLength(PATHS.length * 2 + ENTRIES.length);
  const names = new Set(PLACES.map((p) => p.name));
  for (const f of posts) {
    expect(names.has(f.name), f.name).toBe(true);
    expect(roadDistance(f.x, f.z), `${f.name} post at ${f.x.toFixed(1)}, ${f.z.toFixed(1)}`).toBeGreaterThan(1.5);
  }
  // each place past the yard is named by at least one post (the pond is in sight of the spawn)
  for (const place of PLACES.filter((p) => p.region !== 'yard')) expect(posts.some((f) => f.name === place.name), place.name).toBe(true);

  // the Lookout: a dais you can stand on, steps up its east face, the view stone's talk
  const ridge = scene.parts.find((p) => p.name === 'ridge');
  const gy = groundHeight(RIDGE.LOOKOUT.x, RIDGE.LOOKOUT.z);
  const dais = ridge?.colliders?.find((c) => Math.hypot(c.centre[0] - RIDGE.LOOKOUT.x, c.centre[2] - RIDGE.LOOKOUT.z) < 0.5 && c.half[0] > 3);
  expect(dais, 'the dais collider').toBeDefined();
  expect((dais?.centre[1] ?? 0) + (dais?.half[1] ?? 0) - gy).toBeCloseTo(RIDGE.DAIS.h + 0.1, 1);
  const steps = ridge?.colliders?.filter((c) => c.centre[0] > RIDGE.LOOKOUT.x + RIDGE.DAIS.half && c.centre[0] < RIDGE.LOOKOUT.x + RIDGE.DAIS.half + 3 && Math.abs(c.centre[2] - RIDGE.LOOKOUT.z) < 0.1) ?? [];
  expect(steps).toHaveLength(RIDGE.DAIS.steps);
  expect(shard.targets.talks?.find((t) => t.id === RIDGE_TALKS[0]?.id)).toMatchObject({ dialogue: 'mossgate.ridge.view' });
});
