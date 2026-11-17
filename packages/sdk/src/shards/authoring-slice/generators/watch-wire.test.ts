import { describe, expect, test } from 'vitest';
import { decodeGeometry, encodeGeometry, encodePart, liveShell } from '@wildshard/sdk/watch/protocol';
import { lampRows, waterRows } from '@wildshard/sdk/scene/shardfile';
import { slice } from './shard';

describe('SHARD-SOURCE AP5: the watch wire', () => {
  const scene = slice.describe();
  test('a geometry encodes as five counts and its arrays, and decodes back', () => {
    const geometry = Object.values(scene.geometries)[0];
    if (geometry === undefined) throw new Error('the slice has no geometry');
    const bytes = encodeGeometry(geometry), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const counts = [0, 1, 2, 3, 4].map((i) => view.getUint32(i * 4, true));
    expect(counts).toEqual([geometry.position.length, geometry.normal.length, geometry.uv?.length ?? 0, geometry.colour?.length ?? 0, geometry.index?.length ?? 0]);
    expect(bytes.byteLength).toBe(20 + counts.reduce((n, c) => n + c * 4, 0));
    const decoded = decodeGeometry(geometry.key, bytes.slice().buffer);
    expect(decoded.position).toEqual(geometry.position);
    expect(decoded.index).toEqual(geometry.index);
  });
  test('a part carries its materials and raster sizes inline, its lamps and water as shardfile rows, and its colliders', () => {
    const hut = scene.parts.find((part) => part.name === 'hut');
    if (hut === undefined) throw new Error('the slice has no hut');
    const wire = structuredClone(encodePart(scene, hut, { lamps: lampRows(hut.lights), water: waterRows(hut) }));
    expect(wire.materials.some((m) => (m as { name: string }).name === 'roof')).toBe(true);
    expect(wire.textures.every((t) => t.width > 0)).toBe(true);
    expect(wire.lamps).toHaveLength(hut.lights.filter((l) => l.kind === 'point').length);
    expect(wire.colliders).toHaveLength(hut.colliders.length);
    expect(wire.draws).toHaveLength(hut.draws.length);
    const pond = scene.parts.find((part) => part.water.length > 0);
    expect(pond === undefined ? [] : waterRows(pond)).toEqual(pond === undefined ? [] : [expect.objectContaining({ kind: 'pool', shape: expect.objectContaining({ kind: 'polygon' }) })]);
  });
  test('the live shell keeps the sun and look, and leaves every draw, lamp, collider and water to the page', () => {
    const shell = liveShell(scene);
    expect(shell.parts.flatMap((p) => [...p.draws, ...p.sprites, ...p.colliders, ...p.water])).toEqual([]);
    expect(shell.parts.flatMap((p) => p.lights).every((l) => l.kind !== 'point')).toBe(true);
    expect(shell.parts.flatMap((p) => p.lights).length).toBeGreaterThan(0);
    expect(shell.look).toEqual(scene.look);
  });
});
