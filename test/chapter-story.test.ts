// @vitest-environment happy-dom
import {lendNalatiKokpar} from './fixtures/nalati-kokpar-loan';
import { afterEach, expect, test, vi } from 'vitest';
import { Vector3 } from 'three';
import { App } from '../src/client/engine/app/app';
import { Scope } from '../src/shared/engine/app/scope';
import { createLevelInstallation } from '../src/client/engine/level/installation';
import { Flags } from '../src/shared/engine/world/interact/flags';
import { QuestLine, QuestState } from '../src/shared/engine/quest/core';
import type { MapQuest } from '../src/client/engine/ui/Map';
import { shardContext } from '../src/client/game/plugin/context';
import { RetainedRuntimeHooks } from '../src/client/game/shard/retainedHooks';
import { createShardProduct } from '../src/shared/game/shardfile/shardProduct';
import { bindStoryChapters, presentChapterStory } from '../src/client/game/quest/story';
import { parseChapterStoryPresentation } from '@wildshard/format/questStory';
import { parseQuestData } from '@wildshard/format/quests';
import content from '../src/shards/nalati-grasslands/data/questContent.json' with { type: 'json' };
import policy from '../src/shards/nalati-grasslands/data/chapterStory.json' with { type: 'json' };
import { preparedProductEnvelope } from './fixtures/prepared-product-envelope';
import { MANIFEST } from '../src/shards/_template/discovery.generated';
import { PAGE_STORY as PINE_STORY } from '../src/shards/pine-hollow/generators/pageStory';

import { buildQuestChapter } from '../src/client/game/quest/chapter';
import { bindAdventurePersistence } from '../src/shared/game/quest/persistence';
import { FigureRows } from '../src/client/game/systems/npc/figureRows';
import { SceneHandles } from '../src/client/game/shardfile/sceneHandles';
import { nalatiPersistenceRows } from '../src/shards/nalati-grasslands/generators/persistence';
import { publishBoundQuest } from '../src/shared/game/quest/boundState';
import { PINE_LIFE_ORIGINAL as pineProgram } from './fixtures/pine-life';
import pinePage from '../src/shards/pine-hollow/data/forestStory.json' with { type: 'json' };
import { NALATI_KOKPAR as kokpar } from './fixtures/nalati-kokpar';

const [nalatiEnvelope, driftEnvelope, pineEnvelope] = await Promise.all([
  preparedProductEnvelope('nalati-grasslands', () => false),
  preparedProductEnvelope('driftwood-isle', () => false),
  preparedProductEnvelope('pine-hollow', () => false),
]);
const nalati = nalatiEnvelope.shard, drift = driftEnvelope.shard, pine = pineEnvelope.shard;

const persistenceRows = nalatiPersistenceRows();

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

test('Nalati and Driftwood bind the same ordered states and replay completion facts once per bind', () => {
  for (const source of [nalati, drift]) {
    const scope = new Scope(`chapter-bind-${source.identity.slug}`), flags = new Flags(source.identity.slug, false);
    const product = createShardProduct({ slug: source.identity.slug, revision: 1, shardfile: source, sections: new Map(), files: new Map(),
      read: () => Promise.reject(new Error('No file needed for quest binding')) });
    const facts: string[] = [];
    try {
      const ids = source.quests.quests.map(q => q.id);
      const line = bindStoryChapters({ app: new App(), scope, product }, source, ids, { flags, facts: Object.assign((fact: string, entity: string) => {
        facts.push(`${fact}:${entity}`); return { id: `${fact}:${entity}`, status: 'granted' as const, recorded: true };
      }, { flush: () => true, achievement: () => undefined }) });
      const oracleFlags = new Flags(`${source.identity.slug}-oracle`, false), oracle = new QuestLine(parseQuestData(source.quests).quests, oracleFlags);
      const changes: string[] = [];
      line.onStep = (q, step) => { changes.push(`${q.def.id}:${step?.id ?? 'complete'}`); };
      line.onComplete = q => { changes.push(`done:${q.def.id}`); };
      try {
        for (const q of source.quests.quests) {
          for (const condition of [q.startWhen, ...q.steps.map(step => step.done)]) {
            for (const flag of condition?.none ?? []) { flags.clear(flag); oracleFlags.clear(flag); }
            for (const flag of condition?.all ?? condition?.any?.slice(0, 1) ?? []) {
              flags.set(flag); oracleFlags.set(flag);
              expect(line.chapters.map(state => state.snapshot())).toEqual(oracle.chapters.map(state => state.snapshot()));
              expect(line.active?.def.id).toBe(oracle.active?.def.id);
            }
          }
        }
        expect(line.active).toBeNull();
        expect(facts).toEqual(source.quests.quests.flatMap(q => q.onComplete?.fact === undefined ? [] : [`${q.onComplete.fact}:${q.id}`]));
        expect(changes.filter(entry => entry.startsWith('done:'))).toEqual(ids.map(id => `done:${id}`));
        flags.set('unrelated'); expect(new Set(facts).size).toBe(facts.length);
        expect(() => bindStoryChapters({ app: new App(), scope, product }, source, [ids[0] ?? '', ids[0] ?? ''], { flags })).toThrow('Invalid story chapters');
      } finally { oracle.dispose(); }
    } finally { scope.dispose(); }
  }
});

