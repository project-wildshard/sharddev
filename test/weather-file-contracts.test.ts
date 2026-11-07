import { expect, test } from 'vitest';
import { BufferGeometryLoader } from 'three';
import { parseWeatherDocument } from '@wildshard/format/weatherBundle';
import { parseWeatherEffects } from '@wildshard/format/weatherEffects';
import { nativeWeatherBundle } from '../src/server/game/weather/reactions';
import { encodeCanonicalJson } from '../src/sdk/immutable';
import pine from '../src/shards/pine-hollow/data/weather.json' with { type: 'json' };
import steppe from '../src/shards/nalati-grasslands/data/weather.json' with { type: 'json' };
import { weatherWitness } from './fixtures/weatherInlineWitness';
import { weatherPresentation } from '../src/shards/nalati-grasslands/generators/weatherPresentation';
import { skyRows } from '../src/shards/nalati-grasslands/generators/skyPresentation';

test('phase and reaction documents retain native weather admission and the complete authored body', () => {
  const input = { weather: steppe, reactions: weatherWitness };
  const original = encodeCanonicalJson(input);
  expect(parseWeatherDocument(input)).toEqual(nativeWeatherBundle(input));
  expect(encodeCanonicalJson(input)).toBe(original);
  expect(parseWeatherDocument(pine)).toHaveProperty('page', pine.page);
  expect(() => parseWeatherDocument({ ...input, ignored: true })).toThrow();
  expect(() => parseWeatherDocument({ ...input, reactions: { ...weatherWitness, flash: 'absentRegister' } })).toThrow('Invalid weather reaction references');
  expect(() => parseWeatherDocument({ ...input, reactions: { ...weatherWitness, script: {} } })).toThrow();
  expect(() => parseWeatherDocument({ ...pine, outputs: { ...pine.outputs, wet: 'unknownNumericInput' } })).toThrow('Invalid weather numeric references');
});

test('complete native weather resources retain every geometry, sky and table byte', () => {
  const input = { ...weatherPresentation(357, () => 0), sky: skyRows() };
  const original = encodeCanonicalJson(input);
  const parsed = parseWeatherEffects(input);
  expect(encodeCanonicalJson(parsed)).toBe(original);
  expect(Object.keys(parsed.shapes)).toEqual(Object.keys(input.shapes));
  for (const [name, shape] of Object.entries(parsed.shapes)) {
    const originalShape = input.shapes[name];
    if (originalShape === undefined) throw new Error('Missing original native shape');
    const before = new BufferGeometryLoader().parse(originalShape);
    const after = new BufferGeometryLoader().parse(shape);
    try {
      const originalPosition = before.attributes['position'], parsedPosition = after.attributes['position'];
      if (originalPosition === undefined || parsedPosition === undefined) throw new Error('Missing admitted native position');
      expect([...parsedPosition.array]).toEqual([...originalPosition.array]);
      expect(after.index?.array).toEqual(before.index?.array);
      expect(after.groups).toEqual(before.groups);
    } finally { before.dispose(); after.dispose(); }
  }
});

test('weather resources refuse incomplete geometry, invalid storage and undeclared sky values', () => {
  const input = { ...weatherPresentation(357, () => 0), sky: skyRows() };
  const deck = input.shapes['deck'];
  if (deck === undefined || deck.data === undefined) throw new Error('Missing native deck');
  expect(() => parseWeatherEffects({ ...input, shapes: { ...input.shapes, deck: { ...deck, data: { ...deck.data, attributes: {} } } } })).toThrow();
  expect(() => parseWeatherEffects({ ...input, shapes: { ...input.shapes, deck: { ...deck, data: { ...deck.data, index: { type: 'Uint16Array', array: [999999] } } } } })).toThrow();
  expect(() => parseWeatherEffects({ ...input, noise: [Number.NaN] })).toThrow();
  expect(() => parseWeatherEffects({ ...input, sky: { ...input.sky, initial: {} } })).toThrow();
  expect(() => parseWeatherEffects({ ...input, factory: () => input })).toThrow();
});
