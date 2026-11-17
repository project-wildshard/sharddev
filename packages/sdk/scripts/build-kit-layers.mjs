import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFormatHook } from '@wildshard/format/formatHook';

installFormatHook();

const { parseRows } = await import('@wildshard/format/rows');
const { legacyCreatureProfile } = await import('../../kit/src/legacySpecies.ts');
const { abilities } = await import('../../kit/src/abilities.ts');

const root = fileURLToPath(new URL('../../kit/', import.meta.url));
const catalogue = JSON.parse(readFileSync(resolve(root, 'content/animated/catalogue.json'), 'utf8'));
for (const kind of ['boar', 'bear']) {
  const original = JSON.parse(readFileSync(resolve(root, `content/species/${kind}.json`), 'utf8'));
  const profile = legacyCreatureProfile(kind);
  const shape = catalogue.find(entry => entry.kind === kind && entry.family === 'pbr' && entry.variant === original.variants[0].id);
  if (profile === undefined || shape === undefined) throw new Error(`Missing kit ${kind} content`);
  const id = original.id, look = `${id}.look`;
  const { ability, strike } = abilities.charge({ id: `${id}.charge`, damage: original.chargeDamage });
  strike.speed = original.chargeSpeed; strike.windup = original.chargeWindup; strike.tags = [`creature.${kind}`];
  const rows = parseRows({ strikes: [strike], weather: [], days: [], compendiums: [], loot: [],
    species: [{ id, kind, label: original.label, aggressive: original.aggressive, lockable: original.lockable,
      variants: original.variants.map(variant => ({ ...variant, hp: variant.hp ?? original.tuning.hp,
        mods: { speed: 1, chargeDist: 1, damageTaken: 1, chargeDamage: original.chargeDamage, relentless: false, ...variant.mods } })),
      ...profile, dims: shape.dims, body: { skeleton: 'quadruped', size: 'medium', scale: 1, look },
      abilities: [{ ...ability, damage: strike.damage, speed: strike.speed, windup: strike.windup }],
      ...(original.harvest === undefined ? {} : { harvest: original.harvest }) }],
    looks: [{ id: look, species: id, recipe: 'platform.skin', material: null, parameters: {}, animation: { recipe: 'platform.clips', parameters: {} } }] });
  // Keep the additive harvest declaration last, preserving the committed content bytes.
  const { harvest, ...species } = rows.species[0];
  const content = { species: { ...species, ...(harvest === undefined ? {} : { harvest }) }, strikes: rows.strikes };
  const file = resolve(root, `content/creatures/${kind}.json`), bytes = `${JSON.stringify(content, null, 2)}\n`;
  if (process.argv.includes('--check')) {
    if (readFileSync(file, 'utf8') !== bytes) throw new Error(`Stale kit creature layers: ${kind}`);
  } else writeFileSync(file, bytes);
}
