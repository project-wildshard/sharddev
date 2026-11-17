import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { postStackCost } from '@wildshard/format/postStack';
import { publishedSourceResidency } from '@wildshard/format/sourceResidency';
import { expect, test } from 'vitest';
import { emptyShardfile } from '../src/sharddev/author';
import { writeOutputProduct } from '../src/sharddev/outputProduct';

test('the SDK publishes the source residency and post cost in its validation receipt', () => {
  mkdirSync('tmp', { recursive: true });
  const directory = mkdtempSync(resolve('tmp/validation-claim-'));
  try {
    const source = emptyShardfile({ slug: 'published-residency', name: 'Published', author: 'Test', revision: 1, seed: 1 });
    source.look.post = [{ graph: { version: 1, kind: 'post', nodes: {}, stages: { post: { colour: [1, 1, 1] } } } }];
    writeOutputProduct(source, new Map(), directory);
    const receipt: unknown = JSON.parse(readFileSync(join(directory, 'validation.json'), 'utf8'));
    expect(receipt).toMatchObject({
      residentBytes: publishedSourceResidency(source),
      postCost: postStackCost(source, () => undefined).cost,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
