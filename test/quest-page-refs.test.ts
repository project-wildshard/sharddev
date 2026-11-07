import { originalSkyMovers } from './fixtures/sky-movers';
import { originalSkyNavigation } from './fixtures/sky-navigation';
import { QUEST_HOST as SIGNAL_HOST } from '../src/shards/sunscar-dunes/generators/questHost';
import { QUEST_HOST as SKY_HOST } from '../src/shards/far-reach/generators/questHost';
import { QuestState } from '../src/shared/engine/quest/core';
import { publishBoundQuest } from '../src/shared/game/quest/boundState';
import { EmitterPresentation } from '../src/client/game/shardfile/lightEmitters';
import { parseLightEmitters } from '@wildshard/format/lightEmitters';
import { client as SIGNAL_CLIENT_PLAN, signalProductRows } from './fixtures/sunscar-source-program';
import { skyProductRows } from '../src/shards/far-reach/generators/product';
import { expect, test } from 'vitest';
import { Group, Vector3 } from 'three';
import { Scope } from '../src/shared/engine/app/scope';
import { Flags } from '../src/shared/engine/world/interact/flags';
import type { Interactable } from '../src/shared/engine/world/interact/types';
import { parseDeclaredQuestPage } from '@wildshard/format/declaredQuestPage';
import { parseShardfile } from '@wildshard/format/shardSchema';
import { parseWorldTargets } from '@wildshard/format/worldTargets';
import { bindDeclaredPage } from '../src/client/game/quest/declaredPage';
import { SceneHandles } from '../src/client/game/shardfile/sceneHandles';
import { createShardProduct } from '../src/shared/game/shardfile/shardProduct';
import type { ShardContext } from '../src/client/game/plugin/context';

const signal = signalProductRows();
const sky = skyProductRows(originalSkyNavigation(), originalSkyMovers());

const page = { version: 1, quest: 'sunscar.signal', prompts: [
  { id: 'read', action: 'read', label: 'Read', at: { point: 'place.read-at' }, radius: 2.4 },
], actions: [
  { id: 'read', interaction: 'logbook', after: [{ kind: 'visible', part: 'place.jar', value: false }, { kind: 'label', prompt: 'read', text: 'Read again' }] },
  { id: 'gate', needs: [{ all: ['sunscar.oil'], else: 'oil' }], denied: { oil: 'Find oil' }, after: [{ kind: 'visible', part: 'place.jar', value: false }] },
], initial: [{ when: { all: ['sunscar.logbook'] }, effects: [{ kind: 'visible', part: 'place.jar', value: false }, { kind: 'label', prompt: 'read', text: 'Read again' }] }] };

function fixture() {
  const scope = new Scope('declared-page'), flags = new Flags('declared-page', false), handles = new SceneHandles();
  const jar = new Group(), interactables: Interactable[] = [], toasts: string[] = [];
  handles.publish('place.read-at', new Vector3(1, 2, 3)); handles.publish('place.jar', jar);
  const source = parseShardfile(signal);
  const product = createShardProduct({ slug: source.identity.slug, revision: 1, shardfile: source,
    sections: new Map([['world/targets', parseWorldTargets({ targets: [], spots: [] })]]), files: new Map(),
    read: () => Promise.reject(new Error('The quest fixture declares no asset')) });
  const ctx = { scope, product,
    game: { runtime: { interactables, play: { hud: { toast: (text: string) => { toasts.push(text); } } } } } } as ShardContext;
  return { ctx, scope, flags, handles, jar, interactables, toasts };
}

test('scene refs use the native rules and retain prompt order through old-save restore', () => {
  for (const restored of [false, true]) {
    const f = fixture();
    try {
      if (restored) f.flags.restore(['sunscar.logbook']);
      const bound = bindDeclaredPage(f.ctx, page, { flags: f.flags, handles: f.handles, channelPrompts: new Map() });
      expect(f.interactables).toEqual([...bound.prompts.values()]);
      expect(bound.prompts.get('read')?.position.toArray()).toEqual([1, 2, 3]);
      expect(f.jar.visible).toBe(!restored);
      expect(bound.run('gate')).toBe(false); expect(f.toasts).toEqual(['Find oil']);
      expect(f.flags.has('sunscar.oil')).toBe(false);
      expect(bound.run('read')).toBe(!restored);
      expect(f.flags.has('sunscar.logbook')).toBe(true); expect(f.jar.visible).toBe(false);
      expect(bound.prompts.get('read')?.label).toBe('Read again');
      f.scope.dispose(); expect(f.interactables).toEqual([]);
      expect(() => bound.run('read')).toThrow('disposed');
    } finally { f.scope.dispose(); }
  }
});

test('a missing publication refuses before restore changes a mesh or registers prompts', () => {
  const f = fixture();
  try {
    f.flags.restore(['sunscar.logbook']);
    const invalid = { ...page, initial: [{ when: { all: ['sunscar.logbook'] }, effects: [
      { kind: 'visible', part: 'place.jar', value: false }, { kind: 'light', part: 'place.missing', intensity: 14 },
    ] }] };
    expect(() => bindDeclaredPage(f.ctx, invalid, { flags: f.flags, handles: f.handles, channelPrompts: new Map() })).toThrow('Missing world scene handle');
    expect(f.jar.visible).toBe(true); expect(f.interactables).toEqual([]);
    expect(() => parseDeclaredQuestPage({ ...page, prompts: [{ ...page.prompts[0], at: { owner: 'world', path: ['jar'] } }] })).toThrow();
  } finally { f.scope.dispose(); }
});

