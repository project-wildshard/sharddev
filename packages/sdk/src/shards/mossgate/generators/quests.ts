// The Hollow's quests (TEMPLATE-E2E TR-2, TR-12; the Template's `data/quests.json` and `data/npcs/`, ported). Every flag
// a quest reads is raised by the scene: a region (`world.trigger`), a brazier, the lever or the chest (a `script` trigger on
// the `<prompt>.spent` condition the sdk writes for a shared prompt, SS-GF0), or the rack's take (its `setsFlag`).
import { LAYOUT } from './hollow';
import { GATE_PASS, GATE_PASSED_FLAG, LEDGE_FLAG, PLAY, USES } from './play';
import { BODIES, HAUNTS } from './creatures';
import { MEADOW, MEADOW_FLAGS } from './meadow';
import { THICKET_FLAGS, THICKET_SIGN_DIALOGUE } from './thicket';
import { BOG, BOG_FLAGS, BOG_USE } from './bog';
import { PLACES } from './layout';
import { PLACE_FLAGS } from './places';
import { BEACON, RIDGE, RIDGE_VIEW_DIALOGUE } from './ridge';
import { QUARRY, QUARRYMASTER, QUARRY_BLOBS } from './quarry';
import { FIND_QUESTS, HERMIT_LORE } from './finds';

/** The flag each lit brazier raises (and the Lamplighter's steps, once her quest is taken). */
const lit = (letter: string): string => `mossgate.brazier-${letter.toLowerCase()}.lit`;
const lamp = (letter: string): string => `mossgate.lamp.${letter.toLowerCase()}`;
const LETTERS = ['A', 'B', 'C'] as const;
/** Where each brazier stands, by letter (world.ts `LAYOUT.BRAZIERS`). */
const brazierAt = (letter: string): { x: number; z: number } => {
  const row = LAYOUT.BRAZIERS.find((seat) => seat[2] === letter); if (row === undefined) throw new Error(`mossgate: no brazier ${letter}`);
  return { x: row[0], z: row[1] };
};
const marker = (id: string, label: string, short: string, at: { x: number; z: number }, hideWhen?: string) =>
  ({ id, label, short, at: { poi: 'world' as const, x: at.x, z: at.z }, ...(hideWhen === undefined ? {} : { hideWhen: { all: [hideWhen] } }) });

export const FLAGS = {
  hutDoor: 'hut.door', hutVisit: 'hut.visit',
  lampAccepted: 'mossgate.lamp.accepted', lampReported: 'mossgate.lamp.reported', lampDone: 'mossgate.lamp.done',
  firstLight: 'mossgate.first-light',
  northGate: 'mossgate.north-gate.opened',
  hermitAccepted: 'mossgate.hermit.accepted', hermitReported: 'mossgate.hermit.reported', hermitDone: 'mossgate.hermit.done',
  chestOpened: 'mossgate.chest.opened', chestPaid: 'mossgate.chest.paid',
  ledgePaid: 'mossgate.ledge.paid', ledgeSearched: 'mossgate.ledge.searched',
  rackTaken: 'mossgate.rack.taken', rackPaid: 'mossgate.rack.paid',
  // TR-12b: the fights' flags (a `dead:<spawn>` flag is the engine's, raised when that body dies)
  blob: 'mossgate.blob', blobPaid: 'mossgate.blob.paid', wardenPaid: 'mossgate.warden.paid', greybackPaid: 'mossgate.greyback.paid',
  mosslingsPaid: 'mossgate.mosslings.paid',
  // MOSSGATE-ZONE MZ1 (J453): Cinder Orchard's "pond hermit's pests" turn-in: the pack gone, tell the Hermit
  pestsReported: 'mossgate.hermit.pests',
  // MOSSGATE-ZONE MZ12: the meadow den's side quest pays once its hoard is found
  denPaid: 'mossgate.meadow.den.paid',
  // MZ14: the Bog's drowned chest
  shrinePaid: 'mossgate.bog.shrine.paid',
  // MZ16: every place found
  placesPaid: 'mossgate.places.paid',
  // MZ18: the main chain's middle, the old rite: asked of the Hermit, read at the Standing Stones, carried to the Sunken
  // Shrine, the Lookout's beacon lit, and the Quarrymaster told (MZ19)
  wardenAsked: 'mossgate.hermit.warden', riteStones: 'mossgate.rite.stones', riteShrine: 'mossgate.rite.shrine',
  riteLookout: 'mossgate.rite.lookout', beaconLit: 'mossgate.beacon.lit', quarryTold: 'mossgate.quarrymaster.told',
  // MZ18: the camps' side quests
  gritmawPaid: 'mossgate.gritmaw.paid', gritmawReported: 'mossgate.quarrymaster.gritmaw', quarryCampPaid: 'mossgate.quarry.camp.paid',
  stonesPackPaid: 'mossgate.stones-pack.paid', merePaid: 'mossgate.mere.paid', wallowPaid: 'mossgate.wallow.paid',
} as const;
const dead = (spawn: string): string => `dead:${spawn}`;
/** A marker's short name (18 letters at most): the place's name without its leading "The". */
const short = (name: string): string => name.replace(/^The /u, '').slice(0, 18);
const MOSSLINGS_DEAD = BODIES.mosslings.map(dead);
const STONES_DEAD = BODIES.stonesPack.map(dead);
const QUARRY_BLOBS_DEAD = QUARRY_BLOBS.map((_, i) => dead(`quarry-blob-${i + 1}`));
const MERE_DEAD = HAUNTS.MERE_WISPS.map((_, i) => dead(`mere-wisp-${i + 1}`));
const WALLOW_DEAD = HAUNTS.WALLOW_SOWS.map((_, i) => dead(`wallow-sow-${i + 1}`));
const LAMPS_LIT = LETTERS.map(lamp);

