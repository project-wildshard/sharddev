import { expect, test } from 'vitest';
import layout from '../data/layout.json' with { type: 'json' };
import manifest from '../manifest.json' with { type: 'json' };
import card from '../data/card.json' with { type: 'json' };
import { templateHeightAt } from './landscape';

// TEMPLATE-E2E S-T1.0: the test yard. Every station within 25 m of spawn has a named POI, so a Template 1 spec walks to
// `poseAt('mossgate')` instead of a copied coordinate. TEMPLATES-CLEANROOM M2's composition brings the pond in (19.4 m);
// brazier B stays past 25 m (27.6 m), across the pond, and unnamed.
const YARD = 25;
const SPAWN: [number, number] = [manifest.spawn.x, manifest.spawn.z];
const [braziers0, , braziers2] = layout.BRAZIERS;

/** Each station near spawn, by the POI id that names it: where a spec stands to use it. */
const STATIONS: Readonly<Record<string, [number, number]>> = {
  hut: [layout.HUT.x, layout.HUT.doorZ],
  blob: [layout.BLOB.x, layout.BLOB.z],
  greyback: [layout.ELITE.x, layout.ELITE.z],
  'barrow-warden': [layout.BOSS.x, layout.BOSS.z],
  mossgate: [layout.MOSSGATE.x, layout.MOSSGATE.z],
  'brazier-a': [braziers0?.[0] ?? Number.NaN, braziers0?.[1] ?? Number.NaN],
  'brazier-c': [braziers2?.[0] ?? Number.NaN, braziers2?.[1] ?? Number.NaN],
  lamplighter: [layout.LAMPLIGHTER.x, layout.LAMPLIGHTER.z],
  pond: [layout.POND.x, layout.POND.z],
};

interface Pose { x: number; y: number; z: number; yaw: number }
const heightAt = templateHeightAt();

/** A POI's pose: its centre on the ground at spawn's standing height, facing away from spawn. Throws on an unknown id. */
function poseAt(id: string): Pose {
  const poi = manifest.pois.find((p) => p.id === id);
  if (poi === undefined) throw new Error(`no POI named ${id}`);
  const lift = manifest.spawn.y - heightAt(SPAWN[0], SPAWN[1]);
  return { x: poi.x, y: heightAt(poi.x, poi.z) + lift, z: poi.z, yaw: Math.atan2(poi.x - SPAWN[0], poi.z - SPAWN[1]) };
}

const fromSpawn = (x: number, z: number): number => Math.hypot(x - SPAWN[0], z - SPAWN[1]);

test('every layout station within 25 m of spawn is in the yard list', () => {
  const points: [string, number, number][] = [];
  for (const [key, value] of Object.entries(layout)) {
    if (Array.isArray(value)) {
      if (key === 'BRAZIERS') value.forEach((p, i) => { points.push([`${key}[${String(i)}]`, Number(p[0]), Number(p[1])]); });
      continue;
    }
    points.push([key, value.x, value.z]);
    if ('doorZ' in value) points.push([`${key}.door`, value.x, value.doorZ]);
  }
  const listed = Object.values(STATIONS);
  for (const [key, x, z] of points) {
    if (fromSpawn(x, z) > YARD || key === 'HUT' || key === 'ARENA') continue; // the hut is used at its door; the arena is the boss's ring
    expect(listed.some(([sx, sz]) => sx === x && sz === z), `${key} at (${String(x)}, ${String(z)})`).toBe(true);
  }
});

test('each yard station has a named POI on it, and poseAt resolves it within 25 m of spawn', () => {
  const ids = manifest.pois.map((p) => p.id);
  expect(new Set(ids).size, 'POI ids are unique').toBe(ids.length);
  for (const [id, [sx, sz]] of Object.entries(STATIONS)) {
    const poi = manifest.pois.find((p) => p.id === id);
    expect(poi, `POI ${id}`).toBeDefined();
    expect(poi?.name.trim(), `POI ${id} has a name`).not.toBe('');
    expect(Math.hypot((poi?.x ?? Number.NaN) - sx, (poi?.z ?? Number.NaN) - sz), `POI ${id} stands on its station`).toBeLessThan(0.5);
    const pose = poseAt(id);
    for (const v of [pose.x, pose.y, pose.z, pose.yaw]) expect(Number.isFinite(v), `poseAt(${id})`).toBe(true);
    expect(fromSpawn(pose.x, pose.z), `poseAt(${id}) from spawn`).toBeLessThanOrEqual(YARD);
  }
});

test('the shardfile card carries the same POIs as the manifest', () => {
  // `generators/product.ts` ships `data/card.json` as the shardfile's manifest; the build refuses a manifest that differs.
  expect(card.pois).toStrictEqual(manifest.pois);
});

test('poseAt refuses a name that is not a POI', () => {
  expect(() => poseAt('brazier-b')).toThrow('no POI named brazier-b');
});
