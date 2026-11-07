import { expect, test } from 'vitest';
import { LightEmitters } from '@wildshard/engine/fx/lightEmitters';
import { bakeLightSources, type AuthoredLightEmitter } from './lightSources';

const rows = (): AuthoredLightEmitter[] => [
  { id: 'warm', at: [1, -2, 3], colour: [0.18, 1.4, 0], gain: 2.5, radius: 4, cut: 3, initially: true },
  { id: 'off', at: [-0, 0, 8], colour: [0, 0.5, 1], gain: 9, radius: 0.1, cut: 1, initially: false },
];

test('static bake lights match the complete initial runtime pool without sharing input storage', () => {
  const originalRows = rows().map(row => Object.assign(row, { initially: row.initially ?? true }));
  const input = rows(), actual = bakeLightSources(input), original = new LightEmitters(originalRows).volume();
  expect(actual).toEqual(original);
  actual[0]?.at.set(100, 100, 100);
  actual[0]?.color.setRGB(0, 0, 0);
  expect(input).toEqual(rows());
  const on = rows()[0];
  if (on === undefined) throw new Error('Missing light fixture');
  delete on.initially;
  expect(bakeLightSources([on])[0]?.k).toBe(on.gain);
});

test('static bake lights keep the original bound, identity and numeric refusals', () => {
  const first = rows()[0];
  if (first === undefined) throw new Error('Missing light fixture');
  expect(() => bakeLightSources([first, first])).toThrow('Unique emitter ids');
  expect(() => bakeLightSources(Array.from({ length: 16385 }, (_, index) => ({ ...first, id: `light.${index}` })))).toThrow();
  for (const changes of [{ gain: -1 }, { gain: Number.NaN }, { radius: 0 }, { cut: 0 }, { radius: Infinity }]) {
    expect(() => bakeLightSources([{ ...first, ...changes }])).toThrow();
  }
});
