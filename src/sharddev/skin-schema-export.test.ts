import { expect, test } from 'vitest';
import * as v from 'valibot';
import { SkinPoseLayerSchema } from '@wildshard/format/skinLayers';
import { formatJsonSchema, formatJsonSchemas } from './formatJsonSchema';

test('one-pass skin tables export the original bounded numeric array grammar', () => {
  for (const target of ['draft-07', 'draft-2020-12'] as const) {
    const schema = formatJsonSchema(SkinPoseLayerSchema, target);
    expect(schema).toMatchObject({ type: 'object', additionalProperties: false, properties: {
      times: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 4097 },
      tracks: { type: 'array', maxItems: 128, items: { additionalProperties: false, properties: {
        values: { type: 'array', items: { type: 'number' }, maxItems: 300000 },
      } } },
    } });
  }
  // Run the generation entrypoint too: skin bindings embed these same tables.
  const documents = formatJsonSchemas();
  expect(documents['skinLayers.SkinPoseLayer']).toBeDefined();
  expect(documents['skinData.SkinBinding']).toBeDefined();
});

test('an unrelated raw transform is still refused by the strict exporter', () => {
  const foreign = v.pipe(v.unknown(), v.rawTransform(({ dataset }) => dataset.value));
  expect(() => formatJsonSchema(foreign)).toThrow('raw_transform');
});
