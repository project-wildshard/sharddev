// oxlint-disable-next-line import/no-nodejs-modules -- Exercise the existing native chain with its shipped Rapier bytes.
import { readFileSync } from 'node:fs';
import { expect,test,vi } from 'vitest';
import { Group,MeshBasicMaterial,Vector3 } from 'three';
import { App } from '../src/client/engine/app/app';
import { createLevelInstallation } from '../src/client/engine/level/installation';
import { Scope } from '../src/shared/engine/app/scope';
import type { World } from '../src/client/engine/core/bootstrap';
import { Physics } from '../src/shared/engine/physics/Physics';
import { loadRapier } from '../src/shared/engine/physics/rapier';
import { RopeChain } from '../src/shared/engine/physics/ropeChain';
import { shardContext, ShardPlugin, type ShardContext } from '../src/client/game/plugin/context';
import { hybridInstallation } from '../src/client/game/shardfile/hybrid';
import { bindResidentWorldScope, boundResidentWorldScope } from '../src/client/game/shardfile/hybridPresentation';
import { MANIFEST as TEMPLATE } from '../src/shards/_template/discovery.generated';
import * as movers from '../src/server/game/plugin/mover';
import { FollowedMovers, installFollowedMovers } from '../src/client/game/plugin/followedMovers';
import { installClientMoverOwners } from '../src/client/game/shardfile/clientMoverOwners';
import { publishEntryOwner } from '../src/shared/game/shardfile/entryOwners';
import { createShardProduct } from '../src/shared/game/shardfile/shardProduct';
import { hashImmutableBytes } from '../src/sdk/immutable';
import { emptyShardfile } from '../src/sharddev/author';
import { parseMovers } from '@wildshard/format/movers';
import { validateGraph } from '@wildshard/format/materialGraph';
import { lendLooks, type LentLooks } from '../src/client/game/shardfile/lentLooks';
import { originalDriftwoodMovers } from './fixtures/driftwood-movers';
import { legacyDouble } from '@wildshard/engine/test/FakeGame';


const island = originalDriftwoodMovers();

const admitted=parseMovers(island),boat=admitted.find(row=>row.kind==='platform');
if(boat===undefined)throw new Error('Missing admitted platform fixture');
const platform=boat;
type FixtureWorld=NonNullable<NonNullable<ShardContext['game']['runtime']>['world']>;
const fixtureRuntime=(scope:Scope):FollowedMovers=>new FollowedMovers([platform],{scope,physics:legacyDouble<Physics>({}),adopt:()=>({pose:()=>undefined}),restoreFlags:new Set()});

test('mover ABI reads every live pose field in order and returns detached input',async()=>{
  const scope=new Scope('mover-input'),host=await movers.createMoverHost([platform],new Map(),()=>[]);
  const runtime=new movers.MoverRuntime([platform],{scope,host,physics:()=>{throw new Error('Unexpected body');},adopt:()=>({pose:()=>undefined})});
  const native=host.world.entity.bind(host.world),read:number[]=[],fields:Record<number,number>={};
  for(const field of [1,2,3,4,5,6])Object.defineProperty(fields,field,{get:()=>{read.push(field);return field===1?-0:field;}});
  const reader=vi.spyOn(host.world,'entity').mockImplementation(handle=>{const row=native(handle);return row===undefined?undefined:{...row,fields};});
  try{
    const first=runtime.scriptInput(platform.id,17);
    expect(read).toEqual([1,2,3,4,5,6]);expect(first.slice(6)).toEqual([-0,2,3,4,5,6]);
    expect(first.slice(0,4)).toEqual([17,1/60,0,platform.entity]);
    Reflect.set(first,6,99);read.length=0;
    expect(runtime.scriptInput(platform.id,18).slice(6)).toEqual([-0,2,3,4,5,6]);
    expect(read).toEqual([1,2,3,4,5,6]);
  }finally{reader.mockRestore();scope.dispose();}
});
// D74: the fixture product's graph files by hash (a catalogue graph is its file)
const graphFiles=new Map<string,Uint8Array>();
function fixture(rows=admitted,bound=true){
  const scope=new Scope('mover-owners'),source=emptyShardfile({slug:'mover-owners',name:'Mover owners',author:'Fixture',revision:1,seed:9});
  if(bound){const construction=new Scope('mover-construction');bindResidentWorldScope(scope,construction);scope.onDispose(()=>{construction.dispose();});}
  // Root movers differ deliberately: this host reads only the admitted section.
  const product=createShardProduct({slug:source.identity.slug,revision:1,shardfile:source,sections:new Map<string,unknown>([['world/movers',{movers:rows}],['client/plan',{version:1,features:[]}]]),files:new Map(),read:hash=>{const bytes=graphFiles.get(hash);return bytes===undefined?Promise.reject(new Error('No guest bytes expected')):Promise.resolve(bytes);}});
  const world=legacyDouble<FixtureWorld>({game:legacyDouble<FixtureWorld['game']>({})});
  const ctx=legacyDouble<ShardContext>({scope,product,system:vi.fn<ShardContext['system']>(),game:legacyDouble<ShardContext['game']>({runtime:legacyDouble<NonNullable<ShardContext['game']['runtime']>>({world})})});
  return {ctx,scope,source};
}

