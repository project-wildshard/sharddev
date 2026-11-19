/**
 * ONE-FORMAT OF27a: hull books and rigged hulls become a build step. A rigged-hull body (a hull family's `*.rigged.glb`)
 * is fitted to a kit skeleton (`importCreatureGlb`: the skeleton's own bone names by default, or a chain map), and
 * written as a `platform.skin` GLB look: the skin file, the species row with `body.skeleton`, and its look row, the
 * same `SceneCreature` `world.creature` makes. Every vertex and weight is kept; only joint names and order change.
 */
import type { CreatureBody, CreatureSkeleton } from '@wildshard/format/creatureLayers';
import { CREATURE_SKELETONS } from '@wildshard/format/creatureSkeletons';
import { parseGlb } from '@wildshard/format/shardfileAssets';
import type { ShardRows } from '@wildshard/format/rows';
import { encodeCanonicalJson, hashImmutableBytes } from '../immutable';
import { CREATURE_BONE_CAP } from '../creatureCaps';
import { creatureSkin, type CreatureBinding } from '../scene/creature';
import { importCreatureGlb, type CreatureChainMap } from '../scene/creatureImport';
import type { SceneCreature } from '../scene/description';

type SpeciesRow = ShardRows['species'][number];

/** The species' sim rows, its size and the skin's binding; the skeleton the rig is fitted to. */
export interface HullCreatureOptions {
  readonly species: Omit<SpeciesRow, 'id' | 'body'>;
  readonly size: CreatureBody['size'];
  readonly scale?: number;
  readonly skeleton: CreatureSkeleton;
  /** Source bone names per kit chain; omitted, the rig already uses the skeleton's own names. */
  readonly map?: CreatureChainMap;
  readonly loops?: CreatureBinding['loops'];
  readonly material: CreatureBinding['material'];
  readonly materials?: CreatureBinding['materials'];
  readonly family?: 'toon' | 'pbr' | 'painterly';
  /** The attack clip's length in seconds, as the clips recipe samples it (default 1). */
  readonly attackSpan?: number;
}

/** A kit skeleton's chain map in its own names: a rig that already follows the contract maps to itself. */
export function kitChainMap(skeleton: CreatureSkeleton): CreatureChainMap {
  // A serpent's bones come from its trail row, so it has no fixed chain map (format 0.40.0 CC23).
  if (skeleton === 'serpent') throw new Error('chain root: a serpent has no kit chain map');
  const contract = CREATURE_SKELETONS[skeleton];
  return { root: contract.root, chains: Object.fromEntries(Object.entries(contract.chains).map(([key, chain]) => [key, [...chain.bones]])) };
}

/** Fit a rigged-hull GLB to a kit skeleton and write it as a skin look, its species row and its look row. */
export async function hullCreature(id: string, rig: Uint8Array, options: HullCreatureOptions): Promise<SceneCreature> {
  const imported = await importCreatureGlb(rig, { skeleton: options.skeleton, map: options.map ?? kitChainMap(options.skeleton) });
  if (imported.bones.length > CREATURE_BONE_CAP) throw new Error(`hull ${id}: ${imported.bones.length} bones, over the cap of ${CREATURE_BONE_CAP}`);
  const binding: CreatureBinding = { loops: options.loops ?? [], material: options.material,
    ...(options.materials === undefined ? {} : { materials: options.materials }) };
  const skin = creatureSkin(imported, { id, ...(options.family === undefined ? {} : { family: options.family }), binding });
  const bytes = new TextEncoder().encode(encodeCanonicalJson(skin));
  const lookId = `${id}.look`;
  const species: SpeciesRow = { ...options.species, id,
    body: { size: options.size, scale: options.scale ?? 1, look: lookId, skeleton: options.skeleton } };
  const look: ShardRows['looks'][number] = { id: lookId, species: id, recipe: 'platform.skin', material: null,
    parameters: { skin: hashImmutableBytes(bytes) }, animation: { recipe: 'platform.clips', parameters: { attackSpan: options.attackSpan ?? 1 } } };
  return { id, glb: imported.glb, skin: bytes, species, look, bones: imported.bones.length, triangles: parseGlb(imported.glb).triangles };
}
