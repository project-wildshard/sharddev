// @vitest-environment happy-dom
// A page's quest views over the rows a server sends: the marks, the card, the chip and the notices. `presentQuest` keeps all of it at the
// flip, with a view of the wire in place of its own quest, so the tests that drove it with a page's quest go. `QuestState.progress()` is the
// row a server sends for a quest (`QuestBooks`).
import { afterEach, beforeEach, expect, test } from 'vitest';
import { Vector3 } from 'three';
import { NetClient } from '../src/client/engine/net/client';
import type { MapQuest } from '../src/client/engine/ui/Map';
import { Scope } from '../src/shared/engine/app/scope';
import type { DecodedFrame } from '../src/shared/engine/net/frame';
import type { Transport } from '../src/shared/engine/net/transport';
import { QuestLine, QuestState } from '../src/shared/engine/quest/core';
import { Flags } from '../src/shared/engine/world/interact/flags';
import { createQuestPlacements, type Place, type PoiId } from '../src/shared/engine/world/interact/types';
import { presentQuest } from '../src/client/game/plugin/ui';
import { presentChapterStory, presentQuestStory } from '../src/client/game/quest/story';
import { wirePage } from '../src/client/game/shardfile/wirePage';
import { parseQuestData } from '@wildshard/format/quests';
import { PAGE_STORY as DRIFT_STORY } from '../src/shards/driftwood-isle/generators/pageStory';
import { PAGE_STORY as PINE_STORY } from '../src/shards/pine-hollow/generators/pageStory';
import { preparedProductEnvelope } from './fixtures/prepared-product-envelope';

const [driftEnvelope, pineEnvelope] = await Promise.all([preparedProductEnvelope('driftwood-isle', () => false), preparedProductEnvelope('pine-hollow', () => false)]);
const silent: Transport = { send: () => undefined, close: () => undefined, onMessage: () => () => undefined, onClose: () => () => undefined, stats: { rttMs: 0, lossPct: 0, sentBytes: 0, recvBytes: 0 } };
const at = (tick: number): DecodedFrame => ({ tick, baselineTick: -1, cell: 1, lastSeq: 0, owner: new Float64Array(0), rows: new Map(), ride: null, fresh: new Set() });
let client: NetClient, tick = 2;
/** What a server's frame says of this quest and this player's flags, and the page's frame that hears it. */
const say = (quest: QuestState, flags: readonly string[] = []): void => { client.quests.set(quest.def.id, quest.progress()); client.phased.clear(); for (const flag of flags) client.phased.add(flag); tick += 2; client.latest = at(tick); wirePage.frame(null, true); };
beforeEach(() => {
  Object.defineProperty(wirePage, 'on', { get: () => true, configurable: true }); // the flip makes this the only page
  client = new NetClient(silent); wirePage.bind(client, () => undefined, () => undefined, () => false);
  client.latest = at(tick); wirePage.frame(null, true);
});
afterEach(() => { wirePage.unbind(); Reflect.deleteProperty(wirePage, 'on'); document.body.replaceChildren(); });

