// @vitest-environment happy-dom
import { Scope } from '../src/shared/engine/app/scope';
import type { Interactable } from '../src/shared/engine/world/interact/types';
import { parseQuestPageInteractions, parseInteractionRows } from '@wildshard/format/questInteractions';
import { PINE_LANTERN_PAGE } from '../src/shards/pine-hollow/generators/questPageInteractions';
import { PINE_LANTERN_ROWS } from '../src/shards/pine-hollow/generators/interactions';
import { output as traderOutput } from '../src/shards/driftwood-isle/generators/output';
import { InteractionRules } from '../src/shared/game/quest/interactionRows';
import { Vector3 } from 'three';
import { expect, test, vi } from 'vitest';
import { Flags } from '../src/shared/engine/world/interact/flags';
import { parseQuestHost } from '@wildshard/format/questHost';
import { createQuestPagePrompts, bindQuestPageInteractions } from '../src/client/game/plugin/ui';
import { QUEST_HOST as signal } from '../src/shards/sunscar-dunes/generators/questHost';
import { QUEST_HOST as sky } from '../src/shards/far-reach/generators/questHost';
import { FLAG } from '../src/shards/sunscar-dunes/generators/rows/flags';


const traderFile = traderOutput.namedFiles.find(row => row.name === 'quests/trader.json');
const traderBytes = traderFile === undefined ? undefined : traderOutput.assets.get(traderFile.hash);
if (traderBytes === undefined) throw new Error('Missing published trader rows');
const TRADER_PAGE = parseQuestPageInteractions(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(traderBytes)));

test('unknown fields or missing borrowed targets refuse before initial effects',()=>{
  const flags=new Flags('page-beats-invalid',false),view={label:'unchanged'};
  expect(()=>bindQuestPageInteractions({questHost:parseQuestHost({...signal,page:{actions:[],unexpected:true}})},{flags,toast:()=>undefined})).toThrow();
  expect(()=>bindQuestPageInteractions({questHost:parseQuestHost({...signal,page:{actions:[{id:'a',after:[{kind:'call',target:'missing'}]}],initial:[{when:{},effects:[{kind:'label',target:'view',text:'changed'}]}]}})},
    {flags,labels:new Map([['view',view]]),toast:()=>undefined})).toThrow('Missing page interaction command');
  expect(view.label).toBe('unchanged');
});

test('borrowed rows restore actual views and methods keep their receiver; path escapes refuse',()=>{
  const flags=new Flags('page-borrowed-world',false);flags.set('restored');
  const world={label:'old',visible:true,active:false,turn(on:boolean){this.active=on;}};
  const page={actions:[{id:'turn',after:[{kind:'call',target:'turn'}]}],bindings:{
    labels:[{target:'label',owner:'world',path:['label']}],visible:[{target:'visible',owner:'world',path:['visible']}],
    calls:[{target:'turn',owner:'world',path:['turn'],args:[true]}]},
    initial:[{when:{all:['restored']},effects:[{kind:'label',target:'label',text:'restored'},{kind:'visible',target:'visible',value:false}]}]};
  const source={questHost:parseQuestHost({...signal,page})};
  const bound=bindQuestPageInteractions(source,{flags,owners:new Map([['world',world]]),toast:()=>undefined});
  expect(world.label).toBe('restored');expect(world.visible).toBe(false);bound.run('turn');expect(world.active).toBe(true);
  expect(()=>parseQuestHost({...signal,page:{...page,bindings:{calls:[{target:'turn',owner:'world',path:['constructor','prototype']}]}}})).toThrow();
  world.label='unchanged';
  expect(()=>bindQuestPageInteractions(source,{flags,owners:new Map(),toast:()=>undefined})).toThrow('Missing borrowed owner');
  expect(world.label).toBe('unchanged');
});

 test('borrowed prompt binds its named page action and preflights before restore',()=>{
  const flags=new Flags('prompt-bindings',false),world={onInteract:()=>undefined,label:'before'};let called=false;
  const page={actions:[{id:'take',after:[{kind:'call',target:'take'}]}],bindings:{prompts:[{target:'take',owner:'world',path:['onInteract']}],labels:[{target:'label',owner:'world',path:['label']}]},initial:[{when:{},effects:[{kind:'label',target:'label',text:'restored'}]}]};
  const source={questHost:parseQuestHost({...signal,page})};
  bindQuestPageInteractions(source,{flags,owners:new Map([['world',world]]),calls:new Map([['take',()=>{called=true;}]]),toast:()=>undefined});world.onInteract();expect(called).toBe(true);expect(world.label).toBe('restored');
  const broken={onInteract:0,label:'before'};expect(()=>bindQuestPageInteractions(source,{flags,owners:new Map([['world',broken]]),calls:new Map([['take',()=>undefined]]),toast:()=>undefined})).toThrow('Invalid borrowed prompt');expect(broken.label).toBe('before');
 });

test('admitted interaction rules refuse a missing host without changing flags',()=>{
 const flags=new Flags('missing-interaction-host',false);expect(()=>InteractionRules.fromDeclared({},flags)).toThrow('Missing admitted interaction host');expect(flags.has(FLAG.oil)).toBe(false);
});

