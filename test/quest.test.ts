// src/game/*/quest/* — the quest state machine over flags, Driftwood's quest def (validated against the flags the
// interactables table raises), and the castaway's dialogue selection.
import { describe, expect, it, vi } from 'vitest';
import { Flags } from '../src/shared/engine/world/interact/flags';
import { flagsRaised } from '../src/shared/engine/world/interact/types';
import { DRIFTWOOD_INTERACT, SHARD_FLAGS } from '../src/shards/driftwood-isle/generators/interactables';
import { QuestState, lineFor, type QuestDef, type QuestStep } from '../src/shared/engine/quest/core';
import { validateQuest } from './fixtures/questValidation';
import { CASTAWAY, DRIFTWOOD_QUEST, QUEST_EXTERNAL } from '../src/shards/driftwood-isle/generators/questStory';

import { QUEST_DONE } from '../src/shards/driftwood-isle/generators/questConstants';

const raised = new Set<string>([...DRIFTWOOD_INTERACT.external, ...QUEST_EXTERNAL, ...DRIFTWOOD_INTERACT.rows.flatMap(flagsRaised)]);

describe('Driftwood quest def', () => {
  it('validates: unique steps, every flag it reads is raised by the table or declared external', () => {
    expect(validateQuest(DRIFTWOOD_QUEST, raised)).toEqual([]);
  });
  it('is the D5 spine: castaway → three shards → shrine → captain → the reward', () => {
    expect(DRIFTWOOD_QUEST.steps.map((s) => s.id)).toEqual(['shards', 'shrine', 'captain', 'reward']);
    expect(DRIFTWOOD_QUEST.startWhen).toEqual({ all: ['talked:castaway'] });
  });
});

describe('QuestState', () => {
  const play = () => {
    const flags = new Flags('chunk://test/quest', false);
    const q = new QuestState(DRIFTWOOD_QUEST, flags);
    const steps: (string | null)[] = [];
    q.onStep = (s: QuestStep | null) => { steps.push(s?.id ?? null); };
    const done = vi.fn<() => void>();
    q.onComplete = done;
    return { flags, q, steps, done };
  };

  it('before the castaway: the intro objective, the castaway marker, no step', () => {
    const { q } = play();
    expect(q.isStarted).toBe(false);
    expect(q.current).toBeNull();
    expect(q.index).toBe(-1);
    expect(q.objective()).toMatch(/fire on the plateau/);
    expect(q.markers().map((m) => m.id)).toEqual(['castaway']);
  });

  it('walks the whole spine, counting shards and hiding the markers of taken ones', () => {
    const { flags, q, steps, done } = play();
    flags.set('talked:castaway');
    expect(q.current?.id).toBe('shards');
    expect(q.objective()).toBe('Recover the glyph shards · 0 / 3');
    flags.set('shard:wreck');
    expect(q.objective()).toBe('Recover the glyph shards · 1 / 3');
    expect(q.markers().map((m) => m.id)).toEqual(['lookout', 'cave']);
    for (const s of SHARD_FLAGS) flags.set(s);
    expect(q.current?.id).toBe('shrine');
    flags.set('used:altar');
    expect(q.current?.id).toBe('captain');
    flags.set('dead:captain');
    expect(q.current?.id).toBe('reward');
    expect(done).not.toHaveBeenCalled();
    flags.set('seen:reward');
    expect(q.current).toBeNull();
    expect(q.isComplete).toBe(true);
    expect(flags.has(QUEST_DONE)).toBe(true);
    expect(done).toHaveBeenCalledTimes(1);
    expect(steps).toEqual(['shards', 'shrine', 'captain', 'reward', null]);
  });

  it('a flag that does not move the quest fires no step event', () => {
    const { flags, steps } = play();
    flags.set('talked:castaway');
    flags.set('glass:3'); flags.set('open:castaway-chest');
    expect(steps).toEqual(['shards']);
  });

  it('the HUD chip (E51): a short label and a separate counter; the markers carry short names', () => {
    const { flags, q } = play();
    expect(q.chip()).toEqual({ label: 'Who lit the fire?', count: '' });
    flags.set('talked:castaway');
    expect(q.chip()).toEqual({ label: 'Glyph shards', count: '0/3' });
    flags.set('shard:cave');
    expect(q.chip()).toEqual({ label: 'Glyph shards', count: '1/3' });
    expect(q.markers().map((m) => m.short)).toEqual(['LOOKOUT', 'WRECK']);
    for (const f of [...SHARD_FLAGS, 'used:altar', 'dead:captain', 'seen:reward']) flags.set(f);
    expect(q.chip()).toEqual({ label: 'Quest complete', count: '' });
  });

  it('a step without a chip label falls back to its objective minus the counter', () => {
    const flags = new Flags('chunk://test/chip', false);
    const def: QuestDef = { id: 'q', title: 'Q', completeFlag: 'q:done', steps: [{ id: 's', objective: 'Find the bells · {n} / {of}', count: ['b1', 'b2'], done: { all: ['b1', 'b2'] } }] };
    expect(new QuestState(def, flags).chip()).toEqual({ label: 'Find the bells', count: '0/2' });
  });

  it('resumes where a save left it', () => {
    const flags = new Flags('chunk://test/resume', false);
    for (const f of ['talked:castaway', ...SHARD_FLAGS]) flags.set(f);
    expect(new QuestState(DRIFTWOOD_QUEST, flags).current?.id).toBe('shrine');
  });
});

describe('castaway dialogue', () => {
  const at = (...set: string[]) => { const f = new Flags('chunk://test/talk', false); for (const s of set) f.set(s); return lineFor(CASTAWAY, f); };
  it('the intro first, and it is what starts the quest', () => {
    expect(at()?.sets).toEqual(['talked:castaway']);
  });
  it('then hints, then the shrine, the captain, the reward, the goodbye — the latest beat wins', () => {
    expect(at('talked:castaway')?.lines.join(' ')).toMatch(/flint/);
    expect(at('talked:castaway', ...SHARD_FLAGS)?.lines.join(' ')).toMatch(/Ring Shrine/);
    expect(at('talked:castaway', ...SHARD_FLAGS, 'used:altar')?.lines.join(' ')).toMatch(/Captain/);
    expect(at('talked:castaway', 'dead:captain')?.lines.join(' ')).toMatch(/stand in it/);
    expect(at(QUEST_DONE)?.lines.join(' ')).toMatch(/planet/);
  });
});

describe('validateQuest catches a broken quest', () => {
  it('duplicate step, an always-done step, an unknown flag', () => {
    const bad: QuestDef = {
      id: 'bad', title: 'Bad', completeFlag: 'quest:bad',
      steps: [
        { id: 'a', objective: 'A', done: { all: ['nowhere:x'] } },
        { id: 'a', objective: 'B', done: {} },
      ],
    };
    const errs = validateQuest(bad, raised).join('\n');
    expect(errs).toMatch(/duplicate step/);
    expect(errs).toMatch(/always done/);
    expect(errs).toMatch(/nowhere:x/);
  });
});
