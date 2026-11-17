import { afterAll, beforeAll, expect, test } from 'vitest';
// oxlint-disable-next-line import/no-nodejs-modules -- Optional scenario receipt belongs to this test runner.
import {writeFileSync,readFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Bind receipt observations to the actual installed host and ABI bytes.
import {createHash} from 'node:crypto';
// oxlint-disable-next-line import/no-nodejs-modules -- Optional scenario receipts use the caller environment.
import { env } from 'node:process';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the fixture and the installed native metrics owner.
import {resolve,dirname} from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- Locate only the declared engine package.
import {createRequire} from 'node:module';
import {readProjectAssets} from '@wildshard/build/project';
import {writeOutputProduct} from '../../../sdk/src/sharddev/outputProduct';
import { scenario as diskScenario } from '../../src/sharddev/test/scriptScenario';
import { scriptScenarioReceipt } from '@wildshard/engine/scripts/script-scenario-metrics.mjs';

let directory: string;
// Hosted full-suite source preparation exceeded10s (mini3.6s); fence only this fixture at30s.
// The real native scenario keeps its original2s cap.
beforeAll(async () => {
  mkdirSync('tmp',{recursive:true});directory=mkdtempSync(resolve('tmp/template-boss-'));
  const product=await readProjectAssets(resolve(import.meta.dirname,'../../../sdk/src/shards/_template'));
  writeOutputProduct(product.shard,product.assets,directory,product.output);
},30_000);
afterAll(()=>{if(directory!==undefined)rmSync(directory,{recursive:true,force:true});});

test('Template boss runs published Wasm decisions and resumes a logical save', async () => {
  const create=()=>diskScenario('_template','template.boss.decision',{productDirectory:directory,seed:437,players:[{id:101,at:[-15,0,-18]}]});
  const scenario=await create();
  const strike=(name:string)=>[['field',0,'tell',1],['encounter','guard',1],['strike','boss',name,101],['timer','open',1.2]];
  const opened=[['field',0,'tell',0],['field',0,'core',1],['encounter','guard',2],['timer','shut',3]];
  const closed=(beat:number)=>[['field',0,'core',0],['encounter','guard',1],['timer','beat',beat]];
  const quiet=[['stop','boss'],['field',0,'tell',0],['field',0,'core',0],['timer','arm',0],['timer','beat',0],['timer','open',0],['timer','shut',0]];
  expect(scenario.product.sectionHash).toMatch(/^[a-f0-9]{64}$/u);
  scenario.send('start');
  expect(scenario.commands()).toEqual([['encounter','phase',0],['timer','arm',0.1],['timer','beat',1.6]]);
  expect(scenario.state()).toEqual({phase:1,swingNext:true,beat:0});
  // Current onStart rearms from health; it does not replay the phase-zero beat.
  scenario.send('start');
  expect(scenario.commands()).toEqual([['timer','arm',0.1],['timer','beat',1.6],['encounter','guard',1]]);
  scenario.advance(0.1);expect(scenario.commands()).toEqual([['encounter','guard',1]]);
  scenario.advance(1.5);expect(scenario.commands()).toEqual(strike('slam'));
  scenario.advance(1.2);expect(scenario.commands()).toEqual(opened);
  scenario.advance(3);expect(scenario.commands()).toEqual(closed(1.6));
  scenario.advance(1.6);expect(scenario.commands()).toEqual(strike('sweep'));
  const boss=scenario.world.snapshot().actors?.[0];if(boss===undefined)throw new Error('Missing real boss');
  scenario.world.setActor({...boss,hpShare:0.5});
  scenario.send('threshold','boss',1);expect(scenario.commands()).toEqual([['encounter','phase',1]]);
  scenario.send('threshold','boss',1);expect(scenario.commands()).toEqual([]);
  scenario.advance(0.25);expect(scenario.commands()).toEqual([]);
  const saved=scenario.save();
  scenario.advance(1);const commands=scenario.commands(),state=scenario.state();
  expect(commands).toEqual(opened);
  const resumed=await create();resumed.restore(structuredClone(saved));
  expect(resumed.save()).toEqual(saved);
  resumed.advance(1);expect(resumed.commands()).toEqual(commands);expect(resumed.state()).toEqual(state);
  expect(resumed.save()).toEqual(scenario.save());
  resumed.advance(3);expect(resumed.commands()).toEqual(closed(0.9));
  resumed.advance(0.9);expect(resumed.commands()).toEqual(strike('slam'));
  for(const name of ['sweep','stone']){
    resumed.advance(1.2);expect(resumed.commands()).toEqual(opened);
    resumed.advance(3);expect(resumed.commands()).toEqual(closed(0.9));
    resumed.advance(0.9);expect(resumed.commands()).toEqual(strike(name));
  }
  expect(resumed.state()).toEqual({phase:2,swingNext:true,beat:0});
  resumed.send('stop');expect(resumed.commands()).toEqual([...quiet,['encounter','guard',0]]);
  resumed.advance(2);expect(resumed.commands()).toEqual([]);
  expect(resumed.state()).toEqual({phase:2,swingNext:true,beat:0});
  resumed.send('start');expect(resumed.commands()).toEqual([['timer','arm',0.1],['timer','beat',0.9]]);
  resumed.advance(0.1);expect(resumed.commands()).toEqual([['encounter','guard',1]]);
  resumed.advance(0.8);expect(resumed.commands()).toEqual(strike('slam'));
  resumed.send('death','boss');expect(resumed.commands()).toEqual([...quiet,['encounter','win',0]]);
  resumed.send('death','boss');expect(resumed.commands()).toEqual([]);
  resumed.advance(2);expect(resumed.commands()).toEqual([]);
  expect(resumed.state()).toEqual({phase:3,swingNext:true,beat:1});
  resumed.send('stop');expect(resumed.commands()).toEqual([...quiet,['encounter','guard',0]]);
  resumed.send('start');expect(resumed.commands()).toEqual([]);
  resumed.advance(2);expect(resumed.commands()).toEqual([]);
  for(const owner of [scenario,resumed]){
    expect(owner.host.metrics()[0]).toMatchObject({refusals:0,disabled:false});
    expect(owner.maxFuel()).toBeGreaterThan(0);expect(owner.maxFuel()).toBeLessThan(400_000);
    const calls=owner.trace().filter(entry=>entry.kind==='call');expect(calls.length).toBeGreaterThan(0);
    let previous:number|undefined;
    for(const call of calls){expect(call.tick%6).toBe(0);expect(call.ok).toBe(true);if(previous!==undefined)expect(call.tick-previous).toBeGreaterThanOrEqual(6);previous=call.tick;}
  }
  // oxlint-disable-next-line typescript/dot-notation -- noPropertyAccessFromIndexSignature needs the bracket (tsc TS4111)
  const receiptPath=env['WS_SCRIPT_SCENARIO_RECEIPT'];
  if(receiptPath!==undefined){
    const require=createRequire(import.meta.url),enginePackage=require.resolve('@wildshard/engine/package.json'),root=dirname(enginePackage),engineRequire=createRequire(enginePackage);
    // Same logical fingerprint as engine scenarioHostHash; installed pnpm packages
    // resolve format through its export rather than a checkout-local node_modules.
    const fingerprint=createHash('sha256');
    for(const path of ['src/server/engine/script/decision.ts','src/shared/engine/script/decisionModule.ts','src/format/scriptAbiV1.ts']){
      const file=path==='src/format/scriptAbiV1.ts'?engineRequire.resolve('@wildshard/format/scriptAbiV1'):resolve(root,path);
      fingerprint.update(`${path}\0`);fingerprint.update(readFileSync(file));fingerprint.update('\0');
    }
    const hostHash=fingerprint.digest('hex');
    writeFileSync(receiptPath,`${JSON.stringify(scriptScenarioReceipt({slug:scenario.product.slug,script:scenario.product.script,scenario:'boss logical save continuation',sectionHash:scenario.product.sectionHash,hostHash,trace:[...scenario.trace(),...resumed.trace()]}),null,2)}\n`);
  }
},2_000);
