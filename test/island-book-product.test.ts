import { DRIFTWOOD_GUEST_ROWS } from './fixtures/driftwood-guest-programs';
import { parseExplorerCatalogue } from '@wildshard/format/explorerCatalogue';
import { EXPLORER_CATALOGUE as driftwoodExplorer } from '../src/shards/driftwood-isle/generators/explorerCatalogue';
import { EXPLORER_CATALOGUE as pineExplorer } from '../src/shards/pine-hollow/generators/explorerCatalogue';
import { expect,test } from 'vitest';
import * as v from 'valibot';
import { ResolvedIslandLibrarySchema } from '@wildshard/format/islandLibrary';
import { WorldAssemblySchema } from '@wildshard/format/worldAssembly';
import { parseChapterWake } from '@wildshard/format/chapterDirector';
import { parseClientPlan } from '@wildshard/format/clientPlan';
import { encodeCanonicalJson } from '../src/sdk/immutable';
import { DRIFTWOOD_CLIENT_SECTIONS } from '../src/shards/driftwood-isle/generators/clientSections';
import { DRIFTWOOD_CLIENT_SECTIONS as original } from './fixtures/driftwoodLegacyLayouts';
import { SECTIONS as originalSchemas } from './fixtures/driftwoodLegacySections';
import { WORLD_STAGES } from './fixtures/driftwood-world-stages';
import { NATIVE_VIEW } from '../src/shards/driftwood-isle/generators/nativeView';
import { WAKE_ENCOUNTER } from '../src/shards/driftwood-isle/generators/wakeEncounter';
import { driftwoodOutputRows } from '../src/shards/driftwood-isle/generators/output';
import { DRIFTWOOD_LAYOUTS } from './fixtures/driftwood-layout-source';
import { DRIFTWOOD_ISLAND_FACTS } from './fixtures/driftwood-island-facts';
import source from './fixtures/driftwood-product-source';
import manifest from '../src/shards/driftwood-isle/manifest.json' with {type:'json'};
import headless from '../src/shards/driftwood-isle/data/headlessAssembly.json' with {type:'json'};
import { driftwoodNativeInputs } from '../src/shards/driftwood-isle/generators/nativeServer';

const output = driftwoodOutputRows(DRIFTWOOD_LAYOUTS, DRIFTWOOD_ISLAND_FACTS, DRIFTWOOD_GUEST_ROWS);

function section(name:string):unknown{
  const bytes=output.platform.files.get(`sections/${name}.json`);if(bytes===undefined)throw new Error(`Missing section ${name}`);
  const parsed:unknown=JSON.parse(new TextDecoder().decode(bytes));return parsed;
}

test('the resolved book retains every original fixed byte reference and the original bound wire-order look list',()=>{
  const current=v.parse(ResolvedIslandLibrarySchema,DRIFTWOOD_CLIENT_SECTIONS.find(row=>row.name==='models/island-library')?.value);
  const old=v.parse(originalSchemas['custom/fixedLayouts'],original.find(row=>row.name==='custom/fixedLayouts')?.value);
  expect(current.draws).toEqual(old.fixedDraws);expect(current).toMatchObject({id:'driftwood.island',groups:'models/fixed-geometry.json',figures:'people/catalogue.json'});
  expect(Object.keys(current).sort()).toEqual(['collections','draws','figures','groups','id']);
  expect(DRIFTWOOD_CLIENT_SECTIONS.some(row=>Object.is(row.name,'custom/worldStages'))).toBe(false);
  const wire:unknown=JSON.parse(encodeCanonicalJson(NATIVE_VIEW));
  const looks=v.parse(v.object({CASCADE_LOOKS:v.record(v.string(),v.string()),CREATURE_LOOKS:v.record(v.string(),v.string())}),wire);
  expect(WORLD_STAGES.construction.looks).toEqual({unbound:['driftwood-kit-moor'],bound:[...Object.values(looks.CASCADE_LOOKS),NATIVE_VIEW.SMOKE_LOOK,NATIVE_VIEW.FIREFLY_LOOK,NATIVE_VIEW.REEF_LOOK,NATIVE_VIEW.POOL_LOOK,NATIVE_VIEW.SHRINE_POOL_LOOK,NATIVE_VIEW.OCEAN_LOOK,NATIVE_VIEW.GULL_GRAPH_LOOK,...NATIVE_VIEW.COVER_LOOKS,...Object.values(looks.CREATURE_LOOKS),'driftwood-kit-moor']});
});