test('typed scene loans preserve native pose order, visibility and the original system id',async()=>{
  const {ctx,scope}=fixture([platform]),group=new Group(),result=fixtureRuntime(scope);
  const install=vi.fn<typeof installFollowedMovers>().mockReturnValue(result);
  try{
    publishEntryOwner(scope,'object','boat',group);
    expect(await installClientMoverOwners(ctx,{system:'original.movers',bindings:[{id:platform.id,kind:'object',owner:'boat',order:'XYZ',visibility:'enabled'}]},install)).toBe(result);
    const options=install.mock.calls[0]?.[2],view=options?.views?.get(platform.id);
    if(options===undefined||view===undefined)throw new Error('Missing typed native view');
    expect(options.data).toEqual([platform]);expect(options.systemId).toBe('original.movers');
    view.pose({position:{x:2,y:3,z:4},euler:{x:.1,y:.2,z:.3},enabled:false},{});
    expect(group.position).toEqual(new Vector3(2,3,4));expect(group.rotation.order).toBe('XYZ');expect(group.visible).toBe(false);
    expect(group.userData['declaredMotion']).toBe(true);
    await expect(installClientMoverOwners(ctx,{system:'duplicate',bindings:[{id:platform.id,kind:'object',owner:'boat'}]},install)).rejects.toThrow('already installed');
    scope.dispose();expect(group.userData['declaredMotion']).toBeUndefined();
  }finally{scope.dispose();}
});

test('exact mover identities and every target preflight before native installation or draw mutation',async()=>{
  const {ctx,scope}=fixture([platform]),group=new Group(),install=vi.fn<typeof installFollowedMovers>();
  publishEntryOwner(scope,'object','boat',group);
  try{
    await expect(installClientMoverOwners(ctx,{system:'movers',bindings:[]},install)).rejects.toThrow('exact admitted');
    await expect(installClientMoverOwners(ctx,{system:'movers',bindings:[{id:'wrong',kind:'object',owner:'boat'}]},install)).rejects.toThrow('exact admitted');
    await expect(installClientMoverOwners(ctx,{system:'movers',bindings:[{id:platform.id,kind:'chain',owner:'boat'}]},install)).rejects.toThrow('kind differs');
    await expect(installClientMoverOwners(ctx,{system:'movers',bindings:[{id:platform.id,kind:'object',owner:'missing'}]},install)).rejects.toThrow('Missing live entry owner');
    expect(install).not.toHaveBeenCalled();expect(group.userData).toEqual({});
  }finally{scope.dispose();}
});

test('the original native chain is borrowed without replacing or disposing any body',async()=>{
  const row=admitted.find(value=>value.kind==='chain'),spec=row?.chain;
  if(row===undefined||spec===undefined)throw new Error('Missing chain fixture');
  const R=await loadRapier(Uint8Array.from(readFileSync('public/assets/physics/rapier.wasm'))),physics=new Physics(R),chain=new RopeChain(physics,spec);
  const {ctx,scope}=fixture([row]),dispose=vi.spyOn(chain,'dispose'),result=fixtureRuntime(scope),install=vi.fn<typeof installFollowedMovers>().mockReturnValue(result);
  try{
    const bodies=[...chain.bodies];publishEntryOwner(scope,'chain','deck',chain);
    await installClientMoverOwners(ctx,{system:'chain.movers',bindings:[{id:row.id,kind:'chain',owner:'deck'}]},install);
    expect(install.mock.calls[0]?.[2].views?.get(row.id)?.chain).toBe(chain);
    scope.dispose();expect(chain.bodies).toEqual(bodies);expect(dispose).not.toHaveBeenCalled();
  }finally{dispose.mockRestore();scope.dispose();chain.dispose();physics.dispose();}
});

