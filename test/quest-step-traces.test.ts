import { expect, test } from 'vitest';
import { QuestState } from '../src/shared/engine/quest/core';
import { Flags } from '../src/shared/engine/world/interact/flags';
import { PINE_QUESTS } from '../src/shards/pine-hollow/generators/quests';
import { DRIFTWOOD_QUESTS } from '../src/shards/driftwood-isle/generators/quests';
import traces from './fixtures/quest-step-traces.json' with { type: 'json' };

// Recorded from the original owners before introducing the step runner. Preserve order as well as set membership.
for (const [slug, data] of [['pine-hollow', PINE_QUESTS], ['driftwood-isle', DRIFTWOOD_QUESTS]] as const)
  test(`${slug}: recorded chapter transitions, rewards, flags and legacy save bytes`, () => {
    const definition = data.quests[0];
    if (definition === undefined) throw new Error('Missing recorded chapter');
    const flags = new Flags(slug, false), quest = new QuestState(definition, flags);
    const frames: unknown[] = [], steps: unknown[] = [], rewards: unknown[] = [];
    quest.observe({ step: (step, previous) => { steps.push({ step: step?.id ?? null, previous: previous?.id ?? null }); },
      complete: () => { rewards.push(definition.onComplete); } });
    const capture = (): void => {
      const bytes = JSON.stringify(quest.snapshot());
      const restoredFlags = new Flags(`restored.${slug}`, false); restoredFlags.restore(flags.all);
      const restored = new QuestState(definition, restoredFlags);
      try { restored.restore(quest.snapshot()); expect(JSON.stringify(restored.snapshot())).toBe(bytes); }
      finally { restored.dispose(); }
      frames.push({ flags: flags.all, save: bytes, objective: quest.objective() });
    };
    try {
      capture();
      for (const flag of definition.startWhen?.all ?? []) { flags.set(flag); capture(); }
      for (const step of definition.steps) for (const flag of step.done.all ?? []) { flags.set(flag); capture(); }
      expect({ frames, steps, rewards }).toEqual(traces[slug]);
    } finally { quest.dispose(); }
  });
