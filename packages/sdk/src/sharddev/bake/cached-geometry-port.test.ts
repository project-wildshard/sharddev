import { BoxGeometry, BufferAttribute, type BufferGeometry } from 'three';
import { expect, test } from 'vitest';
// SDK-SPLIT SP6b: the recorder and the scoped tables are the sdk's own copy. SP14 retired the engine's copy (engine
// 0.1.47 has no world/geometryBake), so the native half of this parity test left with it.
import { addGeometryBake, encodeGeometryBake, geometryBakeStats, recordGeometryBake } from './geometryBake';
import { Rng } from '../random';
import { bakeCachedGeometry } from './facetedGeometry';

function channels(geometry: BufferGeometry) {
  const index = geometry.getIndex();
  return [...Object.entries(geometry.attributes), ...(index === null ? [] : [['index', index] as const])].map(([name, value]) => ({
    name, width: value.itemSize, normalized: value.normalized, storage: value.array.constructor.name, values: [...value.array] }));
}

test('author geometry retains native recording producer, owned hits and complete RNG continuation', () => {
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
    const sides = [{ add: addGeometryBake, compile: bakeCachedGeometry, stats: geometryBakeStats }];
    for (const side of sides) {
      const release = side.add(Uint8Array.from(table).buffer);
      try {
        const restored = start === undefined ? null : new Rng(0);
        if (restored !== null && start !== undefined) restored.restore(start);
        const hits = side.stats().hits;
        const hit = side.compile(id, inputs, restored, () => { throw new Error('Owned native cache hit must not rebuild'); });
        try {
          expect(channels(hit)).toEqual(expected); expect(hit.groups).toEqual(groups);
          expect(restored?.snapshot()).toEqual(after);
          expect(side.stats().hits).toBe(hits + 1);
          hit.getAttribute('position').setX(0, 999);
        } finally { hit.dispose(); }
      } finally { release(); }
    }
    expect(calls).toBe(1);
    const fallback = bakeCachedGeometry('sdk.cache.absent', inputs, null, () => { calls++; return new BoxGeometry(); });
    fallback.dispose(); expect(calls).toBe(2);
  }
});
