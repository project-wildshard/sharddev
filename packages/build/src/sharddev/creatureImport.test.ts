// oxlint-disable-next-line import/no-nodejs-modules -- Own the bounded project fixture and remove it after the proof.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve only this lane's repository scratch.
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import { commonCreature } from '@wildshard/kit/creatures';
import { parseRows } from '@wildshard/format/rows';
import { parseShardfile } from '@wildshard/format/shardSchema';
import { parseGlb } from '@wildshard/format/shardfileAssets';
import { emptyShardfile } from '@wildshard/sdk/author';
import { hashImmutableBytes } from '@wildshard/sdk/immutable';
import { creatureSkin } from '@wildshard/sdk/scene/creature';
import { importCreatureGlb } from '@wildshard/sdk/scene/creature-import';
import { validateOutputProduct } from '@wildshard/sdk/outputProduct';
import { importedBiped } from '../../../sdk/test/fixtures/creature-import';
import { buildProject } from './project';

test('an ordinary project imports its raw vendor GLB through the public SDK and admits the actual output', async () => {
  const scratch = resolve(import.meta.dirname, '../../../../tmp/codex-te2e'); mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, 'cc10a2a-project-'));
  const cache = process.env['WILDSHARD_GEN_CACHE']; process.env['WILDSHARD_GEN_CACHE'] = join(root, 'cache');
  try {
    const original = await importedBiped('mixamo'), rig = await importCreatureGlb(original, { skeleton: 'biped', map: 'mixamo' });
    const content = commonCreature('boar', { id: 'fixture.import', look: 'fixture.look' });
    content.species.body = { size: 'medium', scale: 1, skeleton: 'biped', look: 'fixture.look' };
    const source = emptyShardfile({ slug: 'chain-import', name: 'Chain import', author: 'Test', saveRevision: 1, seed: 41 });
    const metadata = new TextEncoder().encode(JSON.stringify(creatureSkin(rig, { id: 'fixture.import', binding: { loops: ['idle'], material: { family: 'pbr', vertexColours: false } } })));
    const file = hashImmutableBytes(rig.glb), skin = hashImmutableBytes(metadata), cost = parseGlb(rig.glb);
    source.rows = parseRows({ ...source.rows, species: [content.species], strikes: content.strikes,
      looks: [{ id: 'fixture.look', species: 'fixture.import', recipe: 'platform.skin', material: null, parameters: { skin }, animation: { recipe: 'platform.clips', parameters: { attackSpan: 1 } } }] });
    source.items.catalogue = content.items;
    const variant = content.species.variants[0]; if (variant === undefined) throw new Error('Missing actual fixture variant');
    source.creatures.spawns = [{ id: 'fixture.actor', species: 'fixture.import', variant: variant.id, at: [0, 0, 4], yaw: 0, scale: 1, seed: 1, brain: null, strike: null }];
    source.files = [{ hash: file, kind: 'glb', compressed: rig.glb.length, ...cost, dependencies: [], critical: false },
      { hash: skin, kind: 'json', compressed: metadata.length, decoded: metadata.length * 2, gpu: 0, triangles: 0, draws: 0, dependencies: [file], critical: false }];
    source.library = [skin];
    source.budgets.library = { resident: source.files.reduce((sum, row) => sum + row.decoded + row.gpu, 0), compressed: source.files.reduce((sum, row) => sum + row.compressed, 0) };
    mkdirSync(join(root, 'assets')); writeFileSync(join(root, 'assets', skin), metadata); writeFileSync(join(root, 'author.glb'), original);
    const text = JSON.stringify(parseShardfile(source)); writeFileSync(join(root, 'data.json'), text);
    // Model the installed SDK dependency of an ordinary source project.
    mkdirSync(join(root, 'node_modules', '@wildshard'), { recursive: true });
    symlinkSync(resolve(import.meta.dirname, '../../../sdk'), join(root, 'node_modules', '@wildshard', 'sdk'), 'dir');
    // The config reads through the build's declared input capability and emits
    // its compiled bytes through normal output admission, with no file effects.
    writeFileSync(join(root, 'shard.config.ts'), `import data from './data.json' with {type:'json'};
import {importCreatureGlb} from '@wildshard/sdk/scene/creature-import';
import {hashImmutableBytes} from '@wildshard/sdk/immutable';
export default async ctx=>{
 const files=await ctx.cached({id:'import-creature',inputs:['author.glb']},async inputs=>{
  const bytes=inputs.get('author.glb');if(!bytes)throw new Error('Missing declared GLB input');
  const rig=await importCreatureGlb(bytes,{skeleton:'biped',map:'mixamo'});
  return new Map([['import.glb',rig.glb]]);
 });
 const glb=files.get('import.glb');
 if(!glb||hashImmutableBytes(glb)!==${JSON.stringify(file)})throw new Error('Import output identity changed');
 return {shard:data,output:{assets:new Map([[${JSON.stringify(file)},glb]])}};
};
`);
    await buildProject(root, join(root, 'built'), { client: null });
    const built = validateOutputProduct(join(root, 'built'));
    expect(built.shard.rows.species[0]?.body?.skeleton).toBe('biped');
    expect(built.assets.get(file)).toEqual(rig.glb); expect(built.assets.get(skin)).toEqual(metadata);
    expect(readFileSync(join(root, 'author.glb'))).toEqual(Buffer.from(original)); expect(readFileSync(join(root, 'data.json'), 'utf8')).toBe(text);
  } finally {
    if (cache === undefined) delete process.env['WILDSHARD_GEN_CACHE']; else process.env['WILDSHARD_GEN_CACHE'] = cache;
    rmSync(root, { recursive: true, force: true });
  }
});
