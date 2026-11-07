import * as v from 'valibot';
import { expect, test } from 'vitest';
import { registeredJsonContract, validateRegisteredJson } from '@wildshard/format/registeredJson';
import { platformFileFamily, validatePlatformFile } from '@wildshard/format/platformFileFamilies';
import { registeredJsonSchema, formatJsonSchema } from '../src/sharddev/formatJsonSchema';
import { nameBlob } from '../src/sharddev/blobs';
import { encodeCanonicalJson } from '../src/sdk/immutable';
import { postGraphIdentityTransforms } from '@wildshard/format/postGraphLook';
import { postChainRows } from '../src/shards/nalati-grasslands/generators/postChain';
import pine from '../src/shards/pine-hollow/data/weather.json' with { type: 'json' };
import steppe from '../src/shards/nalati-grasslands/data/weather.json' with { type: 'json' };
import audio from '../src/shards/nalati-grasslands/data/audioScene.json' with { type: 'json' };
import { weatherRaw } from './fixtures/weatherInlineWitness';

const bytes = (value: unknown): Uint8Array => new TextEncoder().encode(encodeCanonicalJson(value));

test.each([pine, { weather: steppe, reactions: weatherRaw }])('both complete native weather documents qualify without a payload rewrite (%#)', value => {
  const name = 'world/weather.json', contract = registeredJsonContract(name), before = bytes(value);
  const blob = nameBlob(name, 'json', before, { jsonSchema: registeredJsonSchema(name) });
  expect(blob.bytes).toEqual(before);
  expect(validatePlatformFile(name, contract.source, value)?.source).toBe(contract.source);
  expect(bytes(value)).toEqual(before);
  expect(platformFileFamily(name, '@wildshard/format/forestWeather#ForestWeatherSchema')).toBeUndefined();
});

test.each([
  ['audio/scene.json', audio], ['look/post.json', postChainRows().postGraph],
] as const)('the complete %s document retains native admission and exact bytes', (name, value) => {
  const contract = registeredJsonContract(name), before = bytes(value);
  expect(nameBlob(name, 'json', before, { jsonSchema: registeredJsonSchema(name) }).bytes).toEqual(before);
  expect(validatePlatformFile(name, contract.source, value)?.source).toBe(contract.source);
  expect(bytes(value)).toEqual(before);
});

test('G1004 approves only the three exact complete weather families', () => {
  for (const name of ['world/weather-fx.json', 'world/rain.json', 'world/weather-observations.json'] as const) {
    const contract = registeredJsonContract(name);
    expect(registeredJsonSchema(name)).toHaveProperty('$comment', contract.source);
    expect(platformFileFamily(name, contract.source)?.schema).toBe(contract.schema);
    expect(() => validatePlatformFile(name, contract.source, {})).toThrow();
    expect(platformFileFamily(name, undefined)).toBeUndefined();
    expect(platformFileFamily(name.replace('.json', '-private.json'), contract.source)).toBeUndefined();
    expect(platformFileFamily(name, registeredJsonContract('world/weather.json').source)).toBeUndefined();
  }
});

test('weather wires share the complete phase definition without weakening either branch', () => {
  const document = registeredJsonSchema('world/weather.json');
  expect(document).toHaveProperty('definitions.weatherProgram');
  expect(document).toHaveProperty('anyOf.0.$ref', '#/definitions/weatherProgram');
  expect(document).toHaveProperty('anyOf.1.properties.weather.$ref', '#/definitions/weatherProgram');
  for (const value of [{ ...pine, states: 'invalid' }, { weather: { ...steppe, states: 'invalid' }, reactions: weatherRaw }]) {
    expect(() => nameBlob('world/weather.json', 'json', bytes(value), { jsonSchema: document })).toThrow();
  }
});

test('complete post admission refuses malformed graph data even when its native header is present', () => {
  const original = postChainRows().postGraph;
  const passEntry = Object.entries(original.passes)[0];
  if (passEntry === undefined) throw new Error('Missing real post pass');
  const [passName, pass] = passEntry, programEntry = Object.entries(pass.programs)[0];
  if (programEntry === undefined) throw new Error('Missing real post program');
  const [programName, program] = programEntry;
  const malformed = { ...original, passes: { ...original.passes, [passName]: {
    ...pass, programs: { ...pass.programs, [programName]: { ...program, graph: { ...program.graph, kind: 'material' } } },
  } } };
  expect(() => validateRegisteredJson('look/post.json', malformed)).toThrow('Invalid scaled post graph');
  expect(() => nameBlob('look/post.json', 'json', bytes(malformed), { jsonSchema: registeredJsonSchema('look/post.json') })).toThrow();
  expect(() => validateRegisteredJson('look/post.json', { ...original, composite: { ...original.composite, pass: 'absent' } })).toThrow('no pass');
});

test('only the four original readonly transforms bypass structural conversion errors', () => {
  expect(postGraphIdentityTransforms).toHaveLength(4);
  for (const action of postGraphIdentityTransforms) {
    const operation: unknown = Reflect.get(action, 'operation');
    if (typeof operation !== 'function') throw new Error('Missing original readonly transform');
    const input = [[1, 2, 3, 4]];
    expect(Reflect.apply(operation, undefined, [input])).toBe(input);
  }
  expect(() => formatJsonSchema(v.pipe(v.number(), v.transform(value => value)))).toThrow();
  expect(() => formatJsonSchema(v.custom(() => true))).toThrow();
});
