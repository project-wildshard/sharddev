import { expect, test, vi } from 'vitest';
import { MapRaster } from './mapRaster';
import { paintMapScenes } from './mapScenes';

const pieces = { rock: { kinds: [{ name: 'stone', warm: false }] }, camp: { kinds: [{ name: 'wood', warm: true }] } };
const recipe = { scene: { root: 'root', nodes: [{ id: 'root', kind: 'group', children: ['stone', 'wood'] },
  { id: 'stone', kind: 'object', source: 'rock', position: [1, 2, 3] }, { id: 'wood', kind: 'object', source: 'camp', position: [-3, 2, -1] }] },
  imports: [{ id: 'rock', kind: 'baked', piece: 'rock' }, { id: 'camp', kind: 'baked', piece: 'camp', only: { warm: true } }] };
const data = { input: (file: string) => file, bytes: () => new Uint8Array(), json: (file: string): unknown => {
  if (file === 'world') return pieces;
  if (file === 'rock') return pieces.rock;
  if (file === 'camp') return pieces.camp;
  if (file === 'recipe') return recipe;
  throw new Error('Unexpected map input');
} };

test('single-piece source rows retain collection order, filenames and exact placements', async () => {
  const draws: unknown[] = [];
  for (const bakes of [[{ rows: { file: 'world' }, directory: 'meshes' }],
    [{ piece: 'rock', rows: { file: 'rock' }, directory: 'meshes' }, { piece: 'camp', rows: { file: 'camp' }, directory: 'meshes' }]]) {
    const raster = new MapRaster(8), draw = vi.spyOn(raster, 'glb').mockResolvedValue(undefined);
    await paintMapScenes(raster, { bakes, recipes: [{ file: 'recipe' }] }, {}, data);
    draws.push(draw.mock.calls.map(([file, matrix]) => ({ file, matrix: matrix?.elements })));
    draw.mockRestore();
  }
  expect(draws[1]).toEqual(draws[0]);
  expect(draws[0]).toEqual([{ file: 'meshes/rock.glb', matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 2, 3, 1] },
    { file: 'meshes/camp.glb', matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -3, 2, -1, 1] }]);
});

for (const piece of ['', '../escape', 1, null]) {
  test(`single-piece source refuses invalid identity ${String(piece)}`, async () => {
    await expect(paintMapScenes(new MapRaster(8), { bakes: [{ piece, rows: { file: 'rock' }, directory: 'meshes' }], recipes: [] }, {}, data))
      .rejects.toThrow('bounded piece identity');
  });
}
