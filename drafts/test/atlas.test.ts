// The drafts site's data contract (WORLDCLAW-TOOLS W1, W2) and Map Lab's maths (W6), on Thin Ice's real sources.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STAGES, TICKS, spoilerByKind, ticksDone, type Atlas, type DraftIndex } from '../src/atlas.ts';
import { numbers, placeGentlePct, sightlines, slopeDeg, type Field } from '../src/maplab-math.ts';
import { buildAtlas, parseReadme, publicLeaks, roundNumber, type DraftConfig, type DraftContent } from '../tools/build-atlas.ts';
import { imageSize, type ImageIndex } from '../tools/images.ts';

const ROOT = resolve(import.meta.dirname, '..', '..');
// The art originals are not in the tree Vercel sees (.vercelignore), so the pre-push gate skips the tests that read
// them; CI runs them on the full tree.
const HAS_ART = existsSync(join(ROOT, 'art/thin-ice'));

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- JSON.parse is untyped; the caller names the file's shape
const read = <T>(p: string): T => JSON.parse(readFileSync(join(ROOT, p), 'utf8')) as T;

function thinIce(index?: ImageIndex): ReturnType<typeof buildAtlas> {
  const config = read<DraftConfig>('drafts/shards/thin-ice/draft.json');
  const content = read<DraftContent>(config.content);
  const cams = config.cams ? read<Record<string, { eye: [number, number, number]; look: [number, number, number] }>>(config.cams) : {};
  return buildAtlas({
    root: ROOT, config, content, cams, terrain: null,
    index: index ?? read<ImageIndex>('drafts/shards/thin-ice/images.json'), now: '2026-10-02T00:00:00.000Z',
  });
}

describe('the stage list', () => {
  it('has 17 ticks, P1 → P17', () => {
    expect(TICKS).toHaveLength(17);
    expect(TICKS[0]).toBe('P1');
    expect(TICKS.at(-1)).toBe('P17');
    expect(STAGES.map((s) => s.id)).toContain('P5b');
  });
  it('counts the done ticks before the current stage', () => {
    expect(ticksDone('P1')).toBe(0);
    expect(ticksDone('P6')).toBe(5);
    expect(ticksDone('P17')).toBe(16);
  });
});

describe('the README parser', () => {
  it('reads the title, note, made-with and verdict', () => {
    const r = parseReadme('# P2 · three pitches\n\nE359 (2026-10-01). Key art for A, B and C.\n\n- **Made with:** codex image_gen.\n- **Verdict:** Jake: "C".\n');
    expect(r).toEqual({ title: 'P2 · three pitches', note: 'Key art for A, B and C.', made: 'codex image_gen', verdict: 'Jake: "C".' });
  });
  it('sorts round-10 after round-9', () => {
    expect(roundNumber('round-10-x')).toBeGreaterThan(roundNumber('round-9-x'));
  });
});

