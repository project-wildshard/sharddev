// Meta MOSSGATE-ZONE MZ31 (QA 11-19 row 35, "I'm setting these lanterns and nothing happens"): world.questStep and
// world.questPayoff land a quest's beats where they happen (format 0.56 `feedback` and `onComplete.payoff`); a payoff's
// reveal is a shared flag its completion scene raises, which a panel shows.
import * as THREE from 'three';
import { expect, test } from 'vitest';
import { parseQuestData } from '@wildshard/format/quests';
import { lowerShard } from './lower';
import { withAnchored } from './shardfile';

const QUESTS = {
  flags: ['lamp.accepted', 'lamp.a', 'lamp.done'], triggers: [], dialogue: [],
  quests: [{ id: 'lamp', title: 'Relight', completeFlag: 'lamp.done', startWhen: { all: ['lamp.accepted'] },
    steps: [{ id: 'a', objective: 'Light brazier A', done: { all: ['lamp.a'] } }], onComplete: { fact: 'lamp', coins: 25 } }],
};
type World = Parameters<Parameters<typeof lowerShard>[1]>[0];
const at = (world: World, x: number, y: number, z: number): THREE.Object3D => { const o = new THREE.Object3D(); o.position.set(x, y, z); world.scene.add(o); return o; };

test('a step lands at its node and a payoff reveals a shared flag its completion scene raises', () => {
  const scene = lowerShard({ slug: 's', name: 's' }, (world) => {
    world.questStep('lamp', 'a', at(world, 4, 1.25, -6), { colour: '#ffa040', radius: 6, sound: 'ignite' });
    world.questPayoff('lamp', at(world, 0, 0.5, 2), { next: 'Ask the Pond Hermit about the gate', reveal: 'lamp.hollow-lit' });
    world.part('lanterns', (part) => { part.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())); },
      { panel: 's.lanterns', shownWhen: { field: 'lamp.hollow-lit', equals: true } });
  });
  expect(scene.anchored.writes).toEqual([{ use: 'lamp.payoff', field: 'lamp.hollow-lit', scope: 'shared', kind: 'bool', value: 1 }]);
  const data = parseQuestData(withAnchored({ quests: QUESTS }, scene.anchored).quests as unknown);
  const [quest] = data.quests;
  expect(quest?.steps[0]?.feedback).toEqual({ at: { x: 4, y: 1.25, z: -6 }, colour: '#ffa040', radius: 6, sound: 'ignite' });
  expect(quest?.onComplete).toEqual({ fact: 'lamp', coins: 25, scene: 'lamp.payoff', payoff: { at: { x: 0, y: 0.5, z: 2 }, next: 'Ask the Pond Hermit about the gate' } });
});

test('a beat refuses a recording, a stray quest or step, a payoff field on a step, and a second landing', () => {
  const lower = (build: (world: World) => void): unknown => withAnchored({ quests: QUESTS }, lowerShard({ slug: 's', name: 's' }, build).anchored);
  expect(() => lower((w) => { w.questStep('lamp', 'a', at(w, 0, 0, 0), { sound: 'fanfare' as 'chime' }); })).toThrow(/not one of the engine's voices/u);
  expect(() => lower((w) => { w.questStep('lamp', 'z', at(w, 0, 0, 0)); })).toThrow(/has no step z/u);
  expect(() => lower((w) => { w.questPayoff('nope', at(w, 0, 0, 0)); })).toThrow(/no quest nope in extend/u);
  expect(() => lower((w) => { w.questStep('lamp', 'a', at(w, 0, 0, 0), { next: 'x' } as never); })).toThrow(/only a quest's payoff/u);
  expect(() => lower((w) => { w.questStep('lamp', 'a', at(w, 0, 0, 0)); w.questStep('lamp', 'a', at(w, 1, 0, 0)); })).toThrow(/lands twice/u);
  expect(() => lower((w) => { w.questStep('lamp', 'a', at(w, 0, 0, 0), { radius: 90 }); })).toThrow(/outside 1 to 40/u);
});
