import { expect, test } from 'vitest';
import { DataTexture, DataUtils, MeshStandardMaterial, PlaneGeometry, type Texture } from 'three';
import { WaterSurface } from '../src/client/game/systems/looks/waterSurface';
import type { GraphIr, GraphLiteral, GraphRef } from '@wildshard/format/materialGraph';
import { WATER_GRAPHS } from '../src/shards/pine-hollow/generators/waterGraphs';
import { OCEAN_SURFACE } from '../src/shards/driftwood-isle/generators/oceanLook';
import waterRows from '../src/shards/pine-hollow/data/waterLook.json' with { type: 'json' };

const { surfaces: WATER_SURFACES } = waterRows;

test('Driftwood ocean binds its floor, foam and dry sockets; Pine draws its plain surface rows', () => {
  for (const row of [OCEAN_SURFACE, WATER_SURFACES.creek, WATER_SURFACES.trickle, WATER_SURFACES.puddle]) {
    const params = new Map<string, GraphLiteral>(), textures = new Map<string, Texture>();
    const geometry = new PlaneGeometry(2, 2), material = new MeshStandardMaterial();
    const surface = new WaterSurface(row, { material, param: (name, value) => { params.set(name, value); },
      texture: (name, value) => { textures.set(name, value); } });
    if (surface.row.floor === undefined) {
      surface.draw(geometry);
      expect(textures.size).toBe(0);
      expect(() => surface.foamAround([])).toThrow('no floor');
    } else {
      const floor = new Uint16Array(surface.row.floor.res ** 2).fill(DataUtils.toHalfFloat(-2));
      surface.draw(geometry, { level: 1, floor, dry: [{ minX: -2, minZ: -3, maxX: 2, maxZ: 3 }] });
      expect(params.get('dry0')).toEqual([-2, -3, 2, 3]);
      expect(params.get('dry1')).toEqual([...OCEAN_SURFACE.dry.none]);
      const texture = textures.get('tSea');
      expect(texture).toBeInstanceOf(DataTexture);
      if (!(texture instanceof DataTexture)) throw new Error('Missing water floor');
      expect(texture.image.width).toBe(OCEAN_SURFACE.floor.res);
      surface.foamAround([{ x: 0, z: 0, hw: 2, hd: 2, rot: 0, yBottom: -2, yTop: 2 }]);
      const data = texture.image.data;
      if (data === null) throw new Error('Missing floor pixels');
      expect(data[0]).toBe(floor[0]);
      expect(Array.from(data).some((value, index) => index % 2 === 1 && value > 0)).toBe(true);
      expect(() => surface.draw(geometry, { floor: new Uint16Array(1) })).toThrow('baked floor');
      texture.dispose();
    }
    expect(surface.mesh.geometry).toBe(geometry);
    expect(surface.mesh.material).toBe(material);
    expect(surface.mesh.name).toBe(row.name);
    expect(surface.mesh.renderOrder).toBe(row.renderOrder);
    geometry.dispose(); material.dispose();
  }
});

test('a lowered basin keeps its reversible travel, eased level and instant saved state', () => {
  const geometry = new PlaneGeometry(2, 2), material = new MeshStandardMaterial();
  const row = { look: 'quarry-water', name: 'quarry-basin', renderOrder: 3,
    transition: { full: 2, lowered: 0, seconds: 4, exponent: 2, depth: 'depth', film: -.3, lift: .1, bank: -.5, reveal: [.25, .75] } };
  const surface = new WaterSurface(row, { material });
  try {
    surface.draw(geometry);
    surface.setLowered(true); surface.update(2);
    expect(surface.level).toBe(.5); expect(surface.reveal).toBe(.5);
    surface.setLowered(false); surface.update(1); expect(surface.level).toBe(1.125);
    surface.setLowered(true, true); expect(surface.level).toBe(0); expect(surface.reveal).toBe(1);
    surface.update(10); expect(surface.level).toBe(0);
    surface.setLowered(false, true); expect(surface.level).toBe(2); expect(surface.reveal).toBe(0);
  } finally { geometry.dispose(); material.dispose(); }
});

// The pool look's vertex stage evaluated on the CPU (only the ops it uses), against the per-vertex law it replaced.
type Value = number | readonly number[];
function evaluate(graph: GraphIr, ref: GraphRef, inputs: { aWater: readonly number[]; position: readonly number[]; level: number }): Value {
  if (typeof ref === 'number' || Array.isArray(ref)) return ref;
  const node = graph.nodes[String(ref)]; if (node === undefined) throw new Error(`Missing node ${String(ref)}`);
  const at = (i: number): Value => { const input = node.in?.[i]; if (input === undefined) throw new Error('Missing input'); return evaluate(graph, input, inputs); };
  const n = (v: Value): number => { if (typeof v !== 'number') throw new Error('Expected a scalar'); return v; };
  const xyzw = 'xyzw';
  switch (node.op) {
    case 'attribute': return inputs.aWater;
    case 'positionGeometry': return inputs.position;
    case 'param': return inputs.level;
    case 'varying': return at(0);
    case 'swizzle': { const v = at(0); if (typeof v === 'number') throw new Error('Swizzle of a scalar'); const out = (node.mask ?? '').split('').map(c => v[xyzw.indexOf(c)] ?? Number.NaN); return out.length === 1 ? out[0] ?? Number.NaN : out; }
    case 'add': return n(at(0)) + n(at(1));
    case 'sub': return n(at(0)) - n(at(1));
    case 'max': return Math.max(n(at(0)), n(at(1)));
    case 'lt': return Number(n(at(0)) < n(at(1)));
    case 'gt': return Number(n(at(0)) > n(at(1)));
    case 'select': return n(at(0)) !== 0 ? at(1) : at(2);
    case 'combine': return (node.in ?? []).map((_, i) => n(at(i)));
    default: throw new Error(`Unexpected vertex op ${node.op}`);
  }
}

test('the pool look stands each vertex at the live level over its bed, as the CPU lowering did', () => {
  const graph = WATER_GRAPHS[waterRows.looks.pool], row = waterRows.surfaces.pool.transition;
  const position = graph?.stages['vertex.position']?.position;
  if (graph === undefined || position === undefined) throw new Error('Pool look lacks its vertex stage');
  const code = Object.entries(graph.nodes).find(([, node]) => node.op === 'varying' && node.in?.[0] !== undefined && graph.nodes[String(node.in[0])]?.op === 'select')?.[0];
  if (code === undefined) throw new Error('Pool look lacks its depth varying');
  for (let i = 0; i < 400; i++) {
    const bed = row.full - 2 + (i % 40) * 0.08, level = row.lowered + (Math.floor(i / 40) / 9) * (row.full - row.lowered);
    const d = level - bed;
    let y = level, depth = d;
    if (d < 0) { if (bed < row.full) { y = bed + row.lift; depth = Math.max(d, row.film); } else if (d > row.bank) y = bed + row.lift; }
    const inputs = { aWater: [row.full - bed, 0, 0, 2.4], position: [3, row.full, -4], level };
    const p = evaluate(graph, position, inputs);
    if (typeof p === 'number') throw new Error('Position is a vector');
    expect(p[0]).toBe(3); expect(p[1]).toBeCloseTo(y, 12); expect(p[2]).toBe(-4);
    expect(evaluate(graph, code, inputs)).toBeCloseTo(depth, 12);
  }
});
