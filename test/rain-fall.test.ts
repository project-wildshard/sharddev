import { describe, expect, it } from 'vitest';
import { installChannelPrograms } from '../src/shared/game/plugin/channelPrograms';
import { graphParamRoots } from '../src/client/game/looks/graphDaySky';
import pineWeatherRows from '../src/shards/pine-hollow/data/weatherLook.json' with { type: 'json' };
import { pineRainChannels } from '../src/shards/pine-hollow/generators/rainChannels';
import { Object3D, BufferGeometryLoader, Vector3 } from 'three';
import { weatherFxChannels } from '../src/shards/nalati-grasslands/generators/weatherFxChannels';
import { weatherPresentation } from '../src/shards/nalati-grasslands/generators/weatherPresentation';
import { skyRows } from '../src/shards/nalati-grasslands/generators/skyPresentation';
import { dayLookPresets } from '../src/shared/game/looks/dayLookPresets';

const { PINE_RAIN_PROGRAMS } = pineWeatherRows;

const { rain, splash, lens, channels } = PINE_RAIN_PROGRAMS;
function rig() {
  const rows = pineRainChannels(), seen = { on: 1, rain: 0.5, dry: 0, cover: 0, lookY: 0.5, room: 0, radius: 11, slots: 14, windX: 10, windZ: -10 };
  const params = graphParamRoots(rows, channels, [rain, splash, lens]), set: Record<string, unknown> = {};
  const lane = installChannelPrograms(rows, channels, new Map<string, unknown>([['rain', seen], ...params.roots]));
  const step = (dt: number): void => { lane.evaluate({ time: 0, delta: dt, values: {} }); params.push({ setParam: (id, name, value) => { set[`${id}.${name}`] = Array.isArray(value) ? [...value] : value; } }); };
  return { seen, set, step };
}

describe('pine.rain channels', () => {
  it('slants the fall by the wind and wraps the offset into the box round the eye', () => {
    const { set, step } = rig();
    step(1);
    expect(set[`${rain}.velocity`]).toEqual([3, -9.5, -3]);
    const offset = set[`${rain}.offset`];
    if (!Array.isArray(offset)) throw new Error('no offset');
    expect(offset[0]).toBeCloseTo(3); expect(offset[1]).toBeCloseTo(22 - 9.5); expect(offset[2]).toBeCloseTo(22 - 3);
    expect(set[`${rain}.length`]).toBeCloseTo(0.55); expect(set[`${rain}.alpha`]).toBeCloseTo(0.26);
  });
  it('runs the lens clock three times as fast under a roof, dries the lens there and stops in a practice room', () => {
    const { seen, set, step } = rig();
    step(0.5);
    const wet = 0.5 * (6.8 / 14) * 0.2; // exposure × slot share × min(1, dt / 2.5); facing up the look is fully open
    expect(set[`${lens}.wet`]).toBeCloseTo(wet); expect(set[`${lens}.clock`]).toBeCloseTo(0.5); expect(set[`${splash}.time`]).toBeCloseTo(0.5);
    seen.dry = 1; step(0.5);
    expect(set[`${lens}.clock`]).toBeCloseTo(2); expect(set[`${lens}.wet`]).toBeCloseTo(wet * 0.8);
    seen.room = 1; step(0.5);
    expect(set[`${lens}.clock`]).toBeCloseTo(2); expect(set[`${lens}.wet`]).toBe(0); expect(set[`${splash}.time`]).toBeCloseTo(1);
  });
});

