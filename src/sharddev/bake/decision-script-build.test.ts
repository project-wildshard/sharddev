import { expect, test } from 'vitest';
import { Scope } from '@wildshard/engine/app/scope';
import { parseDecisionScripts } from '@wildshard/format/decisionScripts';
import { captureDecisionSources, compileDecisionScripts, decisionLineCeiling } from '@wildshard/sharddev/buildDecisionScripts';
import { inspectDecisionSource } from '@wildshard/sharddev/decisionSource';
import { generateDecisionBindings } from '@wildshard/sharddev/decisionScriptBindings';
import { DecisionHost, type DecisionScript } from '@wildshard/engine/script/decision';
import { createScriptScenario } from '../test/scriptScenario';

const raw = { id: 'test.compiler', abi: '1.0', side: 'sim', module: `blobs/wasm/${'0'.repeat(64)}.wasm`,
  source: 'behaviour/main.as', binding: { encounter: 'test.encounter' }, on: ['start', 'timer'],
  onFail: 'reset', reads: ['nearestPlayer'], commands: ['move', 'timer'], actors: { boss: 'actual.boss' },
  moves: { stalk: 'actual.stalk' }, timers: ['beat'], stateVersion: 1,
  state: [{ name: 'count', type: 'i32', scope: 'binding', default: 0, min: 0, max: 10 }], params: { wait: 0.1 } };
const registries = { actors: new Map([['actual.boss', 37]]), moves: new Map([['actual.stalk', 82]]) };
const source = `import {Actor, Move, Timer, State, Params, Read, Do} from './generated/testCompiler';
export function onStart():void { State.count=1; Do.move(Actor.boss,Move.stalk,Read.nearestPlayer(Actor.boss)); Do.timer(Timer.beat,Params.wait); }
export function onTimer(timer:i32):void { if(timer==Timer.beat) State.count=State.count+1; }`;
const sources = () => new Map([['behaviour/main.as', source]]);
const budget = { asLineCeiling: 10 };

test('generated capabilities compile and drive the real host with authoritative ids and logical state', async () => {
  const built = await compileDecisionScripts([raw], registries, sources(), budget), row = built.rows[0], blob = built.blobs[0];
  if (row === undefined || blob === undefined) throw new Error('Missing compiled decision');
  expect(row.module).toBe(blob.file.path); expect(built.lines).toBe(3);
  const binding = generateDecisionBindings(row, registries);
  const script: DecisionScript = { ...row, ids: binding.map.ids, reads: ['nearestPlayer'], lists: [], state: [{ name: 'count', type: 'i32', scope: 'binding', default: 0, min: 0, max: 10 }] };
  const scenario = createScriptScenario(DecisionHost, { bytes: blob.bytes, script, seed: 7,
    binding: { id: 1, script: row.id, self: 37, actors: [37], instance: 0 }, actors: [{ id: 37, at: [0, 0, 0] }], players: [{ id: 101, at: [0, 0, 2] }] });
  scenario.send('start'); expect(scenario.commands()).toEqual([['move', 'boss', 'stalk', 101], ['timer', 'beat', 0.1]]);
  scenario.advance(0.2); expect(scenario.state()).toEqual({ count: 2 });
  expect(scenario.host.metrics()[0]).toMatchObject({ refusals: 0, disabled: false });
});
test('handler subscriptions, absent capabilities and source closure refuse before publication', async () => {
  await expect(compileDecisionScripts([raw], registries, new Map([['behaviour/main.as', `${source}\nexport function onDeath():void {}`]]), budget)).rejects.toThrow('handlers');
  await expect(compileDecisionScripts([raw], registries, new Map([['behaviour/main.as', source.replace('onTimer', 'otherTimer')]]), budget)).rejects.toThrow('handlers');
  await expect(compileDecisionScripts([raw], registries, new Map([['behaviour/main.as', source.replace('Do.timer(Timer.beat,Params.wait)', 'Do.reward(1)')]]), budget)).rejects.toThrow('compile failed');
  await expect(compileDecisionScripts([raw], registries, new Map([['behaviour/main.as', `${source}\nimport {x} from '../../outside';`]]), budget)).rejects.toThrow('Undeclared');
  const row = parseDecisionScripts([raw])[0]; if (row === undefined) throw new Error('Missing row');
  const bindings = generateDecisionBindings(row, registries).bindings;
  expect(bindings).toContain('boss:i32=37'); expect(bindings).toContain('stalk:i32=82'); expect(bindings).not.toContain('static reward');
});
test('the budget counts every authored source and preserves comment-looking string literals', async () => {
  const info = await inspectDecisionSource('// blank\n/* block\n comment */\nconst a="// kept";\nconst b="/* kept */"; // tail\n', 'behaviour/count.as');
  expect(info.lines).toBe(2);
  expect(() => decisionLineCeiling({})).toThrow('buildOptions.asLineCeiling'); expect(decisionLineCeiling({ decisionLegacyLines: 39, asLineCeiling: 100 })).toBe(3);
  const authored = sources(); authored.set('behaviour/unused.as', 'const unused=1;');
  await expect(compileDecisionScripts([raw], registries, authored, { asLineCeiling: 3 })).rejects.toThrow('4 > 3');
  await expect(compileDecisionScripts([raw], registries, new Map([['behaviour/generated/hidden.as', source]]), budget)).rejects.toThrow('Invalid authored');
});

