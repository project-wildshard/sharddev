import { expect, test } from 'vitest';
// oxlint-disable-next-line import/no-nodejs-modules -- The test owns a generated product folder.
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve only files in the test's owned generated product.
import { resolve } from 'node:path';
import { engineFloorRefusal } from '@wildshard/format/engine-floor';
import { emptyShardfile } from '../src/sharddev/author';
import { ENGINE_FLOOR } from '../src/sharddev/engineFloor';
import { validateOutputProduct, writeOutputProduct } from '../src/sharddev/outputProduct';

// FORMAT-PRUNE FP47b (J505): a 0.4.31-built product names engine 0.1.84, and a v0.1.83 grid refuses it.
test('a written product names the SDK engine floor, and a v0.1.83 grid refuses it', () => {
  mkdirSync('tmp', { recursive: true }); const folder = mkdtempSync(resolve('tmp/engine-floor-'));
  try {
    const index = writeOutputProduct(emptyShardfile({ slug: 'floor', name: 'Floor', author: 'Test', revision: 1, seed: 1 }), new Map(), folder);
    expect(ENGINE_FLOOR).toBe('0.1.84');
    expect(index.requires.engine).toBe(ENGINE_FLOOR);
    expect(validateOutputProduct(folder).index.requires.engine).toBe(ENGINE_FLOOR);
    expect(engineFloorRefusal(index.requires.engine, '0.1.83')).toContain('needs engine 0.1.84 or newer');
    expect(engineFloorRefusal(index.requires.engine, '0.1.84')).toBeUndefined();
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test('the SDK previews on an engine at or above its floor', () => {
  const dev = (JSON.parse(readFileSync(new URL('../../dev/package.json', import.meta.url), 'utf8')) as { dependencies: Record<string, string> }).dependencies['@wildshard/engine'] ?? '';
  expect(engineFloorRefusal(ENGINE_FLOOR, dev)).toBeUndefined();
});