test('a live marker uses its authored frame over the wire, and frozen Place callbacks keep their narrowing', () => {
  const scope = new Scope('wire-live-frame'), flags = new Flags('wire-live-frame', false), place0 = { poi: 'hut', x: 2, z: 3 };
  const quest = new QuestState({ id: 'frames', title: 'Frames', completeFlag: 'done', startWhen: { all: ['go'] },
    steps: [{ id: 'find', objective: 'Find', done: { all: ['found'] }, markers: [{ id: 'gate', label: 'Gate', at: place0 }] }] }, flags);
  const player = { position: new Vector3(), velocity: new Vector3(), yaw: 0, pitch: 0, carried: false };
  const host = { scope, player, toast: () => undefined, sting: () => undefined };
  const frames: Record<Exclude<PoiId, 'world'>, { x: number; z: number }> = { hut: { x: 10, z: 20 }, lookout: { x: 0, z: 0 }, wreck: { x: 0, z: 0 }, shrine: { x: 0, z: 0 }, cave: { x: 0, z: 0 }, pier: { x: 0, z: 0 } };
  const place = (row: Place): { x: number; y: number; z: number } => {
    if (row.poi === 'world') return { x: row.x, y: 0, z: row.z };
    const frame = frames[row.poi]; return { x: frame.x + row.x, y: 0, z: frame.z + row.z };
  };
  try {
    const legacy = presentQuest(host, quest, { place });
    flags.set('go'); say(quest);
    expect(legacy.markers()[0]).toMatchObject({ x: 12, z: 23 });
    place0.poi = 'orchard';
    expect(() => legacy.markers()).toThrow('live frame resolver');
    const resolver = createQuestPlacements({ terrain: () => 3, frames: { orchard: { x: 10, z: 20, rot: Math.PI / 2 } } });
    const live = presentQuest({ ...host, scope: scope.child('live') }, quest, { placements: { [JSON.stringify(place0)]: resolver.place(place0) } });
    expect(live.markers()[0]).toMatchObject({ x: 13, z: 18 });
    const missing = presentQuest({ ...host, scope: scope.child('missing') }, quest, { placements: {} });
    expect(() => missing.markers()).toThrow('admitted frame placement');
    expect(() => presentQuest(host, quest, { place, placements: {} })).toThrow('one frame resolver');
  } finally { scope.dispose(); quest.dispose(); }
});

for (const [source, story] of [[driftEnvelope.shard, DRIFT_STORY], [pineEnvelope.shard, PINE_STORY]] as const)
test(`${source.identity.slug}: a chapter read off the wire keeps its notices, card and objective through completion`, () => {
  const scope = new Scope(`${source.identity.slug}-wire-chapter`), serverFlags = new Flags('wire-server', false), flags = new Flags('wire-page', false);
  const server = new QuestLine(parseQuestData(source.quests).quests, serverFlags), line = new QuestLine(parseQuestData(source.quests).quests, flags);
  const quest = line.chapters[0], heldByServer = server.chapters[0], rows = story.chapters;
  if (quest === undefined || heldByServer === undefined || rows === undefined) throw new Error('Missing admitted chapter');
  const player = { position: new Vector3(), velocity: new Vector3(), yaw: 0, pitch: 0, carried: false }, wired: string[] = [], notices: string[] = [];
  let wiredCard: (() => MapQuest | null) | undefined, card: (() => MapQuest | null) | undefined;
  const place = (where: { x: number; z: number }): { x: number; y: number; z: number } => ({ x: where.x, y: 0, z: where.z });
  try {
    const onWire = presentQuestStory(story, { scope, player, toast: text => { wired.push(text); }, sting: () => { wired.push('sting'); }, fullMap: { setQuest: read => { wiredCard = read; } } }, heldByServer, { place });
    say(heldByServer);
    const current = presentChapterStory(line, rows, { scope, flags, npcs: {}, figures: {}, places: [], prompts: [], open: () => undefined,
      toast: text => { notices.push(text); }, sting: () => { notices.push('sting'); }, fullMap: { setQuest: read => { card = read; } },
      placements: Object.fromEntries([...quest.def.intro?.markers ?? [], ...quest.def.steps.flatMap(step => step.markers ?? [])].map(marker => [JSON.stringify(marker.at), place(marker.at)])), chip: () => quest.chip() });
    let time = 0;
    for (const condition of [quest.def.startWhen, ...quest.def.steps.map(step => step.done)]) {
      for (const flag of condition?.none ?? []) { flags.clear(flag); serverFlags.clear(flag); }
      for (const flag of condition?.all ?? condition?.any?.slice(0, 1) ?? []) {
        flags.set(flag); serverFlags.set(flag); time++; say(heldByServer, serverFlags.all);
        onWire.update(.1, time); current.update(.1, player.position); current.chip.update(time, player);
        expect(current.chip.line.root.textContent).toBe(onWire.chip.line.root.textContent);
        expect(current.markers()).toEqual(onWire.markers()); expect(card?.()).toEqual(wiredCard?.()); expect(notices).toEqual(wired);
      }
    }
    expect(heldByServer.isComplete).toBe(true); expect(notices.length, 'it said something').toBeGreaterThan(0);
  } finally { server.dispose(); line.dispose(); scope.dispose(); }
});
