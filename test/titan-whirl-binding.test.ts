import {lendNalatiPasture} from './fixtures/nalati-return-modules';
import {expect,test,vi} from 'vitest';
import {parse} from 'valibot';
import {BoxGeometry,Group,InstancedMesh,MeshBasicMaterial,PerspectiveCamera,Vector3} from 'three';
import {App} from '../src/client/engine/app/app';
import {Scope} from '../src/shared/engine/app/scope';
import {createLevelInstallation} from '../src/client/engine/level/installation';
import {WorldRegistry} from '../src/client/engine/world/registry';
import {shardContext} from '../src/client/game/plugin/context';
import {createShardProduct} from '../src/shared/game/shardfile/shardProduct';
import {emptyShardfile} from '../src/sharddev/author';
import {MANIFEST as TEMPLATE} from '../src/shards/_template/discovery.generated';
import {ArenaWhirlsSchema,type ArenaWhirlsRows} from '@wildshard/format/encounterRows';
import {ArenaWhirlsView} from '../src/client/game/boss/arenaFire';
import {ReturnProgram} from '../src/shared/game/population/returnProgram';
import {installViewProgram,preflightViewLends,lendViewValues,lendViewDraw,lendViewFrame} from '../src/client/game/shardfile/clientViewProgram';
import {presentEntryOwner,publishEntryOwner} from '../src/shared/game/shardfile/entryOwners';
import {titanWhirlGate} from '../src/shards/nalati-grasslands/generators/stormTitanFight';
import {whirlsViewRows} from '../src/shards/nalati-grasslands/generators/titanWhirlsView';
import {bindFlatTerrain} from '@wildshard/engine/test/terrain';
import {titanPrograms as programmes} from './fixtures/titanInlineWitness';
import { nalatiViewBytes } from './fixtures/nalati-view-modules';

function context(parent:Scope,name:string):ReturnType<typeof shardContext>{
  const scope=parent.child(name),product=createShardProduct({slug:'quarry',revision:1,sections:new Map(),files:new Map(),
    shardfile:emptyShardfile({slug:'quarry',name:'Quarry',author:'Test',revision:1,seed:1}),read:()=>Promise.reject(new Error('No file intake at view bind'))});
  const level=createLevelInstallation(new App(),scope,{},()=>({set:()=>undefined,detail:()=>undefined}));
  const ctx=shardContext(level.context,TEMPLATE,{shard:TEMPLATE,rows:new Map(),bag:{tab:()=>()=>undefined,fragment:()=>()=>undefined}},product);
  Object.defineProperty(ctx.game,'runtime',{value:{world:{registry:new WorldRegistry(),player:{position:new Vector3(),velocity:new Vector3(),yaw:0},game:{camera:new PerspectiveCamera()}}}});
  return ctx;
}

function quarry(owner:Scope):{view:ArenaWhirlsView;rows:ArenaWhirlsRows;funnels:Group[];debris:InstancedMesh;dispose:()=>void}{
  lendNalatiPasture(owner);
  const laws=[-8,8].map(x=>({signal:'whirl',initial:{x,z:0,vx:0,vz:0,cd:0},parameters:{cx:0,cz:0,radius:40,flank:2},retain:{x:'x',z:'z',vx:'vx',vz:'vz',cd:'cd'}}));
  const rows=parse(ArenaWhirlsSchema,{laws,gate:titanWhirlGate(2),ease:4,spin:2,sink:.2,breathe:[.1,1],
    debris:{count:3,climb:.5,turn:1,step:2,radius:[.5,2],height:6,axis:[0,1,0],roll:1,scale:[.5,.25,2]},
    view:{source:'quarry.values',slot:'quarry.frame',draw:'quarry.dust',slots:['west','east'].map(side=>({object:`quarry.${side}`,fields:{k:`${side}Weight`,shown:`${side}Visible`,x:`${side}X`,y:`${side}Ground`,z:`${side}Z`}}))}});
  const funnels=laws.map(()=>new Group()),geometry=new BoxGeometry(),material=new MeshBasicMaterial(),debris=new InstancedMesh(geometry,material,6);
  const view=new ArenaWhirlsView(rows,ReturnProgram.page(programmes.wind,owner),funnels,debris,ReturnProgram.page(programmes.attack,owner),owner);
  return {view,rows,funnels,debris,dispose:()=>{geometry.dispose();material.dispose();}};
}

test.each(['install first','lend first'])('row-only quarry resources drive actual inline view dispatch (%s)',order=>{
  const native=new Scope('quarry.native'),q=quarry(native),ctx=context(native,'first'),systems=vi.spyOn(ctx,'system');
  const restore=bindFlatTerrain({heightAt:()=>3,normalAt:()=>[0,1,0]});
  const feature={kind:'view.program' as const,id:'quarry.whirls',module:'views/quarry.wasm',rows:whirlsViewRows(q.rows)};
  const bytes=nalatiViewBytes('titan-whirls-view');
  try{
    if(order==='install first'){installViewProgram(ctx,feature,bytes);q.view.bindView(ctx.scope);}
    else{q.view.bindView(ctx.scope);installViewProgram(ctx,feature,bytes);}
    expect(systems).not.toHaveBeenCalled();q.view.arm(2);
    q.view.update(.1,0,true,0,{wx:0,wz:0,px:0,pz:30});
    expect(q.funnels[0]?.visible).toBe(false);expect(q.funnels[1]?.visible).toBe(true);
    expect(q.funnels[1]?.position.x).toBe(8);expect(q.funnels[1]?.position.y).toBeCloseTo(2.8,5);expect(q.funnels[1]?.position.z).toBe(0);expect(q.debris.count).toBe(3);
    expect(presentEntryOwner(ctx.scope,'object','quarry.east')).toBe(q.funnels[1]);
    expect(()=>q.view.bindView(ctx.scope)).toThrow();
    ctx.scope.dispose();expect(presentEntryOwner(native,'object','quarry.east')).toBeNull();
    const again=context(native,'second');q.view.bindView(again.scope);installViewProgram(again,feature,bytes);
    q.view.update(.1,.1,true,0,{wx:0,wz:0,px:0,pz:30});expect(q.debris.count).toBe(3);
    native.onDispose(()=>undefined);
    const leaving=native.disposeSteps();leaving.next();expect(again.scope.disposed).toBe(false);
    expect(()=>q.view.update(.1,.2,true,0,{wx:0,wz:0,px:0,pz:30})).toThrow('native owner has ended');
    for(const step of leaving)void step;
  }finally{native.dispose();restore();q.dispose();}
});