test('chapter presentation preserves messages, reward timing, discoveries and home exit ownership', () => {
  vi.useFakeTimers();
  const scope = new Scope('chapter-view'), app = new App(), flags = new Flags('chapter-view', false);
  const level = createLevelInstallation(app, scope, {}, () => ({ set: () => undefined, detail: () => undefined }));
  const context = shardContext(level.context, MANIFEST, { shard: MANIFEST, rows: new Map(), bag: { tab: () => () => undefined, fragment: () => () => undefined } });
  const retained = new RetainedRuntimeHooks(context), line = new QuestLine(parseQuestData(content.quests).quests, flags);
  const figures = Object.fromEntries(Object.keys(content.npcs).map(id => [id, { headWorld: new Vector3(), talking: false }]));
  const toasts: string[] = [], feats: string[] = [], order: string[] = [];
  let map: (() => MapQuest | null) | undefined;
  try {
    const presentation = presentChapterStory(line, parseChapterStoryPresentation(policy), { ctx: retained.context, scope, flags,
      figures, npcs: content.npcs, places: content.places, prompts: [], open: () => { order.push('open'); },
      toast: text => { toasts.push(text); }, sting: () => { order.push('sting'); }, feat: event => { feats.push(event); },
      fullMap: { setQuest: source => { map = source; }, setPois: () => undefined } });
    expect(map?.()?.title).toBe('Nalati Grasslands');
    presentation.installFeats();
    presentation.talk('elder'); expect(presentation.dialogue().isOpen).toBe(true);
    expect(order).toEqual(['open']); presentation.dialogue().close(false);
    presentation.places.update(88, 212); expect(flags.has('seen:nomad-camp')).toBe(true);
    flags.set('talked:elder'); expect(toasts.at(-1)).toBe('New quest · Tulpar');
    expect(map?.()?.title).toBe('Chapter 1 · Tulpar');
    flags.set('tamed:horse'); expect(toasts.at(-1)).toBe('Objective · Win a round of kokpar');
    flags.set('won:kokpar'); flags.set('told:tulpar');
    expect(line.chapters[0]?.isComplete).toBe(true);
    expect(feats).toContain('kokpar'); expect(feats).toContain('tulpar');
    const caption = document.querySelector('.ws-quest-reward');
    expect(caption?.textContent).toContain('Chapter 1 · complete');
    expect(caption?.textContent).toContain('Title earned · Formerly On Foot');
    expect(presentation.chip.line.root.classList.contains('ws-quest-hide')).toBe(true);
    vi.advanceTimersByTime(6499); expect(presentation.chip.line.root.classList.contains('ws-quest-hide')).toBe(true);
    vi.advanceTimersByTime(1); expect(presentation.chip.line.root.classList.contains('ws-quest-hide')).toBe(false);
    const dialogue = presentation.dialogue(); dialogue.open('Reading', ['A long story.'], () => undefined);
    const parent = presentation.chip.line.root.parentNode;
    retained.deactivate(); expect(dialogue.isOpen).toBe(false); expect(presentation.chip.line.root.parentNode).toBeNull();
    expect(() => presentation.dialogue()).toThrow('left its home');
    retained.activate(); expect(presentation.dialogue()).not.toBe(dialogue); expect(presentation.chip.line.root.parentNode).toBe(parent);
    expect(flags.has('seen:nomad-camp')).toBe(true); expect(line.active?.def.id).toBe('golden-king');
  } finally { line.dispose(); scope.dispose(); }
});