/** The Lamplighter's tree: she gives the relighting, then thanks you once all three burn. */
export const LAMPLIGHTER_DIALOGUE = {
  id: 'mossgate.lamplighter', name: 'The Lamplighter', start: 'offer',
  nodes: [
    { id: 'offer', lines: ['The braziers of the Hollow have gone cold, and the Warden stirs in the barrow ring out on the Downs.', 'Light all three for me. Will you?'],
      choices: [{ id: 'accept', label: "I'll relight them.", next: 'waiting', sets: [FLAGS.lampAccepted] }] },
    { id: 'waiting', lines: ['A by the training ground, B across the pond, C by the east gap.', 'Then ask the Pond Hermit how the Warden was put down the last time. He was there.'],
      choices: [{ id: 'report', label: 'All three burn, and the Warden is down.', next: 'thanks', when: { all: [...LAMPS_LIT, FLAGS.quarryTold, dead(BODIES.warden)] }, sets: [FLAGS.lampReported] }] },
    { id: 'thanks', lines: ['The Hollow breathes again. Take this for your trouble.'], choices: [] },
  ],
};

/** The Pond Hermit's tree: once the Lamplighter is helped, he wants the north gate open. */
export const HERMIT_DIALOGUE = {
  id: 'mossgate.hermit', name: 'The Pond Hermit', start: 'offer',
  nodes: [
    { id: 'offer', lines: ['Mind your step, traveller. The north gate has been barred since the Warden woke.', "Help the Lamplighter first, then pull the lever by the north wall and I'll make it worth your while."],
      choices: [{ id: 'accept', label: "I'll open the gate.", next: 'waiting', sets: [FLAGS.hermitAccepted], when: { all: [FLAGS.lampDone] } },
        { id: 'pests', label: 'The mossling pack is gone.', next: 'pests', sets: [FLAGS.pestsReported], when: { all: MOSSLINGS_DEAD } },
        // MZ18: the main chain's second turn-in: the three braziers lit, the Lamplighter sends you to him for the old rite
        { id: 'warden', label: 'The Lamplighter asks how the Warden was put down before.', next: 'rite', sets: [FLAGS.wardenAsked], when: { all: LAMPS_LIT, none: [FLAGS.wardenAsked] } },
        // MZ22: the old words read back
        HERMIT_LORE.choice] },
    HERMIT_LORE.node,
    { id: 'rite', lines: ['The old rite. Read it where it is cut, at the Standing Stones in the meadow north of here.',
      'Carry it to the Sunken Shrine in the Bog, then light the beacon on Lookout Ridge so the ring sees it burn.',
      'The Quarrymaster at the Old Quarry knows the last of it. She keeps the ring\'s old ways.'], choices: [] },
    { id: 'pests', lines: ['Gone? Then the reeds will grow back. Take these coins for the quiet.'], choices: [] },
    { id: 'waiting', lines: ['The lever stands inside the yard, by the north wall behind the hut.'],
      choices: [{ id: 'report', label: 'The north gate is open.', next: 'thanks', when: { all: [FLAGS.northGate] }, sets: [FLAGS.hermitReported] }] },
    { id: 'thanks', lines: ['Fresh air at last. Take these coins, and my thanks.'], choices: [] },
  ],
};

