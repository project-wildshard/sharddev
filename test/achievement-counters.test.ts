import { expect,test } from 'vitest';
import { parseAchievementCounterData } from '@wildshard/format/achievementCounters';
import { PINE_PREPARED_OUTPUT as pineOutput } from './fixtures/pine-program';
import { output as driftwoodOutput } from '../src/shards/driftwood-isle/generators/output';
import { createAchievementCounters } from '../src/shared/game/achievements';
import {onFault, type Fault} from '../src/shared/engine/core/faults';
import { PINE_FEAT_COUNTERS } from '../src/shards/pine-hollow/generators/questInventory';
import { DRIFTWOOD_FEAT_COUNTERS } from '../src/shards/driftwood-isle/generators/questInventory';

function counterData(output: { readonly namedFiles: readonly { name?: string; hash: string }[]; readonly assets: ReadonlyMap<string, Uint8Array> }) {
  const file = output.namedFiles.find(row => row.name === 'quests/achievements.json'), bytes = file === undefined ? undefined : output.assets.get(file.hash);
  if (bytes === undefined) throw new Error('Missing admitted achievement policy');
  return parseAchievementCounterData(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
}
const pineData = counterData(pineOutput), driftwoodData = counterData(driftwoodOutput);

test('old progress advances with original matching, identities, saturation and write order',()=>{
  let drift:Record<string,number>={crab10:4};const emitted:string[]=[];
  const counter=createAchievementCounters(driftwoodData,{read:()=>({...drift}),write:state=>{drift=state;},emit:(fact,id)=>{expect(drift['crab10']).toBeLessThan(6);emitted.push(`${fact}/${id}`);}});
  counter.kill('crab');counter.count('crab10',6.8);expect(drift['crab10']).toBe(6);expect(emitted).toContain('driftwood.crab10/crab10:5');expect(emitted).toContain('driftwood.crab10/crab10:6');
  const pine:Record<string,number>={deer5:2,ghost:0};const witnessed:string[]=[];
  const policy=createAchievementCounters(pineData,{read:()=>({...pine}),write:state=>{Object.assign(pine,state);},emit:(fact,id)=>{witnessed.push(`${fact}/${id}`);}});
  policy.replay();expect(witnessed).toContain('pine.feat.deer5/deer5:2');const saved=pine['ghost'];
  policy.kill('deer','ordinary');expect(pine['ghost']).toBe(saved);expect(pine['deer5']).toBeGreaterThan(2);
  policy.kill('deer','ghost');expect(pine['ghost']).toBeGreaterThan(saved??0);policy.event('resin',1000);expect(pine['resin']).toBeLessThanOrEqual(30);
  const last=pine['resin'];policy.event('resin',0);expect(pine['resin']).toBe(last);
});
test('unknown and nonfinite observations skip without writes, report once, and keep the counter live',()=>{
  let state:Record<string,number>={},written=0;const emitted:string[]=[],faults:Fault[]=[],off=onFault(fault=>{faults.push(fault);});
  const ports={read:()=>({...state}),write:(next:Record<string,number>)=>{written++;state=next;},emit:(_fact:string,id:string)=>{emitted.push(id);}};
  try{
    const counter=createAchievementCounters(driftwoodData,ports);
    for(let n=0;n<2;n++){expect(()=>counter.count('missing',1)).not.toThrow();expect(()=>counter.count('crab10',Number.NaN)).not.toThrow();}
    expect(written).toBe(0);expect(emitted).toEqual([]);expect(state).toEqual({});
    expect(faults).toHaveLength(2);expect(faults.every(fault=>fault.system==='achievement.counters'&&fault.verdict==='retry')).toBe(true);
    counter.count('crab10',1);expect(state['crab10']).toBe(1);expect(written).toBe(1);expect(emitted).toEqual(['crab10:1']);
    expect(()=>createAchievementCounters({...DRIFTWOOD_FEAT_COUNTERS,feats:[{id:'bad',count:Infinity}]},ports)).toThrow();
  }finally{off();}
});

test('flag rows preserve old counters, callback order and malformed-row refusal',()=>{
  const on=new Set(['ready','listed-a','found:one']);
  const flags={has:(flag:string)=>on.has(flag),count:(prefix:string)=>[...on].filter(flag=>flag.startsWith(prefix)).length};
  const submitted:string[]=[];let state:Record<string,number>={progress:1};
  const policy=createAchievementCounters({feats:[{id:'progress',count:8}],prefix:'feat.',floorTotals:true,validateTotals:true,write:'each',flags:[
    {id:'progress',method:'count',value:{flags:['ready','listed-a','missing']}},
    {id:'found',method:'event',value:{prefix:'found:'}},
    {id:'pending',method:'event',value:{flag:'pending'},onlyWhenSet:true},
  ]},{read:()=>({...state}),write:next=>{state=next;},emit:(_fact,id)=>{submitted.push(`${id}/${String(state['progress'])}`);}});
  policy.syncFlags(flags,(id,total)=>{submitted.push(`${id}/${String(total)}`);});
  expect(submitted).toEqual(['progress/2','found/1']);submitted.length=0;
  policy.count('progress',4);expect(submitted).toEqual(['progress:2/2','progress:3/3','progress:4/4']);
  const old=state['progress'];policy.count('progress',0);expect(state['progress']).toBe(old);
  let written=false;
  expect(()=>createAchievementCounters({...PINE_FEAT_COUNTERS,flags:[{id:'bad',method:'event',value:{prefix:''}}]},
    {read:()=>({}),write:()=>{written=true;},emit:()=>undefined})).toThrow();expect(written).toBe(false);
});

test('published policy data preserves ordered flags, matching rows and the two write policies', () => {
  for (const [actual, authored] of [[pineData, PINE_FEAT_COUNTERS], [driftwoodData, DRIFTWOOD_FEAT_COUNTERS]] as const) {
    expect(actual.flags).toEqual(authored.flags);
    expect(actual.feats).toEqual(authored.feats.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => ['id', 'count', 'kind', 'event', 'variant'].includes(key)))));
    expect([actual.prefix, actual.floorTotals, actual.validateTotals, actual.write]).toEqual([authored.prefix, authored.floorTotals, authored.validateTotals, authored.write]);
    expect(() => parseAchievementCounterData({ ...actual, unknown: true })).toThrow();
    expect(() => parseAchievementCounterData({ ...actual, write: 'later' })).toThrow();
    expect(() => parseAchievementCounterData({ ...actual, flags: [{ id: 'bad', method: 'event', value: { flag: 'one', prefix: 'both' } }] })).toThrow();
  }
});
