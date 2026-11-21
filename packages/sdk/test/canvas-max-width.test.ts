import { expect, test } from 'vitest';
import { PaintContext } from '../src/sharddev/scene/canvas';

// SHARD-COMPAT CP18 (the mini's packed typecheck, 11-21): fillText takes a canvas's maxWidth and squeezes text to fit.
function inkColumns(maxWidth?: number): readonly number[] {
  const ctx = new PaintContext(200, 20);
  ctx.fillStyle = '#ffffff';
  ctx.font = '14px sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText('MIRROR SALT', 0, 2, maxWidth);
  const bytes = ctx.bytes(), columns: number[] = [];
  for (let x = 0; x < 200; x++) {
    let inked = false;
    for (let y = 0; y < 20; y++) if ((bytes[(y * 200 + x) * 4 + 3] ?? 0) > 0) inked = true;
    if (inked) columns.push(x);
  }
  return columns;
}

test('text wider than maxWidth is squeezed inside it; narrower text is untouched', () => {
  const free = inkColumns(), squeezed = inkColumns(60), roomy = inkColumns(500);
  expect(free.at(-1)).toBeGreaterThan(60);
  expect(squeezed.at(-1)).toBeLessThanOrEqual(60);
  expect(squeezed.length).toBeGreaterThan(0);
  expect(roomy).toEqual(free);
});
