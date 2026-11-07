import { BufferAttribute, BufferGeometry, Float16BufferAttribute, Group, InterleavedBuffer, InterleavedBufferAttribute, Mesh, MeshBasicMaterial } from 'three';
import * as v from 'valibot';
import { expect, test } from 'vitest';
import { readScene } from '../src/sharddev/scene';
import { worldSceneSourceRecords } from '../src/sharddev/worldScenes';
import { glbWholePartitionIds } from '../src/sharddev/bake/glb';

const rows = v.strictObject({ count: v.number(), label: v.optional(v.string(), 'original') });
const oldBook = v.strictObject({ rows, records: v.array(v.pipe(v.number(), v.finite())),
  wholeTiles: v.record(v.string(), v.strictObject({ files: v.array(v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/u))), resident: v.boolean() })) });

test('source record books retain native admission, defaults, field order and detached ownership', () => {
  const input = { wholeTiles: { tile: { resident: false, files: ['a'.repeat(64)] } }, records: [0, -0, 4.5], rows: { count: 3 } };
  const before = v.parse(oldBook, input), after = worldSceneSourceRecords(rows, input);
  expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  expect(after.records[1]).toBe(-0);
  const types: [typeof before extends typeof after ? true : false, typeof after extends typeof before ? true : false] = [true, true];
  expect(types).toEqual([true, true]);
  after.records.push(5); after.wholeTiles['tile']?.files.push('b'.repeat(64));
  expect(worldSceneSourceRecords(rows, input)).toEqual(before);
  for (const invalid of [null, {}, { ...input, extra: 1 }, { ...input, records: [Infinity] }, { ...input, rows: { count: 'three' } },
    { ...input, wholeTiles: { tile: { files: ['A'.repeat(64)], resident: false } } },
    { ...input, wholeTiles: { tile: { files: [], resident: false, extra: true } } }]) {
    expect(() => v.parse(oldBook, invalid)).toThrow();
    expect(() => worldSceneSourceRecords(rows, invalid)).toThrow();
  }
});

function glb(input: unknown): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(input)), bytes = new Uint8Array(20 + json.length), header = new DataView(bytes.buffer);
  header.setUint32(0, 0x46546c67, true); header.setUint32(4, 2, true); header.setUint32(8, bytes.length, true);
  header.setUint32(12, json.length, true); header.setUint32(16, 0x4e4f534a, true); bytes.set(json, 20); return bytes;
}
const originalNodes = v.object({ nodes: v.optional(v.array(v.object({ extras: v.optional(v.object({ wholePartition: v.optional(v.object({ id: v.string() })) })) })), []) });

test('whole-partition identities retain original optional-node grammar and every bounded header refusal', () => {
  const input = { unrelated: true, nodes: [{}, { extras: { wholePartition: { id: 'tile-b', more: 1 } } }, { extras: {} }, { extras: { wholePartition: { id: 'tile-a' } } }] };
  const before = v.parse(originalNodes, input).nodes.flatMap(node => node.extras?.wholePartition === undefined ? [] : [node.extras.wholePartition.id]);
  expect(glbWholePartitionIds(glb(input))).toEqual(before);
  expect(glbWholePartitionIds(glb({}))).toEqual([]);
  const padded = new Uint8Array(glb(input).length + 16); padded.set(glb(input), 8);
  expect(glbWholePartitionIds(padded.subarray(8, -8))).toEqual(before);
  for (const value of [null, { nodes: null }, { nodes: [null] }, { nodes: [{ extras: null }] }, { nodes: [{ extras: { wholePartition: {} } }] }]) {
    expect(() => v.parse(originalNodes, value)).toThrow();
    expect(() => glbWholePartitionIds(glb(value))).toThrow();
  }
  expect(() => glbWholePartitionIds(new Uint8Array(16))).toThrow('truncated');
  for (const [at, value] of [[0, 0], [4, 1], [8, 1000], [12, 1000], [16, 0]] as const) {
    const bytes = glb(input); new DataView(bytes.buffer).setUint32(at, value, true);
    expect(() => glbWholePartitionIds(bytes)).toThrow('header');
  }
  const malformed = glb({}); malformed[20] = 255;
  expect(() => glbWholePartitionIds(malformed)).toThrow();
});


