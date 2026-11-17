import { expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { parse } from 'valibot';
import { Audio, type SampleLoop } from '@wildshard/engine/audio/Audio';
import { AmbienceZones } from '@wildshard/engine/audio/ambience';
import { SampledAmbience } from '@wildshard/engine/audio/AmbienceBeds';
import { requireAudioProfile } from '@wildshard/engine/audio/audioProfiles';
import { AudioSampleMixSchema } from '@wildshard/format/audioProfiles';
import { app } from '@wildshard/engine/app/runtime';
import { Rng } from '@wildshard/engine/core/rng';
import type { CueOpts } from '@wildshard/engine/audio/Cues';
import { Thrown } from './fixtures/weapon-oracle/thrown';
import audioDeclaration from './fixtures/nalati-audio-original.json' with {type:'json'};
import {parseAudioData} from '@wildshard/format/audio';
import { ND_AUDIO } from '../src/shards/nine-dragon-stack/generators/audio';
// The original steppe ambience's mixes, pans, diagnostics, calls and zones, frozen from the legacy copy
import FROZEN from './fixtures/legacy-oracles/nalati-ambience.json' with { type: 'json' };
import items from '../src/shards/nalati-grasslands/data/items.json' with { type: 'json' };
import { ThrownWeaponProfileSchema } from '@wildshard/format/weaponProfiles';

const NALATI_AUDIO=parseAudioData(audioDeclaration.audio);

class Recorder extends Audio {
  readonly recordedCalls: { kind: string; point: number[]; listener: number[]; yaw: number }[] = [];
  readonly directed: { id: string; gain: number; pan: number }[] = [];
  override cue(id: string, opts: CueOpts = {}): boolean { this.directed.push({ id, gain: opts.gain ?? 1, pan: app.rng.stream('cosmetic').next() }); return true; }
  readonly sampleLoops = new Map<string, SampleLoop>();
  override get ready(): boolean { return true; }
  override get ctx(): AudioContext { return { currentTime: 99 } as AudioContext; }
  override loop(id: string): SampleLoop | undefined { return this.sampleLoops.get(id); }
  override animal(kind: string, point: Vector3, listener: Vector3, yaw: number): void {
    this.recordedCalls.push({ kind, point: point.toArray(), listener: listener.toArray(), yaw });
  }
}
it('replays the frozen zone, mix, call timing and seeded positions across weather and entry changes', () => {
  const audio = new Recorder(), profile = requireAudioProfile(NALATI_AUDIO.zones, 'zones');
  for (const row of requireAudioProfile(profile.sampleMix, 'mix').beds) audio.sampleLoops.set(row.id, { buffer: {} as AudioBuffer, gain: 0.73, loopStart: 0, loopEnd: 1 });
  const mixes: { id: string; gain: number; tau: number; panned: boolean | undefined }[] = [];
  vi.spyOn(AmbienceZones.prototype, 'mix').mockImplementation((row, _sample, gain, tau) => { mixes.push({ id: row.id, gain, tau, panned: row.panned }); });
  vi.spyOn(AmbienceZones.prototype, 'silence').mockImplementation(() => undefined);
  const current = new SampledAmbience(audio, profile), listener = new Vector3(21, 4, -51);
  const pans: number[][] = [];
  const addPans = (zones: AmbienceZones): void => {
    for (const id of ['river', 'camp', 'meltwater']) zones.beds.set(id, { gain: {} as GainNode, pan: { pan: { setTargetAtTime: (...args: number[]) => { pans.push(args); } } } as StereoPannerNode,
      src: undefined, buf: undefined, level: 0, quiet: 0 });
  };
  addPans(current.zones);
  vi.spyOn(AmbienceZones.prototype, 'dispose').mockImplementation(() => undefined);
  const place = { zones: [1, 0, 0] as readonly [number, number, number], river: 0.7, melt: 0.3, camp: 0.4, night: 0.2, wind: 9, gust: 0.6, out: 1, pan: { river: -0.6, camp: 0.1, melt: 0.8 } };
  const sets = FROZEN.sets.values(), calls = new Map(FROZEN.calls.map(row => [row.frame, row.calls]));
  const frozenZones = FROZEN.zones.flatMap(([zone, count]) => Array.from({ length: Number(count) }, () => zone));
  for (let frame = 0; frame < 6000; frame++) {
    const region = Math.floor(frame / 600) % 3;
    const zones: readonly [number, number, number] = region === 0 ? [1, 0, 0] : region === 1 ? [0, 1, 0] : [0, 0, 1];
    const storm = Math.floor(frame / 900) % 2 === 0 ? 0 : 0.8;
    current.inputs['storm'] = storm; current.inputs['rain'] = storm;
    if (frame % 15 === 0) {
      place.zones = zones; place.out = frame > 4500 && frame < 4800 ? 0 : 1;
      const frozen = sets.next().value; if (frozen?.frame !== frame) throw new Error(`Missing frozen ambience set at ${String(frame)}`);
      const [valley, bowl, snow] = zones;
      current.set({ valley, bowl, snow, river: place.river, melt: place.melt, camp: place.camp, night: place.night, wind: place.wind, gust: place.gust, out: place.out,
        riverPan: place.pan.river, campPan: place.pan.camp, meltPan: place.pan.melt });
      current.mix();
      expect(mixes.splice(0)).toEqual(frozen.mixes);
      expect(current.diag).toEqual(frozen.diag);
      expect(pans.splice(0)).toEqual(frozen.pans);
    }
    current.advance(1 / 60, listener, 0.37);
    expect(audio.recordedCalls.splice(0)).toEqual(calls.get(frame) ?? []);
    expect(current.zone).toBe(frozenZones[frame]);
  }
  current.dispose();
});
it('retains the market/Well distance blend throughout and outside every authored rectangle', () => {
  const profile = requireAudioProfile(ND_AUDIO.zones, 'zones'), current = new SampledAmbience(new Audio(), profile);
  const rectangles = requireAudioProfile(profile.rectangles, 'rectangles');
  const distance = (row: (typeof rectangles)[number], x: number, z: number): number => Math.hypot(Math.max(row.x0 - x, 0, x - row.x1), Math.max(row.z0 - z, 0, z - row.z1));
  const well = requireAudioProfile(rectangles.find(row => row.id === 'well'), 'well');
  for (let x = -60; x <= 90; x += 3) for (let z = -260; z <= 60; z += 5) {
    current.set({ x, z });
    const expected = Math.min(1, Math.max(0, 0.5 + (Math.min(...rectangles.filter(row => row.zone === 'market').map(row => distance(row, x, z))) - distance(well, x, z)) / 6));
    expect(current.values.get('wellWeight')).toBe(expected);
  }
});
it('refuses missing mix inputs and invalid sample declarations', () => {
  const profile = requireAudioProfile(NALATI_AUDIO.zones, 'zones'), rows = requireAudioProfile(profile.sampleMix, 'mix');
  expect(() => parse(AudioSampleMixSchema, { ...rows, beds: Array.from({ length: 33 }, () => rows.beds[0]) })).toThrow();
  expect(() => parse(AudioSampleMixSchema, { ...rows, beds: [rows.beds[0], rows.beds[0]] })).toThrow();
  const current = new SampledAmbience(new Audio(), { ...profile, sampleMix: { ...rows, values: [['broken', 'absent']] } });
  expect(() => current.set({})).toThrow('absent');
});
it('continues the carried javelin count and exact gravity step through the frozen compatibility helper', () => {
  const item = items.rows.find(row => row.id === 'weapon.spear');
  const profile = parse(ThrownWeaponProfileSchema, item?.profile);
  const thrown = new Thrown({ ...profile, id: 'weapon.javelin' }), position = new Vector3(1, 2, 3), velocity = new Vector3(4, 5, 6);
  thrown.ammo = 1;
  expect(thrown.release()).toBe(true); expect(thrown.ammo).toBe(0); expect(thrown.release()).toBe(false);
  thrown.flightStep(position, velocity, 0.1);
  expect(velocity.y).toBe(5 - profile.gravity * 0.1);
  expect(position.toArray()).toEqual([1.4, 2 + velocity.y * 0.1, 3.6]);
});

it('keeps the Well chime clock gated and resets after the cue consumes its pan draw', () => {
  const random = app.rng.stream('cosmetic'), reference = new Rng(0); reference.restore(random.snapshot());
  const audio = new Recorder(), current = new SampledAmbience(audio, requireAudioProfile(ND_AUDIO.zones, 'zones'));
  let remaining = 8 + reference.next() * 12;
  const listener = new Vector3(-10, 125, -20), expected: { id: string; gain: number; pan: number }[] = [];
  for (let frame = 0; frame < 1000; frame++) {
    const inWell = frame % 180 < 130, worldOn = frame % 70 < 55;
    current.set({ x: inWell ? -10 : 70, z: inWell ? -20 : 40, worldOn: Number(worldOn) });
    if (inWell && worldOn) {
      remaining -= 0.27;
      if (remaining <= 0) { expected.push({ id: 'chime.gust', gain: 0.4, pan: reference.next() }); remaining = 8 + reference.next() * 12; }
    }
    current.advance(0.27, listener, 0);
    expect(audio.directed).toEqual(expected); expect(random.snapshot()).toEqual(reference.snapshot());
  }
});
