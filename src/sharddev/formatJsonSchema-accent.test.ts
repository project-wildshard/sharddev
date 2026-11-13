import { expect, test } from 'vitest';
import * as v from 'valibot';
import { ACCENT_IDS, AccentSchema, ROAD_ACCENT, type AccentId } from '@wildshard/format/accent';
import { formatJsonSchema } from './formatJsonSchema';

test('the concrete public accent pipeline retains its exact palette bridge', () => {
  expect(AccentSchema.pipe[2].type).toBe('custom');
  expect(formatJsonSchema(AccentSchema)).toMatchObject({ type: 'string', enum: [...ACCENT_IDS] });
  for (const id of ACCENT_IDS) expect(v.parse(AccentSchema, id)).toBe(id);
  for (const value of ['cyan', 'road', 'hud-cyan', ROAD_ACCENT, 'not-an-accent']) {
    expect(() => v.parse(AccentSchema, value)).toThrow();
  }
});

test('a different custom predicate receives no defining-palette bridge', () => {
  const other = v.custom<AccentId>(value => ACCENT_IDS.some(id => id === value));
  expect(() => formatJsonSchema(other)).toThrow();
});
