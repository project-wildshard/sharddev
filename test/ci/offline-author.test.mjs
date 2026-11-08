// Ring 2: an installed author's complete cold build warms the real compiler;
// a second complete build runs with OS networking
// denied. Linux uses a fresh network namespace; macOS uses Seatbelt. Nothing
// patches fetch, sockets, the compiler, the physics host or quest facts.
import '@wildshard/engine/scripts/sim-node-loader.mjs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {after,test} from 'node:test';
import {installWildshard} from '../../src/test/helpers/install.ts';

const parent=process.env.WS_PROOF_SCRATCH??tmpdir();mkdirSync(parent,{recursive:true});
const root=mkdtempSync(join(parent,'offline-author-'));
after(()=>rmSync(root,{recursive:true,force:true}));
const bin=installWildshard(root),app=join(root,'app'),source=join(app,'walking-isle');
const cache={WILDSHARD_GEN_CACHE:join(root,'generation'),WILDSHARD_SHARDFILE_CACHE:join(root,'compiler')};
function processRun(args,isolated=false){
 let command=process.execPath,arguments_=args;
 if(isolated){
  if(process.platform==='darwin'){command='/usr/bin/sandbox-exec';arguments_=['-p','(version 1)(allow default)(deny network*)',process.execPath,...args];}
  else {assert.equal(process.platform,'linux','An actual OS network boundary is required');command='sudo';
   arguments_=['-n','unshare','--net','--','setpriv',`--reuid=${process.getuid()}`,`--regid=${process.getgid()}`,'--init-groups','--reset-env','env',...Object.entries(cache).map(([key,value])=>`${key}=${value}`),process.execPath,...args];}
 }
 const done=spawnSync(command,arguments_,{cwd:app,encoding:'utf8',timeout:90_000,env:{...process.env,...cache}});
 assert.ifError(done.error);return done;
}
function cli(args,isolated=false){const done=processRun([bin,...args],isolated);assert.equal(done.status,0,`${done.stdout}\n${done.stderr}`);return done;}
function inventory(directory,prefix=''){
 return readdirSync(join(directory,prefix),{withFileTypes:true}).flatMap(row=>{
  const file=join(prefix,row.name);return row.isDirectory()?inventory(directory,file):[[file,createHash('sha256').update(readFileSync(join(directory,file))).digest('hex')]];
 }).sort(([a],[b])=>a.localeCompare(b));
}

test('the installed author builds a real walking quest and warms its compiler',{timeout:120_000},()=>{
 cli(['new',source,'walking-isle','--empty']);
 writeFileSync(join(source,'shard.config.ts'),`import {emptyShardfile} from '@wildshard/sharddev/author';
 const world=emptyShardfile({slug:'walking-isle',name:'Walking isle',author:'Outside author',seed:1,revision:1});
 export default {...world,quests:{flags:['walk.arrived','walk.complete'],quests:[{id:'walk.quest',title:'Reach the marker',track:false,
  completeFlag:'walk.complete',steps:[{id:'marker',objective:'Walk to the marker',done:{all:['walk.arrived']}}],onComplete:{fact:'walk.quest',coins:1}}],
  triggers:[{id:'marker',kind:'region',flag:'walk.arrived',x:0,z:-4,radius:1}],dialogue:[]},
  ledger:[{fact:'walk.quest',origin:{kind:'engine',source:'quest:walk.quest'},rewards:[{kind:'achievement',id:'walk.first',title:'First walk',threshold:1}]}]};`);
 cli(['build',source,join(app,'online'),'--product-only']);
});
test('the OS boundary cannot connect to a real parent loopback listener',{timeout:9_500},async()=>{
 const server=createServer(socket=>socket.destroy());
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 try{
  const {port}=server.address();
  const done=processRun(['--input-type=module','-e',`import net from 'node:net';
   const socket=net.connect({host:'127.0.0.1',port:${port}});socket.once('connect',()=>process.exit(0));
   socket.once('error',error=>{console.log(error.code);process.exit(1)});setTimeout(()=>process.exit(2),1500);`],true);
  assert.equal(done.status,1,`The real OS boundary must deny the parent listener: ${done.stdout}\n${done.stderr}`);
  assert.match(done.stdout,/EPERM|EACCES|ECONNREFUSED|ENETUNREACH/);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('an OS-isolated warm build publishes exactly the online bytes',{timeout:120_000},()=>{
 cli(['build',source,join(app,'offline'),'--product-only'],true);
 assert.deepEqual(inventory(join(app,'offline')),inventory(join(app,'online')));
});
