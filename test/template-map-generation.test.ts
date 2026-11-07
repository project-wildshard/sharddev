// oxlint-disable-next-line import/no-nodejs-modules -- Own a bounded map output tree and compare original immutable bytes.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Confine the synthetic output tree to repository scratch.
import { resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- Avoid dumping image data on an equality failure.
import { Buffer } from 'node:buffer';
import { expect, test } from 'vitest';
import { paintDataMap } from '../scripts/bake-data-maps.mjs';
import { mapTilesHash } from '../scripts/map-hash.mjs';
import { templateMapInputs } from '../src/shards/_template/generators/mapInputs';
import settings from '../src/shards/_template/data/map.json' with { type: 'json' };
import { builtProduct } from './fixtures/builtProduct';
import { loadHeadlessProduct } from '../src/sdk/headlessProduct';
import { outputDescriptor } from '../src/shared/game/shardfile/outputDescriptor';

test('the Template map uses producer bytes with no restored world metadata or assets', async () => {
  const product = await loadHeadlessProduct(builtProduct('_template'));
  const name = outputDescriptor(product.shardfile)?.index.files
    .find(file => file.hash === product.shardfile.map?.image)?.name;
  if (name === undefined) throw new Error('Template product does not declare its map image');
  const expected = Buffer.from(await product.file(name));
  const sources = templateMapInputs();
  mkdirSync('tmp', { recursive: true }); const root = mkdtempSync(resolve('tmp', 'template-map-'));
  try {
    const dir = resolve(root, 'src/shards/fixture'); mkdirSync(resolve(dir, 'data'), { recursive: true });
    writeFileSync(resolve(dir, 'source.txt'), 'authored source identity');
    writeFileSync(resolve(dir, 'data/map.json'), JSON.stringify({ ...settings, inputs: ['source.txt'] }));
    const result = await paintDataMap(root, 'fixture', { sources });
    const actual = readFileSync(resolve(root, 'public/assets/fixture/map/top.webp'));
    expect(Buffer.compare(actual, expected)).toBe(0);
    expect(result.stamp.tilesHash).toBe(mapTilesHash(dir));
    const before = result.stamp.tilesHash; writeFileSync(resolve(dir, 'source.txt'), 'changed authored source');
    expect(mapTilesHash(dir)).not.toBe(before);
    const missing = new Map(sources); missing.delete('world-terrain');
    await expect(paintDataMap(root, 'fixture', { sources: missing })).rejects.toThrow(/undeclared map input/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