test('all loan collisions refuse before partial publication, preserving borrowed resources',()=>{
  const native=new Scope('quarry.collisions'),q=quarry(native),ctx=context(native,'entry');
  const disposed=vi.spyOn(q.debris.geometry,'dispose');
  try{
    lendViewDraw(ctx.scope,q.rows.view.draw,q.debris);
    expect(()=>q.view.bindView(ctx.scope)).toThrow('Conflicting view draws loans');
    expect(presentEntryOwner(ctx.scope,'object','quarry.west')).toBeNull();
    expect(()=>lendViewValues(ctx.scope,q.rows.view.source,()=>1)).not.toThrow();
    const other=context(native,'other'),old=new Group();publishEntryOwner(other.scope,'object','quarry.east',old);
    expect(()=>q.view.bindView(other.scope)).toThrow('already bound');
    expect(presentEntryOwner(other.scope,'object','quarry.west')).toBeNull();expect(presentEntryOwner(other.scope,'object','quarry.east')).toBe(old);
    expect(()=>lendViewValues(other.scope,q.rows.view.source,()=>1)).not.toThrow();
    const foreign=new Scope('quarry.foreign');expect(()=>q.view.bindView(foreign)).toThrow('construction ancestor');foreign.dispose();
    native.dispose();expect(disposed).not.toHaveBeenCalled();
  }finally{native.dispose();disposed.mockRestore();q.dispose();}
});

test('duplicate view aliases and object ids refuse before module/resource allocation',()=>{
  const owner=new Scope('quarry.bad'),q=quarry(owner),bindings=ReturnProgram.projectionBindings(programmes.attack),allocate=vi.spyOn(WebAssembly,'Instance');
  try{
    for(const kind of ['alias','object','count']){
      const rows=structuredClone(q.rows),first=rows.view.slots[0],second=rows.view.slots[1];if(first===undefined||second===undefined)throw new Error('Bad fixture');
      if(kind==='alias')second.fields.k=first.fields.k;if(kind==='object')second.object=first.object;if(kind==='count')rows.view.slots.pop();
      expect(()=>ArenaWhirlsView.preflight(rows,bindings)).toThrow('view binding');
    }
    expect(allocate).not.toHaveBeenCalled();
  }finally{allocate.mockRestore();owner.dispose();q.dispose();}
});


test('native retirement during the original ground slot refuses the later view dispatch',()=>{
  const native=new Scope('quarry.mid-slot'),q=quarry(native),ctx=context(native,'entry');
  const feature={kind:'view.program' as const,id:'quarry.whirls',module:'views/quarry.wasm',rows:whirlsViewRows(q.rows)};
  const bytes=nalatiViewBytes('titan-whirls-view');
  q.view.bindView(ctx.scope);installViewProgram(ctx,feature,bytes);q.view.arm(2);q.debris.count=0;
  native.onDispose(()=>undefined);const leaving=native.disposeSteps();
  const restore=bindFlatTerrain({heightAt:()=>{leaving.next();return 3;},normalAt:()=>[0,1,0]});
  try{
    expect(()=>q.view.update(.1,0,true,0,{wx:0,wz:0,px:0,pz:30})).toThrow('native owner has ended');
    expect(ctx.scope.disposed).toBe(false);expect(q.debris.count).toBe(0);
    for(const step of leaving)void step;
  }finally{native.dispose();restore();q.dispose();}
});


test('view inventory refuses accessors and unknown keys before reads or loans',()=>{
  const scope=new Scope('quarry.inventory'),geometry=new BoxGeometry(),material=new MeshBasicMaterial(),draw=new InstancedMesh(geometry,material,1);
  let reads=0;const hostile={};Object.defineProperty(hostile,'values',{enumerable:true,get:()=>{reads++;return ['free'];}});
  try{
    expect(()=>preflightViewLends(scope,hostile)).toThrow('plain JSON');expect(reads).toBe(0);
    const unknown={values:['free'],extra:['ignored']};expect(()=>preflightViewLends(scope,unknown)).toThrow('plain JSON');
    const hidden={values:['free']};Object.defineProperty(hidden,'unknown',{enumerable:true,get:()=>{reads++;return [];}});
    expect(()=>preflightViewLends(scope,hidden)).toThrow('plain JSON');expect(reads).toBe(0);
    expect(()=>lendViewValues(scope,'free',()=>1)).not.toThrow();expect(()=>lendViewDraw(scope,'free',draw)).not.toThrow();expect(()=>lendViewFrame(scope,'free')).not.toThrow();
  }finally{scope.dispose();geometry.dispose();material.dispose();}
});
