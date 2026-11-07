import { lendOpenArenaView } from '../src/client/game/boss/arenaFire';
import { titanFightOwners } from './fixtures/titanFightOwners';
import { installWorldFixture } from './fixtures/worldSetup';
import { installArenaRoomEntry } from '../src/client/game/shardfile/clientEntryBinds';
import { entryOwner, publishEntryOwner } from '../src/shared/game/shardfile/entryOwners';
import { installClientCosmeticFinishes, clientCosmeticFinishes } from '../src/client/game/shardfile/clientCosmeticFinishes';
import { publishBoundPersistence } from '../src/shared/game/quest/chapterBindings';
import type { AdventurePersistence } from '../src/shared/game/quest/persistence';
import { HeldClaims, type HeldSlotKit } from '../src/client/game/loadout/claims';
import type { ModelDef } from '../src/client/engine/models/model';
import { currentOwner } from '../src/shared/engine/app/ownership';
import finishes from '../src/shards/nalati-grasslands/data/skinFinishes.json' with {type:'json'};
import {lendNalatiPasture} from './fixtures/nalati-titan-loan';
import { ArenaRoomEncounter, type OpenArenaWorld } from '../src/client/game/boss/arenaRoom';
import { ARENA_ROOM_PAGE } from '../src/client/game/boss/arenaRoomView';
import type { Animal } from '../src/client/engine/entities/AnimalView';
import { eliteDamageMul } from '../src/shared/engine/entities/eliteBrain';
// @vitest-environment happy-dom
import { app } from '../src/client/engine/app/runtime';
import { shardContext, type ShardContext } from '../src/client/game/plugin/context';
import type { ShardRuntime } from '../src/shared/game/shard/runtime';
import { expect, test,vi } from 'vitest';
import { parse } from 'valibot';
import { PatrolViewSchema } from '@wildshard/format/encounterRows';
import { BoxGeometry, MeshBasicMaterial, PerspectiveCamera, Vector3 } from 'three';
import { BossBrain, type BossScript, type BossDefinition } from '../src/shared/engine/ai/BossBrain';
import { silentBossPresentation } from '../src/server/engine/ai/phases';
import { bindFlatTerrain } from '@wildshard/engine/test/terrain';
import { Scope } from '../src/shared/engine/app/scope';
import { lendLooks } from '../src/client/game/shardfile/lentLooks';
import { parseArenaScriptData } from '@wildshard/format/arenaScriptRows';
import { PatrolEncounterView } from '../src/client/game/boss/encounterView';
import { CueDirector } from '../src/client/game/audio/cueDirector';
import { ReturnProgram } from '../src/shared/game/population/returnProgram';
import { Mount } from '../src/client/game/riding/mount';
import type { LevelContext } from '../src/server/engine/level/context';
import { NALATI_NIGHT as nightInput } from './fixtures/nalati-night';
import {withWeatherWitness} from './fixtures/weatherInlineWitness';
import fireView from '../src/shards/nalati-grasslands/data/arenaFire.json' with { type: 'json' };
import * as titan from '../src/shards/nalati-grasslands/generators/stormTitanFight';
import { titanGeometryRows } from '../src/shards/nalati-grasslands/generators/stormTitanGeometry';
import * as world from '../src/shards/nalati-grasslands/generators/layout';
import { manager } from '@wildshard/engine/test/manager';
import { legacyDouble } from '@wildshard/engine/test/FakeGame';
import {titanPrograms as programs} from './fixtures/titanInlineWitness';
import { mockCanvas } from '@wildshard/engine/test/weaponParity';
import { App } from '../src/client/engine/app/app';
import { createLevelInstallation } from '../src/client/engine/level/installation';
import { WorldRegistry } from '../src/client/engine/world/registry';
import { createShardProduct } from '../src/shared/game/shardfile/shardProduct';
import { installViewProgram } from '../src/client/game/shardfile/clientViewProgram';
import { emptyShardfile } from '../src/sharddev/author';
import { MANIFEST as TEMPLATE } from '../src/shards/_template/discovery.generated';
import { nalatiTitanView } from '../src/shards/nalati-grasslands/generators/titanView';
import { nalatiViewBytes } from './fixtures/nalati-view-modules';

const geometry = titanGeometryRows();

const night=withWeatherWitness(nightInput);

/** R6: a fight driven without its entered bind adopts the real view module at its frame slot (tells, pose ease, aim) */
await installWorldFixture();