test('entered chapter rows preserve carving order and continue the same saved chapters', () => {
  const notices: string[] = [], changes: string[] = [], instance = 'chapter-story-continuation';
  const enter = () => {
    const scope = new Scope(instance), app = new App();lendNalatiKokpar(scope);
    const product = createShardProduct({ slug: nalati.identity.slug, revision: 1, shardfile: nalati,
      sections: new Map(), files: new Map(), read: () => Promise.reject(new Error('No file needed')) });
    const level = createLevelInstallation(app, scope, {}, () => ({ set: () => undefined, detail: () => undefined }));
    const ctx = shardContext(level.context, MANIFEST, { shard: MANIFEST, rows: new Map(), bag: { tab: () => () => undefined, fragment: () => () => undefined } }, product);
    const player = { position: new Vector3(), velocity: new Vector3(), yaw: 0, pitch: 0, carried: false };
    Object.defineProperty(ctx.game, 'runtime', { value: { world: { player }, interactables: [], play: {
      hud: { toast: (text: string) => { notices.push(text); } }, music: { sting: () => undefined },
      audio: { weaponSwap: () => undefined }, fullMap: { setQuest: () => undefined, setPois: () => undefined },
    } } });
    const saved = bindAdventurePersistence(ctx, nalati, persistenceRows, instance);
    for (const talk of policy.talks) new FigureRows(new SceneHandles({ setupMaterial: () => undefined }), {
      id: talk.figure, name: talk.id, feet: [0, 0, 0], yaw: 0, talkHeight: 1.5, pointAt: [0, 1.5, 0], points: false, rig: { skeleton: 'npc.test', clips: [], sockets: [] },
      joints: [], sockets: [], visible: [], drawDistance: 90,
    }, scope);
    const chapter = scope.run(() => buildQuestChapter(ctx, parseChapterStoryPresentation(policy), { content, program: kokpar.program }));
    scope.onDispose(saved.flags.onChange(flag => { changes.push(flag); }));
    return { scope, chapter, saved };
  };
  const first = enter();
  try {
    first.saved.flags.reset(); first.saved.elites.write({}); first.saved.bosses.write({});
    first.saved.flags.set('talked:elder');
    first.chapter.project('quest', { now: 0, bonded: 1, argymaq: 0, inside: 0, tied: 0 });
    first.saved.flags.set('won:kokpar'); first.saved.flags.set('told:tulpar'); first.saved.flags.set('talked:elder:2');
    expect(first.chapter.line?.active?.def.id).toBe('golden-king');
    expect(first.chapter.line?.active?.current?.id).toBe('clues');
    first.chapter.project('carving', { now: 0 });
    expect(first.saved.flags.has(content.clueFlags[0] ?? '')).toBe(true);
    expect(notices.at(-1)).toBe('A carving on its back · clue 1 / 3');
    expect(first.chapter.dialogueBox().isOpen).toBe(true);
    expect(changes.at(-1)).toBe(content.clueFlags[0]);
    first.chapter.dialogueBox().close(false);
    const snapshot = first.chapter.line?.chapters.map(state => state.snapshot());
    first.scope.dispose(); const resumed = enter();
    try {
      expect(resumed.chapter.line?.chapters.map(state => state.snapshot())).toEqual(snapshot);
      const before = changes.length;
      resumed.chapter.project('carving', { now: 0 });
      expect(changes.slice(before)).toEqual([content.clueFlags[1]]);
      resumed.chapter.dialogueBox().close(false);
      resumed.chapter.project('carving', { now: 0 });
      expect(resumed.chapter.line?.active?.current?.id).toBe('door');
      const after = changes.length; resumed.chapter.project('carving', { now: 0 });
      expect(changes.length).toBe(after);
      const bosses = vi.spyOn(resumed.saved.bosses, 'read').mockReturnValue({
        'golden-king': { defeated: true, rewardTaken: false, kills: 1 },
        'storm-titan': { defeated: true, rewardTaken: true, kills: 1 },
      });
      try {
        resumed.chapter.project('quest', { bonded: 0, argymaq: 0, inside: 0, tied: 0 });
        expect(changes.slice(after)).toEqual(['dead:golden-king', 'dead:jel-ata']);
        expect(resumed.chapter.line?.active?.current?.id).toBe('home');
      } finally { bosses.mockRestore(); }
      resumed.saved.flags.clear('dead:jel-ata');
      resumed.saved.flags.set('told:king'); resumed.saved.flags.set('talked:elder:3');
      expect(resumed.chapter.line?.active?.current?.id).toBe('feathers');
      const elite = { timer: 0, discovered: false, skinTaken: false, kills: 1, retired: false };
      const elites = vi.spyOn(resumed.saved.elites, 'read').mockReturnValue(Object.fromEntries(content.featherElites.map(row => [row.id, elite])));
      try {
        const beforeFeathers = changes.length, beforeNotices = notices.length;
        resumed.chapter.project('feathers', {});
        expect(changes.slice(beforeFeathers)).toEqual([...content.featherElites.map(row => `felled:${row.id}`), ...content.featherFlags]);
        expect(notices.slice(beforeNotices).filter(text => text.startsWith('Storm feather'))).toEqual([
          'Storm feather · 1 / 3', 'Storm feather · 2 / 3', 'Storm feather · 3 / 3',
        ]);
        expect(resumed.chapter.line?.active?.current?.id).toBe('cairn');
        resumed.saved.flags.set('lit:cairn'); resumed.saved.flags.set('dead:jel-ata'); resumed.saved.flags.set('told:wind');
        expect(resumed.chapter.line?.active).toBeNull();
        for (const flag of content.featherFlags) resumed.saved.flags.clear(flag);
        const completedNotices = notices.length;
        resumed.chapter.project('feathers', {});
        expect(notices.slice(completedNotices).filter(text => text.startsWith('Storm feather'))).toEqual([]);
      } finally { elites.mockRestore(); }
    } finally { resumed.saved.flags.reset(); resumed.scope.dispose(); }
  } finally { first.scope.dispose(); }
});


