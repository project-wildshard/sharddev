// SDK-SPLIT SP6c: the sdk's own copies of the placeholder geometry (with its far-proxy builder) and the terrain chunk
// geometry make the same bytes as the engine's on the same inputs. The engine is the oracle until SP14 drops its copies.
import { BufferAttribute, type BufferGeometry } from 'three';
import { expect, test } from 'vitest';
import * as enginePlaceholder from '@wildshard/engine/game/plugin/placeholderGeometry';
import * as engineTerrain from '@wildshard/engine/world/Terrain';
import { TERRAIN_RES as ENGINE_TERRAIN_RES } from '@wildshard/engine/core/config';
import { placeholderGeometry, placeholderLeanDrop, type PlaceholderGrid, type PlaceholderLook } from './placeholderGeometry';
import { TERRAIN_RES, canopyChannel, terrainChunkGeometry } from './terrainGeometry';

const bytes = (geometry: BufferGeometry) => {
  const index = geometry.getIndex();
  return [...Object.entries(geometry.attributes), ...(index === null ? [] : [['index', index] as const])].map(([name, value]) => ({
    name, width: value.itemSize, storage: value.array.constructor.name, bits: new Uint8Array(value.array.buffer, value.array.byteOffset, value.array.byteLength) }));
};

const res = 17, heights = Float32Array.from({ length: res * res }, (_, i) => 30 * Math.sin((i % res) * 0.7) * Math.cos(Math.floor(i / res) * 0.5) + 20);
const splat = Uint8Array.from({ length: res * res * 4 }, (_, i) => (i * 37) % 256);
const looks: readonly PlaceholderLook[] = [
  { family: 'toon', quads: 4, colourAt: () => [0.6, 0.5, 0.3], cliff: { lip: [0.4, 0.4, 0.4], foot: [0.3, 0.3, 0.3] }, haze: { colour: [0.7, 0.7, 0.8] } },
  { family: 'painterly', quads: 6, colourAt: (x, z) => [0.5 + x / 2000, 0.4, 0.3 - z / 4000], cliff: { lip: [0.5, 0.4, 0.3], foot: [0.2, 0.2, 0.2] }, haze: { colour: [0.6, 0.7, 0.9] } },
];
const lean = { top: 6, grade: 0.4, jitter: 0.5 };

test('the sdk placeholder geometry is the engine placeholder geometry, byte for byte', () => {
  for (const grid of [{ res, size: 500, heights, splat: null }, { res, size: 500, heights, splat }] satisfies PlaceholderGrid[]) {
    for (const look of looks) {
      const part = { positions: Float32Array.of(0, 30, 0, 10, 30, 0, 0, 30, 10), colours: Float32Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1), index: Uint32Array.of(0, 1, 2) };
      for (const args of [[], [[part]], [[part], 20000], [[], undefined, undefined, lean]] as const) {
        const sdk = placeholderGeometry(grid, look, ...args), engine = enginePlaceholder.placeholderGeometry(grid, look, ...args);
        expect(bytes(sdk)).toEqual(bytes(engine));
      }
      const drop = placeholderLeanDrop(grid, lean), engineDrop = enginePlaceholder.placeholderLeanDrop(grid, lean);
      for (const [x, z] of [[0, 0], [-249, 3], [240, -248], [125, 250]] as const) expect(drop(x, z)).toBe(engineDrop(x, z));
    }
  }
});

test('the sdk terrain chunk geometry and canopy channel are the engine ones, byte for byte', () => {
  expect(TERRAIN_RES).toBe(ENGINE_TERRAIN_RES);
  const field = { heightAt: (x: number, z: number) => 12 * Math.sin(x / 37) + 7 * Math.cos(z / 23) + x * z / 1e5,
    splatAt: (x: number, z: number): [number, number, number, number] => [0.5 + Math.sin(x / 50) / 2, 0.25, 0.25 + Math.cos(z / 40) / 4, 0] };
  const sdk = terrainChunkGeometry(field), engine = engineTerrain.terrainChunkGeometry(field);
  expect(bytes(sdk)).toEqual(bytes(engine));
  const canopy = Float32Array.from({ length: 64 * 64 }, (_, i) => (i % 7) / 7), position = sdk.getAttribute('position');
  if (!(position instanceof BufferAttribute)) throw new Error('terrain positions are a plain attribute');
  expect(canopyChannel(position, canopy, 64)).toEqual(engineTerrain.canopyChannel(position, canopy, 64));
});