test('the real plan owns one complete assembly before updates and uses compiled runtime metadata without a source module',()=>{
  const plan=parseClientPlan(section('client/plan')),assembly=plan.features.filter(row=>row.kind==='world.assembly');
  expect(assembly).toEqual([{kind:'world.assembly',library:'driftwood.island',catalogue:'models/world-scenes.json',farStandIn:true,rows:v.parse(WorldAssemblySchema,WORLD_STAGES)}]);
  expect(source.runtime).toMatchObject({kind:'client-plan',binds:['state','quests','ledger','items','spawns','modes','props','terrain','movers','loot','clientChannels']});
  expect(source.runtime).not.toHaveProperty('entry');expect(manifest).not.toHaveProperty('runtimeEntry');expect(manifest.bindings).not.toHaveProperty('roster');
  expect(manifest.bindings.entry).toEqual({platform:'client-plan',retainHomeRuntime:false,stagesOwner:'declared'});
});

test('native chapter admission receives the exact original encounter without reading retired view rows', () => {
  const wire={constants:driftwoodNativeInputs()};
  expect(output.namedFiles.some(row=>row.name==='sim/headless-assembly.json')).toBe(false);
  const wakeFile=output.namedFiles.find(row=>row.name==='quests/wake-boss.json');if(wakeFile===undefined)throw new Error('Missing defining native encounter');
  const wakeBytes=output.assets.get(wakeFile.hash);if(wakeBytes===undefined)throw new Error('Missing defining native encounter bytes');
  const wake=parseChapterWake(JSON.parse(new TextDecoder().decode(wakeBytes)));
  expect(wake.encounter).toEqual(WAKE_ENCOUNTER.encounter);expect(WAKE_ENCOUNTER.encounter).toEqual(NATIVE_VIEW.BOSS_ENCOUNTER);
  expect(JSON.stringify(headless)).not.toContain('bossView');expect(JSON.stringify(headless)).not.toContain('custom/fixedLayouts');
  expect(wire).not.toHaveProperty('constants.nativeEncounter');
});

test('both real pages publish ordered product Explorer rows and Driftwood borrows its original book', () => {
  const emitted = parseExplorerCatalogue(section('explore/catalogue'));
  expect(emitted).toEqual(driftwoodExplorer);
  expect(emitted.entries.filter(row => row.kind === 'collection' || row.kind === 'scene-model')).toEqual([
    { kind: 'collection', library: 'driftwood.island', model: 'chime', copies: 0, drawnAs: 'single' },
    { kind: 'collection', library: 'driftwood.island', model: 'plaques', copies: 0, drawnAs: 'single' },
    { kind: 'scene-model', library: 'driftwood.island', model: 'captainHat', copies: 0, drawnAs: 'single' },
    { kind: 'scene-model', library: 'driftwood.island', model: 'sailclothCape', copies: 0, drawnAs: 'single' },
  ]);
  expect(emitted.entries).toContainEqual({ kind: 'kit-figure', file: 'people/cards.json', figure: 'castaway', copies: 1, drawnAs: 'single' });
  for (const catalogue of [emitted, pineExplorer]) {
    expect(parseExplorerCatalogue(catalogue)).toEqual(catalogue);
    expect(catalogue.entries.some(row => row.kind === 'posed' && row.source === 'product')).toBe(true);
    expect(catalogue.entries.some(row => row.kind === 'library' && row.library === 'native')).toBe(false);
  }
  expect(pineExplorer.entries.filter(row => row.kind === 'figure').map(row => row.figure)).toEqual(['ranger', 'miller', 'trader']);
});