test('declared prompts borrow their real positions and refuse missing or unsafe frames',()=>{
  const at=new Vector3(4,5,6),source={questHost:parseQuestHost({...sky,page:{actions:[{id:'notes'}],prompts:[{id:'notes',label:'Read notes',radius:2.6,at:{owner:'world',path:['at']}}]}})};
  const [prompt]=createQuestPagePrompts(source,new Map([['world',{at}]]),['notes']);
  expect(prompt.position).toBe(at);expect(prompt.label).toBe('Read notes');expect(prompt.radius).toBeGreaterThan(0);
  expect(()=>prompt.onInteract()).toThrow('not bound');
  expect(()=>createQuestPagePrompts(source,new Map([['world',{at:0}]]),['notes'])).toThrow('actual position');
  expect(()=>createQuestPagePrompts(source,new Map([['world',{at}]]),['missing'])).toThrow('Undeclared');
  expect(()=>parseQuestHost({...sky,page:{actions:[],prompts:[{id:'bad',label:'Bad',radius:1,at:{owner:'world',path:['__proto__']}}]}})).toThrow();
});

test('prompt registration preserves real object order and refuses before appending',()=>{
  const flags=new Flags('registered-prompts',false),first={label:'First',position:new Vector3(),radius:2,onInteract:()=>undefined},second={label:'Second',position:new Vector3(1,0,0),radius:3,onInteract:()=>undefined};
  const source={questHost:parseQuestHost({...sky,page:{actions:[{id:'a'},{id:'b'}],bindings:{prompts:[{target:'a',owner:'world',path:['first','onInteract']},{target:'b',owner:'world',path:['second','onInteract']}]}}})};
  const interactables:typeof first[]=[];
  bindQuestPageInteractions(source,{flags,owners:new Map([['world',{first,second}]]),interactables,toast:()=>undefined});
  expect(interactables).toEqual([first,second]);expect(()=>first.onInteract()).not.toThrow();
  const refused:typeof first[]=[];
  expect(()=>bindQuestPageInteractions(source,{flags,owners:new Map([['world',{first,second:{onInteract:()=>undefined}}]]),interactables:refused,toast:()=>undefined})).toThrow('Invalid registered');expect(refused).toEqual([]);
});


test('paired conditional prompts retain native rules, sound timing and borrowed shop actions; bad paths have no effects', async () => {
  vi.useFakeTimers();
  const flags=new Flags('paired-prompt-rows',false),scope=new Scope('paired-prompt-rows');
  const events:string[]=[],points={pond:new Vector3(1,2,3),ridge:new Vector3(4,5,6),den:new Vector3(7,8,9)};
  const owners=new Map<string,unknown>([['points',points],
    ['sound',{shot:(name:string,at:Vector3)=>{expect(Object.values(points)).toContain(at);events.push(name);}}],
    ['sfx',{interact:(name:string,at:Vector3)=>{expect(Object.values(points)).toContain(at);events.push(name);}}],
    ['floor',{setLantern:()=>undefined}],['shelf',{visible:false}]]);
  const prompts:Interactable[]=[];
  try {
    const page=bindQuestPageInteractions(PINE_LANTERN_PAGE,{flags,interactions:parseInteractionRows({marks:[],rows:PINE_LANTERN_ROWS}),
      timer:scope,promptIds:['pond','ridge','den'],owners,interactables:prompts,toast:text=>{events.push(text);}});
    const pond=page.prompt('pond');expect(pond.position).toBe(points.pond);expect(prompts).toContain(pond);
    expect(pond.label).toBe('The pond lantern is cold — its glass is gone');pond.onInteract();
    expect(flags.has('lit:pond')).toBe(false);expect(events).toEqual(['The pond lantern is cold — its glass is gone','locked']);
    events.length=0;flags.set('taken:pond-glass');expect(pond.label).toBe('Relight the pond lantern');pond.onInteract();
    expect(flags.has('lit:pond')).toBe(true);expect(pond.radius).toBe(0);
    expect(events).toEqual(['lanternCreak','ignite','The pond lantern burns again']);
    await vi.advanceTimersByTimeAsync(350);expect(events.at(-1)).toBe('lanternLight');
    events.length=0;pond.onInteract();expect(events).toEqual([]);
    flags.set('taken:ridge-flint');page.prompt('ridge').onInteract();scope.dispose();events.length=0;
    await vi.advanceTimersByTimeAsync(1000);expect(events).toEqual([]);
    const refused:Interactable[]=[];
    expect(()=>bindQuestPageInteractions(PINE_LANTERN_PAGE,{flags,promptIds:['pond'],owners,interactables:refused,toast:()=>{throw new Error('effect');}})).toThrow('Missing quest timer');
    expect(refused).toEqual([]);
    expect(()=>createQuestPagePrompts(PINE_LANTERN_PAGE,owners,['pond'])).toThrow('flag owner');
    expect(()=>bindQuestPageInteractions({...PINE_LANTERN_PAGE,bindings:{...PINE_LANTERN_PAGE.bindings,calls:[{target:'bad',owner:'sound',path:['shot'],args:[{owner:'points',path:['__proto__']}]}]}},
      {flags,owners,toast:()=>{throw new Error('effect');}})).toThrow();
    const shop={at:new Vector3(),ready:false,open:false},commands={trade(){shop.open=true;events.push('trade');}};
    const trader=bindQuestPageInteractions(TRADER_PAGE,{flags,promptIds:['trade'],owners:new Map<string,unknown>([['shop',shop],['commands',commands]]),toast:()=>{throw new Error('unexpected toast');}}).prompt('trade');
    expect(trader.position).toBe(shop.at);expect(trader.radius).toBe(0);shop.ready=true;
    expect(trader.label).toBe('Trade with Maren');expect(trader.radius).toBeGreaterThan(0);trader.onInteract();
    expect(shop.open).toBe(true);expect(trader.radius).toBe(0);expect(events).toEqual(['trade']);
  } finally {scope.dispose();vi.useRealTimers();}
});
