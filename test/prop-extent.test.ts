import { expect, test } from 'vitest';
import { BoxGeometry, MeshBasicMaterial } from 'three';
import { emptyShardfile } from '@wildshard/engine/host/author';
import { staticGlb } from '../src/sharddev/bake/glb';
import { PropExtent, validatePropDrawBounds, visitGlbTriangles } from '@wildshard/format/product';

// CI6: one visit's extents stand in for the draw-bounds point test exactly; any check they fail visits again and refuses
// with the per-point message.
type Triple = [number, number, number];
const refuses = (points: readonly { x: number; y: number; z: number }[], bounds?: { min: Triple; max: Triple }): boolean => points.some(p =>
  Math.abs(p.x) > 250 || Math.abs(p.z) > 250 || bounds !== undefined && (p.x < bounds.min[0] || p.x > bounds.max[0] || p.y < bounds.min[1] || p.y > bounds.max[1] || p.z < bounds.min[2] || p.z > bounds.max[2]));

test('extents accept exactly the points the per-point test accepts, NaN included', () => {
  let seed = 3; const rnd = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let i = 0; i < 2000; i++) {
    const points = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => ({ x: rnd() < 0.05 ? Number.NaN : rnd() * 520 - 260, y: rnd() * 40 - 20, z: rnd() * 520 - 260 }));
    const extent = new PropExtent(); extent.add(points);
    const bounds: { min: Triple; max: Triple } | undefined = rnd() < 0.3 ? undefined : { min: [rnd() * -260, rnd() * -20, rnd() * -260], max: [rnd() * 260, rnd() * 20, rnd() * 260] };
    expect(extent.within(bounds)).toBe(!refuses(points, bounds));
  }
});

test('recorded extents refuse with the per-point message, and only for these bytes', () => {
  const source = emptyShardfile({ slug: 'extent-test', name: 'Extent', author: 'Test', revision: 1, seed: 1 });
  const geometry = new BoxGeometry(2, 2, 2), material = new MeshBasicMaterial(), file = 'b'.repeat(64);
  source.props = { version: 1, family: 'extent-test', tiles: [], panels: [{ id: 'edge', file, visible: true }, { id: 'again', file, visible: true }], models: [], far: null, textures: [], colliders: [] };
  try {
    for (const [shift, refused] of [[249, false], [249.01, true]] as const) {
      geometry.translate(shift, 0, 0);
      const bytes = staticGlb([{ geometry, material }]), assets = new Map([[file, bytes]]);
      const recorded = new PropExtent(); visitGlbTriangles(bytes, triangle => { recorded.add(triangle); });
      for (const known of [undefined, new Map([[file, recorded]])]) {
        const check = (): void => { validatePropDrawBounds(source, assets, known); };
        if (refused) expect(check).toThrow('Prop exceeds cell draw bounds'); else expect(check).not.toThrow();
      }
      geometry.translate(-shift, 0, 0);
    }
  } finally { geometry.dispose(); material.dispose(); }
});
