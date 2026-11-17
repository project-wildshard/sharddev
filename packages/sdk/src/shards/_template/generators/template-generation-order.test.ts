// oxlint-disable-next-line import/no-nodejs-modules -- Verify retirement of the obsolete report-only generation job.
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import entry, { generate } from '../shard.config';

test('Template has one executable product entry and no obsolete product report job', () => {
  expect(entry).toBe(generate);
  const declaration = readFileSync('src/shards/_template/generators/product.ts', 'utf8');
  expect(declaration).not.toMatch(/from ['"]\.\.\/data\/(?:terrain|props)\.json/u);
});