/** MZ19: the Quarrymaster's tree, the main chain's third turn-in. With the beacon lit she hands out its last leg, the way
 *  into the barrow ring; she also wants Gritmaw gone and her camp cleared (the quarry's side quests). */
export const QUARRYMASTER_DIALOGUE = {
  id: 'mossgate.quarrymaster', name: 'The Quarrymaster', start: 'greet',
  nodes: [
    { id: 'greet', lines: ['Mind the cut. My crew left when Gritmaw woke in the pit, and the blobs took our camp.'],
      choices: [
        { id: 'beacon', label: 'The beacon burns on the ridge. The Hermit says you know the rest of the rite.', next: 'ring', sets: [FLAGS.quarryTold],
          when: { all: [FLAGS.beaconLit], none: [FLAGS.quarryTold] } },
        { id: 'gritmaw', label: 'Gritmaw is down.', next: 'paid', sets: [FLAGS.gritmawReported], when: { all: [dead(BODIES.gritmaw)], none: [FLAGS.gritmawReported] } },
        { id: 'bye', label: 'Later.', next: null },
      ] },
    { id: 'ring', lines: ['Then it is time. The ring on the Barrow Downs opens to whoever carried the rite past the Stones and the Shrine.',
      'Go east from the Hollow and in through the arch. Strike its core when it opens. And tell the Lamplighter when it is done.'], choices: [] },
    { id: 'paid', lines: ['Down? Then we dig again tomorrow. Take this, from the crew.'], choices: [] },
  ],
};

/** MZ18: where the rite's steps are taken: region triggers that rise only once the step before is done. */
const RITE_TRIGGERS = [
  { id: 'rite.stones', kind: 'region' as const, flag: FLAGS.riteStones, x: MEADOW.STONES.x, z: MEADOW.STONES.z, radius: 9, when: { all: [FLAGS.wardenAsked] } },
  { id: 'rite.shrine', kind: 'region' as const, flag: FLAGS.riteShrine, x: BOG.SHRINE.x, z: BOG.SHRINE.z, radius: 9, when: { all: [FLAGS.riteStones] } },
  { id: 'rite.lookout', kind: 'region' as const, flag: FLAGS.riteLookout, x: RIDGE.LOOKOUT.x, z: RIDGE.LOOKOUT.z, radius: 10, when: { all: [FLAGS.riteShrine] } },
  { id: 'beacon.lit', kind: 'script' as const, flag: FLAGS.beaconLit, condition: `${BEACON.use}.spent`, when: { all: [FLAGS.riteLookout] } },
];

