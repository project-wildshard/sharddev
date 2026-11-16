import { parseShardfile, type Shardfile } from '@wildshard/format/shardSchema';
import type { CreatureTemperament } from '@wildshard/format/creatureLayers';
import { parseRows, type SpeciesRow } from '@wildshard/format/rows';
import { legacyCreatureProfile } from '@wildshard/kit/legacySpecies';

/** Preserve a source's explicit per-spawn policy, including null (no installed brain). */
function declaredTemperament(source: Shardfile, row: SpeciesRow, preset: CreatureTemperament): CreatureTemperament {
  const spawns = source.creatures.spawns.filter(spawn => spawn.species === row.id);
  if (spawns.length === 0) return preset;
  const ids = new Set(spawns.map(spawn => spawn.brain));
  if (ids.size !== 1) throw new Error(`species \`${row.id}\` uses several spawn brains: declare its temperament explicitly`);
  const reference = (brain: string): CreatureTemperament => {
    const result = { ...preset, brain };
    delete result.tuning;
    return result;
  };
  const [id] = ids;
  if (id === null) return reference('none');
  const brain = source.creatures.brains.find(entry => entry.id === id);
  if (brain === undefined) throw new Error(`species \`${row.id}\` has an unknown spawn brain`);
  // Existing spawn policies remain their exact declarations; the layer references the admitted policy by id.
  return reference(brain.id);
}

/** Expand only old source rows from kit JSON. Explicit layers and all authored physics/brain rows remain unchanged. */
export function expandCreatureLayers(source: Shardfile, warn: (message: string) => void = console.warn): Shardfile {
  const messages: string[] = [];
  const species = source.rows.species.map(row => {
    if (row.temperament !== undefined) return row;
    const preset = legacyCreatureProfile(row.kind);
    if (preset === undefined) return row;
    const temperament: CreatureTemperament = { ...preset.temperament,
      reaction: row.aggressive ? 'aggressive' : preset.temperament.reaction === 'aggressive' ? 'skittish' : preset.temperament.reaction };
    const look = source.rows.looks.find(entry => entry.species === row.id);
    messages.push(`species \`${row.id}\` uses old kind \`${row.kind}\`: expanded kit layers; declare its temperament explicitly`);
    return { ...row, type: row.type ?? preset.type,
      ...(row.body !== undefined || look === undefined ? {} : { body: { size: 'medium' as const, scale: 1, look: look.id } }),
      temperament: declaredTemperament(source, row, temperament), senses: row.senses ?? preset.senses,
      presentation: row.presentation ?? preset.presentation,
      abilities: row.abilities ?? source.rows.strikes.filter(strike => strike.tags.includes(`creature.${row.kind}`)).map(strike => ({
        use: strike.id, range: strike.range, cooldown: strike.cooldown, weight: strike.weight, damage: strike.damage,
        speed: strike.speed, windup: strike.windup,
      })),
    };
  });
  if (messages.length === 0) return source;
  const expanded = parseShardfile({ ...source, rows: parseRows({ ...source.rows, species }) });
  for (const message of messages) warn(message);
  return expanded;
}

/** Check the final assembled rows, after source sections have contributed their declarations. */
export function assertCreatureTemperaments(rows: Shardfile['rows']): void {
  for (const row of rows.species) if (row.temperament === undefined) {
    throw new Error(`species \`${row.id}\` has no temperament: declare one, or use a kit creature`);
  }
}
