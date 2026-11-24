import { describe, expect, it } from 'vitest';
import { BLACK, blackShare, refuseBlack } from '../scripts/capture-hero.mjs';

// QA 11-24 row 9 (Jake: "ITS THAT ITS ALL BLACK"): a hero capture of a zone that renders black is refused, so a black
// render can never be stamped as a zone's card again.
function frame(parts: readonly (readonly [share: number, luma: number])[]): Uint8Array {
  const out = new Uint8Array(320 * 180);
  let at = 0;
  for (const [share, luma] of parts) { const end = Math.min(out.length, at + Math.round(share * out.length)); out.fill(luma, at, end); at = end; }
  return out;
}

describe('hero black frame', () => {
  it('refuses a frame mostly black (Nine Dragon with its paint unfed: half its pixels under luma 12)', () => {
    const black = frame([[0.49, 6], [0.3, 40], [0.21, 180]]);
    expect(blackShare(black)).toBeGreaterThan(BLACK.share);
    expect(() => refuseBlack('landscape', black)).toThrow(/\[hero-black\] landscape is 49% black/);
  });

  it('keeps a night hero (Glowfen, Pine Hollow: about a tenth under luma 12)', () => {
    const night = frame([[0.11, 8], [0.6, 30], [0.29, 120]]);
    expect(refuseBlack('landscape', night)).toBeCloseTo(0.11, 2);
  });

  it('keeps a lit hero and refuses an empty read', () => {
    expect(refuseBlack('thumb', frame([[1, 90]]))).toBe(0);
    expect(() => refuseBlack('thumb', new Uint8Array(0))).toThrow(/hero-black/);
  });
});
