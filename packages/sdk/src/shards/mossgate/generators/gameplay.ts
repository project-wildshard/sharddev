// TEMPLATE-E2E TR-12 (J434): the rows `defineShard`'s `extend` adds over the scene's shardfile, as quests.ts started (TR-2):
// the quests and their two talks, and the moss blade the rack hands over. The scene writes everything it places itself
// (play.ts: the prompts, the switched panels, the lift, the ledge's region; the sdk writes their state and script).
import type { Shardfile } from '@wildshard/format/shardSchema';
import { STARTER_SWORD } from '@wildshard/sdk/scene/shardfile';
import { HERMIT_DIALOGUE, LAMPLIGHTER_DIALOGUE, FLAGS, QUESTS } from './quests';
import { PLAY, RACK_SCENE } from './play';
import { groundHeight, LAYOUT } from './world';
import { fights } from './fights';
import { THICKET_TALKS } from './thicket';

type Items = Shardfile['items'];
type Weapon = Items['rows'][number];

/** TC-M5b: the moss blade on the rack by the yard. It is not in the loadout, so the engine starts it on its rack; the rack's
 *  take (action 3) puts it in the hotbar and raises the rack quest's flag. */
export const MOSS_BLADE: Weapon = {
  ...STARTER_SWORD, id: 'weapon.moss-blade', slot: 'declared.weapon.moss-blade',
  ui: { name: 'Moss blade', icon: 'sword', swapIcon: '⚔', blurb: 'A green-edged blade from the Hollow\'s rack.' },
  view: { recipe: 'kit.sword', colour: '#8fb070', position: [0.2, -0.35, -0.6], rotation: [0, 0, 0] },
  light: { id: 'moss-blade.light', damage: 34, cooldown: 0.08, range: 2.3, width: 1.2, tags: ['actor.player', 'weapon.moss-blade', 'dmg.melee'], effect: null },
  heavy: { id: 'moss-blade.heavy', damage: 68, cooldown: 0.08, range: 2.3, width: 1.2, tags: ['actor.player', 'weapon.moss-blade', 'dmg.melee'], effect: null },
};
/** The rack's take: a hooks scene the rack's prompt runs (play.ts), past the event types the sdk numbers from 6001. */
const RACK_TAKE = { scene: { id: RACK_SCENE, type: 5001, value: 3 }, action: { scene: RACK_SCENE, item: MOSS_BLADE.id, action: 3 as const, setsFlag: FLAGS.rackTaken } };

/** The two talks: the Lamplighter, drawn by her own figure (world.ts), and the Pond Hermit, a stand-in on the pond's bank. */
const TALKS = [
  { id: 'mossgate.lamplighter.talk', at: [LAYOUT.LAMPLIGHTER.x, groundHeight(LAYOUT.LAMPLIGHTER.x, LAYOUT.LAMPLIGHTER.z), LAYOUT.LAMPLIGHTER.z] as [number, number, number],
    radius: 2.5, label: 'Talk to the Lamplighter', dialogue: LAMPLIGHTER_DIALOGUE.id, figure: 'mossgate.lamplighter' },
  { id: 'mossgate.hermit.talk', at: [PLAY.HERMIT.x, groundHeight(PLAY.HERMIT.x, PLAY.HERMIT.z), PLAY.HERMIT.z] as [number, number, number],
    radius: 2.5, label: 'Talk to the Pond Hermit', dialogue: HERMIT_DIALOGUE.id },
];

/** The achievements the quests' facts pay (the Template's `data/ledger.json`). */
const achievement = (fact: string, id: string, title: string) => ({ fact, origin: { kind: 'engine' as const, source: 'quest.complete' }, rewards: [{ kind: 'achievement' as const, id, title, threshold: 1 }] });
export const LEDGER = [
  achievement('mossgate.first-light', 'mossgate.firstLight', 'The first flame'),
  achievement('mossgate.lamplighter', 'mossgate.lamplighter', 'Relight the Hollow'),
  achievement('mossgate.hermit', 'mossgate.hermit', 'Fresh air'),
  achievement('mossgate.chest', 'mossgate.chest', 'Finders keepers'),
  achievement('mossgate.ledge', 'mossgate.ledge', 'High ground'),
  // TR-12b: the fights
  achievement('mossgate.warden', 'mossgate.warden', 'Barrow Warden'),
  achievement('mossgate.greyback', 'mossgate.greyback', 'Greyback'),
  achievement('mossgate.mosslings', 'mossgate.mosslings', 'Pack hunter'),
];

/** The Hollow's rows over the scene's shardfile: `defineShard(identity, buildHollow, { extend: gameplay, decisions })`;
 *  the fights' rows (fights.ts) go on last. */
export function gameplay(shard: Shardfile): Shardfile {
  return fights({
    ...shard,
    quests: QUESTS as unknown as Shardfile['quests'],
    ledger: [...shard.ledger, ...LEDGER] as Shardfile['ledger'],
    items: { ...shard.items, rows: [...shard.items.rows, MOSS_BLADE] },
    hooks: { ...shard.hooks, scenes: [...shard.hooks.scenes, RACK_TAKE.scene] },
    targets: { ...shard.targets, itemActions: [...shard.targets.itemActions ?? [], RACK_TAKE.action], talks: [...shard.targets.talks ?? [], ...TALKS, ...THICKET_TALKS] },
  });
}
