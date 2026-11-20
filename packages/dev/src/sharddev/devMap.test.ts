// oxlint-disable-next-line import/no-nodejs-modules -- A disposable author product and its map files.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- The same root and shard paths the dev server serves.
import { resolve } from 'node:path';
import { buildProject } from '@wildshard/build/project';
import { expect, test } from 'vitest';
import { devFile } from './dev';
import { renderDevMap } from './devMap';

test('the dev map makes both cook tiles available without changing the product index', async () => {
  mkdirSync('tmp', { recursive: true });
  const root = mkdtempSync(resolve('tmp', 'dev-map-'));
  try {
    writeFileSync(resolve(root, 'shard.config.ts'), `
import { defineShard } from '@wildshard/sdk/scene/shard';
export default defineShard({ slug: 'dev-map', name: 'Dev Map' }, world => {
  world.ground((x, z) => Math.max(0, 1 - Math.hypot(x, z) / 60));
  world.spawn(0, 0, 0);
});
`);
    const product = resolve(root, 'out');
    await buildProject(root, product, { client: null });
    const header = readFileSync(resolve(product, 'shard.json'));
    await renderDevMap(product);
    for (const [name, size] of [['cooked-map-v1.png', 1024], ['cooked-map-v1-cell.png', 400]] as const) {
      const file = devFile([product], '/shardfiles/dev-map/', `/shardfiles/dev-map/${name}`);
      if (file === undefined) throw new Error(`Dev does not serve ${name}`);
      const image = readFileSync(file.file);
      expect(image.toString('ascii', 1, 4)).toBe('PNG');
      expect([image.readUInt32BE(16), image.readUInt32BE(20)]).toEqual([size, size]);
    }
    expect(readFileSync(resolve(product, 'shard.json'))).toEqual(header);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
