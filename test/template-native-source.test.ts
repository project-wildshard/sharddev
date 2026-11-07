// oxlint-disable-next-line import/no-nodejs-modules -- Count real remaining reads without substituting any fixture bytes.
import fs from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Compare only the admitted immutable file names.
import { basename } from 'node:path';
import { expect, test, vi } from 'vitest';
import { TEMPLATE_SOURCE, TEMPLATE_BEHAVIOUR, templateAssets } from './fixtures/templateSource';
import { templateTerrain } from '../src/shards/_template/generators/terrain';
import { templatePropRows } from '../src/shards/_template/generators/props';
import { hashImmutableBytes } from '../src/sdk/immutable';
import { nativeProof } from './proof/_template/native';

test('native fixtures generate world bytes without reading restored terrain/props assets and keep independent ownership', () => {
  const terrain = templateTerrain(), props = templatePropRows(), generated = new Set([...terrain.assets.keys(), ...props.assets.keys(), ...Object.values(TEMPLATE_BEHAVIOUR).map(row => row.hash)]), read = vi.spyOn(fs, 'readFileSync'), first = templateAssets();
  expect(first.size).toBe(TEMPLATE_SOURCE.files.length);
  const filenames = read.mock.calls.map(([path]) => basename(String(path)));
  expect(filenames.filter(file => generated.has(file))).toEqual([]);
  expect(filenames).toHaveLength(TEMPLATE_SOURCE.files.length - generated.size);
  for (const [hash, bytes] of first) expect(hashImmutableBytes(bytes)).toBe(hash);
  const entry = terrain.assets.entries().next().value;
  if (entry === undefined) throw new Error('Missing original terrain fixture');
  const [hash, original] = entry;
  first.get(hash)?.fill(0);
  expect(templateAssets().get(hash)).toEqual(original);
});

for (const mode of ['boot', 'headless', 'replay', 'ledger', 'director'] as const) test(`template producer retains the frozen native ${mode} proof`, () => {
  expect(nativeProof(mode)).toContain(`"${mode}":`);
});
