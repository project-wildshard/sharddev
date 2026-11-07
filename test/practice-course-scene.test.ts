// @vitest-environment happy-dom
import { expect, test, vi } from 'vitest';
import { NALATI_KOKPAR } from './fixtures/nalati-kokpar';
import { Vector3, Mesh, type BufferGeometry } from 'three';
import { parsePracticeScene } from '@wildshard/format/practiceCourseRows';
import { buildPracticeScene } from '@wildshard/engine/game/practice/scene';
import { horseCourseRows } from '../src/shards/nalati-grasslands/generators/courseScene';
import { grappleCourseScene } from '../src/shards/nine-dragon-stack/generators/courseScene';
import { ninePracticeRows } from './fixtures/nine-practice-product';
import course from '../src/shards/nine-dragon-stack/data/grappleCourse.json' with { type: 'json' };

test('both shipping courses publish bounded local scenes with their real obstacles and targets', () => {
  const horse = horseCourseRows(NALATI_KOKPAR.course), grapple = grappleCourseScene(course, ninePracticeRows);
  expect(horse.road.at(0)).toEqual(horse.road.at(-1));
  expect(horse.presentation.colliders.filter(row => row.surface === 'wood')).toHaveLength(8);
  expect(grapple.hooks).toHaveLength(course.hooks.length);
  const finish = course.pads.find(row => row.id === 'top'); if (finish === undefined) throw new Error('Missing finish');
  expect(grapple.hooks.find(row => row.pad === 'top')?.y).toBe(finish.top + course.ringUp);
  for (const data of [horse.presentation, grapple.presentation]) {
    expect(parsePracticeScene(data)).toEqual(data);
    expect(data.parts.some(part => part.kind === 'label')).toBe(true);
    expect(data.parts.some(part => part.kind === 'mesh')).toBe(true);
  }
});

test('one presenter translates drawings, native collision and minimap coordinates together', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  try {
    for (const [data, offset] of [[horseCourseRows(NALATI_KOKPAR.course).presentation, new Vector3(40, 3000, 60)], [grappleCourseScene(course, ninePracticeRows).presentation, new Vector3(-17, 3000, 23)]] as const) {
      const view = buildPracticeScene(data, offset, 'practice');
      const first = data.colliders[0]; if (first === undefined) throw new Error('Missing course floor');
      expect(view.colliders[0]).toMatchObject({ x: first.x + offset.x, y: first.y + offset.y, z: first.z + offset.z });
      expect(view.map.bounds.x0).toBe(data.map.bounds.x0 + offset.x);
      expect(view.map.bounds.z1).toBe(data.map.bounds.z1 + offset.z);
      expect(view.root.children.length).toBeGreaterThan(10);
      const label = view.root.children.find(child => child.name === 'dev-label:START · FINISH');
      if (label !== undefined) expect(label.position.y).toBe(3005.4);
      view.root.traverse(child => { if (child instanceof Mesh) { const geometry = child.geometry as BufferGeometry; geometry.dispose(); } });
    }
  } finally { vi.restoreAllMocks(); }
});

test('admission rejects malformed triangles, negative solids and executable fields before drawing', () => {
  const original = horseCourseRows(NALATI_KOKPAR.course).presentation;
  const mesh = original.parts.find(part => part.kind === 'mesh'); if (mesh === undefined) throw new Error('Missing track mesh');
  expect(() => parsePracticeScene({ ...original, parts: [{ ...mesh, index: [99999, 0, 1] }] })).toThrow();
  expect(() => parsePracticeScene({ ...original, parts: [{ kind: 'box', tone: 'grey', at: [0, 0, 0], size: [-1, 1, 1], tint: 1 }] })).toThrow();
  expect(() => parsePracticeScene({ ...original, update: 'return player.mount()' })).toThrow();
});


test('Nine fixed-kit admission includes the emitted practice scene and refuses unknown fields', async () => {
  const { parseFixedRows } = await import('../src/shards/nine-dragon-stack/generators/sections');
  const practice = grappleCourseScene(course, ninePracticeRows);
  const payload = { signs: [], lanterns: [], lantern: { drop: 1, glow: { color: 1, w: 1, h: 1, power: 1, spill: 1 } }, practice };
  expect(parseFixedRows(payload).practice).toEqual(practice);
  expect(() => parseFixedRows({ ...payload, update: 'run()' })).toThrow();
  expect(() => parseFixedRows({ ...payload, practice: { ...practice, hooks: [{ pad: 'start', x: 'bad', y: 0, z: 0 }] } })).toThrow();
  expect(() => parseFixedRows({ ...payload, practice: { ...practice, course: { ...course, update: 'run()' } } })).toThrow();
});
