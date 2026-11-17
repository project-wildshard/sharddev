import { expect, test } from 'vitest';
import { authorCellBounds, completeL0Tiles } from '../src/sharddev/bake/tileGrid';
import { CHUNK_HALF } from '@wildshard/format/contentBounds';

test('author cell footprint agrees with every complete native L0 tile', () => {
  const bounds = authorCellBounds(), tiles = completeL0Tiles([]);
  expect(bounds).toEqual([-CHUNK_HALF, CHUNK_HALF, -CHUNK_HALF, CHUNK_HALF]);
  expect(authorCellBounds()).not.toBe(bounds);
  expect(Math.min(...tiles.map(row => row.bounds.min[0]))).toBe(bounds[0]);
  expect(Math.max(...tiles.map(row => row.bounds.max[0]))).toBe(bounds[1]);
  expect(Math.min(...tiles.map(row => row.bounds.min[2]))).toBe(bounds[2]);
  expect(Math.max(...tiles.map(row => row.bounds.max[2]))).toBe(bounds[3]);
});
