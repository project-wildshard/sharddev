import { describe, expect, test } from 'vitest';
import { encodeGeometry, encodePart, liveShell } from '@wildshard/sdk/watch/encode';
import { slice } from './shard';

describe('SHARD-SOURCE AP6: the dev scene wire', () => {
  const scene = slice.describe();
  test('a geometry encodes as five counts and its arrays, as engine devScene/wire.ts decodes it', () => {
    const geometry = Object.values(scene.geometries)[0];
    if (geometry === undefined) throw new Error('the slice has no geometry');
    const bytes = encodeGeometry(geometry), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const counts = [0, 1, 2, 3, 4].map((i) => view.getUint32(i * 4, true));
    expect(counts).toEqual([geometry.position.length, geometry.normal.length, geometry.uv?.length ?? 0, geometry.colour?.length ?? 0, geometry.index?.length ?? 0]);
    expect(bytes.byteLength).toBe(20 + counts.reduce((n, c) => n + c * 4, 0));
    expect(new Float32Array(bytes.buffer.slice(bytes.byteOffset + 20, bytes.byteOffset + 32))).toEqual(geometry.position.subarray(0, 3));
  });
  test('a part carries its materials and raster sizes inline, and only point lights', () => {
    const hut = scene.parts.find((part) => part.name === 'hut');
    if (hut === undefined) throw new Error('the slice has no hut');
    const wire = structuredClone(encodePart(scene, hut)) as { materials: { name: string }[]; textures: { width: number }[]; lights: unknown[]; colliders: unknown[]; draws: unknown[] };
    expect(wire.materials.some((m) => m.name === 'roof')).toBe(true);
    expect(wire.textures.every((t) => t.width > 0)).toBe(true);
    expect(wire.lights).toHaveLength(hut.lights.filter((l) => l.kind === 'point').length);
    expect(wire.colliders).toHaveLength(hut.colliders.length);
    expect(wire.draws).toHaveLength(hut.draws.length);
  });
  test('the live shell keeps the sun and look, and leaves every draw, lamp, collider and water to the page', () => {
    const shell = liveShell(scene);
    expect(shell.parts.flatMap((p) => [...p.draws, ...p.sprites, ...p.colliders, ...p.water])).toEqual([]);
    expect(shell.parts.flatMap((p) => p.lights).every((l) => l.kind !== 'point')).toBe(true);
    expect(shell.parts.flatMap((p) => p.lights).length).toBeGreaterThan(0);
    expect(shell.look).toEqual(scene.look);
  });
});
