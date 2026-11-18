// ONE-FORMAT OF11a: a species program (`BrainedSpecies` and its look) becomes CC1's layered rows, so a shard moving off
// `actors/species-programs` (M8) writes plain `actors/species`, `creatures.brains` and `rows.strikes` with the same
// numbers. The program's own brain keeps owning its home, leash and perception: the layer adds nothing it would override.
import type { BorrowedDecision } from '@wildshard/format/decisionScripts';
import type { CreatureAbility, CreatureTemperament } from '@wildshard/format/creatureLayers';
import type { ShardCreatures } from '@wildshard/format/creatures';
import type { ShardRows, SpeciesRow, StrikeRows } from '@wildshard/format/rows';
import type { BrainedSpecies, SpeciesBrain } from '../speciesBrains';
import type { StrikeData } from '../species';

type BrainRow = ShardCreatures['brains'][number];
type Dims = SpeciesRow['dims'];

/** One species' look: the look row id the body draws with and the physics dimensions its bake already uses. */
export interface ProgramLook { readonly look: string; readonly dims: Dims }
/** A species program's catalogue, as `actors/species-programs` `program` carries it. */
export interface SpeciesProgramInput { readonly species: readonly BrainedSpecies[]; readonly strikes: readonly StrikeData[] }
/** A decision brain stays its `sim/scripts` binding: the shard keeps it on its spawn group or encounter. */
export interface ProgramDecision { readonly species: string; readonly decision: BorrowedDecision }
/** The layered rows: species with explicit layers, the declared brains they reference, and plain strike rows. */
export interface ConvertedSpecies {
  readonly species: SpeciesRow[];
  readonly brains: BrainRow[];
  readonly strikes: StrikeRows[];
  /** The program's exact creature strikes, for `actors/strikes` (decisions and scored strikes read them there). */
  readonly catalogue: StrikeData[];
  /** Strike fields a plain strike row drops (OF11b: the data host reads them from `actors/strikes`). */
  readonly lossy: { readonly strike: string; readonly fields: readonly string[] }[];
  readonly decisions: ProgramDecision[];
}

/** The format's largest radius: the program brain owns its own home, so the layer's leash never trips first. */
const LAYER_LEASH = 500;
const DEFAULT_CHARGE_DAMAGE = 25;

function refuse(species: string, message: string): never { throw new Error(`species \`${species}\`: ${message}`); }

/**
 * A creature strike as a plain strike row. Fields a row cannot carry (a scored weight, actor units, alternatives,
 * eligibility, motion beyond speed) are listed in `lost`; the exact strike stays in the `actors/strikes` catalogue.
 */
function strikeRow(strike: StrikeData): { row: StrikeRows; lost: string[] } {
  const { id, shape, windup, active, recover, cooldown, range, damage, tags, weight, units, alternatives, motion, eligibility, debris } = strike;
  const lost = [...weight.kind === 'constant' ? [] : ['weight'], ...units === 'actor' ? ['units'] : [],
    ...alternatives === undefined ? [] : ['alternatives'], ...eligibility === undefined ? [] : ['eligibility'],
    ...Object.keys(motion ?? {}).filter(key => key !== 'speed').map(key => `motion.${key}`)];
  return { lost, row: { id, shape, windup, active, recover, cooldown, range, damage, tags,
    weight: weight.kind === 'constant' ? weight.value : 1, speed: motion?.speed ?? 0, ...(debris === undefined ? {} : { debris }) } as StrikeRows };
}

/** The strikes a brain names, in its own order. */
function brainStrikes(brain: SpeciesBrain): string[] {
  const data: Record<string, unknown> = brain.data as Record<string, unknown>;
  if (brain.archetype === 'decision') return brain.data.strikeEffects.map(row => row.strike);
  return ['strike', 'charge', 'close'].flatMap(key => typeof data[key] === 'string' ? [data[key] as string] : []);
}

function ability(strike: StrikeData): CreatureAbility {
  return { use: strike.id, range: strike.range ?? 0, cooldown: strike.cooldown,
    weight: strike.weight.kind === 'constant' ? strike.weight.value : 1, damage: strike.damage, windup: strike.windup,
    ...(strike.motion?.speed === undefined ? {} : { speed: strike.motion.speed }) };
}

function temperamentOf(row: BrainedSpecies, brains: BrainRow[], decisions: ProgramDecision[]): CreatureTemperament {
  const base = { reaction: row.aggressive === true ? 'aggressive' as const : 'neutral' as const, leash: LAYER_LEASH, assist: 0,
    home: { speed: row.walkSpeed ?? 1, stop: 0 } };
  const brain = row.brain;
  if (brain === undefined) {
    if (row.tuning === undefined) return { ...base, brain: 'none' };
    const motion = [row.walkSpeed, row.chargeSpeed, row.chargeWindup, row.ringRadius, row.trampleRadius];
    if (motion.some(value => value !== undefined) && motion.some(value => value === undefined)) {
      refuse(row.id, 'a hunt keeps all five motion numbers (walkSpeed, chargeSpeed, chargeWindup, ringRadius, trampleRadius) or none');
    }
    const [walkSpeed, chargeSpeed, chargeWindup, ringRadius, trampleRadius] = motion;
    return { ...base, brain: 'hunt', tuning: { ...row.tuning, ...(walkSpeed === undefined ? {} : {
      motion: { walkSpeed, chargeSpeed, chargeWindup, ringRadius, trampleRadius } }) } as NonNullable<CreatureTemperament['tuning']> };
  }
  if (brain.archetype === 'decision') { decisions.push({ species: row.id, decision: brain.data }); return { ...base, brain: 'none' }; }
  if (brain.archetype === 'script') refuse(row.id, 'a script brain moves with its module as a `creatures.brains` script row');
  const data = brain.data as BrainRow;
  if (typeof data.id !== 'string') refuse(row.id, `${brain.archetype} brain has no id`);
  const known = brains.find(entry => entry.id === data.id);
  if (known === undefined) brains.push(data);
  else if (JSON.stringify(known) !== JSON.stringify(data)) refuse(row.id, `brain \`${data.id}\` differs from another species' brain of that id`);
  return { ...base, brain: data.id };
}