test('inline generated helpers remain visible in the checked source budget', async () => {
  const authored = sources();
  authored.set('behaviour/weakPoints.generated.as', `export function weakPoint(x:f64,y:f64,z:f64):bool{
  return x < 1
    || y < 1
    || z < 1;
}
`);
  expect((await captureDecisionSources(authored, { asLineCeiling: 8 })).lines).toBe(8);
  await expect(captureDecisionSources(authored, { asLineCeiling: 7 })).rejects.toThrow('8 > 7');
});

test('emits the exact source SHA and replaces a stale producer claim', async () => {
  const original = await compileDecisionScripts([{ ...raw, sourceHash: 'f'.repeat(64) }], registries, sources(), budget);
  const digest = async (text: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  expect(original.rows[0]?.sourceHash).toBe(await digest(source));
  const changed = `${source}\n// source-only provenance change`;
  const rebuilt = await compileDecisionScripts([raw], registries, new Map([['behaviour/main.as', changed]]), budget);
  expect(rebuilt.rows[0]?.sourceHash).toBe(await digest(changed));
  expect(rebuilt.rows[0]?.sourceHash).not.toBe(original.rows[0]?.sourceHash);
  expect(() => parseDecisionScripts([{ ...raw, sourceHash: 'not-a-sha' }])).toThrow();
});

test('single-signal return packaging preserves results and refuses stateful inbox owners',async()=>{
  const row={id:'test.projection',abi:'1.0',side:'sim',module:`blobs/wasm/${'0'.repeat(64)}.wasm`,source:'behaviour/projection.as',binding:{shard:true},onFail:'hold',on:['signal'],tick:null,stateVersion:1,state:[],params:{},reads:['field'],commands:['channel'],fields:{value:'value'},channels:{result:'result'},signals:{step:'step'}};
  const authored=new Map([['behaviour/projection.as',"import {Field,Channel,Read,Do} from './generated/testProjection';\n@inline export function onSignal(signal:i32,value:f64,source:i32):void{Do.channel(Channel.result,Read.field(0,Field.value)*2);}"]]);
  const ids={fields:new Map([['value',1]]),channels:new Map([['result',1]]),signals:new Map([['step',1]])};
  const {ReturnProgram}=await import('@wildshard/engine/game/population/returnProgram');
  for(const singleSignal of [false,true]){
    const built=await compileDecisionScripts([row],ids,authored,{asLineCeiling:10,singleSignal}),script=built.rows[0],blob=built.blobs[0];
    if(script===undefined||blob===undefined)throw new Error('Missing return fixture');
    const owner=new Scope('compiled return fixture'),assets=new Map([[script.module.slice('blobs/wasm/'.length,-'.wasm'.length),blob.bytes]]);
    try{
      expect(script.module).toBe(blob.file.path);
      ReturnProgram.lendModules(owner,assets,[script]);
      const law=ReturnProgram.page({script,bytes:''},owner);
      expect(law.project('step',{value:3})).toEqual({result:6});
      expect(law.project('step',{value:-7})).toEqual({result:-14});
    }finally{owner.dispose();}
  }
  expect(()=>generateDecisionBindings(raw,registries,{singleSignal:true})).toThrow('stateless return');
});
