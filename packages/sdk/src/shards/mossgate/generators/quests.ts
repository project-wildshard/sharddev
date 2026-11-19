// TEMPLATE-E2E TR-2 (J434): the starter's one quest, so a new repo's proof tape has a fact to earn. Walking to the hut
// door enters the `hut.door` region (the scene's `world.trigger`, at the door node in world.ts); the quest then pays
// and files `hut.visit`, the fact `src/proof.json` requires.
export const QUESTS = {
  flags: ['hut.door', 'hut.visit'], triggers: [], dialogue: [],
  quests: [{ id: 'hut.visit', title: 'The hut', completeFlag: 'hut.visit',
    steps: [{ id: 'door', objective: 'Walk up to the hut door', done: { all: ['hut.door'] } }],
    onComplete: { fact: 'hut.visit', coins: 5 } }],
};
