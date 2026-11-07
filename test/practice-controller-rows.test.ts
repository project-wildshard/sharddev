import {expect,test} from 'vitest';
import { NALATI_KOKPAR } from './fixtures/nalati-kokpar';
import {parsePracticeController} from '@wildshard/format/practiceCourseRows';
import {horseCourseRows} from '../src/shards/nalati-grasslands/generators/courseScene';
import {grappleCourseScene} from '../src/shards/nine-dragon-stack/generators/courseScene';
import { ninePracticeRows } from './fixtures/nine-practice-product';
import course from '../src/shards/nine-dragon-stack/data/grappleCourse.json' with {type:'json'};

test('both real native entries share one strict controller grammar',()=>{
 for(const rows of [horseCourseRows(NALATI_KOKPAR.course).controller,grappleCourseScene(course, ninePracticeRows).controller])expect(parsePracticeController(rows)).toEqual(rows);
 const original=horseCourseRows(NALATI_KOKPAR.course).controller;
 const orchard=parsePracticeController({...original,title:'Orchard laps',entry:{kind:'mount',actor:{kind:'mule',variant:'cart',name:'Juniper'},start:{x:2,z:5,yaw:1},road:[[0,0],[20,0]]},center:{kind:'fixed',x:44,z:-9}});
 expect(orchard.entry.kind).toBe('mount');expect(orchard.title).toBe('Orchard laps');
});

test('controller admission refuses executable and incomplete suffixes before entry allocation',()=>{
 const rows=horseCourseRows(NALATI_KOKPAR.course).controller;
 for(const input of [{...rows,entry:{kind:'mount',actor:{kind:'mule',variant:'cart',name:'Juniper'},start:{x:0,z:0,yaw:0},road:[[0,0,7],[1,1]]}},{...rows,entry:{...rows.entry,update:()=>0}},{...rows,center:{kind:'fixed',x:Infinity,z:0}},{...rows,piece:{...rows.piece,surface:'unknown'}},{...rows,view:{kind:'checkpoints',pads:[],goals:1,words:{}}}])expect(()=>parsePracticeController(input)).toThrow();
 let reads=0;const input={...rows,get entry(){reads++;return rows.entry;}};expect(()=>parsePracticeController(input)).toThrow('JSON');expect(reads).toBe(0);
});


test('grapple entry rows admit unrelated hook courses and detach their bounded coordinates', () => {
 const base=grappleCourseScene(course, ninePracticeRows).controller,hooks=[{x:-7,y:12,z:9},{x:20,y:4,z:-8}];
 const rows=parsePracticeController({...base,title:'Quarry swing',entry:{kind:'grapple',hooks}});
 if(rows.entry.kind!=='grapple')throw new Error('Missing independent grapple entry');
 expect(rows.title).toBe('Quarry swing');expect(rows.entry.hooks[0]?.x).toBe(-7);
 const first=hooks[0];if(first===undefined)throw new Error('Missing independent hook');first.y=99;expect(rows.entry.hooks[0]?.y).toBe(12);
 for(const entry of [{kind:'grapple',hooks:[{x:-0,y:1,z:0}]},{kind:'grapple',hooks:[{x:0,y:Infinity,z:0}]},{kind:'grapple',hooks:Array.from({length:257},()=>({x:0,y:0,z:0}))},{kind:'grapple',hooks,tool:()=>undefined}])expect(()=>parsePracticeController({...base,entry})).toThrow();
});
