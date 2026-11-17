import { expect, test } from 'vitest';
import hooks from '../behaviour/hooks.json' with { type: 'json' };
import layout from '../data/layout.json' with { type: 'json' };
import targets from '../data/targets.json' with { type: 'json' };

// TEMPLATE-E2E TC-M4: the lever by the yard's south wall swings the south gate. Its prompt's scene (event 205) reaches
// `behaviour/door.as`, which flips shared field 105; the gate panel and its collider stand while the field is 0.
test('the lever, its scene, the gate field and the gate panel line up', () => {
  expect(targets.lever.scene).toBe('template.lever.pull');
  expect(hooks.hooks.scenes.find(row => row.id === 'template.lever.pull')?.type).toBe(205);
  const ids = hooks.state.shared.map(row => row.id);
  expect(ids).toEqual([...ids].sort((a, b) => a - b)); // door.as reads shared fields by their place: 105 is the fifth
  expect(ids.indexOf(105)).toBe(4);
  expect(targets.rows.panels.find(row => row.panel === 'template.south-gate')).toMatchObject({ fieldId: 105, equals: 1, visibleWhenMatched: false, colliders: ['template.south-gate'] });
  const [[x0, z0], [x1]] = layout.YARD as [[number, number], [number, number]];
  expect(layout.LEVER.x).toBeGreaterThan(x0); expect(layout.LEVER.x).toBeLessThan(x1);
  expect(layout.LEVER.z - z0).toBeGreaterThan(1); expect(layout.LEVER.z - z0).toBeLessThan(3); // just inside the south wall
});