test('the native installer refuses an ancestor retirement before reading or allocating physics',()=>{
  const {ctx,scope}=fixture([platform]),construction=new Scope('retiring-world'),entered=construction.child('entered');
  const readPhysics=vi.fn();
  const world=legacyDouble<World>({get physics():Physics{readPhysics();throw new Error('No native allocation during retirement');}});
  construction.onDispose(()=>undefined);
  const retiring=construction.disposeSteps();retiring.next();
  try{
    expect(entered.disposed).toBe(false);expect(entered.disposing).toBe(true);
    expect(()=>installFollowedMovers({...ctx,scope:entered},world,{data:[platform],systemId:'retiring.movers',restoreFlags:new Set()})).toThrow('scope left during admission');
    expect(readPhysics).not.toHaveBeenCalled();
  }finally{for(const step of retiring)void step;scope.dispose();construction.dispose();}
});

function moorLook(type:'vec2'|'float'='vec2'){
  const checked=validateGraph({version:1,kind:'material',model:'toon',params:{moor:{type,value:type==='vec2'?[0,0]:0}},
    nodes:{paint:{op:'const',type:'vec3',value:[1,1,1]}},stages:{surface:{colour:'paint'}}});
  if(!checked.ok)throw new Error(checked.errors.join('; '));
  // D74: a catalogue graph is its graph file, read back through the product
  const bytes=new TextEncoder().encode(JSON.stringify(checked.graph)),file=hashImmutableBytes(bytes);graphFiles.set(file,bytes);
  return {family:'graph' as const,file};
}

test('mooring follows each row, one reusable lift buffer, and rest',async()=>{
  const {ctx,scope,source}=fixture([platform]),group=new Group(),material=new MeshBasicMaterial(),write=vi.fn<LentLooks['setParam']>();
  const R=await loadRapier(Uint8Array.from(readFileSync('public/assets/physics/rapier.wasm'))),physics=new Physics(R);
  const moor={look:'fixture-moor',water:.375,cleats:[-2.9,2.9] as const};
  source.look.materials[moor.look]=moorLook();publishEntryOwner(scope,'object','boat',group);
  const install=vi.fn<typeof installFollowedMovers>((_ctx,_world,options)=>new FollowedMovers(options.data,{scope,physics,restoreFlags:new Set(),adopt:id=>options.views?.get(id)}));
  lendLooks(scope,{materials:new Map([[moor.look,material]]),setParam:(id,name,value)=>{
    const heave=group.position.y-moor.water,pitch=Math.sin(group.rotation.x);
    expect(value).toEqual([heave-moor.cleats[0]*pitch,heave-moor.cleats[1]*pitch]);
    write(id,name,value);
  },setTexture:()=>undefined,bindMeshMap:()=>material});
  try{
    const runtime=await installClientMoverOwners(ctx,{system:'original.movers',bindings:[{id:platform.id,kind:'object',owner:'boat',moor}]},install);
    if(runtime===undefined)throw new Error('Bound entry did not install its mover view');
    expect(write).not.toHaveBeenCalled(); // admission must not add a rest/initial update
    runtime.showRest();expect(write).toHaveBeenCalledTimes(1);const buffer=write.mock.calls[0]?.[2];
    for(let tick=1;tick<=180;tick++){
      runtime.follow(platform.id,{position:{x:1,y:Math.sin(tick/9),z:2},euler:{x:Math.sin(tick/7)/4,y:0,z:0},enabled:true});
      const pose=runtime.pose(platform.id),call=write.mock.calls.at(-1);
      expect(group.position).toEqual(new Vector3(pose.position.x,pose.position.y,pose.position.z));
      expect(group.rotation.x).toBe(pose.euler.x);expect(call?.[0]).toBe(moor.look);expect(call?.[1]).toBe('moor');expect(call?.[2]).toBe(buffer);
    }
    const writes=write.mock.calls.length;
    runtime.showRest();expect(write).toHaveBeenCalledTimes(writes+1);expect(write.mock.calls.at(-1)?.[2]).toBe(buffer);
  }finally{scope.dispose();material.dispose();physics.dispose();}
});

