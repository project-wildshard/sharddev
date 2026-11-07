import { beforeEach, expect, test } from 'vitest';
import { setTerrainHeight } from '../src/shared/engine/world/terrainHeight';
import { AmbientFlock } from '../src/shared/engine/ai/ambientFlock';
import { parseAmbientFlock, parseAmbientLife } from '@wildshard/format/ambientLife';
import { GULL_FLOCK } from '../src/shards/driftwood-isle/generators/gullsLook';
import { PINE_LIFE } from '../src/shards/pine-hollow/generators/ambientLife';
import { AmbientGroup } from '../src/shared/game/ambient/flock';
// oxlint-disable-next-line import/no-nodejs-modules -- Hash the Node scenario's complete shipping pose and cue trace.
import { createHash } from 'node:crypto';
import poses from './fixtures/ambient-poses.json';
import { BufferGeometry, Float32BufferAttribute, MeshBasicMaterial } from 'three';
import { AmbientFlockDraw } from '../src/client/game/ambient/ambientFlock';
import { withPortableMath } from './fake/portableMath';

beforeEach(() => { setTerrainHeight(() => 0); });

const pine = parseAmbientLife(PINE_LIFE);
const eye = { x: 0, y: 1.7, z: 0, light: 0.8, fx: 0, fz: 1 };
test('Driftwood gulls and Pine guide ravens fly their shipped formation rows', () => {
  for (const row of [parseAmbientFlock(GULL_FLOCK), pine.guide.flock]) {
    const flock = new AmbientFlock(row, [{ x: 80, y: 2, z: -200 }, { x: -80, y: 2, z: -200 }], () => 0);
    expect(flock.guide(eye, 150, 150)).toBe(true);
    expect(flock.birds.filter(b => b.state === 6)).toHaveLength(row.guide?.formation.length ?? 0);
    for (let i = 0; i < 1800; i++) flock.update(1 / 60, eye);
    expect(flock.birds.every(b => [b.x, b.y, b.z, b.yaw, b.pitch, b.flap].every(Number.isFinite))).toBe(true);
    expect(flock.birds.some(b => b.state === 6)).toBe(false);
    if (row.wheeling === null) expect(flock.birds.every(b => b.state === 0)).toBe(true);
    else expect(flock.birds.some(b => b.state !== 0)).toBe(true);
  }
});

test('ambient groups own scavenge arrivals, release and daylight gates', () => {
  const ravens = new AmbientGroup(pine.scavenger.flock, []);
  const site = ravens.gather(60, 40, 0.8, 2);
  expect(site).toBeGreaterThanOrEqual(0);
  expect(ravens.siteVisit(site)).toBe(1);
  for (let i = 0; i < 600; i++) ravens.update(1 / 60, eye);
  expect(ravens.birds.filter(b => b.state !== 0)).toHaveLength(2);
  ravens.release(site, eye);
  for (let i = 0; i < 1200; i++) ravens.update(1 / 60, eye);
  expect(ravens.siteVisit(site)).toBe(3);
  expect(ravens.birds.every(b => b.state === 0)).toBe(true);
  const owl = new AmbientGroup(pine.sentinel.flock, [{ x: 40, y: 10, z: 30 }]);
  expect(owl.visitAt(40, 30, 20, eye)).toBe(true);
  for (let i = 0; i < 2400; i++) owl.update(1 / 60, eye);
  expect(owl.birds[0]?.state).toBe(10);
  for (let i = 0; i < 1200; i++) owl.update(1 / 60, { ...eye, light: 0 });
  expect(owl.birds[0]?.state).toBe(0);
});

function expectShippingPose(actual: unknown, expected: unknown): void {
  // The shipping JSON encodes the unset yaw sentinel (Infinity) as null.
  if (expected === null && actual === Infinity) return;
  if (typeof expected === 'number') {
    expect(typeof actual).toBe('number');
    expect(actual).toBeCloseTo(expected, 9);
  } else if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) throw new Error('Missing shipping pose array');
    expect(actual).toHaveLength(expected.length);
    expected.forEach((value: unknown, i: number) => { expectShippingPose(actual[i], value); });
  } else if (typeof expected === 'object' && expected !== null) {
    if (typeof actual !== 'object' || actual === null) throw new Error('Missing shipping pose object');
    expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
    for (const [key, value] of Object.entries(expected)) expectShippingPose(Reflect.get(actual, key), value);
  } else expect(actual).toBe(expected);
}

test('all ambient groups preserve 18000 seeded shipping pose/call frames', () => withPortableMath(() => {
  for (const entry of poses.cases) {
    const row = entry.name === 'gull' ? parseAmbientFlock(GULL_FLOCK) : entry.name === 'guide' ? pine.guide.flock
      : entry.name === 'scavenger' ? pine.scavenger.flock : entry.name === 'sentinel' ? pine.sentinel.flock : pine.trunkForager.flock;
    const group = new AmbientGroup(row, [{ x: 40, y: 10, z: 30 }, { x: 70, y: 14, z: 40, r: 0.3, w: 1 }]);
    const hash = createHash('sha256');
    for (let frame = 0; frame < poses.frames; frame++) {
      const near = frame >= 1200 && frame < 1800;
      const viewer = { x: near ? 40 : 0, y: 1.7, z: near ? 30 : 0, light: frame < 2400 ? 0.8 : 0, fx: 0, fz: 1, fast: frame < 1600 };
      if (frame === 0 && entry.name === 'scavenger') group.gather(40, 30, 0.8, 2);
      if (frame === 30 && (entry.name === 'gull' || entry.name === 'guide')) group.guide(viewer, 150, 150);
      group.update(poses.dt, viewer);
      hash.update(JSON.stringify([group.birds, group.calls]));
      const sample = entry.poses.find(pose => pose.frame === frame);
      if (sample !== undefined) expectShippingPose({ birds: group.birds, calls: group.calls }, { birds: sample.birds, calls: sample.calls });
    }
    expect(hash.digest('hex'), entry.name).toBe(entry.portableHash);
  }
}));