describe.skipIf(!HAS_ART)('Thin Ice → atlas.json', () => {
  // Built in the tests, not here: vitest runs a skipped suite's body to collect it, and this reads art/.
  let built: ReturnType<typeof thinIce> | null = null;
  const b = (): ReturnType<typeof thinIce> => (built ??= thinIce());

  it('builds with no problems: every picture has its phone copy (W2)', () => {
    expect(b().problems).toEqual([]);
    expect(b().sources).toHaveLength(b().atlas.items.length);
  });
  it('carries every round and picture of the dry run', () => {
    expect(b().atlas.rounds).toHaveLength(11);
    expect(b().atlas.items.length).toBe(226);
  });
  it('puts the run at P6 with P1–P5b done', () => {
    expect(b().atlas.run.stage).toBe('P6');
    expect(b().atlas.stages.find((s) => s.id === 'P5')?.state).toBe('done');
    expect(b().atlas.stages.find((s) => s.id === 'P6')?.state).toBe('current');
    expect(b().card.ticks).toBe(5);
  });
  it('quotes Jake\'s answers verbatim and points each stage at its pick', () => {
    const p5 = b().atlas.stages.find((s) => s.id === 'P5');
    expect(p5?.answers).toContain("Map A revision 2, it's approved.");
    expect(p5?.pick).toBe('round-6-map-revision-2/p5r2-map.jpg');
  });
  it('follows a view across rounds (concept → try 1 → blockout → wave 2)', () => {
    const fp02 = b().atlas.lineages['fp-02'] ?? [];
    expect(fp02).toEqual([
      'round-3-concepts/p4-place-02-village.jpg',
      'round-6-map-revision-2/blockout/fp-02-village.jpg',
      'round-7-first-person-try-1/p6-02-village.jpg',
      'round-8-first-person-wave-2/w2-02-village.jpg',
    ]);
    const mapView = 'map';
    expect(b().atlas.lineages[mapView]).toEqual([
      'round-4-map-wave-1/p5-map-a.jpg', 'round-5-map-revision-1/p5b-top.jpg', 'round-6-map-revision-2/p5r2-map.jpg',
    ]);
  });
  it('lists the six concept models, the boss flagged as a spoiler', () => {
    expect(b().atlas.models.map((m) => m.id).sort()).toEqual(['bellkeeper', 'crawlers', 'harpoon', 'icebear', 'sigrun', 'sled']);
    expect(b().atlas.models.find((m) => m.id === 'bellkeeper')?.spoiler).toBe(true);
  });
  it('gives every quest step its current wildcard pictures', () => {
    expect(b().atlas.steps).toHaveLength(12);
    for (const st of b().atlas.steps) expect(st.items).toHaveLength(3);
  });
  it('carries the camera check for all 11 first-person cameras', () => {
    expect(b().atlas.cams).toHaveLength(11);
    expect(b().atlas.cams.find((c) => c.id === '02-village')?.ok).toBe(false);
    expect(b().atlas.cams.find((c) => c.id === '04-quarry')?.ok).toBe(true);
  });
});

describe.skipIf(!HAS_ART)('spoilers stay off public pages (Done-when 3)', () => {
  it('marks maps, the journey, steps, the boss and secret places by kind; never the key art', () => {
    expect(spoilerByKind('map', undefined, undefined)).toBe(true);
    expect(spoilerByKind('step', undefined, undefined)).toBe(true);
    expect(spoilerByKind('concept', 'boss', undefined)).toBe(true);
    expect(spoilerByKind('fp', undefined, 'secret')).toBe(true);
    expect(spoilerByKind('keyart', 'boss', 'boss')).toBe(false);
    expect(spoilerByKind('pitch', undefined, undefined)).toBe(false);
  });
  it('the public card shows the key art only; a spoiler as key art is refused', () => {
    const { atlas, card } = thinIce();
    expect(publicLeaks(card, atlas)).toEqual([]);
    const map = atlas.items.find((i) => i.kind === 'map' && i.images !== null);
    expect(map?.images).toBeDefined();
    if (map?.images !== undefined && map.images !== null) expect(publicLeaks({ ...card, keyArt: map.images }, atlas)).toHaveLength(1);
  });
  it('the committed index carries nothing but the public card', () => {
    const index = read<DraftIndex>('drafts/public/data/index.json');
    for (const d of index.drafts) expect(Object.keys(d).sort()).toEqual(['keyArt', 'line', 'name', 'slug', 'stage', 'stageName', 'ticks', 'waiting']);
  });
});

describe.skipIf(!HAS_ART)('a picture with no phone copy is a problem, not a silent gap (W2)', () => {
  it('names the missing source', () => {
    const { problems } = thinIce({});
    expect(problems.some((p) => p.includes('no phone copy yet: art/thin-ice/round-3-concepts/p4-keyart.jpg'))).toBe(true);
  });
});