test('Pine secret guest commits the original flag before its once-only notice', () => {
  const scope = new Scope('pine-secret-chapter'), app = new App(), flags = new Flags('pine-secret-chapter', false), effects: string[] = [];
  const product = createShardProduct({ slug: pine.identity.slug, revision: 1, shardfile: pine,
    sections: new Map(), files: new Map(), read: () => Promise.reject(new Error('No file needed')) });
  const level = createLevelInstallation(app, scope, {}, () => ({ set: () => undefined, detail: () => undefined }));
  const ctx = shardContext(level.context, MANIFEST, { shard: MANIFEST, rows: new Map(), bag: { tab: () => () => undefined, fragment: () => () => undefined } }, product);
  const definition = parseQuestData(pine.quests).quests[0];
  if (definition === undefined) throw new Error('Missing authored Pine chapter');
  publishBoundQuest(scope, new QuestState(definition, flags, app.events, scope));
  const player = { position: new Vector3(), velocity: new Vector3(), yaw: 0, pitch: 0, carried: false };
  Object.defineProperty(ctx.game, 'runtime', { value: { world: { player }, interactables: [], play: {
    hud: { toast: (text: string) => { effects.push(text); } }, music: { sting: () => undefined },
    fullMap: { setQuest: () => undefined },
  } } });
  try {
    const chapter = scope.run(() => buildQuestChapter(ctx, PINE_STORY, { program: pineProgram }));
    scope.onDispose(flags.onChange(flag => { effects.push(flag); }));
    const at = { playerX: 0, playerY: 0, playerZ: 0, atX: 0, atY: 0, atZ: 0, floorY: 0 };
    chapter.project('secret', { ...at, playerX: 2.2 });
    chapter.project('secret', { ...at, playerY: .8 });
    expect(effects).toEqual([]);
    chapter.project('secret', at);
    expect(effects).toEqual([pinePage.secret.flag, pinePage.secret.text]);
    chapter.project('secret', at);
    expect(effects).toEqual([pinePage.secret.flag, pinePage.secret.text]);
  } finally { scope.dispose(); }
});
