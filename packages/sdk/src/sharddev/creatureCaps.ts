/**
 * ONE-FORMAT CC47 (Q-CC15, Q-T21; SHARD-SOURCE AP34): the creature caps `wildshard check` holds every creature to.
 *
 * Hard caps refuse: 64 bones in a creature's rig and 16 hit volumes (the skeleton's defaults plus its own). Each size
 * class has its own triangle and texture marks, and a creature over its class's mark warns: the phone draws 30 deer at
 * 3,000 triangles each inside its frame (CC53), so a giant may carry more than a rabbit but neither is free. All of it
 * still counts inside the shard's total (J338) and its budget tier (OF10c); the report card prints each creature's
 * numbers beside the tier.
 */
import { creatureContract } from '@wildshard/format/creatureSkeletons';
import type { CreatureSize } from '@wildshard/format/creatureLayers';
import { resolveSkinLookFiles } from '@wildshard/format/skinAssets';
import type { BudgetTier } from '@wildshard/format/budget-tiers';
import type { Shardfile } from '@wildshard/format/shardSchema';

/** Bones in one creature rig; past this the phone's pose and skinning cost refuses (AP34). */
export const CREATURE_BONE_CAP = 64;
/** Resolved hit volumes on one creature (format's CC6a cap, named here so check refuses with these words). */
export const CREATURE_VOLUME_CAP = 16;

/** One size class's marks: triangles drawn and decoded bytes (its textures, mostly) per rig. Over a mark warns. */
export interface CreatureClassMarks { readonly triangles: number; readonly decodedBytes: number }
const MIB = 1_048_576;
/** Medium is the deer: Pine's phone deer is 3,000 triangles and the kit's PBR bear 5,672 (CC53). */
export const CREATURE_CLASS_MARKS: Readonly<Record<CreatureSize, CreatureClassMarks>> = {
  tiny: { triangles: 1_500, decodedBytes: MIB },
  small: { triangles: 3_000, decodedBytes: 2 * MIB },
  medium: { triangles: 6_000, decodedBytes: 4 * MIB },
  large: { triangles: 12_000, decodedBytes: 8 * MIB },
  giant: { triangles: 24_000, decodedBytes: 16 * MIB },
};

/** One creature's numbers, the largest over its skin variants. `bones` is null for a look with no rig (a recipe). */
export interface CreatureNumbers {
  readonly species: string;
  readonly size: CreatureSize;
  readonly bones: number | null;
  readonly volumes: number;
  readonly triangles: number | null;
  readonly decodedBytes: number | null;
}
/** A finding in check's shape: a stable code (refusals.ts names its rule) and the words. */
export interface CreatureFinding { readonly code: string; readonly message: string }

type CapSource = Pick<Shardfile, 'rows' | 'files'>;

/** Each species' numbers, from its body and its look's skins (every variant). */
export function creatureNumbers(source: CapSource, assets: ReadonlyMap<string, Uint8Array>): CreatureNumbers[] {
  return source.rows.species.map((row): CreatureNumbers => {
    const body = row.body, size: CreatureSize = body?.size ?? 'medium';
    const defaults = body?.skeleton === undefined ? [] : creatureContract({ skeleton: body.skeleton, ...(body.trail === undefined ? {} : { trail: body.trail }) }).volumes;
    const volumes = new Set([...defaults, ...body?.volumes ?? []].map(volume => volume.part)).size;
    const look = source.rows.looks.find(entry => entry.species === row.id && (body === undefined || entry.id === body.look));
    if (look?.recipe !== 'platform.skin') return { species: row.id, size, bones: null, volumes, triangles: null, decodedBytes: null };
    const resolved = resolveSkinLookFiles(source, look, assets);
    const skins = [resolved.skin, ...resolved.variants?.values() ?? []].map(skin => skin.row);
    return { species: row.id, size, volumes,
      bones: Math.max(...skins.map(skin => skin.rig.joints[0]?.length ?? 0)),
      triangles: Math.max(...skins.map(skin => skin.cost.triangles)),
      decodedBytes: Math.max(...skins.map(skin => skin.cost.decoded)) };
  });
}

/** The hard caps: each creature over one refuses, by name. */
export function creatureCapRefusals(numbers: readonly CreatureNumbers[]): CreatureFinding[] {
  return numbers.flatMap(row => [
    ...row.bones !== null && row.bones > CREATURE_BONE_CAP ? [{ code: 'creature-bone-cap',
      message: `creature ${row.species} has ${row.bones} bones, over the cap of ${CREATURE_BONE_CAP}` }] : [],
    ...row.volumes > CREATURE_VOLUME_CAP ? [{ code: 'creature-volume-cap',
      message: `creature ${row.species} has ${row.volumes} hit volumes, over the cap of ${CREATURE_VOLUME_CAP}` }] : [],
  ]);
}

/** The size-class marks: each creature over its class's triangles or texture bytes warns; upload still takes it. */
export function creatureCapWarnings(numbers: readonly CreatureNumbers[]): CreatureFinding[] {
  return numbers.flatMap(row => {
    const marks = CREATURE_CLASS_MARKS[row.size];
    return [
      ...row.triangles !== null && row.triangles > marks.triangles ? [{ code: 'creature-triangles',
        message: `creature ${row.species} draws ${row.triangles} triangles, over the ${row.size} mark of ${marks.triangles}` }] : [],
      ...row.decodedBytes !== null && row.decodedBytes > marks.decodedBytes ? [{ code: 'creature-textures',
        message: `creature ${row.species} decodes ${(row.decodedBytes / MIB).toFixed(1)} MB, over the ${row.size} mark of ${(marks.decodedBytes / MIB).toFixed(0)} MB` }] : [],
    ];
  });
}

/** The report card's creature line: the tier, then each creature's bones, volumes and triangles. */
export function creatureReportLine(numbers: readonly CreatureNumbers[], tier: BudgetTier): string {
  const rows = numbers.map(row => `${row.species} (${row.size}) ${row.bones ?? '-'} bones, ${row.volumes} volumes, ${row.triangles ?? '-'} triangles`);
  return `tier ${tier}; ${rows.length === 0 ? 'no creatures' : rows.join('; ')}`;
}
