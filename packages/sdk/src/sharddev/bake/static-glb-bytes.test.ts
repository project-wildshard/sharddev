import {BufferAttribute,BufferGeometry,Color,DataUtils,Float16BufferAttribute,InterleavedBuffer,InterleavedBufferAttribute,Matrix4,MeshBasicMaterial,MeshStandardMaterial} from 'three';
import {expect,test} from 'vitest';
import * as v from 'valibot';
import {staticGlb,type GlbPrimitive} from './glb';

/** Wire fixtures cover ordinary float coercion and all distinct accessor storage paths. */
function glbByteCases():readonly {name:string;parts:readonly GlbPrimitive[]}[] {
 const plain=new BufferGeometry();
 plain.setAttribute('position',new BufferAttribute(new Float64Array([-0,1/3,1e-46,1+2**-30,-2/3,-1e-46,-1,Math.PI,0]),3));
 plain.setAttribute('normal',new BufferAttribute(new Float32Array([0,0,1,0,0,1,0,0,1]),3));
 plain.setAttribute('custom',new BufferAttribute(new Float32Array([1,2,3,4,5,6,7,8,9,10,11,12]),4));
 const native=new BufferGeometry();
 native.setAttribute('position',new BufferAttribute(new Float32Array([-0,0,0,1,0,0,0,1,0]),3));
 native.setAttribute('normal',new Float16BufferAttribute(new Uint16Array([0,0,0x3c00,0,0,0x3c00,0,0,0x3c00]),3));
 native.setAttribute('color',new BufferAttribute(new Uint8Array([255,0,127,255,0,255,63,127,127,63,255,0]),4,true));
 native.setAttribute('pair',new BufferAttribute(new Int16Array([-32767,16384,0,-16384,32767,1]),2,true));
 native.setAttribute('tag',new BufferAttribute(new Uint32Array([0,65536,4294967295]),1));
 native.setIndex(new BufferAttribute(new Uint16Array([2,1,0]),1));
 const indexed=new BufferGeometry();
 indexed.setAttribute('position',new BufferAttribute(new Float32Array([0,0,0,1,0,0,0,1,0]),3));
 indexed.setAttribute('uv',new BufferAttribute(new Float32Array([0,0,1,0,0,1]),2));
 indexed.setAttribute('tangent',new BufferAttribute(new Float32Array([1,0,0,1,1,0,0,-1,1,0,0,1]),4));
 indexed.setIndex(new BufferAttribute(new Uint32Array([1,2,0]),1));
 const interleaved=new BufferGeometry(), interleavedRows=new InterleavedBuffer(Float32Array.of(-0,0,0,0,0,1,1,0,0,0,0,1,0,1,0,0,0,1),6);
 interleaved.setAttribute('position',new InterleavedBufferAttribute(interleavedRows,3,0));
 interleaved.setAttribute('normal',new InterleavedBufferAttribute(interleavedRows,3,3));
 interleaved.setAttribute('pair',new InterleavedBufferAttribute(new InterleavedBuffer(Uint8Array.of(99,0,255,99,127,63,99,255,0),3),2,1,true));
 const instances=[new Matrix4().makeTranslation(4,2,1),new Matrix4().makeScale(2,3,4)];
 return [
  {name:'source-floats',parts:[{name:'float_values',geometry:plain,material:new MeshStandardMaterial(),customAttributes:{_CUSTOM:'custom'},transform:new Matrix4().makeTranslation(1,2,3)}]},
  {name:'compact-native',parts:[{name:'native_values',geometry:native,material:new MeshStandardMaterial({vertexColors:true}),nativeAttributes:true,compactIndex:true,customAttributes:{_PAIR:'pair',_TAG:'tag'}}]},
  {name:'trs-instances',parts:[{name:'trs_values',geometry:indexed,material:new MeshBasicMaterial(),instances,instanceColours:[new Color(0.25,0.5,0.75),new Color(1,0,0)]}]},
  {name:'interleaved',parts:[{name:'interleaved_values',geometry:interleaved,material:new MeshStandardMaterial(),compactIndex:true,customAttributes:{_PAIR:'pair'}}]},
  {name:'matrix-instances',parts:[{name:'matrix_values',geometry:indexed.clone(),material:new MeshStandardMaterial(),instances,exactInstances:true,nativeAttributes:true}]},
 ];
}



function dispose(cases:ReturnType<typeof glbByteCases>):void {
 for(const {parts} of cases)for(const {geometry,material} of parts){geometry.dispose();material.dispose();}
}

