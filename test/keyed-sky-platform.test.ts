import { gunzipSync } from 'fflate';
import oracle from './fixtures/keyed-sky-half-oracle.json';
import { encodeGainKey, packGainKey } from '../src/sharddev/bake/keyedSky';
import { encodeGainKey as nativeEncodeGainKey, packGainKey as nativePackGainKey } from '../scripts/bake/keyed-sky.mjs';
import { describe, expect, it } from 'vitest';
import { DayCycle } from '../src/shared/engine/world/dayCycle';
import { parseKeyedSky, SKY_PRESET } from '@wildshard/format/keyedSky';
import { dayClock } from '../src/shared/game/looks/dayClock';
import { keyedSkyDay } from '../src/shared/game/looks/keyedSkyClock';
import { overcastOver } from '../src/client/game/looks/overcast';
import sky from '../src/shards/pine-hollow/data/sky.json';

// A second author chooses different images, timing, curves and storm responses.
const second = {
  ...sky, cycleMinutes: 7, start: 0.4, moonKey: 'lunar',
  keys: { blue: { id: 'invented-blue', sunU: 0.2, sunEl: 30, paint: 0 }, lunar: { id: 'invented-moon', sunU: 0.8, sunEl: 50, paint: 0 } },
  presets: { bright: { ...sky.presets.day, key: 'blue', lightI: 9, lamps: 0.25 }, dark: { ...sky.presets.night, key: 'lunar', lightI: 0.2 } },
  frames: [[0, 'bright'], [0.5, 'dark'], [1, 'bright']],
  response: { ...sky.response, moonDisc: 0.4, overcastLamps: 0.8, domeDim: 0.7 },
  overcast: [{ op: 'scale', key: 'lightI', by: -0.8 }, { op: 'atLeast', key: 'lamps', by: 0.9 }],
};

describe('weather reactions + keyed sky rows', () => {
  it('accepts an independently authored sky without a callback or shard branch', () => {
    const day = keyedSkyDay(second), clock = new DayCycle(day.spec);
    clock.phase = 0; const first = day.presets['bright'];
    if (first === undefined) throw new Error('Missing fixture preset');
    const out = day.clone(first); clock.key(out);
    expect(out.key).toBe('blue'); expect(out.lightI).toBe(9);
    expect(day.spec.curves.lamps(0)).toBe(0.25);
    overcastOver(out, day.style.overcast, 0.5);
    expect(out.lightI).toBeCloseTo(5.4); expect(out.lamps).toBe(0.45);
    clock.phase = 0.5; clock.key(out);
    expect(out.key).toBe('lunar'); expect(out.lightI).toBe(0.2);
    expect(day.style.response.overcastLamps).toBe(0.8);
  });
  it('keeps exact day state after a checkpoint and a clock jump', () => {
    const day = keyedSkyDay(sky), live = new DayCycle(day.spec), restored = new DayCycle(day.spec);
    live.cycle = sky.cycleMinutes * 60;
    live.phase = 0.92;
    for (let i = 0; i < 240; i++) live.update(0.5);
    restored.restore(live.snapshot());
    for (let i = 0; i < 240; i++) { live.update(0.5); restored.update(0.5); expect(restored.snapshot()).toEqual(live.snapshot()); }
  });
  it('refuses callbacks, malformed keyframes and incomplete packed keys at admission', () => {
    const row = parseKeyedSky(second);
    expect(() => { Reflect.apply(dayClock, undefined, [SKY_PRESET, { ...row, callback: () => 1 }]); }).toThrow();
    expect(() => { Reflect.apply(dayClock, undefined, [SKY_PRESET, row, { lamps: () => 1 }]); }).toThrow();
    expect(() => { Reflect.apply(dayClock, undefined, [SKY_PRESET, row, { lamps: 'key' }]); }).toThrow();
    expect(() => parseKeyedSky({ ...second, onWeather: () => 1 })).toThrow();
    let called = false; const accessor = { ...second };
    Object.defineProperty(accessor, 'cycleMinutes', { enumerable: true, get: () => { called = true; return 7; } });
    expect(() => parseKeyedSky(accessor)).toThrow(); expect(called).toBe(false);
    expect(() => parseKeyedSky({ ...second, frames: [[0, 'missing'], [1, 'bright']] })).toThrow();
    expect(() => parseKeyedSky({ ...second, frames: [[0.5, 'bright'], [0, 'dark']] })).toThrow();
    expect(() => parseKeyedSky({ ...second, packedKeys: {} })).toThrow();
    expect(() => parseKeyedSky({ ...second, cycleMinutes: Infinity })).toThrow();
  });
});

// The old upload passes RGB half floats to RGB9_E5; retain those exact bits.
it('retains the shipped gzip bytes independently of the producer OS', () => {
  const data = new Uint16Array([15360, 15360, 15360]);
  const bytes = encodeGainKey(data);
  expect(Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')).toBe('1f8b080000000000021363b06100420057940dd706000000');
  expect(gunzipSync(bytes)).toEqual(new Uint8Array(data.buffer));
});

it('packs RGB half texels offline and retains the unrounded horizon', () => {
  const packed = packGainKey(new Uint8Array([255, 255, 255, 255]), new Uint8Array([0, 0, 0, 255]), 1, 1);
  expect(packed.horizon).toEqual([1, 1, 1]); expect([...packed.data]).toEqual([15360, 15360, 15360]);
  expect(() => packGainKey(new Uint8Array(4), new Uint8Array(3), 1, 1)).toThrow();
});

it('matches the original worker bits across every gain and colour byte', async () => {
  const color = new Uint8Array(oracle.texels * 4), gain = new Uint8Array(color.length);
  for (let i = 0; i < oracle.texels; i++) {
    const c = i % 256, g = i >>> 8; color.set([c, c * 3 % 256, 255 - c, 255], i * 4); gain.set([g, g, g, 255], i * 4);
  }
  const result = packGainKey(color, gain, oracle.width, oracle.height);
  const native = nativePackGainKey(color, gain, oracle.width, oracle.height);
  expect(Buffer.compare(new Uint8Array(result.data.buffer), new Uint8Array(native.data.buffer))).toBe(0);
  expect(result.horizon).toEqual(native.horizon);
  expect(Buffer.compare(encodeGainKey(result.data), nativeEncodeGainKey(native.data))).toBe(0);
  const digest = await crypto.subtle.digest('SHA-256', result.data.slice().buffer);
  expect(Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')).toBe(oracle.sha256);
});

it('encodes only the selected native half-float view', () => {
  const storage = new Uint16Array([123, 15360, 16384, 17408, 456]), view = storage.subarray(1, 4);
  const bytes = encodeGainKey(view);
  expect(Buffer.compare(bytes, nativeEncodeGainKey(view))).toBe(0);
  expect(Buffer.compare(gunzipSync(bytes), new Uint8Array(view.buffer, view.byteOffset, view.byteLength))).toBe(0);
});
