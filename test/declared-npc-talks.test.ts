// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import * as v from 'valibot';
import { Group, Vector3 } from 'three';
import { QuestNpcBindingsSchema, questNpcBindingRules } from '@wildshard/format/npcs';
import { installDeclaredNpcTalks, type QuestNpcTalkPorts } from '../src/client/game/plugin/ui';
import { Scope } from '../src/shared/engine/app/scope';
import { DialogueBox } from '../src/client/engine/quest/view/ui';
import { Flags } from '../src/shared/engine/world/interact/flags';
import { pineQuestNpcs } from '../src/shards/pine-hollow/generators/questNpcs';
import { QUEST_NPCS } from '../src/shards/driftwood-isle/generators/questNpcs';
import { parseQuestData } from '../src/sharddev/quests';
import { DRIFTWOOD_QUESTS } from '../src/shards/driftwood-isle/generators/quests';

// GR8: called, not read from a scheduler job's output
const pinePeople = pineQuestNpcs();

test('the two native talk rosters admit only declared flags and bounded reading policies', () => {
  const rows = v.parse(QuestNpcBindingsSchema, pineQuestNpcs().rows);
  expect(rows.map(row => row.npc.id)).toEqual(['ranger', 'miller', 'trader']);
  expect(questNpcBindingRules(rows, parseQuestData(pinePeople.quests).flags, true)).toEqual([]);
  expect(questNpcBindingRules(v.parse(QuestNpcBindingsSchema, QUEST_NPCS), DRIFTWOOD_QUESTS.flags, true)).toEqual([]);
  const first = rows[0];
  if (first === undefined || !('kind' in first)) throw new Error('Missing posed ranger');
  for (const invalid of [
    { ...first, install: { ...first.install, radius: 0 } },
    { ...first, install: { ...first.install, bark: { enter: 16, leave: 7 } } },
    { ...first, install: { ...first.install, file: '../escape' } },
    { ...first, unknown: true }, { ...first, yaw: undefined },
  ]) expect(v.safeParse(QuestNpcBindingsSchema, [invalid]).success).toBe(false);
  expect(v.safeParse(QuestNpcBindingsSchema, [first, first]).success).toBe(false);
  expect(questNpcBindingRules(rows, [], true)).toContain('undeclared quest NPC flag errand:paid');
});

test('root talk completion preserves paid saves, native ownership and update order', () => {
  const scope = new Scope('declared-npc-talks'), dialogue = new DialogueBox(scope), flags = new Flags('declared-npc-talks', false);
  const scene = new Group(), events: string[] = [];
  const make = () => ({ group: new Group(), collider: { x: 0, z: 0, hw: 0.3, hd: 0.3, rot: 0, yTop: 2, yBottom: 0 }, talking: false, head: new Vector3(0, 1, 0) });
  type Figure = ReturnType<typeof make>;
  const figures: QuestNpcTalkPorts<Figure>['figures'] = new Map(['ranger', 'miller', 'trader', 'castaway'].map(kind => [kind, kind === 'castaway' ? {
    kind: 'borrowed',
    create: () => { events.push(`create:${kind}`); return make(); },
    at: (fig: Figure) => fig.head,
    advance: () => { events.push(`advance:${kind}`); },
    bark: () => { events.push(`bark:${kind}`); }, open: () => { events.push(`open:${kind}`); },
    own: (_fig: Figure, register: () => void) => { events.push(`own:${kind}`); register(); },
    stow: (on: boolean) => { events.push(`stow:${on}`); },
    approach: { at: (fig: Figure) => fig.head, run: () => { events.push('approach'); } },
  } : { kind: 'posed', create: (at: { x: number; y: number; z: number }, yaw: number) => {
    events.push(`create:${kind}`); const figure = make(); figure.group.position.set(at.x, at.y, at.z); figure.group.rotation.y = yaw;
    return { ...figure, talkPoint: figure.head, update: () => { events.push(`advance:${kind}`); }, lod: () => { events.push(`lod:${kind}`); } };
  }, bark: () => { events.push(`bark:${kind}`); } }]));
  const ports: QuestNpcTalkPorts<Figure> = { figures, dialogue: () => dialogue, flags, scene, prompts: [],
    registry: { add: piece => { events.push(`register:${piece.id}`); return piece; } }, groundAt: () => 3,
    calls: new Map([['pay-miller', () => { events.push('paid'); flags.set('errand:paid'); }], ['trade', () => { events.push('trade'); }]]) };
  const source = { questNpcs: v.parse(QuestNpcBindingsSchema, pineQuestNpcs().rows) };
  try {
    expect(() => installDeclaredNpcTalks(source, { ...ports, calls: new Map() })).toThrow('Unbound');
    expect(() => installDeclaredNpcTalks(source, { ...ports, figures: new Map() })).toThrow('Unbound');
    expect(() => installDeclaredNpcTalks({ questNpcs: [] }, ports)).toThrow('Missing');
    expect(scene.children).toHaveLength(0); expect(ports.prompts).toHaveLength(0);
    const people = installDeclaredNpcTalks(source, ports), miller = people[1], trader = people[2];
    if (miller === undefined || trader === undefined) throw new Error('Missing people');
    expect(events.filter(event => event.startsWith('register:'))).toEqual(['register:npc-ranger', 'register:npc-miller', 'register:npc-trader']);
    expect(miller.fig.group.position.y).toBe(3);
    expect(trader.prompt.position.y).toBe(4.4);
    flags.set('errand:done');
    miller.prompt.onInteract();
    for (let step = 0; step < 32; step++) dialogue.advance();
    expect(flags.has('errand:paid')).toBe(true); expect(events.filter(event => event === 'paid')).toHaveLength(1);
    const saved = flags.all; flags.reset(); flags.restore(saved);
    miller.prompt.onInteract(); for (let step = 0; step < 32; step++) dialogue.advance();
    expect(events.filter(event => event === 'paid')).toHaveLength(1);
    const castaway = installDeclaredNpcTalks({ questNpcs: v.parse(QuestNpcBindingsSchema, QUEST_NPCS) }, ports)[0];
    if (castaway === undefined) throw new Error('Missing castaway');
    expect(castaway.prompt.position).toBe(castaway.fig.head);
    events.length = 0; castaway.prompt.onInteract(); castaway.update(0.1, 1, new Vector3());
    expect(events).toEqual(['open:castaway', 'advance:castaway', 'stow:true', 'approach']);
    castaway.update(0.1, 2, new Vector3(100, 0, 0));
    expect(castaway.fig.talking).toBe(false); expect(events.at(-1)).toBe('stow:false');
  } finally { dialogue.dispose(); scope.dispose(); }
});
