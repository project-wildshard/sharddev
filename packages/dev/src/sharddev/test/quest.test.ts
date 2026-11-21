import { describe, expect, it } from 'vitest';
import { authoredQuest, questFlags } from './quest';

// SHARD-COMPAT CP18b: an authored quest walks its steps on flags alone, with no built folder.
const quest = {
  id: 'demo.cup',
  name: 'Demo Cup',
  completeFlag: 'demo.done',
  startWhen: { all: ['demo.entered'] },
  steps: [
    { id: 'licence', text: 'Get the licence', done: { all: ['demo.licensed'] }, markers: [] },
    { id: 'race', text: 'Win the race', done: { all: ['demo.won'] }, markers: [] },
  ],
};

describe('authoredQuest', () => {
  it('starts on its startWhen flags and completes on its steps', () => {
    const flags = questFlags('demo', ['demo.entered']);
    const state = authoredQuest(quest as never, flags);
    try {
      expect(state.current?.id).toBe('licence');
      flags.set('demo.licensed');
      expect(state.current?.id).toBe('race');
      flags.set('demo.won');
      expect(state.isComplete).toBe(true);
      expect(flags.has('demo.done')).toBe(true);
    } finally {
      state.dispose();
    }
  });
});
