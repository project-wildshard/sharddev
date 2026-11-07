import { BoxGeometry, BufferAttribute, type BufferGeometry } from 'three';
import { expect, expectTypeOf, test } from 'vitest';
import { addGeometryBake, bakedGeometry, encodeGeometryBake, geometryBakeStats, recordGeometryBake } from '@wildshard/engine/world/geometryBake';
import { Rng } from '../random';
import { bakeCachedGeometry } from './facetedGeometry';

function channels(geometry: BufferGeometry) {
  const index = geometry.getIndex();
  return [...Object.entries(geometry.attributes), ...(index === null ? [] : [['index', index] as const])].map(([name, value]) => ({
    name, width: value.itemSize, normalized: value.normalized, storage: value.array.constructor.name, values: [...value.array] }));
}

test('author geometry retains native recording producer, owned hits and complete RNG continuation', () => {
  expectTypeOf<typeof bakeCachedGeometry>().toEqualTypeOf<typeof bakedGeometry>();
  for (const rng of [null, new Rng(7), Rng.scrambled(23)]) {
    const start = rng?.snapshot(), id = 'sdk.cache.author', inputs = [1.25, -0, 0.1];
    let calls = 0;
    const recorder = recordGeometryBake((key, values, stream) => {
      expect(key).toBe(id); expect(values).toBe(inputs); expect(stream).toBe(rng); calls++;
      const made = new BoxGeometry(1 + (stream?.next() ?? 0), 2, 3);
      made.setAttribute('_weight', new BufferAttribute(new Uint8Array(24).fill(119), 1, true));
      return made;
    });
    let source: BufferGeometry;
    let table: Uint8Array;
    try {
      source = bakeCachedGeometry(id, inputs, rng, () => { throw new Error('Native recording producer must own compilation'); });
      table = encodeGeometryBake(recorder.entries);
    } finally { recorder.stop(); }
    const expected = channels(source), groups = structuredClone(source.groups), after = rng?.snapshot();
    source.dispose();
    const release = addGeometryBake(Uint8Array.from(table).buffer);
    try {
      for (const compile of [bakeCachedGeometry, bakedGeometry]) {
        const restored = start === undefined ? null : new Rng(0);
        if (restored !== null && start !== undefined) restored.restore(start);
        const hits = geometryBakeStats().hits;
        const hit = compile(id, inputs, restored, () => { throw new Error('Owned native cache hit must not rebuild'); });
        try {
          expect(channels(hit)).toEqual(expected); expect(hit.groups).toEqual(groups);
          expect(restored?.snapshot()).toEqual(after);
          expect(geometryBakeStats().hits).toBe(hits + 1);
          hit.getAttribute('position').setX(0, 999);
        } finally { hit.dispose(); }
      }
      expect(calls).toBe(1);
      const fallback = bakeCachedGeometry('sdk.cache.absent', inputs, null, () => { calls++; return new BoxGeometry(); });
      fallback.dispose(); expect(calls).toBe(2);
    } finally { release(); }
  }
});
