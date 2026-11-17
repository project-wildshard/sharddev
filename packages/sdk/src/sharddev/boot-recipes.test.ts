import { expect, test } from 'vitest';
import { resolveBootFiles, resolveBootSources } from '@wildshard/engine/boot/filePolicy';
import { bootRecipeFiles, bootRecipeSources, type BootRecipes, type BootRecipeInputs } from './bootInventory';

const table = { phone: { '/fixture/a.phone.webp': '/fixture/a.ktx2', '/fixture/a.phone.webp#layer': '/fixture/a-layer.ktx2', '/page': '/fixture/page.ktx2' }, desktop: { '/fixture/a.webp': '/fixture/desktop.ktx2', '/page': '/fixture/page-desktop.ktx2' } };
const inputs: BootRecipeInputs = { inventory: { '/fixture/a.phone.webp': 4, '/fixture/a.webp': 7, '/fixture/a.ktx2': 2, '/fixture/a-layer.ktx2': 2, '/fixture/b.bin': true, '/assets/tex/oak/diffuse_1k.jpg': 3 },
  pages: { sheet: { phone: { '/page': { image: '/fixture/a.webp' } }, desktop: { '/page': { image: '/fixture/a.webp' } } } },
  aliases: { original: { '/fixture/b.bin': '/fixture/owned.bin' } } };
const recipes: BootRecipes = {
  direct: { source: { urls: ['/fixture/a.webp', '/fixture/a.webp', '/fixture/b.bin'] } },
  tier: { source: { urls: { phone: ['/fixture/a.webp'], desktop: ['/fixture/b.bin'] } } },
  concat: { source: { concat: ['direct', 'tier', 'direct'] } },
  prefix: { source: { publicPrefix: '/fixture/' } },
  pbr: { source: { pbr: ['oak'] } }, gltf: { source: { gltf: ['arch'] } },
  table: { source: { tablePrefix: '/fixture/' } }, pages: { source: { pages: 'sheet' } },
  available: { source: { available: ['/fixture/b.bin'], fallback: ['fallback'] } },
  fallback: { source: { available: ['missing'], fallback: ['/fixture/b.bin', '/fixture/b.bin'] } },
  filtered: { source: { concat: ['direct', 'prefix'] }, excludeParts: ['phone'], excludeBasenamePrefix: 'a.', unique: true },
  mapped: { source: { urls: ['/fixture/a.webp', '/fixture/b.bin'] }, map: ['gpu', 'layer'], present: true },
  except: { source: { concat: ['direct', 'direct'] }, except: 'tier' },
  aliases: { source: { urls: ['/fixture/b.bin'] }, aliases: 'original' },
};

test('author boot recipes retain every native selector, transform, order and duplicate', () => {
  const before = structuredClone({ recipes, table, inputs });
  for (const tier of ['phone', 'desktop'] as const) for (const tex of ['img', 'ktx2'] as const) {
    for (const key of Object.keys(recipes)) expect(bootRecipeFiles(recipes, key, tier, tex, table, inputs))
      .toEqual(resolveBootFiles(recipes, key, tier, tex, table, inputs));
    const sources = { sky: 'concat', baked: 'table', terrain: 'prefix', trees: 'pbr', physics: 'direct', cabins: 'gltf', props: 'mapped', art: 'pages', music: 'aliases', sfx: 'fallback' };
    expect(bootRecipeSources(recipes, sources, tier, tex, table, inputs)).toEqual(resolveBootSources(recipes, sources, tier, tex, table, inputs));
  }
  expect({ recipes, table, inputs }).toEqual(before);
});

test('author boot recipes keep original missing metadata, cycle and expansion refusals', () => {
  const fails: { rows: BootRecipes; key: string; inputs: BootRecipeInputs }[] = [
    { rows: recipes, key: 'missing', inputs },
    { rows: { a: { source: { concat: ['b'] } }, b: { source: { concat: ['a'] } } }, key: 'a', inputs },
    { rows: recipes, key: 'pages', inputs: { inventory: inputs.inventory } },
    { rows: recipes, key: 'aliases', inputs: { inventory: inputs.inventory } },
    { rows: { huge: { source: { urls: Array.from({ length: 4097 }, () => 'one') } } }, key: 'huge', inputs },
    { rows: { many: { source: { concat: Array.from({ length: 257 }, () => 'one') } }, one: { source: { urls: [] } } }, key: 'many', inputs },
    { rows: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [String(i), { source: i === 16 ? { urls: [] } : { concat: [String(i + 1)] } }])), key: '0', inputs },
  ];
  for (const value of fails) {
    let message: string | undefined;
    try { resolveBootFiles(value.rows, value.key, 'phone', 'img', table, value.inputs); } catch (error) {
      if (!(error instanceof Error)) throw error;
      message = error.message;
    }
    if (message === undefined) throw new Error('Native refusal control unexpectedly admitted');
    expect(() => bootRecipeFiles(value.rows, value.key, 'phone', 'img', table, value.inputs)).toThrow(message);
  }
  expect(() => bootRecipeFiles(recipes, 'pages', 'phone', 'ktx2', { phone: {}, desktop: {} }, inputs)).toThrow('Missing boot page stand-in');
  for (const inventory of [undefined, null]) expect(() => { Reflect.apply(bootRecipeFiles, undefined, [recipes, 'direct', 'phone', 'img', table, { inventory }]); }).toThrow('explicit inventory');
  expect(() => { Reflect.apply(bootRecipeSources, undefined, [recipes, { sky: 'direct' }, 'phone', 'img', table, undefined]); }).toThrow('explicit inventory');
});
