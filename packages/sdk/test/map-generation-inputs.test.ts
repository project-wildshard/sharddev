import { expect, test } from 'vitest';
import { MapRaster } from '../src/sharddev/bake/mapRaster';
import { paintMapGeometry } from '../src/sharddev/bake/mapScenes';


test('output notes remain metadata while malformed selected exclusions refuse', async () => {
  const raster = new MapRaster(2), config = { painter: { version: 1 }, outputs: { why: 'Shared map author note', plot: { exclude: 1 } } };
  const readers = { input: (file: string): string => file, bytes: (): Uint8Array => new Uint8Array(), json: (): unknown => ({}) };
  raster.triangles = 1;
  await expect(paintMapGeometry(raster, config, readers)).resolves.toBeUndefined();
  await expect(paintMapGeometry(raster, config, readers, { output: 'plot' })).rejects.toThrow('Invalid type');
});