/** Locate only a declared portable channel; the native raw storage remains independent. */
function channelView(bytes:Uint8Array,semantic:string):{view:DataView;count:number} {
 const header=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),length=header.getUint32(12,true);
 const doc=v.parse(v.object({meshes:v.array(v.object({primitives:v.array(v.object({attributes:v.record(v.string(),v.number())}))})),
  accessors:v.array(v.object({bufferView:v.number(),count:v.number()})),bufferViews:v.array(v.object({byteOffset:v.number(),byteLength:v.number()}))}),
  JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+length))));
 const id=doc.meshes[0]?.primitives[0]?.attributes[semantic],accessor=id===undefined?undefined:doc.accessors[id];
 const buffer=accessor===undefined?undefined:doc.bufferViews[accessor.bufferView];
 if(accessor===undefined||buffer===undefined)throw new Error(`Missing portable channel ${semantic}`);
 return {view:new DataView(bytes.buffer,bytes.byteOffset+28+length+buffer.byteOffset,buffer.byteLength),count:accessor.count};
}

test('writes the compact-native normal as its numeric float32 portable channel',()=>{
 const cases=glbByteCases();
 try {
  const parts=cases.find(row=>row.name==='compact-native')?.parts,normal=parts?.[0]?.geometry.getAttribute('normal');
  if(parts===undefined||!(normal instanceof Float16BufferAttribute))throw new Error('Missing half normal');
  const current=channelView(staticGlb(parts),'NORMAL');
  for(let i=0;i<current.count;i++)for(let c=0;c<3;c++)
   expect(current.view.getFloat32((i*3+c)*4,true)).toBe(c===0?normal.getX(i):c===1?normal.getY(i):normal.getZ(i));
 }finally{dispose(cases);}
});

test('keeps source-precision bounds and negative zero while encoding float32 wire samples',()=>{
 const cases=glbByteCases(),entry=cases.find(row=>row.name==='source-floats');
 try {
  if(entry===undefined)throw new Error('Missing float fixture');
  const bytes=staticGlb(entry.parts),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),jsonLength=view.getUint32(12,true);
  const document=v.parse(v.object({accessors:v.array(v.looseObject({min:v.optional(v.array(v.number())),max:v.optional(v.array(v.number()))}))}),JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+jsonLength))));
  expect(document.accessors[0]?.min).toEqual([-1,-2/3,-1e-46]);
  expect(document.accessors[0]?.max).toEqual([1+2**-30,Math.PI,1e-46]);
  expect(Object.is(view.getFloat32(28+jsonLength,true),-0)).toBe(true);
 }finally{dispose(cases);}
});

test.each(['position','normal','custom'] as const)('rejects non-finite %s values before returning any GLB',channel=>{
 for(const value of [Number.NaN,Infinity,-Infinity]) {
  const cases=glbByteCases(),entry=cases.find(row=>row.name==='source-floats'),part=entry?.parts[0];
  try {
   if(entry===undefined||part===undefined)throw new Error('Missing float fixture');
   part.geometry.getAttribute(channel).setComponent(0,0,value);
   expect(()=>staticGlb(entry.parts)).toThrow('Invalid GLB attribute');
  }finally{dispose(cases);}
 }
});


test.each([1,2,3,4])('writes width-%s half channels with numeric axis semantics, including normalization and signed zero',width=>{
 for(const normalized of [false,true]){
  const geometry=new BufferGeometry(),material=new MeshStandardMaterial();
  geometry.setAttribute('position',new BufferAttribute(new Float32Array([0,0,0,1,0,0,0,1,0]),3));
  const samples=[-0,1,-2,3.2,65504,2**-24],half=new Float16BufferAttribute(Uint16Array.from({length:3*width},(_,i)=>DataUtils.toHalfFloat(samples[i%samples.length]??0)),width,normalized);
  geometry.setAttribute('half',half);
  try{
   const bytes=staticGlb([{geometry,material,customAttributes:{_HALF:'half'}}]),channel=channelView(bytes,'_HALF');
   expect(channel.count).toBe(3);
   for(let i=0;i<half.count;i++)for(let c=0;c<width;c++){
    const numeric=c===0?half.getX(i):c===1?half.getY(i):c===2?half.getZ(i):half.getW(i);
    expect(Object.is(channel.view.getFloat32((i*width+c)*4,true),Math.fround(numeric))).toBe(true);
   }
  }finally{geometry.dispose();material.dispose();}
 }
});

