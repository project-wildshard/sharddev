// FORMAT-PRUNE FP49: world.field and world.emitter lower to a scene shard's page plan (format `client/plan`): one
// `weather.fields` row over a quest's flags and one `light.emitters` row of lights the page owns, never look lamps.
import * as THREE from 'three';
import { expect, test } from 'vitest';
import { parseClientPlan } from '@wildshard/format/clientPlan';
import { flicker, animate } from './author';
import { lowerShard } from './lower';
import { EMITTER_CLOCK, SCENE_FIELD_BASE, scenePagePlan, withPageFields } from './shardfile';

const lanterns = ['fen.lantern.1', 'fen.lantern.2'];
const build = (field?: string) => (world: Parameters<Parameters<typeof lowerShard>[1]>[0]): void => {
  world.field('fen.glow', { quest: 'fen.lit', else: 0.25, rate: 0.2, steps: [{ when: { all: ['fen.lit'] }, value: 1 }, { when: { count: { of: lanterns, atLeast: 1 } }, value: 0.6 }] });
  world.part('shrine', (part) => {
    const light = new THREE.PointLight(new THREE.Color('#7fe8ff'), 18, 22, 2); light.position.set(0, 4.6, -70);
    part.add(animate(light, flicker({ rate: 0.4, amount: 0.15 })));
    world.emitter('fen.shrine', light, field === undefined ? {} : { field });
    part.add(new THREE.PointLight(new THREE.Color('#ffb347'), 8, 12, 2));
  });
};

test('a field and an emitter lower to anchored rows; the emitter light leaves the look lamps', () => {
  const scene = lowerShard({ slug: 'fen', name: 'Fen' }, build('fen.glow'));
  expect(scene.anchored.fields).toEqual([{ id: 'fen.glow', quest: 'fen.lit', min: 0, max: 1, else: 0.25, rate: 0.2,
    steps: [{ when: { all: ['fen.lit'] }, value: 1 }, { when: { count: { of: lanterns, atLeast: 1 } }, value: 0.6 }] }]);
  const [emitter] = scene.anchored.emitters ?? [];
  expect(emitter).toMatchObject({ id: 'fen.shrine', at: [0, 4.6, -70], colour: 0x7f_e8_ff, distance: 22, decay: 2, initially: true, field: 'fen.glow' });
  // the look lamp's flicker curve, as two waves over a lowered base
  expect(emitter?.gain).toBeCloseTo(18 * (1 - 0.075), 3);
  expect(emitter?.waves).toHaveLength(2);
  const lamps = scene.parts.flatMap((part) => part.lights.filter((light) => light.kind === 'point'));
  expect(lamps.map((lamp) => lamp.intensity)).toEqual([8]);
});

test('the page plan carries both rows; without a field the format admits it today', () => {
  const plain = scenePagePlan(lowerShard({ slug: 'fen', name: 'Fen' }, build()).anchored);
  const plan = parseClientPlan(plain);
  expect(plan.features.map((feature) => feature.kind)).toEqual(['weather.fields', 'light.emitters']);
  const emitters = plan.features.find((feature) => feature.kind === 'light.emitters');
  expect(emitters?.kind === 'light.emitters' ? emitters.rows.clock : null).toBe(EMITTER_CLOCK);
  const followed = scenePagePlan(lowerShard({ slug: 'fen', name: 'Fen' }, build('fen.glow')).anchored) as { features: { kind: string; rows: { rows?: { field?: string }[] } }[] };
  expect(followed.features[1]?.rows.rows?.[0]?.field).toBe('fen.glow');
  expect(scenePagePlan({ triggers: [], interactions: [] })).toBeNull();
});

test('an emitter must follow a declared field, and a field keeps every value in its range', () => {
  expect(() => lowerShard({ slug: 'fen', name: 'Fen' }, (world) => {
    const light = new THREE.PointLight(); world.scene.add(light); world.emitter('fen.lamp', light, { field: 'fen.none' });
  })).toThrow(/no world.field declares/u);
  expect(() => lowerShard({ slug: 'fen', name: 'Fen' }, (world) => {
    world.field('fen.glow', { quest: 'q', else: 2, rate: 1, steps: [] });
  })).toThrow(/outside 0 to 1/u);
});

test('the fields and the emitter clock are host f64 state past the scene lane ids', () => {
  const scene = lowerShard({ slug: 'fen', name: 'Fen' }, build('fen.glow'));
  const shard = withPageFields({ state: { shared: [{ id: 6001, name: 'fen.lights' }], player: [{ id: 6501, name: 'fen.fuel' }] } }, scene.anchored);
  expect(shard.state.shared.slice(1)).toEqual([
    { id: 6502, name: 'fen.glow', type: 'f64', privacy: 'host', default: 0.25, min: 0, max: 1 },
    { id: 6503, name: EMITTER_CLOCK, type: 'f64', privacy: 'host', default: 0, min: 0 },
  ]);
  expect(SCENE_FIELD_BASE).toBe(6501);
  const none = { state: { shared: [], player: [] } };
  expect(withPageFields(none, { triggers: [], interactions: [] })).toBe(none);
  expect(() => withPageFields({ state: { shared: [{ id: 1, name: 'fen.glow' }], player: [] } }, scene.anchored)).toThrow(/declared twice/u);
});
