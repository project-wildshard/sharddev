// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { Group, Vector3 } from 'three';
import { installNpcTalk } from '../src/client/game/plugin/ui';
import { Flags } from '../src/shared/engine/world/interact/flags';
import { DialogueBox } from '../src/client/engine/quest/view/ui';
import { Scope } from '../src/shared/engine/app/scope';
import type { NpcDef } from '../src/shared/engine/quest/core';
import type { Piece } from '../src/client/engine/world/registry';
import type { Interactable } from '../src/shared/engine/world/interact/types';
import { QUEST_NPCS } from '../src/shards/pine-hollow/generators/questTalkPolicy';
import { CASTAWAY_TALK } from '../src/shards/driftwood-isle/generators/questNpcs';

test('NPC installation borrows reading, saved flags and original frame order; invalid rows have no effects', () => {
  const scope = new Scope('npc-installation-test');
  const dialogue = new DialogueBox(scope), flags = new Flags('npc-installation', false), scene = new Group();
  const events: string[] = [], prompts: Interactable[] = [];
  const npc: NpcDef = { id: 'talk', name: 'Old friend', dialogue: [{ when: { none: ['met'] }, lines: ['Hello.'], sets: ['met'] }] };
  const figure = () => ({ group: new Group(), collider: { x: 0, z: 0, hw: 0.3, hd: 0.3, rot: 0, yTop: 2, yBottom: 0 }, talking: false, head: new Vector3(0, 1, 0) });
  let dialogueReads = 0, made = false;
  const ports = { npc, dialogue: () => { dialogueReads++; return dialogue; }, flags, scene, prompts,
    create: () => { made = true; return figure(); }, registry: { add: <P extends Piece>(piece: P): P => { events.push('register'); return piece; } },
    at: (fig: ReturnType<typeof figure>) => fig.head,
    advance: () => { events.push('figure'); }, bark: () => { events.push('bark'); }, open: () => { events.push('open'); }, done: () => { events.push('done'); } };
  try {
    expect(() => installNpcTalk({ ...QUEST_NPCS.ranger, radius: -1 }, ports)).toThrow();
    expect(() => installNpcTalk({ ...QUEST_NPCS.ranger, file: '../outside' }, ports)).toThrow();
    const { bark: _bark, ...noBark } = ports;
    expect(() => installNpcTalk(QUEST_NPCS.ranger, noBark)).toThrow();
    expect(made).toBe(false); expect(scene.children).toEqual([]); expect(prompts).toEqual([]);
    const ranger = installNpcTalk(QUEST_NPCS.ranger, ports);
    expect(dialogueReads).toBe(0); expect(ranger.prompt.position).not.toBe(ranger.fig.head);
    expect(prompts).toContain(ranger.prompt); expect(ranger.prompt.label).toBe('Talk to Hale');
    events.length = 0; ranger.update(0.1, 1, new Vector3(0, 1, 1)); expect(events).toEqual(['figure', 'bark']);
    events.length = 0; ranger.update(0.1, 2, new Vector3(0, 1, 2)); expect(events).toEqual(['figure']);
    ranger.update(0.1, 3, new Vector3(0, 1, 30));
    events.length = 0; ranger.update(0.1, 4, new Vector3(0, 1, 1)); expect(events).toEqual(['figure', 'bark']);
    ranger.prompt.onInteract(); expect(dialogue.isOpen).toBe(true); expect(ranger.fig.talking).toBe(true);
    expect(events).toContain('open'); dialogue.advance(); dialogue.advance();
    expect(dialogue.isOpen).toBe(false); expect(flags.has('met')).toBe(true); expect(events).toContain('done');
    const saved = flags.all, restored = new Flags('npc-restored', false); restored.restore(saved);
    const loaded = installNpcTalk(QUEST_NPCS.trader, { ...ports, flags: restored });
    events.length = 0; loaded.prompt.onInteract(); expect(dialogue.isOpen).toBe(false); expect(events).toEqual(['done']);
    restored.clear('met'); loaded.prompt.onInteract(); loaded.update(0.1, 5, new Vector3(30, 1, 0));
    expect(dialogue.isOpen).toBe(false); expect(restored.has('met')).toBe(false);

    const castaway = installNpcTalk(CASTAWAY_TALK, { ...ports, npc: { ...npc, dialogue: [{ lines: ['Stay awhile.'] }] },
      own: (_fig, register) => { events.push('owner'); register(); },
      stow: on => { events.push(on ? 'stow' : 'unstow'); },
      approach: { at: fig => fig.group.position, run: () => { events.push('wave'); } } });
    expect(castaway.prompt.position).toBe(castaway.fig.head);
    castaway.prompt.onInteract(); events.length = 0;
    castaway.update(0.1, 6, new Vector3()); expect(events).toEqual(['figure', 'stow', 'wave']);
    events.length = 0; castaway.update(0.1, 7, new Vector3()); expect(events).toEqual(['figure']);
    events.length = 0; castaway.update(0.1, 8, new Vector3(50, 0, 0)); expect(events).toEqual(['figure', 'unstow']);
    expect(castaway.fig.talking).toBe(false);
  } finally { dialogue.dispose(); scope.dispose(); }
});
