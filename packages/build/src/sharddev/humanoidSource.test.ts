// oxlint-disable-next-line import/no-nodejs-modules -- Own and remove the bounded ordinary-project fixtures.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve only repository-owned scratch.
import { join, resolve } from 'node:path';
import { test, expect } from 'vitest';
import { BoxGeometry } from 'three';
import { commonCreature } from '@wildshard/kit/creatures';
import { humanoidSource } from '@wildshard/kit/skeletons';
import { parseRows } from '@wildshard/format/rows';
import { parseShardfile } from '@wildshard/format/shardSchema';
import { parseGlb } from '@wildshard/format/shardfileAssets';
import { emptyShardfile } from '@wildshard/sdk/author';
import { skinnedGlb } from '@wildshard/sdk/bake/skinned';
import { hashImmutableBytes } from '@wildshard/sdk/immutable';
import { creatureSkin } from '@wildshard/sdk/scene/creature';
import { validateOutputProduct } from '@wildshard/sdk/outputProduct';
import { buildProject } from './project';

test('three ordinary project builds compile the configurable humanoid without baking body scale into geometry', async () => {
  const scratch = resolve(import.meta.dirname, '../../../../tmp/codex-te2e'); mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, 'cc10a2b2a-project-'));
  const cache = process.env['WILDSHARD_GEN_CACHE']; process.env['WILDSHARD_GEN_CACHE'] = join(root, 'cache');
  const head = new BoxGeometry(0.5, 0.3, 0.2), attachment = new BoxGeometry(0.06, 0.08, 0.1);
  try {
    let unitHash: string | undefined;
    for (const scale of [0.5, 1, 2]) {
      const directory = join(root, `scale-${scale}`); mkdirSync(directory);
      const sockets = ['head', 'hand.L', 'hand.R', 'chest', 'back'];
      const source = humanoidSource({ look: 'fixture.look', scale, head, attachments: sockets.map(socket => ({ socket, geometry: attachment, at: [0, 0, 0.12] })) });
      try {
        const glb = skinnedGlb(source).glb;
        const metadata = new TextEncoder().encode(JSON.stringify(creatureSkin({ glb, bones: source.bones, clips: [], lamps: [] }, { id: 'fixture.humanoid', binding: { loops: [], material: { family: 'pbr', vertexColours: true } } })));
        const file = hashImmutableBytes(glb), skin = hashImmutableBytes(metadata), cost = parseGlb(glb);
        if (unitHash === undefined) unitHash = file; else expect(file).toBe(unitHash);
        const content = commonCreature('boar', { id: 'fixture.humanoid', look: 'fixture.look' });
        content.species.body = source.body; content.species.dims = source.dims;
        const shard = emptyShardfile({ slug: 'kit-humanoid', name: 'Kit humanoid', author: 'Test', revision: 1, seed: 42 });
        shard.rows = parseRows({ ...shard.rows, species: [content.species], strikes: content.strikes,
          looks: [{ id: 'fixture.look', species: 'fixture.humanoid', recipe: 'platform.skin', material: null, parameters: { skin }, animation: { recipe: 'platform.clips', parameters: { attackSpan: 1 } } }] });
        shard.items.catalogue = content.items;
        const variant = content.species.variants[0]; if (variant === undefined) throw new Error('Missing fixture variant');
        shard.creatures.spawns = [{ id: 'fixture.actor', species: 'fixture.humanoid', variant: variant.id, at: [0, 0, 4], yaw: 0, scale: 1, seed: 1, brain: null, strike: null }];
        shard.files = [{ hash: file, kind: 'glb', compressed: glb.length, ...cost, dependencies: [], critical: false },
          { hash: skin, kind: 'json', compressed: metadata.length, decoded: metadata.length * 2, gpu: 0, triangles: 0, draws: 0, dependencies: [file], critical: false }];
        shard.library = [skin];
        shard.budgets.library = { resident: shard.files.reduce((sum, row) => sum + row.decoded + row.gpu, 0), compressed: shard.files.reduce((sum, row) => sum + row.compressed, 0) };
        const data = JSON.stringify(parseShardfile(shard)), shape = JSON.stringify({ scale });
        writeFileSync(join(directory, 'data.json'), data); writeFileSync(join(directory, 'shape.json'), shape);
        mkdirSync(join(directory, 'node_modules', '@wildshard'), { recursive: true });
        symlinkSync(resolve(import.meta.dirname, '../../../sdk'), join(directory, 'node_modules', '@wildshard', 'sdk'), 'dir');
        symlinkSync(resolve(import.meta.dirname, '../../../kit'), join(directory, 'node_modules', '@wildshard', 'kit'), 'dir');
        symlinkSync(resolve(import.meta.dirname, '../../../kit/node_modules/three'), join(directory, 'node_modules', 'three'), 'dir');
        writeFileSync(join(directory, 'shard.config.ts'), `import data from './data.json' with {type:'json'};
import {BoxGeometry} from 'three';
import {humanoidSource} from '@wildshard/kit/skeletons';
import {skinnedGlb} from '@wildshard/sdk/bake/skinned';
import {creatureSkin} from '@wildshard/sdk/scene/creature';
import {hashImmutableBytes} from '@wildshard/sdk/immutable';
export default async ctx=>{
 const assets=await ctx.cached({id:'kit-humanoid',inputs:['shape.json']},async inputs=>{
  const bytes=inputs.get('shape.json');if(!bytes)throw new Error('Missing declared shape');
  const {scale}=JSON.parse(new TextDecoder().decode(bytes));
  const head=new BoxGeometry(.5,.3,.2),attachment=new BoxGeometry(.06,.08,.1);
  const source=humanoidSource({look:'fixture.look',scale,head,attachments:['head','hand.L','hand.R','chest','back'].map(socket=>({socket,geometry:attachment,at:[0,0,.12]}))});
  try{
   const glb=skinnedGlb(source).glb;
   const skin=new TextEncoder().encode(JSON.stringify(creatureSkin({glb,bones:source.bones,clips:[],lamps:[]},{id:'fixture.humanoid',binding:{loops:[],material:{family:'pbr',vertexColours:true}}})));
   return new Map([[hashImmutableBytes(glb),glb],[hashImmutableBytes(skin),skin]]);
  }finally{head.dispose();attachment.dispose();for(const part of source.parts){part.geometry.dispose();part.material.dispose()}}
 });
 return {shard:data,output:{assets}};
};
`);
        await buildProject(directory, join(directory, 'built'), { client: null });
        const built = validateOutputProduct(join(directory, 'built'));
        expect(built.shard.rows.species[0]?.body).toEqual(source.body);
        expect(built.assets.get(file)).toEqual(glb); expect(built.assets.get(skin)).toEqual(metadata);
        expect(readFileSync(join(directory, 'data.json'), 'utf8')).toBe(data);
        expect(readFileSync(join(directory, 'shape.json'), 'utf8')).toBe(shape);
      } finally { for (const part of source.parts) { part.geometry.dispose(); part.material.dispose(); } }
    }
    expect(head.boundingBox).toBeNull(); expect(attachment.boundingBox).toBeNull();
  } finally {
    head.dispose(); attachment.dispose();
    if (cache === undefined) delete process.env['WILDSHARD_GEN_CACHE']; else process.env['WILDSHARD_GEN_CACHE'] = cache;
    rmSync(root, { recursive: true, force: true });
  }
}, 60_000);