describe.skipIf(!HAS_ART)('the committed atlas is current', () => {
  it('matches a rebuild from the sources, apart from the time stamp', () => {
    const committed = read<Atlas>('drafts/public/data/thin-ice/atlas.json');
    const { atlas } = thinIce();
    // the terrain and the design docs are read by atlas.ts's I/O (loadTerrain, loadDesign), not by buildAtlas
    const strip = (a: Atlas): string => JSON.stringify({ ...a, generated: '', terrain: null, design: [] });
    expect(strip(committed)).toBe(strip(atlas));
  });
});

describe.skipIf(!HAS_ART)('image headers', () => {
  it('reads a JPEG\'s size', () => {
    const buf = readFileSync(join(ROOT, 'art/thin-ice/round-3-concepts/p4-keyart.jpg'));
    expect(imageSize(buf)).toEqual({ w: 1024, h: 1536 });
  });
});

describe('Map Lab\'s maths = the dry run\'s terrain_vis.py on the approved blockout (WT6, J61)', () => {
  const hb = readFileSync(join(ROOT, 'drafts/public/data/thin-ice/terrain.f32'));
  const field: Field = {
    res: 256, size: 500, water: 0,
    heights: new Float32Array(hb.buffer, hb.byteOffset, hb.byteLength / 4),
    labels: new Uint8Array(readFileSync(join(ROOT, 'drafts/public/data/thin-ice/labels.u8'))),
  };
  const slope = slopeDeg(field);
  const atlas = read<Atlas>('drafts/public/data/thin-ice/atlas.json');
  const t = atlas.terrain;
  it('has the terrain', () => { expect(t).not.toBeNull(); });
  if (!t) return;
  // The reference values: terrain_vis.py's sections 3–4 run in numpy on the same H / labels (2026-10-02).
  it('the land, walkable and gentle shares and every place\'s gentle ground', () => {
    const { n } = numbers(field, slope, t.places, t.roads);
    expect(n.landPct).toBe(95.5);
    expect(n.walkablePct).toBe(86.7);
    expect(n.gentlePct).toBe(81.3);
    expect(n.viewpoints).toBe(362);
    expect(n.places).toEqual({ landing: 99, village: 100, lighthouse: 33, spire: 100, cave: 72, tower: 100, quarry: 83, glacier: 87, spring: 98, overlook: 72, bayrun: 10 });
    expect(n.bands.close).toBe(35.8);
    expect(n.bands.mid).toBe(34);
    expect(n.bands.far).toBe(23.2);
    // numpy's round-half-even gives 7.0 where this gives 6.9: the same cells, a different rounding.
    expect(Math.abs(n.bands.unseen - 7.0)).toBeLessThanOrEqual(0.1);
  });
  it('a moved place reads the ground where it lands', () => {
    const village = t.places.find((p) => p.id === 'village');
    expect(village).toBeDefined();
    if (!village) return;
    expect(placeGentlePct(field, slope, village.x, village.z, village.r)).toBe(100);
    expect(sightlines(field, village, t.places).length).toBeGreaterThan(0);
  });
});

describe('a day-zero draft (P0: no art, no key art yet) builds (E395)', () => {
  it('has no rounds, no items and no problems', () => {
    const config: DraftConfig = {
      slug: 'day-zero', name: 'Day Zero', line: 'A test line.', art: 'art/day-zero-does-not-exist', design: '', content: '',
      run: { stage: 'P0', waiting: 'the vision', next: 'P1' }, rounds: {}, files: [], stages: {},
    };
    const content: DraftContent = { places: [], steps: [], lanes: [], side: [], mechanics: [], camChecks: {}, sets: [] };
    const { atlas, card, problems } = buildAtlas({ root: ROOT, config, content, cams: {}, terrain: null, index: {}, now: '2026-10-02T00:00:00.000Z' });
    expect(problems).toEqual([]);
    expect(atlas.items).toEqual([]);
    expect(card.keyArt).toBeNull();
    expect(card.ticks).toBe(0);
  });
});