function nativePageFixture(input: typeof signal, questHost: typeof SIGNAL_HOST | typeof SKY_HOST, restored: string[] = []) {
  const source = parseShardfile({ ...input, questHost }), rows = source.questHost?.page;
  if (rows === undefined || !('version' in rows)) throw new Error('Missing typed page');
  const scope = new Scope('native-page-rules'), flags = new Flags('native-page-rules', false), handles = new SceneHandles();
  flags.restore(restored);
  const quest = source.quests.quests.find(row => row.id === rows.quest);
  if (quest === undefined) throw new Error('Missing native quest');
  publishBoundQuest(scope, new QuestState(quest, flags));
  for (const prompt of rows.prompts) if (!('channel' in prompt) && 'point' in prompt.at) handles.publish(prompt.at.point, new Vector3());
  const jar = new Group(); handles.publish('well.jar', jar);
  for (let i = 0; i < 3; i++) handles.publish(`brazier.${String(i)}.oil`, new Group());
  const groups = new Map(['signal', 'brazier.0', 'brazier.1', 'brazier.2'].map(id => [id, new Group()]));
  for (const [id, group] of groups) handles.publish(id, group);
  const product = createShardProduct({ slug: source.identity.slug, revision: 1, shardfile: source,
    sections: new Map<string, unknown>([['world/targets', parseWorldTargets({ targets: [], spots: [] })], ['client/plan', SIGNAL_CLIENT_PLAN]]), files: new Map(),
    read: () => Promise.reject(new Error('The rule fixture declares no asset')) });
  const toasts: string[] = [], stages: string[] = [], interactables: Interactable[] = [];
  let up = false;
  const motion = { atEnd: (_id: string) => up, field: () => undefined };
  const ctx = { scope, product, root: new Group(),
    game: { runtime: { interactables, play: { hud: { toast: (text: string) => { toasts.push(text); } } } } } } as ShardContext;
  const emitters = new EmitterPresentation(parseLightEmitters({ version: 1, input: 'firelights', clock: 'firetime',
    rows: [...groups.keys()].map(id => ({ id, parent: id, initially: false, draws: [] })) }), handles, ctx, scope, new Map());
  const channelPrompts = new Map([['sunscar.well.prompt', { label: 'Well', position: new Vector3(), radius: 2, onInteract: () => undefined }]]);
  const bind = () => bindDeclaredPage(ctx, rows, { flags, handles, motion, channelPrompts, stages: { advance: id => { stages.push(id); } } });
  return { scope, flags, jar, groups, stages, toasts, emitters, bind, raise: () => { up = true; } };
}

test('Signal typed page retains crank permissions, all waymark effects and old-save continuation', () => {
  const f = nativePageFixture(signal, SIGNAL_HOST);
  try {
    const bound = f.bind();
    expect(bound.run('well')).toBe(false); expect(f.jar.visible).toBe(true);
    expect(bound.run('crank')).toBe(true);
    expect(bound.run('well')).toBe(true); expect(f.jar.visible).toBe(false);
    expect(bound.run('crank')).toBe(false); expect(bound.run('well')).toBe(false);
    expect(bound.run('fire')).toBe(false);
    for (let i = 0; i < 3; i++) { expect(bound.run(`pour.${String(i)}`)).toBe(true); expect(bound.run(`light.${String(i)}`)).toBe(true); }
    expect([...f.groups.values()].slice(1).every(group => group.visible)).toBe(true);
    expect(bound.run('fire')).toBe(true); expect(f.stages).toHaveLength(1);
    expect(bound.run('fire')).toBe(false); expect(f.stages).toHaveLength(1);
    f.jar.visible = true; for (const id of f.groups.keys()) f.emitters.set(id, false);
    const restored = f.bind();
    expect(f.jar.visible).toBe(false); expect([...f.groups.values()].every(group => group.visible)).toBe(true);
    expect(restored.run('fire')).toBe(false); expect(f.stages).toHaveLength(1);
    f.flags.restore(['sunscar.lit']); for (const id of f.groups.keys()) f.emitters.set(id, false);
    const oldSave = f.bind();
    expect(f.groups.get('signal')?.visible).toBe(true); expect(f.groups.get('brazier.0')?.visible).toBe(false);
    expect(oldSave.run('fire')).toBe(false); expect(f.flags.all).toEqual(['sunscar.lit']); expect(f.stages).toHaveLength(1);
  } finally { f.scope.dispose(); }
});

test('Sky typed notes and winch keep both permissions and do not command a raised bridge', () => {
  const f = nativePageFixture(sky, SKY_HOST);
  try {
    const bound = f.bind();
    expect(bound.run('notes')).toBe(true); expect(f.flags.has('far.notes')).toBe(true);
    expect(bound.run('winch')).toBe(false);
    f.flags.set('far.roost'); f.flags.set('far.vanes');
    expect(bound.run('winch')).toBe(true);
    f.raise(); expect(bound.run('winch')).toBe(false);
  } finally { f.scope.dispose(); }
});
