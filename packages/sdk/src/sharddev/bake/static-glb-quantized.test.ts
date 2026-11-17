import {BufferAttribute,BufferGeometry,Mesh,MeshStandardMaterial} from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {expect,test} from 'vitest';
import {nativeWholeGeometry} from '@wildshard/engine/models/nativeGeometry';
import {staticGlb} from './glb';

// L18.3: quantized channels round-trip through three's own loader as the same typed attributes; positions stay exact
test('quantized normals and colours read back as the same normalized typed channels', async () => {
 const geometry=new BufferGeometry();
 geometry.setAttribute('position',new BufferAttribute(new Float32Array([0,0,0,1.25,0,0,0,2.5,-0.75]),3));
 geometry.setAttribute('normal',new BufferAttribute(new Int8Array([0,0,127,0,-127,0,90,0,-90]),3,true));
 geometry.setAttribute('color',new BufferAttribute(new Uint16Array([0,65535,1234,65535,0,4321,32768,16384,8192]),3,true));
 const material=new MeshStandardMaterial({vertexColors:true});
 const bytes=staticGlb([{geometry,material,compactIndex:true,quantizedChannels:true}]);
 const gltf=await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer,'');
 const isGeometry=(value:unknown):value is BufferGeometry=>value instanceof BufferGeometry;
 const geometries:BufferGeometry[]=[];gltf.scene.traverse(node=>{if(node instanceof Mesh){const found:unknown=node.geometry;if(isGeometry(found))geometries.push(found);}});
 const read=geometries[0];
 expect(read).toBeDefined();
 if(read===undefined)return;
 const position=read.getAttribute('position'),normal=read.getAttribute('normal'),colour=read.getAttribute('color');
 expect(Array.from(position.array)).toEqual([0,0,0,1.25,0,0,0,2.5,-0.75]);
 expect(normal.array).toBeInstanceOf(Int8Array);expect(normal.normalized).toBe(true);
 expect(Array.from(normal.array)).toEqual([0,0,127,0,-127,0,90,0,-90]);
 expect(colour.array).toBeInstanceOf(Uint16Array);expect(colour.normalized).toBe(true);
 expect(Array.from(colour.array)).toEqual([0,65535,1234,65535,0,4321,32768,16384,8192]);
 expect(()=>staticGlb([{geometry:new BufferGeometry().setAttribute('position',geometry.getAttribute('position')).setAttribute('normal',new BufferAttribute(new Float32Array(9),3)),material,quantizedChannels:true}])).toThrow('normalized Int8');
 material.dispose();geometry.dispose();
});

// L18.3c: with native attributes too, the table names the typed portable accessors (no raw copies) and the engine restores them
test('quantized channels compose with native attributes and restore through nativeWholeGeometry', async () => {
 const geometry=new BufferGeometry();
 geometry.setAttribute('position',new BufferAttribute(new Float32Array([0,0,0,1,0,0,0,1,0]),3));
 geometry.setAttribute('normal',new BufferAttribute(new Int8Array([0,0,127,0,0,127,0,0,127]),3,true));
 geometry.setAttribute('color',new BufferAttribute(new Uint16Array([65535,0,0,0,65535,0,0,0,65535]),3,true));
 geometry.setAttribute('aSway',new BufferAttribute(new Float32Array([0.5,1,0.25,0,1,0.75]),2));
 const material=new MeshStandardMaterial({vertexColors:true});
 const bytes=staticGlb([{geometry,material,customAttributes:{_SWAY:'aSway'},compactIndex:true,nativeAttributes:true,quantizedChannels:true}]);
 const gltf=await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer,'');
 const isMesh=(value:unknown):value is Mesh=>value instanceof Mesh;
 const meshes:Mesh[]=[];gltf.scene.traverse(node=>{if(isMesh(node))meshes.push(node);});
 const mesh=meshes[0];
 expect(mesh).toBeDefined();
 if(mesh===undefined)return;
 const restored=nativeWholeGeometry(mesh);
 expect(restored.getAttribute('normal').array).toBeInstanceOf(Int8Array);
 expect(Array.from(restored.getAttribute('color').array)).toEqual([65535,0,0,0,65535,0,0,0,65535]);
 expect(Array.from(restored.getAttribute('aSway').array)).toEqual([0.5,1,0.25,0,1,0.75]);
 const json=new TextDecoder().decode(bytes.subarray(20,20+new DataView(bytes.buffer,bytes.byteOffset+12,4).getUint32(0,true)));
 expect(json).not.toContain('_WS_RAW_NORMAL');expect(json).not.toContain('_WS_RAW_COLOR');
 material.dispose();geometry.dispose();
});
