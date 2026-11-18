// oxlint-disable-next-line import/no-nodejs-modules -- Own and clean ordinary project fixtures.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Keep build fixtures inside lane scratch.
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import deer from '@wildshard/kit/content/creatures/deer.json' with { type: 'json' };
import wolf from '@wildshard/kit/content/creatures/wolf.json' with { type: 'json' };
import { deerCreature, wolfCreature } from '@wildshard/kit/creatures';
import { bakeWildlife } from '@wildshard/kit/geometry/wildlife';
import { parseRows } from '@wildshard/format/rows';
import { parseSkinFile } from '@wildshard/format/skinAssets';
import { emptyShardfile } from '@wildshard/sdk/author';
import { hashImmutableBytes } from '@wildshard/sdk/immutable';
import { validateOutputProduct } from '@wildshard/sdk/outputProduct';
import { buildProject } from './project';

test('ordinary projects admit both wildlife products from plain files and Kit helpers', async () => {
  const scratch = resolve(import.meta.dirname, '../../../../tmp/codex-te2e'); mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, 'cc56b-'));
  const originalCache = process.env['WILDSHARD_GEN_CACHE']; process.env['WILDSHARD_GEN_CACHE'] = join(root, 'cache');
  try {
    const shard = emptyShardfile({ slug: 'kit-wildlife', name: 'Kit wildlife', author: 'Test', revision: 1, seed: 42 });
    const bodies = [deer, wolf];
    const assembled = [deerCreature({ id: deer.species.id, look: deer.species.body.look }), wolfCreature({ id: wolf.species.id, look: wolf.species.body.look })];
    const items = assembled.flatMap(content => content.items);
    shard.items.catalogue = items;
    const assets = new Map<string, Uint8Array>();
    const looks = [];
    let distinctGlb: string | undefined;
    for (const [index, kind] of (['deer', 'wolf'] as const).entries()) {
      const source = bodies[index];
      if (source === undefined) throw new Error('Missing wildlife rows');
      const glb = new Uint8Array(readFileSync(new URL(import.meta.resolve(`@wildshard/kit/content/wildlife/${kind}.glb`))));
      const metadata = new Uint8Array(readFileSync(new URL(import.meta.resolve(`@wildshard/kit/content/wildlife/${kind}.skin.json`))));
      const regenerated = await bakeWildlife(kind);
      expect(regenerated.glb).toEqual(glb);
      expect(regenerated.skin).toEqual(metadata);
      const file = hashImmutableBytes(glb), skin = hashImmutableBytes(metadata), cost = parseSkinFile(metadata).row.cost;
      expect(file).not.toBe(distinctGlb);
      distinctGlb = file;
      assets.set(file, glb); assets.set(skin, metadata);
      shard.files.push({ hash: file, kind: 'glb', compressed: glb.length, ...cost, dependencies: [], critical: false },
        { hash: skin, kind: 'json', compressed: metadata.length, decoded: metadata.length * 2, gpu: 0, triangles: 0, draws: 0, dependencies: [file], critical: false });
      shard.library.push(skin);
      looks.push({ id: source.species.body.look, species: source.species.id, recipe: 'platform.skin', material: null,
        parameters: { skin }, animation: { recipe: 'platform.clips', parameters: { attackSpan: 1 } } });
      const variant = source.species.variants[0]; if (variant === undefined) throw new Error('Missing wildlife variant');
      shard.creatures.spawns.push({ id: `fixture.${kind}`, species: source.species.id, variant: variant.id, at: [index * 4, 0, 5], yaw: 0, scale: 1, seed: index, brain: null, strike: null });
    }
    shard.budgets.library = { resident: shard.files.reduce((sum, row) => sum + row.decoded + row.gpu, 0), compressed: shard.files.reduce((sum, row) => sum + row.compressed, 0) };
    let packedRows: Uint8Array | undefined;
    for (const mode of ['plain', 'helper'] as const) {
      const directory = join(root, mode); mkdirSync(directory);
      const content = mode === 'plain' ? bodies : assembled;
      shard.rows = parseRows({ ...shard.rows, species: content.map(x => x.species), strikes: content.flatMap<unknown>(x => x.strikes), looks });
      writeFileSync(join(directory, 'shard.json'), JSON.stringify(shard));
      for (const [key, bytes] of assets) writeFileSync(join(directory, key), bytes);
      mkdirSync(join(directory, 'node_modules', '@wildshard'), { recursive: true });
      symlinkSync(resolve(import.meta.dirname, '../../../kit'), join(directory, 'node_modules', '@wildshard', 'kit'), 'dir');
      writeFileSync(join(directory, 'shard.config.ts'), `import shard from './shard.json' with {type:'json'};
${mode === 'plain' ? '' : "import { bakeWildlife } from '@wildshard/kit/geometry/wildlife';"}
export default async ctx => {
  const ids = shard.files.map(row => row.hash);
  const assets = await ctx.cached({id:'kit-wildlife-${mode}',inputs:ids}, async files => {
    ${mode === 'plain' ? 'return files;' : "const deer = await bakeWildlife('deer');const wolf = await bakeWildlife('wolf');return new Map(ids.map((id,index)=>[id,[deer.glb,deer.skin,wolf.glb,wolf.skin][index]]));"}
  });
  return {shard,output:{assets}};
};`);
      const out = join(directory, 'built');
      await buildProject(directory, out, { client: null });
      const product = validateOutputProduct(out);
      for (const [key, bytes] of assets) expect(product.assets.get(key)).toEqual(bytes);
      const rows = new TextEncoder().encode(JSON.stringify(product.shard.rows));
      if (packedRows === undefined) packedRows = rows;
      else expect(rows).toEqual(packedRows);
    }
  } finally {
    if (originalCache === undefined) delete process.env['WILDSHARD_GEN_CACHE']; else process.env['WILDSHARD_GEN_CACHE'] = originalCache;
    rmSync(root, { recursive: true, force: true });
  }
}, 60_000);
