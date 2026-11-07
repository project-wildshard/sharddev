// oxlint-disable-next-line import/no-nodejs-modules -- Read the tracked original authored bow file in this Node fixture.
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parse } from 'valibot';
import { BowWeaponProfileSchema, HeldBowFileSchema } from '@wildshard/format/weaponProfiles';
import { parseBowProfile, parseHeldBowFile, sharedBowAuthorBase } from './bowProfile';
import { BOW } from '@wildshard/engine/game/weapons/starterBowProfile';

test('shared author bow base retains every native field and independent storage without a wind owner', () => {
  const { wind, ...native } = BOW;
  const first = sharedBowAuthorBase(), second = sharedBowAuthorBase();
  expect(wind).toBeDefined();
  expect(first).toEqual(native);
  expect(JSON.stringify(first)).toBe(JSON.stringify(native));
  expect(first).not.toBe(second);
  Reflect.set(first, 'quiver', 99);
  expect(second).toEqual(native);
  expect(sharedBowAuthorBase()).toEqual(native);
  expect(Object.hasOwn(second, 'wind')).toBe(false);
});

const original: unknown = JSON.parse(readFileSync('public/assets/nalati/baked/recurve-pool.json', 'utf8'));

test('author bow admission preserves the complete original file', () => {
  expect(parseHeldBowFile(original)).toEqual(parse(HeldBowFileSchema, original));
});

test('author bow admission keeps strict missing and unknown field refusals', () => {
  const admitted = parseHeldBowFile(original);
  expect(() => parseHeldBowFile({ ...admitted, extra: true })).toThrow();
  const { pool, ...missing } = admitted;
  expect(pool).toBeDefined();
  expect(() => parseHeldBowFile(missing)).toThrow();
});

test('author numeric bow policy retains complete tracked rows and strict refusals', () => {
  const input: unknown = JSON.parse(readFileSync('src/shards/pine-hollow/data/bowProfile.json', 'utf8'));
  const actual = parseBowProfile(input);
  expect(actual).toEqual(parse(BowWeaponProfileSchema, input));
  for (const invalid of [{ ...actual, quiver: Number.NaN }, { ...actual, callback: () => undefined },
    { ...actual, flight: { ...actual.flight, gravity: Number.POSITIVE_INFINITY } }]) {
    expect(() => parseBowProfile(invalid)).toThrow();
    expect(() => parse(BowWeaponProfileSchema, invalid)).toThrow();
  }
});
