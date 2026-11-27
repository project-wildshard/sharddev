import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { postStackCost } from '@wildshard/format/postStack';
import { publishedSourceResidency } from '@wildshard/format/sourceResidency';
import { expect, test } from 'vitest';
import { emptyShardfile } from '../src/sharddev/author';
import { writeOutputProduct } from '../src/sharddev/outputProduct';
import { stampEngineFloor } from '../src/sharddev/engineFloor';

test('the SDK publishes the source residency and post cost in its validation receipt', () => {
  mkdirSync('tmp', { recursive: true });
  const directory = mkdtempSync(resolve('tmp/validation-claim-'));
  try {
    const source = emptyShardfile({ slug: 'published-residency', name: 'Published', author: 'Test', revision: 1, seed: 1 });
    source.look.post = [{ graph: { version: 1, kind: 'post', nodes: {}, stages: { post: { colour: [1, 1, 1] } } } }];
    writeOutputProduct(source, new Map(), directory);
    // The written product carries the SDK's engine floor (FP47b), so its residency counts that word.
    const written = structuredClone(source);
    stampEngineFloor(written);
    const receipt: unknown = JSON.parse(readFileSync(join(directory, 'validation.json'), 'utf8'));
    expect(receipt).toMatchObject({
      residentBytes: publishedSourceResidency(written),
      postCost: postStackCost(source, () => undefined).cost,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('the SDK writes the authored version in both the descriptor and raw cook', () => {
  mkdirSync('tmp', { recursive: true });
  const directory = mkdtempSync(resolve('tmp/versioned-cook-'));
  try {
    const source = emptyShardfile({ slug: 'versioned-zone', name: 'Versioned', author: 'Test', revision: 1, seed: 1 });
    writeOutputProduct(source, new Map(), directory, { shardVersion: '0.0.13', cook: { mounts: [] } });
    const header: unknown = JSON.parse(readFileSync(join(directory, 'shard.json'), 'utf8'));
    const cook: unknown = JSON.parse(readFileSync(join(directory, 'cook.json'), 'utf8'));
    expect(header).toMatchObject({ shardVersion: '0.0.13' });
    expect(cook).toMatchObject({ shardVersion: '0.0.13', version: 1 });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
