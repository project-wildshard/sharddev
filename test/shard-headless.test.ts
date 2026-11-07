/// <reference types="node" />
// oxlint-disable-next-line import/no-nodejs-modules -- Headless behaviour runs the real authored product bytes.
import { readFileSync } from 'node:fs';
import { QuestState } from '../src/shared/engine/quest/core';
import { Flags } from '../src/shared/engine/world/interact/flags';
import { afterAll, expect, it, vi } from 'vitest';
import { parseShardfileField } from '../src/sdk/shardfile';
import { loadHeadlessProduct } from '../src/sdk/headlessProduct';
import { builtProduct } from './fixtures/builtProduct';
import type { WalkPoint } from '../src/sdk/headlessJourney';
import {openProductSession} from './fixtures/headless/productSession';
import * as v from 'valibot';

const coordinate=v.pipe(v.number(),v.finite());
const routeLeg=v.object({name:v.string(),start:v.object({x:coordinate,z:coordinate,hover:v.optional(v.boolean())}),
  inside:v.optional(v.unknown()),waypoints:v.pipe(v.array(v.object({x:coordinate,z:coordinate,
    jump:v.exactOptional(v.union([v.boolean(),v.pipe(v.number(),v.integer(),v.minValue(0),v.maxValue(2))])),jumpAt:v.exactOptional(v.pipe(coordinate,v.minValue(0)))})),v.minLength(1))});
const routeInput:unknown=JSON.parse(readFileSync('scripts/physics-route.json','utf8'));
const routes=v.parse(v.record(v.string(),v.unknown()),routeInput);
function spawnRoute(slug:string,spawn:{x:number;z:number}):{name:string;points:readonly WalkPoint[]}{
  if(slug==='_template'||slug==='pastel-plain')return {name:'spawn-square',points:[{x:spawn.x,z:spawn.z},{x:spawn.x+5,z:spawn.z},{x:spawn.x+5,z:spawn.z+5},{x:spawn.x,z:spawn.z+5}]};
  const legs=v.parse(v.array(routeLeg),routes[slug]).filter(leg=>leg.inside===undefined&&leg.start.hover!==true);
  const nearest=legs.sort((a,b)=>Math.hypot(a.start.x-spawn.x,a.start.z-spawn.z)-Math.hypot(b.start.x-spawn.x,b.start.z-spawn.z))[0];
  if(nearest===undefined)throw new Error(`Missing authored spawn walk for ${slug}`);
  return {name:nearest.name,points:[nearest.start,...nearest.waypoints]};
}
// Admit the same verified products the native scenarios run. Quest-source
// declarations are checked separately without constructing whole author worlds.
const cases = await Promise.all([
  '_template', 'pastel-plain', 'driftwood-isle', 'pine-hollow',
  'nalati-grasslands', 'nine-dragon-stack', 'sunscar-dunes', 'far-reach',
].map(async slug => ({ slug, product: await loadHeadlessProduct(builtProduct(slug)) })));

// Each simulation owns a separate native worker. Overlap two independent
// starts/tick tapes without multiplying the file's peak native residency by five.
vi.setConfig({ maxConcurrency: 2 });
let waveStarted:number|undefined;
let completedJourneys=0;
afterAll(() => {
  vi.resetConfig();
  if(waveStarted!==undefined){
    expect(completedJourneys).toBe(cases.length);
    expect(performance.now()-waveStarted).toBeLessThan(60_000);
  }
});

