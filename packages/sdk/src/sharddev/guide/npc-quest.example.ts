// Wren's Hives: an NPC with a quest and loot, and how their rows connect. Everything joins on flag names: Wren's
// `accept` choice sets `wren.met`, which starts the quest; the badger's death trigger sets `wren.badger-dead`, which
// finishes its first step and opens her turn-in choice; that choice sets `wren.returned`, which finishes the quest. The
// quest pays coins, and each badger kill rolls a honeycomb off the shard's loot table (an item its catalogue names).
import * as THREE from 'three';
import { abilities, temperament } from '@wildshard/kit';
import type { Shardfile } from '@wildshard/format/shardSchema';
import { defineShard } from '@wildshard/sdk/scene/shard';

const WREN_AT = [-6, 0, 4] as const;
const bite = abilities.bite({ id: 'badger.bite', damage: 6, range: 1.4 });
const { temperament: pursue, senses } = temperament.pursue({ aggro: 12, leash: 24 });

// 1. Flags: every name a choice, trigger or quest reads or sets is declared once here.
const flags = ['wren.met', 'wren.badger-dead', 'wren.returned', 'wren.done'];

// 2. The NPC is a talk (`targets.talks`, below) that opens this dialogue tree. A choice shows while its `when` holds
//    and sets its `sets` flags; `next: null` ends the talk.
const wren = { id: 'wren', name: 'Wren the beekeeper', start: 'hello', nodes: [
  { id: 'hello', lines: ['A honey badger is in my hives. Drive it off and I will pay you.'], choices: [
    { id: 'accept', label: 'I will help.', next: 'waiting', when: { none: ['wren.met'] }, sets: ['wren.met'] }] },
  { id: 'waiting', lines: ['The badger digs by the hives, north of here.'], choices: [
    { id: 'turn-in', label: 'The badger is gone.', next: null, when: { all: ['wren.badger-dead'] }, sets: ['wren.returned'] }] },
] };

// 3. The quest starts when `startWhen` holds; each step is done when its flags are; `completeFlag` is raised at the
//    end, and `onComplete` pays the coins and files the fact a proof tape's `requiredFacts` names.
const quest = { id: 'honey-badger', title: 'The honey badger', track: true, completeFlag: 'wren.done', startWhen: { all: ['wren.met'] },
  steps: [
    { id: 'badger', objective: 'Drive the badger from the hives.', done: { all: ['wren.badger-dead'] } },
    { id: 'return', objective: 'Tell Wren the badger is gone.', done: { all: ['wren.returned'] } },
  ],
  onComplete: { fact: 'wren.paid', coins: 10 } };

// 4. A death trigger raises its flag when a creature carrying `tag` dies: every creature carries `creature.<kind>`.
const badgerDead: Shardfile['quests']['triggers'][number] = { id: 'badger-dead', kind: 'death', flag: 'wren.badger-dead', tag: 'creature.badger' };

// 5. Loot: a `trophies` table rolls items on each kill, matched by the creature's `kind`; a `coins` table would pay
//    coins the same way. `currency` names the shard's coin: what it is called, the pickup a kill bursts and the Bag
//    icon. The rest of the economy row is empty: no effects, goods, grants, finds or map marks.
const loot: Shardfile['rows']['loot'][number] = { id: 'wren.loot', gear: 'purse.coins', finds: null, marks: null, charted: false, chime: 'coin',
  economy: {
    currency: { id: 'coin', name: 'Coin', model: 'shared/doubloon', icon: 'coin' },
    tables: [{ id: 'badger.trophies', domain: 'trophies', table: { mode: 'weighted', rows: [{ item: 'honeycomb', weight: 1, count: 1, match: { kind: 'badger' } }] } }],
    effects: [], goods: [], grants: { player: [], worn: [], weapons: [] }, finds: { counters: [], sections: [] }, marks: [],
  } };

/** The badger: a `body` bone carrying a `head` bone, a box on each. */
function badgerBody(): THREE.Group {
  const fur = new THREE.MeshStandardMaterial({ color: '#4a4440' });
  const root = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group();
  body.name = 'body'; head.name = 'head';
  body.position.set(0, 0.3, 0); head.position.set(0, 0.05, 0.4);
  body.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.7), fur), head);
  head.add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.25), fur));
  root.add(body);
  return root;
}

/** A one-second clip that dips the head by `angle` radians and back. */
function nod(name: string, angle: number): THREE.AnimationClip {
  const dip = [Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)];
  return new THREE.AnimationClip(name, 1, [new THREE.QuaternionKeyframeTrack('head.quaternion', [0, 0.5, 1], [0, 0, 0, 1, ...dip, 0, 0, 0, 1])]);
}

export default defineShard({ slug: 'wrens-hives', name: "Wren's Hives" }, (world) => {
  world.ground(() => 0, { colourAt: () => [0.45, 0.6, 0.3] });
  world.spawn(0, 1, 10, 0);
  // Wren's body is an ordinary part; the talk below stands at her feet
  world.part('wren', (figure) => {
    const dress = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.2, 7), new THREE.MeshStandardMaterial({ color: '#d9962b' }));
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 1), new THREE.MeshStandardMaterial({ color: '#efe3c4' }));
    dress.position.y = 0.6; head.position.y = 1.45;
    figure.add(dress, head);
    figure.position.set(...WREN_AT);
  });
  world.creature('badger', badgerBody(), {
    species: {
      kind: 'badger', label: 'Honey badger', type: 'beast', aggressive: true, lockable: true,
      dims: { bodyY: 0.3, bodyHalfLen: 0.35, bodyRadius: 0.2, headRadius: 0.1, legLen: 0.2, feet: [], halfWidth: 0.2 },
      variants: [{ id: 'grey', label: 'Honey badger', rarity: 'common', weight: 1, scale: [1, 1], hp: 30,
        mods: { speed: 1, chargeDist: 1, damageTaken: 1, chargeDamage: 0, relentless: false } }],
      temperament: pursue, senses, abilities: [bite.ability],
    },
    strikes: [bite.strike],
    size: 'small',
    clips: [nod('idle', 0.1), nod('walk', 0.3), nod('attack', 0.6)],
    loops: ['idle', 'walk'],
    material: { family: 'pbr', vertexColours: true },
  });
  const hives = new THREE.Object3D();
  hives.position.set(0, 0, -14);
  world.scene.add(hives);
  world.spawnAt('badger-1', hives, { species: 'badger', variant: 'grey', brain: null, strike: null, seed: 1, scale: 1 });
}, {
  // 6. The sections `world` has no call for go in through `extend`: the quest rows, the talk, the item and the loot.
  extend: (shard) => ({
    ...shard,
    quests: { ...shard.quests, flags, quests: [quest], triggers: [badgerDead], dialogue: [wren] },
    targets: { ...shard.targets, talks: [{ id: 'wren', at: [...WREN_AT], radius: 3, label: 'Talk to Wren', dialogue: 'wren' }] },
    items: { ...shard.items, catalogue: [{ id: 'honeycomb', label: 'Honeycomb', icon: 'shell', travels: true }] },
    rows: { ...shard.rows, loot: [loot] },
  }),
});
