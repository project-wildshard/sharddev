// oxlint-disable-next-line import/no-nodejs-modules -- Independently verify the addressed bytes returned by the producer.
import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import { resolveSkinLookFiles, skinLookRules } from '@wildshard/format/skinAssets';
import { parseRows } from '@wildshard/format/rows';
import { kitCreature } from './kitCreatures';

test.each(['boar', 'bear'] as const)('every %s body in both families passes real skin admission and preserves shipped bytes', async kind => {
  for (const family of ['pbr', 'toon'] as const) {
    const product = await kitCreature(kind, { id: 'author.beast', look: 'author.beast.look', family });
    const rows = parseRows({ species: [product.species], strikes: product.strikes, looks: [product.look], weather: [], days: [], compendiums: [], loot: [] });
    expect(skinLookRules({ rows, files: product.files, library: product.library })).toEqual([]);
    const resolved = resolveSkinLookFiles({ rows, files: product.files }, product.look, product.assets);
    expect(resolved.variants?.size).toBe(product.species.variants.length);
    expect(new Set([...resolved.variants?.values() ?? []].map(value => value.row.file)).size).toBe(product.species.variants.length);
    for (const file of product.files) {
      const bytes = product.assets.get(file.hash); expect(bytes).toBeDefined();
      expect(createHash('sha256').update(bytes ?? new Uint8Array()).digest('hex')).toBe(file.hash);
      expect(bytes?.length).toBe(file.compressed);
    }
  }
});

test('explicit aliases reuse the shipped body and asset closure, and unknown overrides refuse', async () => {
  const product = await kitCreature('boar', { id: 'author.boar', look: 'author.boar.look', family: 'toon', skins: { sow: 'boar', black: 'boar' } });
  const rows = parseRows({ species: [product.species], strikes: product.strikes, looks: [product.look], weather: [], days: [], compendiums: [], loot: [] });
  const resolved = resolveSkinLookFiles({ rows, files: product.files }, product.look, product.assets);
  expect(resolved.variants?.get('sow')).toBe(resolved.variants?.get('boar'));
  expect(resolved.variants?.get('black')).toBe(resolved.variants?.get('boar'));
  expect(product.files.filter(file => file.kind === 'glb')).toHaveLength(4);
  await expect(kitCreature('boar', { id: 'author.boar', look: 'author.skin', family: 'toon', skins: { invented: 'boar' } })).rejects.toThrow('Unknown kit creature variant');
  await expect(kitCreature('boar', { id: 'author.boar', look: 'author.skin', family: 'toon', skins: { sow: 'invented' } })).rejects.toThrow('Unknown kit boar toon body');
});

// ONE-FORMAT OF-NE22 (NEW-SHARD-E2E F22): the kit's row for `rows.species` is `commonCreature`'s species (dims, mods,
// body); `commonSpeciesRows` is the older species-program shape and is refused there, as the GUIDE says.
test.each(['boar', 'bear'] as const)('commonCreature %s goes straight into rows.species; commonSpeciesRows does not', async kind => {
  const { commonCreature, commonSpeciesRows } = await import('@wildshard/kit');
  const { species, strikes } = commonCreature(kind, { id: `author.${kind}`, look: `author.${kind}.look`, strike: `author.${kind}.charge` });
  const look = { id: `author.${kind}.look`, species: species.id, recipe: 'platform.skin', material: null, parameters: { skin: 'a'.repeat(64) },
    animation: { recipe: 'platform.clips', parameters: { attackSpan: 1 } } };
  const rows = parseRows({ species: [species], strikes, looks: [look], weather: [], days: [], compendiums: [], loot: [] });
  expect(rows.species[0]?.dims).toBeDefined();
  expect(rows.species[0]?.variants.every(variant => variant.mods !== undefined)).toBe(true);
  expect(() => parseRows({ species: [commonSpeciesRows(kind, `author.${kind}`)], strikes: [], looks: [], weather: [], days: [], compendiums: [], loot: [] })).toThrow();
});
