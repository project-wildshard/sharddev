import {expect,test} from 'vitest';
import {zlibSync} from 'fflate';
import {build} from 'vite';
import {encodePortableBytes} from './portableBytes';
import {assertConfigBoundary} from '../configBoundary';

test('every portable level preserves original bytes and selected offset views',()=>{
  const input=Uint8Array.from({length:4099},(_,i)=>i%251),view=input.subarray(2,4097);
  for(const level of [0,1,2,3,4,5,6,7,8,9]as const){
    const before=zlibSync(view,{level}),after=encodePortableBytes(view,level);
    expect(Buffer.compare(before,after)).toBe(0);expect(after.buffer).not.toBe(input.buffer);
  }
  expect(Buffer.compare(encodePortableBytes(view),zlibSync(view,{level:9}))).toBe(0);
  for(const level of [-1,10,.5,Number.NaN])expect(()=>encodePortableBytes(view,level)).toThrow('Deflate level');
  expect(()=>encodePortableBytes(new Uint8Array(new SharedArrayBuffer(16)))).toThrow('bounded unshared');
});
test('portable author compression bundles without native service imports',async()=>{
  const result=await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry:'src/sharddev/bake/portableBytes.ts',formats:['es']},rolldownOptions:{external:[/^node:/u],output:{codeSplitting:false}}}});
  const built=Array.isArray(result)?result[0]:result;
  if(built===undefined||!('output'in built))throw new Error('Missing portable codec bundle');
  const chunks=built.output.filter(row=>row.type==='chunk');expect(chunks).toHaveLength(1);
  for(const chunk of chunks)expect(()=>assertConfigBoundary([...chunk.imports,...chunk.dynamicImports])).not.toThrow();
});