/** The quest section `extend` adds (gameplay.ts). The scene adds its region triggers (`hut.door`, the ledge) itself. */
export const QUESTS = {
  flags: [...Object.values(FLAGS), ...LETTERS.map(lit), ...LETTERS.map(lamp), LEDGE_FLAG, GATE_PASSED_FLAG, ...Object.values(MEADOW_FLAGS), ...Object.values(THICKET_FLAGS), ...Object.values(BOG_FLAGS), dead(BODIES.warden), dead(BODIES.greyback), ...MOSSLINGS_DEAD,
    dead(BODIES.gritmaw), ...STONES_DEAD, ...QUARRY_BLOBS_DEAD, ...MERE_DEAD, ...WALLOW_DEAD, ...FIND_QUESTS.flags],
  triggers: [
    // TR-12b: any grey blob's death raises the blob quest's flag
    { id: 'blob', kind: 'death' as const, flag: FLAGS.blob, tag: 'creature.greyBlob' },
    ...LETTERS.map((l) => ({ id: `brazier-${l.toLowerCase()}.lit`, kind: 'script' as const, flag: lit(l), condition: `${USES.brazier(l)}.spent` })),
    ...LETTERS.map((l) => ({ id: `lamp.${l.toLowerCase()}`, kind: 'script' as const, flag: lamp(l), condition: `${USES.brazier(l)}.spent`, when: { all: [FLAGS.lampAccepted] } })),
    { id: 'north-gate.opened', kind: 'script' as const, flag: FLAGS.northGate, condition: `${USES.lever}.spent` },
    { id: 'chest.opened', kind: 'script' as const, flag: FLAGS.chestOpened, condition: `${USES.chest}.spent` },
    { id: 'ledge.searched', kind: 'script' as const, flag: FLAGS.ledgeSearched, condition: `${USES.ledgeCache}.spent` },
    { id: 'bog.chest.opened', kind: 'script' as const, flag: BOG_FLAGS.chestOpened, condition: `${BOG_USE}.spent` },
    ...RITE_TRIGGERS,
    ...FIND_QUESTS.triggers,
  ],
  dialogue: [LAMPLIGHTER_DIALOGUE, HERMIT_DIALOGUE, THICKET_SIGN_DIALOGUE, RIDGE_VIEW_DIALOGUE, QUARRYMASTER_DIALOGUE, ...FIND_QUESTS.dialogue],
  quests: [
    // TR-2: the starter's one quest, so a new repo's proof tape has a fact to earn (the hut door's region, world.ts)
    { id: 'hut.visit', title: 'The hut', completeFlag: FLAGS.hutVisit,
      steps: [{ id: 'door', objective: 'Walk up to the hut door', done: { all: [FLAGS.hutDoor] } }],
      onComplete: { fact: FLAGS.hutVisit, coins: 5 } },
    // the first flame: brazier A opens the moss gate (play.ts), and its fact is the one the proof tape lights
    { id: 'mossgate.first-light', title: 'The first flame', track: true, completeFlag: FLAGS.firstLight,
      steps: [{ id: 'a', objective: 'Light brazier A', done: { all: [lit('A')] }, hint: 'Brazier A stands by the training ground, east of the hut',
        markers: [marker('first-light.marker', 'Brazier A', 'A', brazierAt('A'), lit('A'))] },
        // MZ4 (J454): the flame opens the moss gate; the quest ends on the far side of it, not at the bowl
        { id: 'gate', objective: 'Go through the moss gate', done: { all: [GATE_PASSED_FLAG] }, hint: 'Brazier A sank the gate\'s bars: the gate is in the yard\'s west wall, by the pond',
          markers: [marker('gate.marker', 'Moss gate', 'Gate', GATE_PASS, GATE_PASSED_FLAG)] }],
      onComplete: { fact: FLAGS.firstLight, coins: 5 } },
    { id: 'mossgate.lamplighter', title: 'Relight the Hollow', completeFlag: FLAGS.lampDone, startWhen: { all: [FLAGS.lampAccepted] },
      steps: [
        ...LETTERS.map((l) => ({ id: l.toLowerCase(), objective: `Light brazier ${l}`, done: { all: [lamp(l)] },
          markers: [marker(`brazier-${l.toLowerCase()}.marker`, `Brazier ${l}`, l, brazierAt(l), lamp(l))] })),
        // MZ18: the old rite, across the Meadow, the Bog, the Ridge and the Quarry, before the Downs
        { id: 'hermit', objective: 'Ask the Pond Hermit how the Warden was put down', done: { all: [FLAGS.wardenAsked] }, hint: 'The Hermit waits on the pond\'s north bank',
          markers: [marker('rite-hermit.marker', 'Pond Hermit', 'Hermit', PLAY.HERMIT)] },
        { id: 'stones', objective: 'Read the rite at the Standing Stones', done: { all: [FLAGS.riteStones] }, hint: 'North of the yard, past the mossling den: mind the pack in the ring',
          markers: [marker('rite-stones.marker', 'The Standing Stones', 'Stones', MEADOW.STONES)] },
        { id: 'shrine', objective: 'Carry the rite to the Sunken Shrine', done: { all: [FLAGS.riteShrine] }, hint: 'West of the yard, through the moss gate and into the Bog',
          markers: [marker('rite-shrine.marker', 'The Sunken Shrine', 'Shrine', BOG.SHRINE)] },
        { id: 'beacon', objective: 'Light the beacon on Lookout Ridge', done: { all: [FLAGS.riteLookout, FLAGS.beaconLit] }, hint: 'North-west, up the climb past the cairns; the beacon stands on the Lookout\'s dais',
          markers: [marker('rite-beacon.marker', 'The beacon', 'Beacon', RIDGE.LOOKOUT)] },
        { id: 'quarrymaster', objective: 'Find the Quarrymaster at the Old Quarry', done: { all: [FLAGS.quarryTold] }, hint: 'South of the yard, over the bridge on the haul path',
          markers: [marker('rite-quarrymaster.marker', 'The Quarrymaster', 'Quarry', QUARRYMASTER)] },
        { id: 'warden', objective: 'Put down the Barrow Warden', done: { all: [dead(BODIES.warden)] }, hint: 'The Warden wakes in the barrow ring, out on the Barrow Downs east of the yard: watch the ground ring, dodge, then strike its open core',
          markers: [marker('relight-warden.marker', 'Barrow ring', 'Warden', HAUNTS.WARDEN, dead(BODIES.warden))] },
        { id: 'report', objective: 'Tell the Lamplighter', done: { all: [FLAGS.lampReported] }, hint: 'The Lamplighter waits on the path north of spawn',
          markers: [marker('lamplighter.marker', 'The Lamplighter', 'Lamp', LAYOUT.LAMPLIGHTER)] },
      ],
      onComplete: { fact: 'mossgate.lamplighter', coins: 25 } },
    { id: 'mossgate.hermit', title: "The hermit's gate", completeFlag: FLAGS.hermitDone, startWhen: { all: [FLAGS.hermitAccepted] },
      steps: [
        { id: 'lever', objective: 'Pull the lever by the north wall', done: { all: [FLAGS.northGate] }, markers: [marker('lever.marker', 'Gate lever', 'Lever', PLAY.LEVER, FLAGS.northGate)] },
        { id: 'report', objective: 'Tell the Pond Hermit', done: { all: [FLAGS.hermitReported] }, markers: [marker('hermit.marker', 'Pond Hermit', 'Hermit', PLAY.HERMIT)] },
      ],
      onComplete: { fact: 'mossgate.hermit', coins: 15 } },
    { id: 'mossgate.chest', title: 'The old chest', track: false, completeFlag: FLAGS.chestPaid,
      // MZ4 (J454): the key first, from the ledge cache, then the chest
      steps: [{ id: 'key', objective: 'Find the chest key in the ledge cache', done: { all: [FLAGS.ledgeSearched] }, hint: 'Ride the lift by the south wall up to the ledge',
        markers: [marker('chest-key.marker', 'Ledge cache', 'Key', PLAY.LEDGE, FLAGS.ledgeSearched)] },
        { id: 'chest', objective: 'Open the old chest by the sign', done: { all: [FLAGS.chestOpened] }, markers: [marker('chest.marker', 'Old chest', 'Chest', PLAY.CHEST, FLAGS.chestOpened)] }],
      onComplete: { fact: 'mossgate.chest', coins: 10 } },
    { id: 'mossgate.ledge', title: 'The ledge cache', track: false, completeFlag: FLAGS.ledgePaid,
      steps: [{ id: 'ledge', objective: 'Ride the lift up to the ledge cache', done: { all: [LEDGE_FLAG] }, markers: [marker('ledge.marker', 'Ledge cache', 'Ledge', PLAY.LEDGE, LEDGE_FLAG)] },
        { id: 'search', objective: 'Search the ledge cache', done: { all: [FLAGS.ledgeSearched] } }],
      onComplete: { fact: 'mossgate.ledge', coins: 15 } },
    { id: 'mossgate.rack', title: 'The moss blade', track: false, completeFlag: FLAGS.rackPaid,
      steps: [{ id: 'rack', objective: 'Take the moss blade from its rack', done: { all: [FLAGS.rackTaken] }, markers: [marker('rack.marker', 'Blade rack', 'Rack', PLAY.RACK, FLAGS.rackTaken)] },
        // MZ4 (J454): a blade is proved on something
        { id: 'blob', objective: 'Try the blade on a grey blob', done: { all: [FLAGS.blob] }, hint: 'Grey blobs wander the yard and past the north gate' }],
      onComplete: { fact: 'mossgate.rack', coins: 5 } },
    // TR-12b: the fights (creatures.ts places the bodies, fights.ts the encounters and the Warden's script)
    { id: 'mossgate.blob', title: 'The grey blobs', track: false, completeFlag: FLAGS.blobPaid,
      steps: [{ id: 'blob', objective: 'Beat a grey blob', done: { all: [FLAGS.blob] }, hint: 'Grey blobs wander the yard and past the north gate',
        markers: [marker('blob.marker', 'Grey blob', 'Blob', { x: HAUNTS.BLOBS[0][0], z: HAUNTS.BLOBS[0][1] }, FLAGS.blob)] }],
      onComplete: { fact: 'mossgate.blob', coins: 5 } },
    { id: 'mossgate.mosslings', title: 'The mossling pack', track: false, completeFlag: FLAGS.mosslingsPaid,
      steps: [{ id: 'pack', objective: 'Drive off the mossling pack', chip: 'Mosslings', count: MOSSLINGS_DEAD, done: { all: MOSSLINGS_DEAD },
        hint: 'They circle, then bite: strike the one that comes in', markers: [marker('mosslings.marker', 'Mossling meadow', 'Pack', HAUNTS.MEADOW, MOSSLINGS_DEAD[0])] },
        { id: 'report', objective: 'Tell the Pond Hermit', done: { all: [FLAGS.pestsReported] }, hint: 'The Hermit waits on the pond\'s north bank',
          markers: [marker('pests-hermit.marker', 'Pond Hermit', 'Hermit', PLAY.HERMIT)] }],
      onComplete: { fact: 'mossgate.mosslings', coins: 15 } },
    // MZ12: Mossling Meadow's find: the den north of the yard, then the hoard the pack keeps behind it
    { id: 'mossgate.meadow.den', title: 'The mossling den', track: false, completeFlag: FLAGS.denPaid,
      steps: [{ id: 'den', objective: 'Find the mossling den in the meadow', done: { all: [MEADOW_FLAGS.den] }, hint: 'North of the yard, past the north gate',
        markers: [marker('den.marker', 'Mossling den', 'Den', MEADOW.DEN, MEADOW_FLAGS.den)] },
        { id: 'hoard', objective: 'Find what the pack hoards behind its mound', done: { all: [MEADOW_FLAGS.hoard] }, hint: 'Round the back of the den, away from the burrow mouth' }],
      onComplete: { fact: 'mossgate.meadow.den', coins: 10 } },
    // MZ14: the Bog's chest is shared (one lid for the world), so the quest pays each player who stands at it once it is open
    { id: 'mossgate.bog.shrine', title: 'The sunken shrine', track: false, completeFlag: FLAGS.shrinePaid,
      steps: [{ id: 'shrine', objective: 'Find the sunken shrine in the Bog', done: { all: [BOG_FLAGS.shrine] }, hint: 'West of the yard, past the moss gate',
        markers: [marker('shrine.marker', 'Sunken shrine', 'Shrine', BOG.SHRINE, BOG_FLAGS.shrine)] },
        { id: 'chest', objective: 'Open the drowned chest on the shrine floor', done: { all: [BOG_FLAGS.atChest, BOG_FLAGS.chestOpened] } }],
      onComplete: { fact: 'mossgate.bog.shrine', coins: 20 } },
    { id: 'mossgate.greyback', title: 'Greyback', track: false, completeFlag: FLAGS.greybackPaid,
      steps: [{ id: 'greyback', objective: 'Bring down Greyback', done: { all: [dead(BODIES.greyback)] }, hint: 'The old boar holds a clearing in the thicket, north-east of the yard: sidestep its charge',
        markers: [marker('greyback.marker', 'Greyback\'s clearing', 'Greyback', HAUNTS.GREYBACK, dead(BODIES.greyback))] }],
      onComplete: { fact: 'mossgate.greyback', coins: 15 } },
    { id: 'mossgate.warden', title: 'The Barrow Warden', track: false, completeFlag: FLAGS.wardenPaid,
      steps: [{ id: 'warden', objective: 'Put down the Barrow Warden', done: { all: [dead(BODIES.warden)] },
        hint: 'The Warden wakes in the barrow ring, out on the Barrow Downs east of the yard: watch the ground ring, dodge, then strike its open core',
        markers: [marker('warden.marker', 'Barrow ring', 'Warden', HAUNTS.WARDEN, dead(BODIES.warden))] }],
      onComplete: { fact: 'mossgate.warden', coins: 25 } },
    // MZ18: a side quest for each camp the chain passes
    { id: 'mossgate.gritmaw', title: 'Gritmaw', track: false, completeFlag: FLAGS.gritmawPaid,
      steps: [{ id: 'gritmaw', objective: 'Bring down Gritmaw in the quarry pit', done: { all: [dead(BODIES.gritmaw)] }, hint: 'Its grit ring rises before each strike: step out of it',
        markers: [marker('gritmaw.marker', 'Quarry pit', 'Gritmaw', QUARRY.GRITMAW, dead(BODIES.gritmaw))] },
        { id: 'report', objective: 'Tell the Quarrymaster', done: { all: [FLAGS.gritmawReported] }, markers: [marker('gritmaw-report.marker', 'The Quarrymaster', 'Quarry', QUARRYMASTER)] }],
      onComplete: { fact: 'mossgate.gritmaw', coins: 25 } },
    { id: 'mossgate.quarry.camp', title: 'The quarry camp', track: false, completeFlag: FLAGS.quarryCampPaid,
      steps: [{ id: 'camp', objective: 'Clear the grey blobs from the quarry camp', chip: 'Camp', count: QUARRY_BLOBS_DEAD, done: { all: QUARRY_BLOBS_DEAD },
        markers: [marker('quarry-camp.marker', 'Quarry camp', 'Camp', QUARRY.CAMP, QUARRY_BLOBS_DEAD[0])] }],
      onComplete: { fact: 'mossgate.quarry.camp', coins: 10 } },
    { id: 'mossgate.stones-pack', title: 'The stones pack', track: false, completeFlag: FLAGS.stonesPackPaid,
      steps: [{ id: 'pack', objective: 'Drive the mossling pack out of the Standing Stones', chip: 'Stones pack', count: STONES_DEAD, done: { all: STONES_DEAD },
        markers: [marker('stones-pack.marker', 'The Standing Stones', 'Pack', MEADOW.STONES, STONES_DEAD[0])] }],
      onComplete: { fact: 'mossgate.stones-pack', coins: 10 } },
    { id: 'mossgate.mere', title: 'The lights on the mere', track: false, completeFlag: FLAGS.merePaid,
      steps: [{ id: 'wisps', objective: 'Put out the wisps over Wisp Mere', chip: 'Wisps', count: MERE_DEAD, done: { all: MERE_DEAD },
        markers: [marker('mere.marker', 'Wisp Mere', 'Mere', BOG.MERE, MERE_DEAD[0])] }],
      onComplete: { fact: 'mossgate.mere', coins: 10 } },
    { id: 'mossgate.wallow', title: 'The Sow Wallow', track: false, completeFlag: FLAGS.wallowPaid,
      steps: [{ id: 'sows', objective: 'Drive the sows from the Sow Wallow', chip: 'Sows', count: WALLOW_DEAD, done: { all: WALLOW_DEAD },
        markers: [marker('wallow.marker', 'The Sow Wallow', 'Wallow', { x: HAUNTS.WALLOW_SOWS[0][0], z: HAUNTS.WALLOW_SOWS[0][1] }, WALLOW_DEAD[0])] }],
      onComplete: { fact: 'mossgate.wallow', coins: 10 } },
    // MZ16: the twelve places, each a region trigger (places.ts); untracked, so its markers name them on the full map only
    { id: 'mossgate.places', title: 'The lay of the Hollow', track: false, completeFlag: FLAGS.placesPaid,
      steps: [{ id: 'walk', objective: 'Find the twelve places of the Hollow', chip: 'Places', count: [...PLACE_FLAGS], done: { all: [...PLACE_FLAGS] },
        hint: 'Fingerposts on every road name the place at its end', markers: PLACES.map((p) => marker(`place.${p.id}`, p.name, short(p.name), p)) }],
      onComplete: { fact: 'mossgate.places', coins: 20 } },
    // MZ22: the finds (finds.ts): the twelve pieces of glass, the cairn's chest and the four old signs
    ...FIND_QUESTS.quests,
  ],
};