test.each([0x7c00,0xfc00,0x7e01])('rejects non-finite decoded half storage %s',bits=>{
 const geometry=new BufferGeometry(),material=new MeshStandardMaterial();
 geometry.setAttribute('position',new BufferAttribute(new Float32Array([0,0,0,1,0,0,0,1,0]),3));
 geometry.setAttribute('half',new Float16BufferAttribute(Uint16Array.of(bits,0,0),1));
 try{expect(()=>staticGlb([{geometry,material,customAttributes:{_HALF:'half'}}])).toThrow('Invalid GLB attribute');}
 finally{geometry.dispose();material.dispose();}
});

test.each([false,true])('packed quantized channels preserve subview bytes and zero stride padding (aligned=%s)',aligned=>{
 const positionBank=new Int16Array([999,999,999,-32768,0,32767,1,-1,2,3,4,-5,999,999,999]);
 const normalBank=new Int8Array([99,99,99,-128,0,127,1,-1,2,3,4,-5,99,99,99]);
 const colourBank=new Uint16Array([999,999,999,0,65535,1234,1,2,3,4,5,6,999,999,999]);
 const positions=positionBank.subarray(3,12),normals=normalBank.subarray(3,12),colours=colourBank.subarray(3,12);
 const banks=[new Uint8Array(positionBank.buffer).slice(),new Uint8Array(normalBank.buffer).slice(),new Uint8Array(colourBank.buffer).slice()];
 const geometry=new BufferGeometry().setAttribute('position',new BufferAttribute(positions,3))
  .setAttribute('normal',new BufferAttribute(normals,3,true)).setAttribute('color',new BufferAttribute(colours,3,true));
 const material=new MeshStandardMaterial({vertexColors:true});
 try{
  // Int16 positions require the aligned meshopt path; the other channels also cover tightly packed views.
  if(!aligned)geometry.setAttribute('position',new BufferAttribute(Float32Array.from(positions),3));
  const flags:Pick<GlbPrimitive,'meshoptReady'>=aligned?{meshoptReady:true}:{};
  const bytes=staticGlb([{geometry,material,quantizedChannels:true,...flags,transform:new Matrix4()}]);
  const header=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),jsonLength=header.getUint32(12,true);
  const doc=v.parse(v.object({meshes:v.array(v.object({primitives:v.array(v.object({attributes:v.record(v.string(),v.number())}))})),
   accessors:v.array(v.object({bufferView:v.number(),min:v.optional(v.array(v.number())),max:v.optional(v.array(v.number()))})),
   bufferViews:v.array(v.object({byteOffset:v.number(),byteLength:v.number(),byteStride:v.optional(v.number())}))}),
   JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+jsonLength))));
  const checks:[string,Int16Array|Int8Array|Uint16Array][]=[['NORMAL',normals],['COLOR_0',colours]];
  if(aligned)checks.unshift(['POSITION',positions]);
  for(const [semantic,source] of checks){
   const id=doc.meshes[0]?.primitives[0]?.attributes[semantic],accessor=id===undefined?undefined:doc.accessors[id];
   const view=accessor===undefined?undefined:doc.bufferViews[accessor.bufferView];
   if(view===undefined)throw new Error(`Missing ${semantic}`);
   const width=3*source.BYTES_PER_ELEMENT,stride=aligned?Math.ceil(width/4)*4:width;
   const expected=new Uint8Array(3*stride),raw=new Uint8Array(source.buffer,source.byteOffset,source.byteLength);
   for(let vertex=0;vertex<3;vertex++)expected.set(raw.slice(vertex*width,(vertex+1)*width),vertex*stride);
   expect(view.byteLength).toBe(expected.byteLength);
   expect(view.byteStride).toBe(stride===width?undefined:stride);
   expect(bytes.slice(28+jsonLength+view.byteOffset,28+jsonLength+view.byteOffset+view.byteLength)).toEqual(expected);
   if(semantic==='POSITION'){expect(accessor?.min).toEqual([-32768,-1,-5]);expect(accessor?.max).toEqual([3,4,32767]);}
  }
  expect(new Uint8Array(positionBank.buffer)).toEqual(banks[0]);expect(new Uint8Array(normalBank.buffer)).toEqual(banks[1]);expect(new Uint8Array(colourBank.buffer)).toEqual(banks[2]);
 }finally{geometry.dispose();material.dispose();}
});