/**
 * Turn a species program into CC1's layered rows. Each species keeps its id, kind, variants (with full hp and mods, as
 * the engine's `variantMods` fills them), flight and harvest; its look gives the body (medium, scale 1: the authored model
 * units) and the physics dims. A grazer, diver, stalker, guardian or other declared brain becomes a `creatures.brains` row
 * the temperament names; a decision brain stays its script binding (returned in `decisions`, temperament `none`); a
 * tuned species without a brain hunts. Strikes the brain or the species' `creature.<kind>` tag name become abilities.
 */
export function speciesProgramToRows(program: SpeciesProgramInput, looks: ReadonlyMap<string, ProgramLook>): ConvertedSpecies {
  const brains: BrainRow[] = [], decisions: ProgramDecision[] = [];
  const strikes = new Map(program.strikes.map(row => [row.id, row]));
  if (strikes.size !== program.strikes.length) throw new Error('species program: duplicate strike ids');
  const species = program.species.map((row): SpeciesRow => {
    const look = looks.get(row.kind) ?? refuse(row.id, `no look for kind \`${row.kind}\``);
    const temperament = temperamentOf(row, brains, decisions);
    const named = [...row.brain === undefined ? [] : brainStrikes(row.brain),
      ...program.strikes.filter(strike => strike.tags.includes(`creature.${row.kind}`)).map(strike => strike.id)];
    const abilities = [...new Set(named)].map(id => ability(strikes.get(id) ?? refuse(row.id, `unknown strike \`${id}\``)));
    const variants = row.variants.map(variant => {
      const hp = variant.hp ?? row.tuning?.hp ?? refuse(row.id, `variant \`${variant.id}\` has no hp`);
      const mods = variant.mods ?? {};
      return { id: variant.id, label: variant.label, rarity: variant.rarity, weight: variant.weight, scale: variant.scale, hp,
        mods: { speed: mods.speed ?? 1, chargeDist: mods.chargeDist ?? 1, damageTaken: mods.damageTaken ?? 1,
          chargeDamage: mods.chargeDamage ?? row.chargeDamage ?? DEFAULT_CHARGE_DAMAGE, relentless: mods.relentless ?? false } };
    });
    const sounds = row.sounds;
    return { id: row.id, kind: row.kind, label: row.label, aggressive: row.aggressive === true,
      lockable: row.lockable ?? row.flight !== undefined, dims: look.dims, variants,
      ...(row.flight === undefined ? {} : { flight: { ...row.flight } }),
      ...(row.capExempt === undefined ? {} : { capExempt: row.capExempt }),
      ...(row.harvest === undefined ? {} : { harvest: [...row.harvest] }),
      body: { size: 'medium', scale: 1, look: look.look }, temperament,
      ...(abilities.length === 0 ? {} : { abilities }),
      presentation: { blood: row.blood ?? true, sounds: sounds === undefined ? {} : { call: sounds.call, hurt: sounds.hurt,
        ...(sounds.callVariants === undefined ? {} : { callVariants: [...sounds.callVariants] }),
        ...(sounds.callEvery === undefined ? {} : { callEvery: sounds.callEvery }) } } } as SpeciesRow;
  });
  const rows = program.strikes.map(strike => ({ id: strike.id, ...strikeRow(strike) }));
  return { species, brains, strikes: rows.map(entry => entry.row), catalogue: [...program.strikes],
    lossy: rows.flatMap(entry => entry.lost.length === 0 ? [] : [{ strike: entry.id, fields: entry.lost }]), decisions };
}

/** A program challenge grazer's circling phase for one spawn (engine `seedSlot`): the declared spawn's `phaseOffset`. */
export function programSpawnPhase(brain: SpeciesBrain | undefined, seed: number): number | undefined {
  if (brain === undefined || !('phaseSlots' in brain)) return undefined;
  return Math.floor(Math.abs(Math.sin(seed * 12.9898 + 1.7) * 43758.5)) % brain.phaseSlots;
}

/** The converted rows merged into a source's rows: the program's species and strikes replace any of the same id. */
export function withConvertedRows(rows: ShardRows, converted: ConvertedSpecies): ShardRows {
  const species = new Set(converted.species.map(row => row.id)), strikes = new Set(converted.strikes.map(row => row.id));
  return { ...rows, species: [...rows.species.filter(row => !species.has(row.id)), ...converted.species],
    strikes: [...rows.strikes.filter(row => !strikes.has(row.id)), ...converted.strikes] };
}