function adoptTitanView(fight: ArenaScriptFight, scope: Scope): void {
  // the module's bytes, as the product compiles them (happy-dom's Response cannot feed a runtime compile)
  const rows = nalatiTitanView(), module = nalatiViewBytes('titan-view');
  const product = createShardProduct({ slug: 'titan-view-fixture', revision: 1, sections: new Map(), files: new Map(),
    shardfile: emptyShardfile({ slug: 'titan-view-fixture', name: 'Titan view fixture', author: 'Test', revision: 1, seed: 1 }),
    read: () => Promise.reject(new Error('The Titan view needs no file read')) });
  const level = createLevelInstallation(new App(), scope.child('titan-view'), {}, () => ({ set: () => undefined, detail: () => undefined }));
  const ctx = shardContext(level.context, TEMPLATE, { shard: TEMPLATE, rows: new Map(), bag: { tab: () => () => undefined, fragment: () => () => undefined } }, product);
  Object.defineProperty(ctx.game, 'runtime', { value: { world: { registry: new WorldRegistry(), player: { position: new Vector3(), velocity: new Vector3(), yaw: 0 }, game: { camera: new PerspectiveCamera() } } } });
  lendOpenArenaView(fight, ctx.scope);
  installViewProgram(ctx, { kind: 'view.program', id: 'titan-view', module: 'views/nalati.titan-view.wasm', rows }, module);
}

function encounter(def: Omit<BossDefinition, 'reward'>, script: BossScript, position: Vector3) {
  let rewards = 0;
  const saved = { defeated: false, rewardTaken: false, kills: 0 };
  const brain = new BossBrain({ ...def, reward: {} }, script, {
    player: { position }, lockInput: () => undefined, skipHeld: () => false,
    respawn: point => { position.copy(point); }, faceToward: () => undefined,
    spawnReward: () => { rewards++; }, persist: value => { Object.assign(saved, value); },
  }, silentBossPresentation(), saved);
  const trace: string[] = [];
  return { brain, saved, trace, get rewards() { return rewards; }, step: (dt: number, t: number) => {
    brain.update(dt, t); const state = `${brain.state}:${brain.phase}`; if (trace.at(-1) !== state) trace.push(state);
  } };
}