function readGeometry(geometry: BufferGeometry) {
  const root = new Group(), material = new MeshBasicMaterial();
  root.add(new Mesh(geometry, material));
  try {
    const value = readScene(root).geometries[0];
    if (value === undefined) throw new Error('Missing owned geometry');
    return value;
  } finally { material.dispose(); }
}

test('scene extraction preserves raw normalized, half, interleaved and signed-zero channels',()=>{
 const geometry=new BufferGeometry();
 const position=new Float32Array([-0,1/3,0,1,0,0,0,1,0]),weights=new Uint8Array([0,127,255]);
 const doubles=new Float64Array([-0,Number.MIN_VALUE,Number.MAX_VALUE]);
 const halves=new Uint16Array([0x8000,0x3c00,1,0x7bff,0,0x3555]);
 const lanes=new Float32Array([99,-0,1/3,99,99,Math.PI,4.25,99,99,-17,1e-30,99]);
 geometry.setAttribute('position',new BufferAttribute(position,3));
 geometry.setAttribute('weights',new BufferAttribute(weights,1,true));
 geometry.setAttribute('doubles',new BufferAttribute(doubles,1));
 geometry.setAttribute('half',new Float16BufferAttribute(halves,2));
 geometry.setAttribute('lanes',new InterleavedBufferAttribute(new InterleavedBuffer(lanes,4),2,1));
 geometry.setIndex([2,0,1]);geometry.addGroup(0,3,0);geometry.setDrawRange(0,3);
 try{
  const actual=readGeometry(geometry),before=new Uint8Array(position.buffer).slice();
  expect(Object.keys(actual.attributes)).toEqual(['doubles','half','lanes','position','weights']);
  expect(actual.attributes['position']).toEqual({itemSize:3,normalized:false,array:Array.from(position),storage:'Float32Array'});
  expect(actual.attributes['weights']).toEqual({itemSize:1,normalized:true,array:Array.from(weights),storage:'Uint8Array'});
  expect(actual.attributes['half']).toEqual({itemSize:2,normalized:false,array:Array.from(halves),storage:'Uint16Array'});
  expect(actual.attributes['doubles']?.array).toEqual(Array.from(doubles));
  expect(actual.attributes['lanes']?.array).toEqual([lanes[1],lanes[2],lanes[5],lanes[6],lanes[9],lanes[10]]);
  expect(Object.is(actual.attributes['position']?.array[0],-0)).toBe(true);
  expect(actual.index).toEqual([2,0,1]);expect(actual.groups).toEqual([{start:0,count:3,materialIndex:0}]);
  expect(actual.drawRange).toEqual({start:0,count:3});
  actual.attributes['position']?.array.fill(12);
  expect(new Uint8Array(position.buffer)).toEqual(before);
 }finally{geometry.dispose();}
});

test('scene copying retains getter order, unusual length coercion and finite/morph refusals',()=>{
 const geometry=new BufferGeometry().setAttribute('position',new BufferAttribute(new Float32Array(9),3));
 try{
  for(const count of [3,2.75,-1,Number.NaN]){
   const values=new Float32Array([1,2,3]),reads:number[]=[],properties:string[]=[];
   const observed=new Proxy(values,{get(target,key){if(typeof key==='string')properties.push(key);const value:unknown=Reflect.get(target,key,target);return value;}});
   const attribute=new BufferAttribute(values,1);
   Object.defineProperty(attribute,'count',{value:count});
   Object.defineProperty(attribute,'array',{get:()=>{reads.push(reads.length);return observed;}});
   geometry.setAttribute('custom',attribute);
   const expected=Array.from({length:count},(_,index)=>values[index]);
   expect(readGeometry(geometry).attributes['custom']?.array).toEqual(expected);
   expect(reads.length).toBe(expected.length+1);
   expect(properties).toEqual([...expected.map((_,index)=>String(index)),'constructor']);
  }
  const invalid=new BufferAttribute(new Float32Array([1,Number.NaN,3]),1);let reads=0;
  Object.defineProperty(invalid,'array',{get:()=>{reads++;return new Float32Array([1,Number.NaN,3]);}});
  geometry.setAttribute('custom',invalid);
  expect(()=>readGeometry(geometry)).toThrow('Nonfinite geometry attribute custom');expect(reads).toBe(3);
  geometry.deleteAttribute('custom');geometry.morphAttributes.position=[new BufferAttribute(new Float32Array(9),3)];
  expect(()=>readGeometry(geometry)).toThrow('Scene reader does not yet compile morph targets');
 }finally{geometry.dispose();}
});
