import { CylinderGeometry, ConeGeometry, MeshStandardMaterial } from 'three';
import { staticGlb } from '@wildshard/sdk/bake/glb';
import { hashImmutableBytes } from '@wildshard/sdk/immutable';
import { parseGlb } from '@wildshard/sdk/assets';
import { parseItems, type ShardItems } from '@wildshard/format/items';

// The retained author example owns this model and copies its ordinary file into the shard.

/** Retained starter spear generator: an ash shaft, iron leaf point and wrapped grip, in the hand's local +Y frame.
 * The self-contained GLB needs no image, decoder, rig, clip or external material. No generated asset is committed. */
export function starterSpearModel(): Uint8Array {
  const shaft = new CylinderGeometry(0.015, 0.022, 1.6, 8); shaft.translate(0, -0.4, 0);
  const point = new ConeGeometry(0.075, 0.32, 4); point.rotateY(Math.PI / 4); point.scale(1, 1, 0.18); point.translate(0, 0.56, 0);
  const grip = new CylinderGeometry(0.024, 0.024, 0.18, 8);
  const ash = new MeshStandardMaterial({ color: '#ab8053', roughness: 0.9 }); ash.name = 'Ash shaft';
  const iron = new MeshStandardMaterial({ color: '#aeb2b9', metalness: 0.75, roughness: 0.4 }); iron.name = 'Iron point';
  const wrap = new MeshStandardMaterial({ color: '#5b3c29', roughness: 1 }); wrap.name = 'Wrapped grip';
  try { return staticGlb([{ geometry: shaft, material: ash }, { geometry: point, material: iron }, { geometry: grip, material: wrap }], 'starter-spear'); }
  finally { for (const geometry of [shaft, point, grip]) geometry.dispose(); for (const material of [ash, iron, wrap]) material.dispose(); }
}

/** Ordinary model bytes and item rows: the build copies both into the shard file. */
export function starterSpearContent(): { model: Uint8Array; hash: string; cost: ReturnType<typeof parseGlb>; items: ShardItems } {
  const model = starterSpearModel(), hash = hashImmutableBytes(model), asset = hash;
  const data = parseItems({ version: 1, rows: [{ id: 'weapon.spear', kind: 'weapon', family: 'kit.melee',
    slot: 'declared.weapon.spear', context: 'weapon.melee', ui: { name: 'Spear', icon: 'sword',
      swapIcon: 'M12 2 L15 8 L12 7 L9 8 Z M12 7 V22', blurb: 'An ash spear with an iron point. Thrust to keep your distance.' },
    view: { recipe: 'asset.static', asset, colour: '#ffffff', position: [0.16, -0.18, -0.35], rotation: [-Math.PI / 2, 0, -0.08] }, hook: null,
    light: { id: 'spear.thrust', damage: 30, cooldown: 0.35, range: 3.2, width: 0.3, tags: ['weapon.spear'], effect: null },
    heavy: { id: 'spear.heavy-thrust', damage: 45, cooldown: 0.8, range: 3.2, width: 0.3, tags: ['weapon.spear'], effect: null }, charge: 0.4 }],
    contexts: [], loadout: { primary: 'weapon.spear', secondary: null, tools: [] } });
  return { model, hash, cost: parseGlb(model), items: data };
}