test('visitor rows admit only finite numeric perches and cannot mix flight policies', () => {
  expect(() => new AmbientGroup(pine.sentinel.flock, [{ x: Infinity, y: 0, z: 0 }])).toThrow();
  expect(() => new AmbientGroup(pine.sentinel.flock, [{ x: 0, y: 0, z: 0, update: () => 0 }])).toThrow();
  expect(() => new AmbientGroup({ ...pine.sentinel.flock, guide: pine.guide.flock.guide })).toThrow('cannot mix');
});

test('perch visitors obey day/night gates and flee on approach', () => {
  const owl = new AmbientGroup(pine.sentinel.flock, [{ x: 40, y: 10, z: 30 }]);
  for (let i = 0; i < 2400; i++) owl.update(1 / 60, { ...eye, light: 0 });
  expect(owl.birds.every(bird => bird.state === 0)).toBe(true);
  for (let i = 0; i < 1200; i++) owl.update(1 / 60, eye);
  expect(owl.birds[0]?.state).toBe(10);
  owl.update(1 / 60, { ...eye, x: 40, z: 30 });
  expect(owl.birds[0]?.state).toBe(7);
  expect(owl.birds[0]?.legs).toBe(pine.sentinel.flock.visit?.flushLegs);
});

test('numeric light and weather gates park poses and calls without reseeding', () => {
  const group = new AmbientGroup({ ...pine.scavenger.flock, when: { light: [0.4, 1], weather: { rain: [0, 0.3] } } });
  group.gather(40, 30, 0.8, 2);
  expect(group.birds).toEqual([]);
  group.update(0, { ...eye, weather: { rain: 0.1 } });
  const before = structuredClone(group.birds);
  for (const viewer of [{ ...eye, light: 0 }, { ...eye, weather: { rain: 1 } }, eye]) {
    group.update(1 / 60, viewer);
    expect(group.birds).toEqual([]);
    expect(group.calls).toEqual([]);
  }
  group.update(0, { ...eye, weather: { rain: 0.1 } });
  expect(group.birds).toEqual(before);
  expect(group.birds.filter(bird => bird.state !== 0)).toHaveLength(2);
});

test('an independent marsh row drives three small daytime perch visitors', () => {
  const visit = pine.trunkForager.flock.visit;
  if (visit === null) throw new Error('Missing visitor fixture');
  const rows = { ...pine.trunkForager.flock, seed: 983, count: 3, scale: 0.3,
    when: { light: [0, 0.7], weather: { mist: [0.2, 0.8] } },
    visit: { ...visit, every: 2, enter: [0, 0.7], stay: [0, 0.8], near: [2, 30], speed: 4,
      pose: { pitch: 0.2, body: 0.1, legs: 0, stand: 0.05, peck: 0 },
      callCue: 'reed-click', gain: 0.2, flush: 3, relocate: [6, 12], leave: 60, acts: null } };
  const perches = [{ x: 10, y: 2, z: 6, r: 0.2, w: 2 }, { x: 18, y: 3, z: -8, r: 0.4, w: 1 }];
  const a = new AmbientGroup(rows, perches), b = new AmbientGroup(rows, perches);
  const viewer = { ...eye, light: 0.1, weather: { mist: 0.5 } };
  for (let i = 0; i < 1200; i++) { a.update(1 / 60, viewer); b.update(1 / 60, viewer); }
  expect(a.birds).toEqual(b.birds);
  expect(a.birds.filter(bird => bird.state === 10)).toHaveLength(3);
  expect(a.birds.every(bird => [bird.x, bird.y, bird.z, bird.flap, bird.fold].every(Number.isFinite))).toBe(true);
  a.update(1 / 60, { ...viewer, weather: { mist: 0.9 } });
  expect(a.birds).toEqual([]);
});

test('a gated posed draw reserves the full declared population before first visibility', () => {
  const row = parseAmbientFlock({ ...pine.scavenger.flock, when: { weather: { rain: [0, 0.3] } } });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  const material = new MeshBasicMaterial();
  const draw = new AmbientFlockDraw(row, { name: 'marsh', geometry, material }, []);
  try {
    expect(draw.mesh.count).toBe(0);
    draw.flock.gather(40, 30, 0.8, 3);
    draw.update(0, { ...eye, weather: { rain: 0.1 } });
    expect(draw.mesh.count).toBe(3);
    draw.update(0, { ...eye, weather: { rain: 1 } });
    expect(draw.mesh.count).toBe(0);
  } finally { draw.mesh.geometry.dispose(); geometry.dispose(); material.dispose(); }
});