test.each(['missing','not-lent','wrong-param'] as const)('a %s mooring look refuses before any native or scene effect',async mode=>{
  const {ctx,scope,source}=fixture([platform]),group=new Group(),material=new MeshBasicMaterial(),write=vi.fn<LentLooks['setParam']>(),install=vi.fn<typeof installFollowedMovers>();
  const moor={look:'fixture-moor',water:0,cleats:[-2,2] as const};publishEntryOwner(scope,'object','boat',group);
  if(mode!=='missing')source.look.materials[moor.look]=moorLook(mode==='wrong-param'?'float':'vec2');
  if(mode!=='not-lent')lendLooks(scope,{materials:new Map([[moor.look,material]]),setParam:write,setTexture:()=>undefined,bindMeshMap:()=>material});
  try{
    await expect(installClientMoverOwners(ctx,{system:'movers',bindings:[{id:platform.id,kind:'object',owner:'boat',moor}]},install)).rejects.toThrow('declared lent vec2');
    expect(install).not.toHaveBeenCalled();expect(group.userData).toEqual({});expect(write).not.toHaveBeenCalled();
  }finally{scope.dispose();material.dispose();}
});

test('standalone hybridInstallation owns exactly one entered client drive',async()=>{
  const {ctx,scope}=fixture([platform],false),app=new App(),runtime=ctx.game.runtime;
  if(runtime===undefined)throw new Error('Missing standalone runtime');
  const level=createLevelInstallation(app,scope,{},()=>({set:()=>undefined,detail:()=>undefined}));
  const base=shardContext(level.context,TEMPLATE,{shard:TEMPLATE,runtime,rows:new Map(),bag:{tab:()=>()=>undefined,fragment:()=>()=>undefined}},ctx.product);
  const entered=scope.child('standalone-entered'),installation=hybridInstallation(base,entered,runtime),group=new Group(),result=fixtureRuntime(entered);
  publishEntryOwner(entered,'object','boat',group);
  const install=vi.fn<typeof installFollowedMovers>().mockReturnValue(result);
  try{
    expect(boundResidentWorldScope(installation.context.scope)).toBe(scope);
    expect(await installClientMoverOwners(installation.context,{system:'original.movers',bindings:[{id:platform.id,kind:'object',owner:'boat'}]},install)).toBe(result);
    expect(install).toHaveBeenCalledTimes(1);expect(install.mock.calls[0]?.[2].systemId).toBe('original.movers');
    expect(group.position).toEqual(new Vector3()); // admission adds no rest/pose write
    await expect(installClientMoverOwners(installation.context,{system:'original.movers',bindings:[{id:platform.id,kind:'object',owner:'boat'}]},install)).rejects.toThrow('already installed');
  }finally{scope.dispose();}
});

test('a hook outside a resident construction leaves original rest and native handles without a client drive',async()=>{
  const {ctx,scope}=fixture([platform],false),group=new Group();
  const R=await loadRapier(Uint8Array.from(readFileSync('public/assets/physics/rapier.wasm'))),physics=new Physics(R),host=await movers.createMoverHost([platform],new Map(),()=>[]);
  const result=new movers.MoverRuntime([platform],{scope,host,physics}),saved=result.snapshotBodies();
  expect(saved).toHaveLength(1);
  group.position.set(platform.at.x,platform.at.y,platform.at.z);const rest=group.position.clone();
  publishEntryOwner(scope,'object','boat',group);let completed=false;
  const install=vi.fn<typeof installFollowedMovers>();
  class Native extends ShardPlugin{
    override async world(context:ShardContext):Promise<void>{
      expect(await installClientMoverOwners(context,{system:'original.movers',bindings:[{id:platform.id,kind:'object',owner:'boat'}]},install)).toBeUndefined();completed=true;
    }
  }
  const native=new Native();
  const system=vi.spyOn(ctx,'system');
  try{
    await native.world(ctx);expect(completed).toBe(true);expect(boundResidentWorldScope(scope)).toBeUndefined();
    expect(install).not.toHaveBeenCalled();expect(system).not.toHaveBeenCalled();expect(group.position).toEqual(rest);
    expect(group.userData['declaredMotion']).toBeUndefined();expect(result.snapshotBodies()).toEqual(saved);
  }finally{system.mockRestore();scope.dispose();physics.dispose();}
});