// The main Node integration journey uses real products, worker ticks and the
// authored physics route. No historical output fingerprint or replay suffix.
for (const { slug } of cases) it.concurrent(`${slug}: enters, walks 1800 ticks and disposes`, async () => {
  const started=performance.now();waveStarted??=started;
  const {sim,product}=await openProductSession(slug),source=product.shardfile;
  try {
    const route=spawnRoute(slug,source.spawn),report=await sim.journey({ticks:1800,points:[...route.points]});
    expect(report.ticks).toBe(1800);expect(report.distance).toBeGreaterThan(0);
    expect(report.visited,JSON.stringify(report)).toBeGreaterThan(1);
    expect(report.final.grounded).toBe(true); // actual Rapier support after input release
    expect(report.final.position.every(Number.isFinite)).toBe(true);
    expect(sim.quarantined).toBe(false);
    process.stdout.write(`node-harness ${slug} ${JSON.stringify({route:route.name,ticks:report.ticks,settledTicks:report.settledTicks,distance:report.distance,
      visited:report.visited,stuck:report.stuck,maxTickMicros:report.maxTickMicros,elapsedMs:performance.now()-started})}\n`);
  } finally { await sim.dispose(); }
  await expect(sim.step()).rejects.toThrow();
  expect(performance.now()-started).toBeLessThan(60_000);completedJourneys++;
}, 60_000);

for (const { slug, product } of cases) for (const row of product.shardfile.quests.quests) it(`${slug}: ${row.title} completes without repeating its completion`, () => {
  const flags = new Flags(`behaviour.${slug}`, false), quest = new QuestState(row, flags);
  let completed = false, repeated = false;
  quest.observe({ complete: () => { if (completed) repeated = true; completed = true; } });
  const satisfy = (condition: { all?: readonly string[]; any?: readonly string[]; none?: readonly string[] } | undefined): void => {
    for (const flag of condition?.none ?? []) flags.clear(flag);
    for (const flag of condition?.all ?? []) flags.set(flag);
    const choice = condition?.any?.at(0); if (choice !== undefined) flags.set(choice);
  };
  try {
    satisfy(row.startWhen);
    for (const step of row.steps) satisfy(step.done);
    expect(quest.isComplete).toBe(true); expect(completed).toBe(true);
    for (const step of row.steps) satisfy(step.done);
    expect(repeated).toBe(false);
  } finally { quest.dispose(); }
});

// Keep the independent complete source oracle without baking geometry, textures
// or Wasm merely to read quest declarations. These are the same quest leaves and
// achievement compositions the eight original product constructors consume.
it('admitted quest inventories match the original source declarations', async () => {
  const [template, pastel, driftwood, driftwoodFeats, pine, pineFeats, nalati, nalatiFeats, signal, sky] = await Promise.all([
    import('../src/shards/_template/data/quests.json'), import('../src/shards/pastel-plain/data/quests.json'),
    import('../src/shards/driftwood-isle/generators/quests'), import('../src/shards/driftwood-isle/generators/questInventory'),
    import('../src/shards/pine-hollow/generators/quests'), import('../src/shards/pine-hollow/generators/questInventory'),
    import('../src/shards/nalati-grasslands/data/questContent.json'), import('../src/shards/nalati-grasslands/data/feats.json'),
    import('../src/shards/sunscar-dunes/generators/quests'), import('../src/shards/far-reach/generators/quests'),
  ]);
  const expected = {
    '_template': template.default, 'pastel-plain': pastel.default,
    'driftwood-isle': { ...driftwood.DRIFTWOOD_QUESTS, achievements: driftwoodFeats.DRIFTWOOD_FEATS },
    'pine-hollow': { ...pine.PINE_QUESTS, achievements: pineFeats.PINE_FEATS },
    'nalati-grasslands': { ...nalati.default.quests, achievements: nalatiFeats.default },
    // Nine's product keeps emptyShardfile's unmodified quest default.
    'nine-dragon-stack': undefined,
    'sunscar-dunes': signal.SIGNAL_QUESTS, 'far-reach': sky.SKY_QUESTS,
  };
  expect(Object.fromEntries(cases.map(({ slug, product }) => [slug, product.shardfile.quests])))
    .toStrictEqual(Object.fromEntries(Object.entries(expected).map(([slug, input]) => [slug, parseShardfileField('quests', input)])));
}, 120_000);