test.each([false,true])('arena script runs mounted phases, exposes its heart and wins (orchard fixture %s)', orchard => {
  mockCanvas();
  const restore = bindFlatTerrain({ heightAt: () => 0, normalAt: () => [0, 1, 0], waterLevel: () => -100 }), scope = new Scope('titan-headless');
  const f = manager(), figure = new BoxGeometry(.2,.5,.3), materials = new Map(['nalati-titan-cloud','nalati-titan-flame','nalati-titan-smoke','nalati-spray-debris','nalati-spray-mist','nalati-tell','nalati-ghost','nalati-ghost-captain','nalati-ghost-storm'].map(id => [id, new MeshBasicMaterial()]));
  Object.assign(f.player,{ velocity: new Vector3(),setBodyEnabled: () => undefined });
  lendLooks(scope, { materials, setParam: () => undefined, setTexture: () => undefined, bindMeshMap: () => { throw new Error('No mapped materials in this fight'); },
    instance: () => ({ material: new MeshBasicMaterial(), setParam: () => undefined }) });
  const weather = { weather: legacyDouble<OpenArenaWorld['weather']>({ flash: 0, raise: () => undefined,stormActive: true }) };
  scope.expose(app,'levelScope',scope);
  const game = Object.assign(f.game.asGame(), { app,levelScope: scope });
  lendNalatiPasture(scope);
  const data = parseArenaScriptData({ ...titanFightOwners, arenaScript: titan.TITAN_HOST,arenaFire: fireView,programs:{attack:programs.attack,wind:programs.wind} },geometry);
  if (orchard) {
    data.definition.id = 'orchard-thunder'; data.definition.name = 'Orchard thunder';
    data.place.heartHp = 1300; data.script.fight.parameters['fullHp'] = 1300;
    data.script.fight.initial['hp'] = 1300; data.view.target.range = 90;
    data.script.fight.parameters['rewardDistance'] = 6; data.view.reward.lift = 2;
    data.record = { kind: 'orchard-thunder',variant: 'elder' };
  }
  const allocate=vi.spyOn(ReturnProgram,'page'),add=vi.spyOn(game.scene,'add');
  for(const malformed of ['count','slot','output','alias','retain','clear','channel']){
    const invalid=structuredClone(data);
    if(malformed==='count')invalid.clocks.frame.parameters[invalid.clocks.count]=0;
    if(malformed==='slot')delete invalid.clocks.frame.initial[invalid.clocks.left];
    if(malformed==='output')invalid.clocks.frame.outputs=[];
    if(malformed==='channel')invalid.clocks.frame.outputs=[...(invalid.clocks.frame.outputs??[]),'missing'];
    if(malformed==='retain')invalid.clocks.frame.retain['hostile']='missing';
    if(malformed==='clear'){const first=invalid.clocks.landings[0];if(first===undefined)throw new Error('Missing landing');delete invalid.clocks.clear[first.on];}
    if(malformed==='alias'){const first=invalid.clocks.landings[0],second=invalid.clocks.landings[1];if(first===undefined||second===undefined)throw new Error('Missing landing rows');second.on=first.on;}
    expect(()=>new ArenaRoomEncounter({kind:'open',page:ARENA_ROOM_PAGE,world:{game,player:f.player,weather:weather.weather,tieSpot:null},rows:invalid})).toThrow('Invalid encounter clock bank');
  }
  const invalidSnapshot=structuredClone(data);invalidSnapshot.script.fight.retainEvents.tell.bend='missing';
  expect(()=>new ArenaRoomEncounter({kind:'open',page:ARENA_ROOM_PAGE,world:{game,player:f.player,weather:weather.weather,tieSpot:null},rows:invalidSnapshot})).toThrow('Missing projection state slot');
  for(const bad of ['intro-clock-channel','clock-event','support-slot','member-slot','gate-slot','gate-input','gate-event','support-actors','support-commit','support-commit-finite','support-memory','whirl-slot','field-channel','field-signal']){
    const invalid=structuredClone(data);
    if(bad==='intro-clock-channel')invalid.script.fight.retainEvents.introClock.zzzzIntroTick='missing';
    if(bad==='clock-event')invalid.clocks.frame.signals.step='missingEvent';
    if(bad==='support-slot')invalid.support.initial['missing']=0;
    if(bad==='member-slot')invalid.support.member['missing']=0;
    if(bad==='gate-slot'&&invalid.whirls.gate.slots[0]!==undefined)invalid.whirls.gate.slots[0].weight='missing';
    if(bad==='gate-input')invalid.whirls.gate.inputs.delta='missing';
    if(bad==='gate-event')invalid.whirls.gate.arm='missing';
    if(bad==='support-actors')delete invalid.support.actors;
    if(bad==='support-commit')invalid.support.commit['x']=1;
    if(bad==='support-commit-finite')invalid.support.commit['mode']=Number.NaN;
    if(bad==='support-memory'){if(invalid.support.actors===undefined)throw new Error('Missing actor rows');invalid.support.actors.memory['tx']='missingChannel';}
    if(bad==='whirl-slot'){const row=invalid.whirls.laws[0];if(row===undefined)throw new Error('Missing whirl');row.retain={missing:'missing'};}
    if(bad==='field-channel')invalid.field.channels.lifetime='missingChannel';
    if(bad==='field-signal')invalid.field.signals.activate='missingEvent';
    expect(()=>new ArenaRoomEncounter({kind:'open',page:ARENA_ROOM_PAGE,world:{game,player:f.player,weather:weather.weather,tieSpot:null},rows:invalid})).toThrow();
  }
  expect(allocate).not.toHaveBeenCalled();expect(add).not.toHaveBeenCalled();allocate.mockRestore();add.mockRestore();
  const intake=vi.spyOn(ReturnProgram,'page');
  const owner = new ArenaRoomEncounter({kind:'open',page:ARENA_ROOM_PAGE,world:{ game,player: f.player,weather: weather.weather,tieSpot: null },rows:data});
  expect(intake.mock.calls).toStrictEqual([[data.programs.attack,scope],[data.programs.wind,scope]]);intake.mockRestore();
  verifyOpenArenaEntry(owner,scope);
  const riders = new PatrolEncounterView({ patrol: night.patrol,motion: night.motion,view: parse(PatrolViewSchema,night.ride) },ReturnProgram.page(night.program,scope),
    { game,sky: f.sky,player: f.player,forest: f.forest,cues: new CueDirector(game,night.cues,scope),figures: { rider: figure,captain: figure,storm: figure } });
  riders.attachActors(f.manager); owner.riders = riders;
  owner.mount = new Mount(legacyDouble<LevelContext>({ app,scope }),f.player,f.manager,
    { speeds: { walk: 1.8,trot: 4.5,canter: 8.5,gallop: 13 },names: {},thrownDamage: 7,thrownLabel: 'Thrown',restAt: { x: 3,z: 5 } });
  const horse = f.manager.spawn('horse',0,0,0); owner.mount.horse = horse;
  const fight = owner.openFight;
  adoptTitanView(fight, scope);
  f.player.position.set(world.CAIRN.x, 0, world.CAIRN.z + titan.TITAN_PLACE.centreZ); fight.tied = true;
  const e = encounter(data.definition, fight, f.player.position), direction = new Vector3(0, 0, -1);
  let support:Animal|null=null,supportChecked=false;
  try {
    fight.reset(0);fight.intro(0,true);fight.update(.016,.016,false);
    expect(fight.pose.raise).toBe(.2);expect(fight.inArena(f.player.position)).toBe(false);expect(fight.shielded).toBe(false);
    expect(fight.life.value(data.script.fight.retainEvents.tell.raiseRate)).toBe(0);
    fight.reset(0);
    const seeds=data.seeds.map(at=>({...at}));data.seeds.splice(0,data.seeds.length,{x:0,z:0},{x:5,z:0});
    fight.reset(2);fight.intro(0,true);fight.begin(2);fight.clocks.set({mode:3});
    const aim=vi.spyOn(fight.body,'aim'),panic=vi.spyOn(owner,'horseSteed').mockImplementation(()=>{fight.reset(0);});
    fight.update(.1,1,true);expect(panic).toHaveBeenCalled();expect(aim.mock.calls.at(-1)?.[0]).toBe(fight.spearAt);
    expect(aim.mock.calls.at(-1)?.[1]).toBe(0);aim.mockRestore();panic.mockRestore();data.seeds.splice(0,data.seeds.length,...seeds);
    fight.reset(0);
    const chain=data.clocks.frame;
    const initial=chain.initial['zzChainCd'];chain.initial['zzChainCd']=0;fight.reset(2);fight.begin(2);fight.body.setVisible(true);
    const raised=vi.spyOn(weather.weather,'raise'),random=app.rng.stream('ai'),before=random.snapshot();
    fight.update(.05,0,true);expect(random.snapshot()).toEqual(before);
    fight.update(.05,.05,true);const paused=random.snapshot();fight.update(1,1,false);expect(random.snapshot()).toEqual(paused);
    for(let i=0;i<45;i++){owner.mount.horse=horse;owner.mount.feet.copy(f.player.position);fight.update(.1,2+i*.1,true);}
    expect(raised).toHaveBeenCalledTimes(7);raised.mockClear();fight.reset(0);
    for(let i=0;i<20;i++)fight.update(.1,8+i*.1,false);
    expect(raised).not.toHaveBeenCalled();raised.mockRestore();
    if(initial===undefined)throw new Error('Missing native chain cooldown');chain.initial['zzChainCd']=initial;
    fight.reset(0);
    e.brain.arm();
    for (let frame = 0; frame < 12000 && e.brain.state !== 'victory'; frame++) {
      const dt = 1 / 30, t = frame * dt;
      owner.mount.horse = horse; owner.mount.feet.copy(f.player.position);
      e.step(dt, t);
      if (frame % 15 === 0 && e.brain.state === 'fight') {
        for (const { a } of riders.riders) if(a.alive){
          if(fight.phase===1&&!supportChecked){
            support=a;supportChecked=true;expect(a.hp).toBe(data.support.actors?.hp);
            expect(eliteDamageMul(a,f.player.position.clone().add(new Vector3(100,0,0)),direction)).toBe(.5);
            expect(eliteDamageMul(a,f.player.position,direction)).toBe(1);
          }
          a.applyDamage(1000,a.position,direction);
        }
        const target = fight.lockTarget();
        if (target !== null && fight.heartOpen) {
          const hit = fight.target(target.position.clone().add(new Vector3(0, 0, 30)), direction, 100, null);
          expect(hit).not.toBeNull(); hit?.animal.applyDamage(90, hit.point, direction);
        }
      }
    }
    expect(e.brain.state).toBe('victory'); expect(e.trace).toEqual(['armed:0','intro:0','fight:0','beat:1','fight:1','beat:2','fight:2','victory:2']);
    expect(e.saved).toEqual({ defeated: true, rewardTaken: false, kills: 1 }); expect(e.rewards).toBe(1); expect(fight.dead).toBe(true);
    expect(supportChecked).toBe(true);if(support===null)throw new Error('Missing actual support actor');
    expect(eliteDamageMul(support,f.player.position.clone().add(new Vector3(100,0,0)),direction)).toBe(1);
    fight.reset(0); expect(fight.inArena(f.player.position)).toBe(false); expect(fight.hp).toBe(data.place.heartHp);
  } finally { scope.dispose(); figure.dispose(); for (const material of materials.values()) material.dispose(); restore(); }
});


