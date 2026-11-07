import { expect, it } from 'vitest';
import nalati from '../src/shards/nalati-grasslands/discovery.generated';
import { readNativeTerrain } from '../src/sharddev/bake/terrain';
import { fixtureBytes } from '@wildshard/engine/test/nativeBytes';
import discovery from '../src/shards/nalati-grasslands/data/discovery.json' with { type: 'json' };
import nine from '../src/shards/nine-dragon-stack/discovery.generated';

it('Nine uses compiled page ownership without a trusted runtime', () => {
  expect(nine.clientPlanRuntime).toBe(true);
  expect(Object.hasOwn(nine, 'trustedRuntime')).toBe(false);
});

it('keeps the four native camera poses and unbounded Nine attacker allocation', async () => {
  expect(nine.fight?.attackers).toBe(Infinity);
  expect(Object.keys(await nine.dev?.poses() ?? {})).toEqual(['A', 'B', 'C', 'D']);
});

it('bakes every Nalati camera eye against the shipped terrain samples', async () => {
  const terrain = readNativeTerrain(fixtureBytes(new URL('../public/assets/baked/nalati-grasslands/terrain.bin', import.meta.url)));
  const poses = await nalati.dev?.poses();
  // Program discovery is canonical JSON: record keys are unordered and yaw zero has no negative sign.
  expect(Object.keys(poses ?? {}).sort()).toEqual(discovery.captureProbes.map(probe => probe.name).sort());
  for (const probe of discovery.captureProbes) expect(poses?.[probe.name]).toEqual({
    probe, eye: [probe.x, terrain.heightAt(probe.x, probe.z) + 1.68, probe.z],
    yaw: 0 - probe.yaw * 180 / Math.PI, pitch: probe.pitch * 180 / Math.PI, mockup: '', frame: probe.name,
  });
  const ground = nalati.ground;
  try {
    if (ground.terrain === undefined) throw new Error('Missing Nalati terrain');
    nalati.ground = { ...ground, terrain: { ...ground.terrain, heightAt: () => 25 } };
    expect(await nalati.dev?.poses()).toEqual(poses);
    if (poses?.['camp'] !== undefined) poses['camp'].eye = [0, 0, 0];
    expect((await nalati.dev?.poses())?.['camp']?.eye).toEqual([60, terrain.heightAt(60, 214) + 1.68, 214]);
  } finally { nalati.ground = ground; }
});
