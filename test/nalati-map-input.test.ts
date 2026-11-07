import {afterEach,expect,test} from 'vitest';
// oxlint-disable-next-line import/no-nodejs-modules -- This regression stages only declared metadata in an owned sandbox.
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Redirect the map reader into the owned fixture.
import {dirname,resolve} from 'node:path';
import * as v from 'valibot';
import {readMapJson} from '../scripts/map-geometry.mjs';

const owned:string[]=[];
afterEach(()=>{for(const root of owned.splice(0))rmSync(root,{recursive:true,force:true});});
function fixture(files:Record<string,unknown>):string {
 mkdirSync('tmp',{recursive:true});const root=mkdtempSync(resolve('tmp','nalati-map-input-'));owned.push(root);
 for(const [name,value]of Object.entries(files)){const path=resolve(root,name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(value));}
 return root;
}

test('the defining map JSON decoder retains numeric decoding for staged metadata',()=>{
 const prepared={places:{rows:[]},view:{sequence:[]},dressing:{rows:[]},sample:['-0','Infinity','-Infinity']};
 const root=fixture({'data/placeRuntime.generated.json':prepared});
 expect(readMapJson(resolve(root,'data/placeRuntime.generated.json'))).toEqual({...prepared,sample:[-0,Infinity,-Infinity]});
});

test('a missing declared data copy refuses rather than reading stale boot metadata',()=>{
 const root=fixture({'boot/placeRuntime.generated.json':{projection:'stale'}});
 expect(()=>readMapJson(resolve(root,'data/placeRuntime.generated.json'))).toThrow('ENOENT');
});

test('the map freshness recipe names native source inputs instead of retired handoffs',()=>{
 const settings=v.parse(v.object({inputs:v.array(v.string())}),JSON.parse(readFileSync('src/shards/nalati-grasslands/data/map.json','utf8')));
 expect(settings.inputs).not.toContain('data/placeRuntime.generated.json');
 expect(settings.inputs).not.toContain('../../../public/assets/nalati/baked/places.bin');
 expect(settings.inputs).toContain('../../sharddev/bake/annulus.ts');
 expect(settings.inputs).not.toContain('data/poiPaint.json');
 expect(settings.inputs).toContain('data/poiContacts.json');
 expect(settings.inputs).toContain('../../../public/assets/nalati/models/boulder-1.phone.glb');
 expect(settings.inputs).toContain('data/campMaterials.json');
 expect(settings.inputs).not.toContain('data/specimens.generated.json');
 expect(settings.inputs).toContain('../../../pnpm-lock.yaml');
});
