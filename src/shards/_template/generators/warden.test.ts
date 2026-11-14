// oxlint-disable-next-line import/no-nodejs-modules -- Read the committed Warden skin bytes from disk.
import { readFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Read the committed Warden skin bytes from disk.
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { validateSkinAssets } from '@wildshard/format/skinAssets';
import { bakeWardenSkin, WARDEN_PARTS } from './warden';
import skins from '../data/skins.json' with { type: 'json' };
import rows from '../data/rows.json' with { type: 'json' };
import creatures from '../data/creatures.json' with { type: 'json' };
import look from '../data/look.json' with { type: 'json' };

const ASSETS = resolve(import.meta.dirname, '../assets');

// SHARD-SOURCE M4.10 (Jake: the Barrow Warden must no longer be a ball): the Warden is a mossy stone golem baked by
// generators/warden.ts (scripts/bake/template-warden.mjs writes it). The committed bytes are that bake's, exactly.
test('the Warden skin is the generator\'s bake, admitted at its declared cost', async () => {
  const { glb, json, entry } = await bakeWardenSkin();
  const committed = skins.find((row) => row.species === 'barrow-warden');
  expect(committed, 'data/skins.json has the barrow-warden entry; run node scripts/bake/template-warden.mjs').toEqual(entry);
  expect(new Uint8Array(readFileSync(resolve(ASSETS, entry.glb)))).toEqual(glb);
  expect(new Uint8Array(readFileSync(resolve(ASSETS, entry.skin)))).toEqual(json);
  const [, file] = entry.files;
  expect(file?.triangles).toBeGreaterThanOrEqual(300); expect(file?.triangles).toBeLessThanOrEqual(1500);
  // the parts draw in the look's emissive materials; validateSkinAssets checks bones, clips, parts and cost
  for (const id of Object.values(WARDEN_PARTS)) expect(Object.keys(look.materials)).toContain(id);
  const source = { rows: { looks: [{ id: entry.look, species: entry.species, recipe: 'platform.skin', material: null, parameters: { skin: entry.skin }, animation: { recipe: 'platform.clips', parameters: { attackSpan: 1 } } }] }, files: entry.files, look: { materials: look.materials } };
  expect(() => { validateSkinAssets(source as unknown as Parameters<typeof validateSkinAssets>[0], new Map([[entry.skin, json], [entry.glb, glb]])); }).not.toThrow();
});

test('the Barrow Warden spawn is its own species; the grey blob keeps only its grey variant', () => {
  const warden = creatures.spawns.find((row) => row.id === 'barrow-warden');
  expect(warden?.species).toBe('barrow-warden'); expect(warden?.variant).toBe('warden'); expect(warden?.strike).toBe('template.warden.slam');
  expect(creatures.spawns.find((row) => row.id === 'grey-blob:1')?.species).toBe('grey-blob');
  const species = rows.species.find((row) => row.id === 'barrow-warden');
  expect(species?.variants.map((row) => row.id)).toEqual(['warden']);
  expect(rows.species.find((row) => row.id === 'grey-blob')?.variants.map((row) => row.id)).toEqual(['grey']);
});
