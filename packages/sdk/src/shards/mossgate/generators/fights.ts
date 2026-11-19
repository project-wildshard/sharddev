// TEMPLATE-E2E TR-12b (J434): the rows behind the Hollow's creatures (creatures.ts places their bodies): their brains, the
// mossling pack, Greyback's and the Barrow Warden's encounters, the Warden's boss panel, the two shared fields its decision
// script writes (the ground ring's tell and the open core), and that script's row (`behaviour/warden.as`). The Template's
// `data/creatures.json`, `encounters.json` and `bossDecision.json`, ported.
import type { Shardfile } from '@wildshard/format/shardSchema';
import type { DecisionScripts } from '@wildshard/format/decisionScripts';
import { BODIES, HAUNTS, STRIKES } from './creatures';
import { LAYOUT } from './world';

/** The Warden's two shared fields: the ground ring's tell (it rears) and its open core (strike now). */
export const WARDEN_FIELDS = {
  tell: { id: 110, name: 'mossgate.warden-tell' },
  core: { id: 111, name: 'mossgate.warden-core' },
} as const;
export const ENCOUNTERS = { greyback: 'mossgate.greyback', warden: 'mossgate.warden' } as const;

/** The Template's brains: the blobs pursue, the sows ram and the wisps circle the pond and dive. */
const BRAINS = [
  { id: 'mossgate.blob-pursuit', kind: 'pursue', awareRadius: 12, leashRadius: 25, speed: 1, returnSpeed: 2, stopDistance: 1.5, turnRate: 4,
    thinkDivisor: 3, attackCooldownTicks: 60, wanderRadius: 4, wanderEveryTicks: 420 },
  { id: 'mossgate.sow-ram', kind: 'ram-grazer', strike: STRIKES.sowRam.id, grazeSpeed: 1, ramSpeed: 7, noticeRadius: 8, rimMargin: 2, fallDrop: 1.5,
    levelTolerance: 2.5, threatSpeed: 1.4, wanderMinSeconds: 2, wanderMaxSeconds: 5, rampRate: 4 },
  { id: 'mossgate.wisp-dive', kind: 'orbit-diver', strike: STRIKES.wispDive.id, home: { x: LAYOUT.POND.x, z: LAYOUT.POND.z, r: 7, y: 5 }, circleSpeed: 5,
    hangAltitude: 5, stalkSpeed: 7, diveSpeed: 12, restSeconds: 6, noticeRadius: 18, giveUpRadius: 30, initialRestSeconds: 3, stalkMaxSeconds: 8,
    riseMargin: 1.5, targetHeight: 1.2, alignRadius: 2.5, alignTolerance: 1.4 },
];
/** The mossling pack: they shadow a player, ring them, then one darts in to bite. */
const PACK = {
  id: 'mossgate.mosslings', kind: 'pack', thinkDivisor: 6, members: [...BODIES.mosslings], home: [HAUNTS.MEADOW.x, HAUNTS.MEADOW.z], trotSpeed: 2.5,
  runSpeed: 6.5, shadowMinRadius: 10, shadowMaxRadius: 15, ringMinRadius: 4, ringMaxRadius: 7, biteRadius: 1.3, sightRadius: 20, coneAngle: 1.2,
  smellRadius: 24, hearing: [3, 6, 12, 20], telegraphSeconds: 0.5, dashSeconds: 1.3, breakoffSeconds: 1, attackSeconds: 0.4, leaderVariant: 'moss',
  yipCue: 'mossling_yip', howlCue: 'mossling_howl', snarlCue: 'mossling_snarl', biteCue: 'mossling_bite',
};
const RESPAWN = { at: [LAYOUT.SPAWN.x, 0, LAYOUT.SPAWN.z], yaw: 0 };
const WARDEN_PANEL = 'mossgate.warden-panel';
/** Greyback, an elite boar in its clearing; the Barrow Warden, the boss of the barrow ring, with two phases. */
const ENCOUNTER_ROWS = [
  { id: ENCOUNTERS.greyback, entity: BODIES.greyback, kind: 'elite', panel: null, name: 'Greyback', title: 'Greyback', retry: 'Try Greyback again',
    arena: { at: [HAUNTS.GREYBACK.x, 0, HAUNTS.GREYBACK.z], radius: HAUNTS.GREYBACK.r }, intro: 0, introShort: 0, respawn: RESPAWN,
    phases: [{ at: 1, name: 'First phase', caption: 'First phase', speed: 2, stopDistance: 2, turnRate: 3 }] },
  { id: ENCOUNTERS.warden, entity: BODIES.warden, kind: 'boss', panel: WARDEN_PANEL, name: 'Barrow Warden', title: 'Keeper of the hollow',
    retry: 'Try the Barrow Warden again', arena: { at: [HAUNTS.WARDEN.x, 0, HAUNTS.WARDEN.z], radius: HAUNTS.WARDEN.r }, intro: 1, introShort: 0.2,
    respawn: RESPAWN,
    phases: [
      { at: 1, name: 'First phase', caption: 'First phase', speed: 1, stopDistance: 0, turnRate: 4 },
      // 0.6: behaviour/warden.as reads the same share
      { at: 0.6, name: 'Second phase', caption: 'Second phase', speed: 2.5, stopDistance: 0, turnRate: 4 },
    ] },
];