test('arena roles are full-row aliases and retired payload roles refuse',()=>{
  expect(programs.attack).toStrictEqual(programs.rules);
  expect(programs.wind).toStrictEqual(programs.fire);
  const input={ ...titanFightOwners, arenaScript:titan.TITAN_HOST,arenaFire:fireView,programs:{attack:programs.attack,wind:programs.wind}};
  expect(Object.keys(parseArenaScriptData(input,geometry).programs)).toStrictEqual(['attack','wind']);
  for(const key of ['fire','rules'])expect(()=>parseArenaScriptData({...input,programs:{...input.programs,[key]:programs.attack}},geometry)).toThrow('Invalid key');
});

type ArenaScriptFight=ArenaRoomEncounter['openFight'];

/** Exercise the row on the same original open encounter used by the full fight oracle. */
function verifyOpenArenaEntry(arena:ArenaRoomEncounter,parent:Scope):void{
 const scope=parent.child('open.entry'),identity={slug:'orchard-entry',name:'Orchard',author:'Fixture',revision:1,seed:1};
 const product=createShardProduct({slug:identity.slug,revision:1,shardfile:emptyShardfile(identity),
  sections:new Map([['held/finishes',{order:[],rows:{},cards:[],extras:{},cosmetics:finishes}]]),files:new Map(),read:()=>Promise.reject(new Error('No fixture file read'))});
 const ctx=legacyDouble<ShardContext>({scope,product,game:legacyDouble<ShardContext['game']>({runtime:legacyDouble<ShardRuntime>({menu:{}})})});
 const claims=HeldClaims.fromSlots({version:1,id:'orchard.kit',slots:[{id:'blade',kind:'blade',item:'weapon.blade',source:{kind:'passes',file:'blade.json'}}],
  registration:['blade'],equipment:{primary:'blade',extras:[]},selection:{unlock:[]},mount:[],refills:[],upgrades:[]});
 const kit=legacyDouble<HeldSlotKit>({}),reward=legacyDouble<ModelDef<object>>({id:'orchard/reward'}),seen:unknown[]=[];
 const bind=vi.spyOn(arena,'bind').mockImplementation((actual,held,model,equipment)=>{seen.push(actual,held,model,equipment,currentOwner());});
 const pageKit=vi.spyOn(claims,'pageKit').mockReturnValue(kit),model=vi.spyOn(claims,'model').mockReturnValue(reward);
 const row={kind:'arena-room.entry' as const,owner:'orchard.open',claims:'orchard.kit',reward:'orchard.spear',publish:'orchard.fight',equipment:'held-finishes' as const};
 try{
  publishEntryOwner(scope,'arena-room',row.owner,arena);publishEntryOwner(scope,'claims',row.claims,claims);
  expect(()=>installArenaRoomEntry(ctx,row)).toThrow('not installed');expect(bind).not.toHaveBeenCalled();expect(model).not.toHaveBeenCalled();
  publishBoundPersistence(scope,legacyDouble<AdventurePersistence>({cosmetics:{read:()=>({owned:[],worn:{}}),write:()=>true}}));
  installClientCosmeticFinishes(ctx);const original=clientCosmeticFinishes(ctx).locker;
  installArenaRoomEntry(ctx,row);
  expect(seen).toHaveLength(5);expect(seen[0]).toBe(ctx);expect(seen[1]).toBe(kit);expect(seen[2]).toBe(reward);expect(seen[4]).toBe(scope);
  expect(bind.mock.calls[0]?.[3]?.arsenal).toBe(claims);expect(bind.mock.calls[0]?.[3]?.locker).toBe(original);
  expect(entryOwner(scope,'arena-room',row.publish)).toBe(arena);expect(model).toHaveBeenCalledWith(row.reward);
  expect(()=>installArenaRoomEntry(ctx,row)).toThrow('unbound original kit');expect(bind).toHaveBeenCalledOnce();
  scope.dispose();expect(()=>entryOwner(scope,'arena-room',row.publish)).toThrow('scope has ended');
 }finally{scope.dispose();bind.mockRestore();pageKit.mockRestore();model.mockRestore();}
}
