import { parseDecisionScripts, scriptV1Identifier, SCRIPT_V1_REFERENCE_KINDS, type DecisionScriptRow } from '@wildshard/format/decisionScripts';
import { SCRIPT_V1_EVENTS, SCRIPT_V1_COMMANDS, SCRIPT_V1_READS, SCRIPT_V1_LISTS, type ScriptV1EventName } from '@wildshard/format/scriptAbiV1';
import { decisionBindingMap, type DecisionRegistries, type DecisionBindingMap } from './decisionBindingMap';
import { WS_CORE } from './as/ws';

interface Method { args: string; values: string; result?: 'i32' | 'f64' | 'bool' }
const reads: Record<keyof typeof SCRIPT_V1_READS, Method> = {
  x:{args:'actor:i32',values:'f64(actor)'},y:{args:'actor:i32',values:'f64(actor)'},z:{args:'actor:i32',values:'f64(actor)'},
  yaw:{args:'actor:i32',values:'f64(actor)'},hpShare:{args:'actor:i32',values:'f64(actor)'},alive:{args:'actor:i32',values:'f64(actor)',result:'bool'},
  field:{args:'actor:i32,field:i32',values:'f64(actor),f64(field)'},distance:{args:'actor:i32,target:i32',values:'f64(actor),f64(target)'},
  nearestPlayer:{args:'actor:i32',values:'f64(actor)',result:'i32'},flag:{args:'flag:i32',values:'f64(flag)',result:'bool'},
  timerLeft:{args:'timer:i32',values:'f64(timer)'},random:{args:'',values:''},actorInZone:{args:'actor:i32,zone:i32',values:'f64(actor),f64(zone)',result:'bool'},
  playersInZone:{args:'zone:i32',values:'f64(zone)',result:'i32'},moving:{args:'actor:i32',values:'f64(actor)',result:'bool'},
  strikeState:{args:'actor:i32',values:'f64(actor)',result:'i32'},playerFlag:{args:'player:i32,flag:i32',values:'f64(player),f64(flag)',result:'bool'},
  spawnGroupAlive:{args:'spawn:i32',values:'f64(spawn)',result:'i32'},bearing:{args:'actor:i32,target:i32',values:'f64(actor),f64(target)'},
  bodyX:{args:'body:i32',values:'f64(body)'},bodyY:{args:'body:i32',values:'f64(body)'},bodyZ:{args:'body:i32',values:'f64(body)'},
  bodyAlive:{args:'body:i32',values:'f64(body)',result:'bool'},
  bodyYaw:{args:'body:i32',values:'f64(body)'},bodyVisible:{args:'body:i32',values:'f64(body)',result:'bool'},
  playerIntent:{args:'axis:i32',values:'f64(axis)'},
};
const lists: Record<keyof typeof SCRIPT_V1_LISTS, Method> = {
  actorsInZone:{args:'zone:i32',values:'f64(zone)'},playersWithin:{args:'actor:i32,radius:f64',values:'f64(actor),radius'},
  groundHeight:{args:'x:f64,z:f64',values:'x,z'},nearestWalkable:{args:'x:f64,z:f64',values:'x,z'},path:{args:'actor:i32,target:i32',values:'f64(actor),f64(target)'},
  radial:{args:'angle:f64,radius:f64=1',values:'angle,radius'},
  declaredFloor:{args:'x:f64,z:f64',values:'x,z'},
};
const commands: Record<keyof typeof SCRIPT_V1_COMMANDS, Method> = {
  move:{args:'actor:i32,move:i32,target:i32=0',values:'actor,f64(move),f64(target)'},
  strike:{args:'actor:i32,strike:i32,target:i32=0',values:'actor,f64(strike),f64(target)'},stop:{args:'actor:i32',values:'actor'},
  field:{args:'actor:i32,field:i32,value:f64',values:'actor,f64(field),value'},spawn:{args:'spawn:i32',values:'0,f64(spawn)'},despawn:{args:'actor:i32',values:'actor'},
  flag:{args:'flag:i32,value:bool,player:i32=0',values:'player,f64(flag),value?1.0:0.0'},timer:{args:'timer:i32,seconds:f64',values:'0,f64(timer),seconds'},
  signal:{args:'signal:i32,value:f64=0',values:'0,f64(signal),value'},grant:{args:'fact:i32,player:i32=0',values:'player,f64(fact)'},
  reward:{args:'reward:i32,player:i32=0',values:'player,f64(reward)'},cue:{args:'cue:i32,actor:i32=0',values:'actor,f64(cue)'},
  channel:{args:'channel:i32,value:f64',values:'0,f64(channel),value'},impulse:{args:'target:i32,impulse:i32',values:'target,f64(impulse)'},
  encounter:{args:'verb:i32,value:f64=0',values:'0,f64(verb),value'},weather:{args:'weather:i32',values:'0,f64(weather)'},
  'body.spawn':{args:'body:i32',values:'0,f64(body)'},
  'body.teleport':{args:'body:i32,x:f64,y:f64,z:f64',values:'body,x,y,z'},
  'collider.enabled':{args:'collider:i32,on:bool',values:'0,f64(collider),on?1.0:0.0'},
  'body.place':{args:'body:i32,x:f64,z:f64,yaw:f64',values:'body,x,z,yaw'},
  'body.visible':{args:'body:i32,on:bool',values:'body,on?1.0:0.0'},
  'body.retire':{args:'body:i32',values:'body'},
  'view.channel':{args:'channel:i32,value:f64',values:'0,f64(channel),value'},'view.clip':{args:'actor:i32,clip:i32',values:'actor,f64(clip)'},
  'view.vfx':{args:'actor:i32,cue:i32',values:'actor,f64(cue)'},'view.sound':{args:'actor:i32,cue:i32',values:'actor,f64(cue)'},
  'view.visible':{args:'actor:i32,value:bool',values:'actor,value?1.0:0.0'},
  'view.field':{args:'field:i32,value:f64',values:'0,f64(field),value'},
};
/** Handlers follow the design's implicit-subject form; Event.subject retains the full current subject for multi-actor bindings. */
export const DECISION_HANDLERS: Record<ScriptV1EventName, { name: string; args: string }> = {
  start:{name:'onStart',args:''},tick:{name:'onTick',args:'Clock.dt'},timer:{name:'onTimer',args:'i32(__ws.value(1))'},
  'zone.enter':{name:'onZoneEnter',args:'i32(__ws.value(1)),i32(__ws.value(2))'},'zone.leave':{name:'onZoneLeave',args:'i32(__ws.value(1)),i32(__ws.value(2))'},
  interact:{name:'onInteract',args:'i32(__ws.value(1)),i32(__ws.value(2)),i32(__ws.value(3))'},
  hit:{name:'onHit',args:'i32(__ws.value(2)),__ws.value(3),__ws.value(4)'},threshold:{name:'onThreshold',args:'i32(__ws.value(2))'},death:{name:'onDeath',args:'i32(__ws.value(2))'},
  'move.done':{name:'onMoveDone',args:'i32(__ws.value(2)),__ws.value(3)==1'},'strike.done':{name:'onStrikeDone',args:'i32(__ws.value(2)),__ws.value(3)==1'},
  flag:{name:'onFlag',args:'i32(__ws.value(1)),__ws.value(2)==1'},signal:{name:'onSignal',args:'i32(__ws.value(1)),__ws.value(2),i32(__ws.value(3))'},
  'strike.target':{name:'onStrikeTarget',args:'i32(__ws.value(1)),i32(__ws.value(2)),i32(__ws.value(3))'},
  'player.join':{name:'onPlayerJoin',args:'i32(__ws.value(1))'},'player.leave':{name:'onPlayerLeave',args:'i32(__ws.value(1))'},
  spawned:{name:'onSpawned',args:'i32(__ws.value(2))'},stop:{name:'onStop',args:''},
  field:{name:'onField',args:'i32(__ws.value(1)),i32(__ws.value(2)),__ws.value(3)'},cue:{name:'onCue',args:'i32(__ws.value(1)),i32(__ws.value(2))'},
  channel:{name:'onChannel',args:'i32(__ws.value(1)),__ws.value(2)'},
};
const namespaces = {actors:'Actor',moves:'Move',strikes:'Strike',cues:'Cue',fields:'Field',flags:'Flag',zones:'Zone',spots:'Spot',targets:'Target',spawns:'Spawn',signals:'Signal',facts:'Fact',rewards:'Reward',channels:'Channel',impulses:'Impulse',weather:'Weather',bodies:'Body',colliders:'Collider'} as const;
/** Safe generated filename shared by the compiler and author imports. */
export function decisionBindingsPath(row: Pick<DecisionScriptRow,'id'>): string { return `behaviour/generated/${scriptV1Identifier(row.id)}.ts`; }
/** Allocation-free, capability-specific AssemblyScript bindings plus the only ABI entry point. */
export function generateDecisionBindings(input: unknown, registries: DecisionRegistries, options: { development?: boolean; singleSignal?: boolean } = {}): {
  row: DecisionScriptRow; map: DecisionBindingMap; path: string; bindings: string; glue: string; sources: Readonly<Record<string,string>>;
} {
  const row = parseDecisionScripts([input])[0]; if (row === undefined) throw new Error('Missing decision row');
  const map = decisionBindingMap(row,registries), lines = ['// Generated from the admitted decision row. Never edit.',"import * as core from '../../sdk/as/ws';"];
  for (const kind of [...SCRIPT_V1_REFERENCE_KINDS,'timers'] as const) {
    // Unused additive namespaces must not perturb existing guest bytecode.
    if ((kind === 'bodies' || kind === 'colliders') && Object.keys(map.ids[kind] ?? {}).length === 0) continue;
    const name = kind === 'timers' ? 'Timer' : namespaces[kind];
    lines.push(`export namespace ${name} {`,...Object.entries(map.ids[kind]??{}).map(([alias,id])=>`  export const ${scriptV1Identifier(alias)}:i32=${id};`),'}');
  }
  lines.push('export class State {');
  for (const [index,slot] of row.state.entries()) {
    const name=scriptV1Identifier(slot.name), value=`core.state(${index})`, type=slot.type;
    const check=options.development===false||type==='bool'?'':`assert(value>=${slot.min??(type==='i32'?-2147483648:-Number.MAX_VALUE)}&&value<=${slot.max??(type==='i32'?2147483647:Number.MAX_VALUE)});`;
    lines.push(`  @inline static get ${name}():${type}{return ${type==='bool'?`${value}==1`:`${type}(${value})`};}`,
      `  @inline static set ${name}(value:${type}){${check}core.setState(${index},${type==='bool'?'value?1.0:0.0':'f64(value)'});}`);
  }
  lines.push('}','export class Params {',...map.paramNames.map((name,index)=>`  @inline static get ${scriptV1Identifier(name)}():f64{return core.parameter(${index});}`),'}',
    'export class Clock {',...['tick','dt','binding','self'].map((name,index)=>`  @inline static get ${name}():${name==='dt'?'f64':'i32'}{return ${name==='dt'?`core.header(${index})`:`i32(core.header(${index}))`};}`),'}',
    'export class Event {',...['kind','subject','a','b','c','d'].map((name,index)=>`  @inline static get ${name}():f64{return core.event(${index});}`),'}','export class Read {');
  let hasList=false;
  for(const name of row.reads) {
    if(Object.hasOwn(SCRIPT_V1_READS,name)) {
      const key=name as keyof typeof SCRIPT_V1_READS, method=reads[key], type=method.result??'f64',call=`core.read(${SCRIPT_V1_READS[key]}${method.values?',':''}${method.values})`;
      lines.push(`  @inline static ${scriptV1Identifier(name)}(${method.args}):${type}{return ${type==='bool'?`${call}!=0`:type==='i32'?`i32(${call})`:call};}`);
    } else {
      const key=name as keyof typeof SCRIPT_V1_LISTS,method=lists[key];hasList=true;
      lines.push(`  @inline static ${name}(${method.args}):i32{return core.list(${SCRIPT_V1_LISTS[key]},${method.values});}`);
    }
  }
  lines.push('}');if(hasList)lines.push('export class List {@inline static at(index:i32):f64{return core.listAt(index);}}');
  lines.push('export class Do {');
  for(const name of row.commands){const method=commands[name];lines.push(`  @inline static ${scriptV1Identifier(name)}(${method.args}):void{core.command(${SCRIPT_V1_COMMANDS[name]},${method.values});}`);}
  if(row.commands.includes('encounter'))lines.push('  @inline static encounterPhase(index:i32):void{Do.encounter(1,f64(index));}','  @inline static encounterWin():void{Do.encounter(2);}','  @inline static encounterFail():void{Do.encounter(3); }');
  lines.push('}','export class __ws {',`  @inline static init():void{core.init(${row.state.length},${map.paramNames.length});}`,
    '  @inline static io():i32{return core.io();}','  @inline static begin():void{core.begin();}','  @inline static end():i32{return core.finish();}',
    '  @inline static count():i32{return core.events();}','  @inline static select(index:i32):void{core.selectEvent(index);}','  @inline static value(field:i32):f64{return core.event(field);}','}');
  const path=decisionBindingsPath(row),handlers=row.on.map(name=>DECISION_HANDLERS[name]);
  let glue=[`import {${handlers.map(handler=>handler.name).join(',')}} from './${row.source.slice(0,-3)}';`,
    `import {__ws,Clock} from './${path.slice(0,-3)}';`,'export function ws_abi():i32{return 1;}',
    'export function ws_init(lo:i32,hi:i32):void{__ws.init();}','export function ws_io():i32{return __ws.io();}',
    'export function ws_handle():i32{__ws.begin();for(let index:i32=0;index<__ws.count();index++){__ws.select(index);switch(i32(__ws.value(0))){',
    ...row.on.map(name=>`case ${SCRIPT_V1_EVENTS[name]}:${DECISION_HANDLERS[name].name}(${DECISION_HANDLERS[name].args});break;`),
    'default:unreachable();}}return __ws.end();}'].join('\n');
  // Return projections already submit exactly one stateless signal per request.
  // Emit their fixed transport directly; general ABI inboxes keep their loop.
  if(options.singleSignal===true){
    if(row.on.length!==1||row.on[0]!=='signal'||row.state.length>0||row.tick!==null||row.timers.length>0||row.commands.some(command=>command!=='channel'))throw new Error('Single-signal transport requires a stateless return projection');
    glue=`${glue.slice(0,glue.indexOf('export function ws_handle'))}export function ws_handle():i32{__ws.begin();assert(__ws.count()==1);__ws.select(0);assert(i32(__ws.value(0))==${SCRIPT_V1_EVENTS.signal});onSignal(${DECISION_HANDLERS.signal.args});return __ws.end();}`;
  }
  const bindings=lines.join('\n');return {row,map,path,bindings,glue,sources:{[path]:bindings,'sdk/as/ws.ts':WS_CORE}};
}