describe('Nalati weather presentation rows', () => {
  function setup() {
    const rows = weatherFxChannels(), ids = ['nalati-storm-deck', 'nalati-storm-curtains', 'nalati-lightning-bolt', 'nalati-strike-smoke', 'nalati-puddles'];
    const params = graphParamRoots(rows, 'nalati.fx', ids), set: Record<string, unknown> = {};
    const flags = { deck: 0, curtains: 0, rain: 0, bolt: 0, glow: 0, smoke: 0, fire: 0, puddles: 0 };
    const weather = { front: 0, stormFrom: 1, rainbow: 0, overcast: 0, rain: 0, flash: 0, wet: 0 };
    const rainU = { uVelx: 0, uVely: 0, uVelz: 0, uLen: 0, uAlpha: 0, uColx: 0, uColy: 0, uColz: 0 }, draw = { count: 0 };
    const sky = skyRows(), look = { ...dayLookPresets(sky.schema).live(sky.initial), sunDir: new Vector3(0, 1, 0), keyDir: new Vector3(0, 1, 0) }, camera = { x: 10, y: 20, z: -30 }, wind = { x: 10, z: -20 };
    const strike = { x: 1, y: 2, z: 3, kind: 1, age: 1e6 }, telegraph = { x: 1, y: 2, z: 3, kind: 1, age: 1e6 }, burn = { x: 1, y: 2, z: 3, age: 1e6 }, flash = { distance: 0, bearing: 0, age: 1e6 };
    const owners = new Map<string, unknown>([...params.roots, ['strike', strike], ['telegraph', telegraph], ['burn', burn], ['flash', flash], ['flags', flags], ['weather', weather], ['look', look], ['camera', camera], ['wind', wind], ['rainU', rainU], ['draw', draw], ['glowMaterial', { opacity: 0 }], ['fireMaterial', { opacity: 0 }],
      ...['deck', 'curtains', 'glow', 'fire'].map(id => [id, new Object3D()] as const)]);
    const lane = installChannelPrograms(rows, 'nalati.fx', owners);
    const defaultValues = { active: 0, count: 3500 };
    const step = (values = defaultValues): void => {
      lane.evaluate({ time: 0, delta: 1 / 30, values });
      params.push({ setParam: (id, name, value) => { set[`${id}.${name}`] = Array.isArray(value) ? [...value] : value; } });
    };
    return { flags, weather, rainU, draw, set, step, strike, telegraph, burn };
  }
  it('hides dry weather and exposes rain, wet ground and the storm front together', () => {
    const { flags, weather, rainU, draw, set, step } = setup();
    step(); expect(Object.values(flags)).toEqual(Array.from({ length: 8 }, () => 0));
    Object.assign(weather, { front: .8, rain: .6, overcast: .9, wet: .8 }); step();
    expect(flags).toMatchObject({ deck: 1, curtains: 1, rain: 1, puddles: 1, bolt: 0, glow: 0 });
    expect(rainU).toMatchObject({ uVelx: 3.5, uVely: -9.5, uVelz: -7 });
    expect(draw.count).toBeCloseTo(3500 * .66);
    expect(set['nalati-puddles.puddle']).toEqual([.8, .6]);
  });
  it('expires telegraphs and bolts while preserving a struck tree smoke tail', () => {
    const { flags, set, step, strike, telegraph, burn } = setup();
    Object.assign(strike, { age: .02 }); Object.assign(telegraph, { age: .01 }); Object.assign(burn, { age: 0 }); step({ active: 1, count: 3500 });
    expect(flags).toMatchObject({ bolt: 1, glow: 1, smoke: 1, fire: 1 });
    expect(set['nalati-lightning-bolt.alpha']).toBe(1);
    Object.assign(strike, { age: 1 }); Object.assign(telegraph, { age: 2 }); Object.assign(burn, { age: 355 }); step({ active: 0, count: 3500 });
    expect(set['nalati-strike-smoke.origin']).toEqual([1, 0, 3]); expect(set['nalati-lightning-bolt.origin']).toEqual([1, 2, 3]);
    expect(flags).toMatchObject({ bolt: 0, glow: 0, smoke: 1, fire: 0 });
    expect(set['nalati-strike-smoke.smoke']).toEqual([1 / 6, 2, -4]);
  });
  it('bakes finite indexed bolt geometry and ground-fitted puddle matrices', () => {
    const rows = weatherPresentation(0x4a1a, () => 7);
    expect(rows.puddles.length / 16).toBeGreaterThan(0);
    expect(rows.puddles.length / 16).toBeLessThanOrEqual(110);
    for (let offset = 13; offset < rows.puddles.length; offset += 16) expect(rows.puddles[offset]).toBeCloseTo(7.03);
    expect(rows.shapes['bolt']?.data?.index?.array.length).toBeGreaterThan(64 * 6);
    const loader = new BufferGeometryLoader();
    for (const shape of Object.values(rows.shapes)) expect(loader.parse(shape).getAttribute('position').count).toBeGreaterThan(0);
    expect(rows).toEqual(weatherPresentation(0x4a1a, () => 7));
    expect(rows.noise).toHaveLength(128 * 128 * 4);
    expect(rows.glow[3]).toBe(0);
    expect(rows.glow[(64 * 128 + 64) * 4 + 3]).toBe(255);
  });
});
