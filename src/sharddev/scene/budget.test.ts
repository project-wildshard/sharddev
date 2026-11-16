import { expect, test } from 'vitest';
import { budgetReport, partBudgets } from './budget';
import type { SceneDraw, ScenePart, ShardScene } from './description';

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const draw = (material: string, geometry: string, at: readonly [number, number], instances = 0): SceneDraw => ({
  path: material, geometry, material, matrix: [...IDENTITY.slice(0, 12), at[0], 0, at[1], 1],
  instances: instances === 0 ? null : { count: instances, matrices: new Float32Array(Array.from({ length: instances }, () => IDENTITY).flat()), colours: null },
  castShadow: true, receiveShadow: true, motion: null,
});
const part = (name: string, draws: SceneDraw[]): ScenePart => ({ name, hash: name, draws, sprites: [], points: [], lights: [], colliders: [], water: [], materials: [], textures: [], geometries: [] });
const geometry = (key: string, triangles: number): ShardScene['geometries'][string] => ({ key, position: new Float32Array(), normal: new Float32Array(), uv: null, colour: null, index: null, triangles });

// AP9a's done-when: the table per part, and an overrun names the part and the tier.
test('the budget table names each part, and a tile over the phone cap names its tier and the parts that fill it', () => {
  const scene = {
    geometries: { blade: geometry('blade', 500), wall: geometry('wall', 2000) },
    // 100 grass clumps at the cell centre (tile 0/4/4, 50,000 triangles), a hut wall beside them and one far away
    parts: [part('grass', [draw('grass', 'blade', [1, 1], 100)]), part('hut', [draw('stone', 'wall', [2, 2]), draw('moss', 'wall', [200, 200])])],
  };
  const parts = partBudgets(scene);
  expect(parts.map((p) => [p.part, p.triangles, p.materials, p.tiles.get('0/4/4')])).toEqual([['grass', 50_000, 1, 50_000], ['hut', 4000, 2, 2000]]);
  const lines = budgetReport(parts, [{ tile: '0/4/4', triangles: 52_000, draws: 3 }, { tile: '0/7/7', triangles: 2000, draws: 1 }]);
  expect(lines[0]).toMatch(/^budget \(AP9\): 2 parts; caps phone 40,000 tris a tile, 150 draws a view; desktop no tile cap, 400 draws a view/u);
  expect(lines.find((l) => l.includes('grass'))).toMatch(/grass\s+50,000\s+1\s+0\/4\/4 50,000\s+over: tile tris\s+ok/u);
  expect(lines.find((l) => l.includes(' hut '))).toMatch(/hut\s+4,000\s+2\s+0\/4\/4 2,000\s+ok\s+ok/u);
  expect(lines.filter((l) => l.startsWith('over '))).toEqual(['over phone: tile 0/4/4 52,000 tris > 40,000: grass 50,000, hut 2,000']);
});

test('a part with more materials than a view may draw is over on that tier only', () => {
  const geometries = { g: geometry('g', 2) };
  const draws = Array.from({ length: 200 }, (_, i) => draw(`m${String(i)}`, 'g', [0, 0]));
  const lines = budgetReport(partBudgets({ geometries, parts: [part('market', draws)] }), []);
  expect(lines.find((l) => l.includes('market'))).toMatch(/market\s+400\s+200\s+\S+ 400\s+over: draws\s+ok/u);
  expect(lines.find((l) => l.includes('(all parts)'))).toMatch(/over: draws 200 > 150\s+ok/u);
});
