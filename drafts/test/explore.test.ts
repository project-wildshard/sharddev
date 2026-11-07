// @vitest-environment happy-dom
// Draft Explore's SETS on a test fixture (J69: Thin Ice plans its sets at P11), and the decision boards (W5, J68).
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Atlas } from '../src/atlas.ts';
import { explorePage, setTotals } from '../src/explore.ts';
import { stagePage } from '../src/pages.ts';

const ROOT = resolve(import.meta.dirname, '..', '..');
const thinIce = JSON.parse(readFileSync(join(ROOT, 'drafts/public/data/thin-ice/atlas.json'), 'utf8')) as Atlas;

const fixture: Atlas = {
  ...thinIce,
  sets: [{
    id: 'ferry-pier', name: 'The ferry pier', region: "Ferryman's Village", aerial: 'round-4-map-wave-1/p5w-s.jpg',
    bounds: { x: -40, z: 110, w: 30, d: 20 },
    members: [{ model: 'sigrun', copies: 1, tris: 4000, draws: 2 }, { model: 'harpoon', copies: 3, tris: 800, draws: 1 }],
  }],
};

describe('SETS (J46, J49, J69)', () => {
  it('totals a set: models, copies, every copy\'s triangles, one draw set per member', () => {
    expect(fixture.sets.map(setTotals)).toEqual([{ models: 2, copies: 4, tris: 6400, draws: 3 }]);
  });
  it('lists the sets by region, each with its counts and member chips', () => {
    const page = explorePage(fixture, 'sets', undefined, undefined);
    expect(page.textContent).toContain("Ferryman's Village");
    expect(page.textContent).toContain('2 models · 4 copies · 6.4k tris · 3 draws');
    expect(page.querySelector('a.wd-set-card')?.getAttribute('href')).toBe('#/thin-ice/explore/sets/ferry-pier');
  });
  it('opens a set: the aerial in its bounds box, the totals, a row per member linking to its model', () => {
    const page = explorePage(fixture, 'sets', 'ferry-pier', undefined);
    expect(page.querySelector('.wd-set-aerial.wd-big img')).not.toBeNull();
    expect(page.textContent).toContain('Bounds 30 × 20 m at (-40, 110)');
    const rows = [...page.querySelectorAll('a.wd-set-member')];
    expect(rows.map((r) => r.getAttribute('href'))).toEqual(['#/thin-ice/explore/models/sigrun', '#/thin-ice/explore/models/harpoon']);
    expect(rows[1]?.textContent).toContain('×3 · 800 tris each · 1 draw');
  });
  it('a member\'s model page says which sets it is part of', () => {
    const page = explorePage(fixture, 'models', 'harpoon', undefined);
    expect(page.textContent).toContain('Part of');
    expect(page.textContent).toContain('The ferry pier ×3');
  });
  it('Thin Ice itself has no sets until P11', () => {
    expect(explorePage(thinIce, 'sets', undefined, undefined).textContent).toContain('No sets planned yet');
  });
});

describe('decision boards (W5, J68)', () => {
  it('Thin Ice carries a board for each past decision, with the picks', () => {
    expect(thinIce.boards.map((b) => b.id)).toEqual([
      'p2-pitch', 'p3-direction', 'p3-kept-simple', 'p4-places-1', 'p4-places-2', 'p4-places-3', 'p4-characters', 'p4-gear',
      'p5-map', 'p5-rev2', 'p5b-content', 'p6-views',
    ]);
    expect(thinIce.boards.find((b) => b.id === 'p2-pitch')?.picked).toBe('C');
    expect(thinIce.boards.find((b) => b.id === 'p5-map')?.answer).toEqual(['They all look the same lol. I guess A']);
  });
  it('a stage page shows its boards: the question, every option, the pick, the answer', () => {
    const page = stagePage(thinIce, 'P2');
    expect(page.textContent).toContain('Three pitches: which one is Thin Ice\'s shard?');
    expect(page.querySelectorAll('.wd-option')).toHaveLength(3);
    expect(page.querySelector('.wd-option.wd-picked')?.textContent).toContain('C');
    expect(page.textContent).toContain('C · Thin Ice');
  });
  it('the design documents are part of the draft', () => {
    expect(thinIce.design.map((d) => d.name)).toEqual(['design.md', 'p2-pitches.md', 'style-bible.md']);
  });
});
