import type {WorldPrimitive} from './world';
import {expect,test} from 'vitest';
import {worldGeometry} from './worldGeometry';

function clippingPrimitive(triangles:readonly (readonly number[])[],colours=4):WorldPrimitive {
 const positions=new Float64Array(triangles.flat()),count=positions.length/3;
 return {node:'clipping-fixture',objectId:null,material:0,terrain:false,positions,
  indices:Uint32Array.from({length:count},(_,i)=>i),
  normals:Float32Array.from({length:count*3},(_,i)=>(i%7-3)/4),
  colours:Float32Array.from({length:count*colours},(_,i)=>(i%11)/10),
  uv:Float32Array.from({length:count*2},(_,i)=>(i%9)/8),
  tangents:Float32Array.from({length:count*4},(_,i)=>(i%5-2)/2)};
}

test.each([
 [-1,0,-1,-1,2,-1,-1,0,1], [1,0,-1,1,2,-1,1,0,1],
 [-1,0,-1,1,2,-1,1,0,-1], [-1,0,1,1,2,1,1,0,1],
])('retains vertical triangles exactly on a tile boundary',(...coordinates)=>{
 const geometry=worldGeometry(clippingPrimitive([coordinates]),[-1,1,-1,1]);
 try{expect(Array.from(geometry.getAttribute('position').array)).toEqual(coordinates);}
 finally{geometry.dispose();}
});

test('retains triangles crossing a tile even when every original vertex is outside',()=>{
 const geometry=worldGeometry(clippingPrimitive([[-3,0,0,3,0,0,0,2,3]]),[-1,1,-1,1]);
 try{
  const position=geometry.getAttribute('position');
  expect(position.count).toBeGreaterThan(0);
  for(let i=0;i<position.count;i++){
   expect(position.getX(i)).toBeGreaterThanOrEqual(-1);
   expect(position.getX(i)).toBeLessThanOrEqual(1);
   expect(position.getZ(i)).toBeGreaterThanOrEqual(-1);
   expect(position.getZ(i)).toBeLessThanOrEqual(1);
  }
 }finally{geometry.dispose();}
});
