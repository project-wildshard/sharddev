import {expect,test,vi} from 'vitest';
import {Scope} from '../src/shared/engine/app/scope';
import {readDirectorProduct,prepareEmbeddedDirector,embeddedDirectorBytes} from '../src/shared/game/plugin/director';
import {parseDirector} from '@wildshard/format/director';
import {createShardProduct} from '../src/shared/game/shardfile/shardProduct';
import {emptyShardfile} from '../src/sharddev/author';
import {sha256} from '../src/shared/game/plugin/moduleHash';
import {pineDirector,driftwoodDirector} from './fixtures/director-modules';
import pine from '../src/shards/pine-hollow/data/director.json' with {type:'json'};
import driftwood from '../src/shards/driftwood-isle/data/director.json' with {type:'json'};

function fixture(declaration:unknown,module:{readonly module:string;readonly bytes:Uint8Array},options:{readonly inline?:string;readonly omitFile?:boolean;readonly raw?:Uint8Array;readonly wait?:Promise<void>}={}){
  const file='behaviour/director.wasm',raw=options.raw??module.bytes,hash=sha256(raw),stages={original:true};
  const json=new TextEncoder().encode(JSON.stringify({declaration,module:{module:module.module,bytes:options.inline??'',...(options.omitFile?{}:{file})},stages,bindings:null,seed:357})),jsonHash=sha256(json),reads:string[]=[];
  const product=createShardProduct({slug:'raw-director',revision:1,shardfile:emptyShardfile({slug:'raw-director',name:'Director',author:'Fixture',revision:1,seed:357}),
    sections:new Map(),files:new Map([['directors/main.json',{hash:jsonHash,url:'main'}],[file,{hash,url:file}]]),read:async ref=>{
      if(ref===jsonHash){reads.push('main');return json;}if(ref!==hash)throw new Error('Unexpected director file');reads.push(file);await options.wait;return raw;
    }});
  return {product,reads,stages};
}
for(const [name,declaration,module] of [
  ['pine',pine,pineDirector],
  ['driftwood',driftwood,driftwoodDirector],
] as const){
  test(`${name} named director preserves its original module and continuation`,async()=>{
    const f=fixture(declaration,module),scope=new Scope('director.raw');
    try{
      const result=await readDirectorProduct(f.product,scope),old=await prepareEmbeddedDirector(declaration,module,357,scope),a=old(),b=result.create();
      expect(result.bytes).toEqual(module.bytes);expect(result.stages).toEqual(f.stages);expect(f.reads).toEqual(['main','behaviour/director.wasm']);
      const rows=parseDirector(declaration),input=Object.fromEntries(rows.inputs.map(row=>[row.key,0]));
      for(const event of rows.events.filter(row=>row.direction==='input')){a.enqueue(event.key);b.enqueue(event.key);}
      for(let tick=0;tick<32;tick++){expect(b.step(tick,input,1/60)).toEqual(a.step(tick,input,1/60));expect(b.snapshot()).toEqual(a.snapshot());}
    }finally{scope.dispose();}
  });
  test(`${name} raw admission rejects mixed bytes, wrong hashes and ancestor retirement`,async()=>{
    const mixed=fixture(declaration,module,{inline:'invalid'});await expect(readDirectorProduct(mixed.product)).rejects.toThrow('mixed');expect(mixed.reads).toEqual(['main']);
    const wrong=Uint8Array.from(module.bytes);wrong[wrong.length-1]=0;
    await expect(readDirectorProduct(fixture(declaration,module,{raw:wrong}).product)).rejects.toThrow('hash mismatch');
    const root=new Scope('director.root'),scope=root.child('entry');let finish:(()=>void)|undefined;
    const wait=new Promise<void>(resolve=>{finish=resolve;}),f=fixture(declaration,module,{wait});
    try{
      const pending=readDirectorProduct(f.product,scope);await vi.waitFor(()=>expect(f.reads).toHaveLength(2));root.disposeSteps().next();
      if(finish===undefined)throw new Error('Missing held file');finish();await expect(pending).rejects.toThrow('owner left');
    }finally{root.dispose();}
  });
}

for(const [name,declaration,module] of [['pine',pine,pineDirector],['driftwood',driftwood,driftwoodDirector]] as const){
  test(`${name} refuses unconverted inline director content before decoding or reading a module`,async()=>{
    const encoded=btoa(Array.from(module.bytes,value=>String.fromCodePoint(value)).join('')),decode=vi.spyOn(globalThis,'atob');
    try{for(const inline of [encoded,'invalid','']){
      const f=fixture(declaration,module,{inline,omitFile:true});
      await expect(readDirectorProduct(f.product)).rejects.toThrow('named binary file');
      expect(f.reads).toEqual(['main']);
    }expect(decode).not.toHaveBeenCalled();}finally{decode.mockRestore();}
  });
}

test('direct director admission refuses encoded or non-byte payloads without decoding',()=>{
  const decode=vi.spyOn(globalThis,'atob');
  try{
    for(const bytes of ['', 'invalid', [0,97,115,109], null, undefined]){
      expect(()=>{Reflect.apply(embeddedDirectorBytes,undefined,[pine,{...pineDirector,bytes}]);}).toThrow('raw binary bytes');
    }
    expect(decode).not.toHaveBeenCalled();
  }finally{decode.mockRestore();}
});

test('raw director copies only its selected byte view and keeps the author payload detached',()=>{
  const backing=new Uint8Array(pineDirector.bytes.length+9);backing.set(pineDirector.bytes,4);
  const view=backing.subarray(4,4+pineDirector.bytes.length),copy=embeddedDirectorBytes(pine,{...pineDirector,bytes:view});
  expect(copy).toEqual(pineDirector.bytes);expect(copy.buffer).not.toBe(backing.buffer);
  copy.fill(0);expect(view).toEqual(pineDirector.bytes);
});
