import {expect,test} from 'vitest';
import {BufferGeometry,Float32BufferAttribute,Matrix4,Mesh,MeshStandardMaterial,Uint8BufferAttribute,Int8BufferAttribute} from 'three';
import {staticGlb} from './glb';
import {compressGlb,pairedChannelGlb} from './glbCompression';
import {readSourceModel} from './skinned';
import {identitySpaceGeometry} from '@wildshard/engine/models/ownedGeometry';

function geometry(light=false):BufferGeometry{
  const g=new BufferGeometry();
  g.setAttribute('position',new Float32BufferAttribute([-1,0,0,1,0,0,0,2,0],3));
  g.setAttribute('normal',new Int8BufferAttribute([0,0,127,0,0,127,0,0,127],3,true));
  g.setAttribute('color',new Uint8BufferAttribute(light?[179,153,128,102,77,51,26,204,230]:[26,51,77,77,51,26,102,128,153],3,true));
  g.setAttribute('dye',new Float32BufferAttribute(light?[.7,-1,1.1]:[.8,-1,1.2],1));
  g.setIndex([0,1,2]);return g;
}
const material=new MeshStandardMaterial({roughness:.8});
const pack=(g:BufferGeometry)=>staticGlb([{geometry:g,material,customAttributes:{_DYE:'dye'},quantizedChannels:true}],'cast');
function isMesh(value:unknown):value is Mesh{return value instanceof Mesh;}
async function read(bytes:Uint8Array):Promise<BufferGeometry>{
  const {gltf}=await readSourceModel(bytes);gltf.scene.updateMatrixWorld(true);
  const mesh=gltf.scene.getObjectByName('cast');if(!isMesh(mesh))throw new Error('Missing static mesh');
  return identitySpaceGeometry(mesh)??mesh.geometry;
}
const channels=[{from:'COLOR_0',to:'_LIGHT_COLOR'},{from:'_DYE',to:'_LIGHT_DYE'}];
function sameChannel(a:BufferGeometry,key:string,b:BufferGeometry,other=key):void{
  const x=a.getAttribute(key),y=b.getAttribute(other);expect(y.count).toBe(x.count);expect(y.itemSize).toBe(x.itemSize);
  for(let i=0;i<x.count;i++)for(let c=0;c<x.itemSize;c++)expect(Object.is(y.getComponent(i,c),x.getComponent(i,c))).toBe(true);
}

test('paired packed channels preserve every native primary value and each normalized alternate colour',async()=>{
  const primary=compressGlb(pack(geometry())),alternate=compressGlb(pack(geometry(true)));
  const savedA=primary.slice(),savedB=alternate.slice(),output=await pairedChannelGlb(primary,alternate,'cast',channels);
  const [a,b,result]=await Promise.all([read(primary),read(alternate),read(output)]);
  expect(b.getAttribute('color').normalized).toBe(true);expect(result.getAttribute('_light_color').normalized).toBe(true);
  for(const name of Object.keys(a.attributes))sameChannel(a,name,result);
  sameChannel(b,'color',result,'_light_color');sameChannel(b,'_dye',result,'_light_dye');
  expect(result.index?.array).toEqual(a.index?.array);expect(primary).toEqual(savedA);expect(alternate).toEqual(savedB);
  a.dispose();b.dispose();result.dispose();
});

test('a different vertex, index order or unselected channel cannot be represented as a palette',async()=>{
  const primary=pack(geometry());
  for(const changed of ['position','index','normal']){
    const g=geometry(true);
    if(changed==='index')g.setIndex([2,1,0]);else g.getAttribute(changed).setX(0,.5);
    await expect(pairedChannelGlb(primary,pack(g),'cast',channels)).rejects.toThrow(/topology|channel/);g.dispose();
  }
});

test('paired channels refuse absent donors, duplicate targets, position replacement and changed frames',async()=>{
  const primary=pack(geometry()),alternate=pack(geometry(true));
  await expect(pairedChannelGlb(primary,primary,'cast',[{from:'_ABSENT',to:'_LIGHT'}])).rejects.toThrow();
  await expect(pairedChannelGlb(primary,primary,'cast',[{from:'COLOR_0',to:'_DYE'}])).rejects.toThrow();
  await expect(pairedChannelGlb(primary,alternate,'cast',[{from:'POSITION',to:'_LIGHT'}])).rejects.toThrow();
  await expect(pairedChannelGlb(primary,alternate,'cast',[...channels,{from:'COLOR_0',to:'_OTHER'}])).rejects.toThrow();
  const moved=staticGlb([{geometry:geometry(true),material,customAttributes:{_DYE:'dye'},quantizedChannels:true,transform:new Matrix4().makeTranslation(0,1,0)}],'cast');
  await expect(pairedChannelGlb(primary,moved,'cast',channels)).rejects.toThrow('frames');
  const changed=staticGlb([{geometry:geometry(),material:new MeshStandardMaterial({roughness:.9}),customAttributes:{_DYE:'dye'},quantizedChannels:true}],'cast');
  await expect(pairedChannelGlb(primary,changed,'cast',channels)).rejects.toThrow('material');
});