/** The Warden's decision script: a beat per strike, told by the ring, then the core opens (`behaviour/warden.as`). */
export const WARDEN_DECISION = {
  id: 'mossgate.warden.decision', abi: '1.0', side: 'sim', module: `blobs/wasm/${'0'.repeat(64)}.wasm`, source: 'behaviour/warden.as',
  binding: { encounter: ENCOUNTERS.warden }, pages: 1, onFail: 'reset', on: ['start', 'timer', 'threshold', 'death', 'stop'], tick: null,
  reads: ['nearestPlayer', 'hpShare'], commands: ['strike', 'stop', 'timer', 'encounter', 'field'], actors: { boss: BODIES.warden }, moves: {},
  strikes: { slam: STRIKES.wardenSlam.id, sweep: STRIKES.wardenSweep.id, stone: STRIKES.wardenThrow.id }, cues: {},
  fields: { tell: WARDEN_FIELDS.tell.name, core: WARDEN_FIELDS.core.name }, flags: {}, zones: {}, spots: {}, targets: {}, spawns: {}, signals: {},
  facts: {}, rewards: {}, channels: {}, impulses: {}, weather: {}, timers: ['arm', 'beat', 'open', 'shut'], stateVersion: 1,
  state: [
    { name: 'phase', type: 'i32', default: 0, scope: 'binding', min: 0, max: 3 },
    { name: 'swingNext', type: 'bool', default: true, scope: 'binding' },
    { name: 'beat', type: 'i32', default: 0, scope: 'binding', min: 0, max: 2 },
  ],
  params: { firstBeat: 1.6, secondBeat: 0.9, windup: 1.2, window: 3 },
} as unknown as DecisionScripts[number];
export const DECISIONS: DecisionScripts = [WARDEN_DECISION];

/** The panel parts the Warden's fields show (play.ts draws them): the ground ring while it rears, the gem while its core is open. */
export const WARDEN_PANELS = { ring: 'mossgate.warden-ring', core: 'mossgate.warden-core' } as const;

/** The fight rows over the shardfile: `gameplay` calls this after the quests. */
export function fights(shard: Shardfile): Shardfile {
  const field = (name: string, id: number) => ({ id, name, type: 'bool' as const, privacy: 'public' as const, default: false });
  const panel = (id: string, fieldId: number) => ({ panel: id, scope: 'shared' as const, fieldId, equals: 1, visibleWhenMatched: true, colliders: [], activeWhenMatched: true });
  return {
    ...shard,
    creatures: { ...shard.creatures, brains: [...shard.creatures.brains, ...BRAINS], groups: [...shard.creatures.groups, PACK] } as Shardfile['creatures'],
    encounters: [...shard.encounters, ...ENCOUNTER_ROWS] as Shardfile['encounters'],
    ui: [...shard.ui, { kind: 'bossPanel', id: WARDEN_PANEL, encounter: ENCOUNTERS.warden, name: 'Barrow Warden', title: 'Keeper of the hollow', retry: 'Try the Barrow Warden again' }] as Shardfile['ui'],
    state: { ...shard.state, shared: [...shard.state.shared, field(WARDEN_FIELDS.tell.name, WARDEN_FIELDS.tell.id), field(WARDEN_FIELDS.core.name, WARDEN_FIELDS.core.id)] },
    targets: { ...shard.targets, panels: [...shard.targets.panels, panel(WARDEN_PANELS.ring, WARDEN_FIELDS.tell.id), panel(WARDEN_PANELS.core, WARDEN_FIELDS.core.id)] },
  };
}
