import { expect, test } from 'vitest';
import { emptyShardfile } from './author';
import { HeadlessSimulation } from '@wildshard/engine/host/headless';

test('the public worker never reads a caller-selected module option', async () => {
  const shard = emptyShardfile({ slug: 'data-only-proof', name: 'Data only', author: 'Fixture', revision: 1, seed: 17 });
  let reads = 0;
  const options = { deadline: 'advisory' as const, get trustedRuntime(): never {
    reads++; throw new Error('Public API must not read caller code');
  } };
  const worker = await HeadlessSimulation.create(shard, new Map(), undefined, options);
  try {
    expect((await worker.step()).tick).toBe(1);
    expect(reads).toBe(0);
  } finally { await worker.dispose(); }
});
