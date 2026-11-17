// A standalone recurve asset tool (GR6, D2-style): run it by hand when the recurve
// bow changes; its committed outputs are public/assets/nalati/baked/recurve-pool.json and the pool GLB it names.
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {recurvePool} from '../src/shards/nalati-grasslands/generators/recurvePool.ts';

const made=recurvePool(),out=new URL('../public/assets/nalati/baked/',import.meta.url);
const hash=createHash('sha256').update(made.glb).digest('hex');
if(hash!=='6f362ed67dfffeb86ad47768a8e43a59267da96dee77914d0f9cf2af70b8e3ea')throw new Error(`Recurve pool hash changed (${hash}); update the declared generation output`);
made.rows.pool.url=`/assets/nalati/baked/${hash}.glb`;
const metadata=new URL('recurve-pool.json',out),text=`${JSON.stringify(made.rows)}\n`;
if(process.argv.includes('--check')){
  if(!readFileSync(new URL(`${hash}.glb`,out)).equals(made.glb)||readFileSync(metadata,'utf8')!==text)throw new Error('Recurve pool stale: run bake-recurve-pool.mjs');
}else{
  mkdirSync(out,{recursive:true});writeFileSync(new URL(`${hash}.glb`,out),made.glb);writeFileSync(metadata,text);
}
