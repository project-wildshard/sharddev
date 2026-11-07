// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the checkout the committed tables live in.
import { resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- Own only isolated source-table fixtures under repository tmp.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Run the actual plain runner against an invalid isolated registry.
import { spawnSync } from 'node:child_process';
import { expect, test } from 'vitest';
import { manifestClosure, shardSource } from '../scripts/gen-shards.mjs';
import { audioTableSource } from '../scripts/app-build/gen';
import { authoredManifestSource } from '../scripts/authored-manifest.mjs';
import { genSource, sourceTableTexts } from '../scripts/gen-source.mjs';
import { SOURCE_GENERATORS, selectSourceGenerators } from '../scripts/source-generators.mjs';

test('a staged path selects only the gen:source rows it feeds', () => {
  const ids = (path: string): string[] => selectSourceGenerators([path]).map(row => row.id);
  expect(ids('scripts/source-generators.mjs')).toEqual(SOURCE_GENERATORS.map(row => row.id));
  expect(ids('scripts/gen-source.mjs')).toEqual(SOURCE_GENERATORS.map(row => row.id));
  expect(ids('scripts/committed-source-tables.mjs')).toEqual(SOURCE_GENERATORS.map(row => row.id));
  expect(ids('scripts/git-source-view.mjs')).toEqual(SOURCE_GENERATORS.map(row => row.id));
  expect(ids('src/shared/game/weapons/starterBow.json')).toEqual(['starter-weapons']);
  expect(ids('src/shards/pine-hollow/manifest.json')).toEqual(['shard-list', 'manifest-closure']);
  expect(ids('public/assets/music/calm/music.json')).toEqual(['boot-audio']);
  expect(ids('public/assets/title/main-crossroads-square.jpg')).toEqual(['title-asset-urls']);
  expect(ids('scripts/title-assets.mjs')).toEqual(['title-asset-urls']);
  expect(ids('scripts/title-assets.generated.json')).toEqual(['title-asset-urls']);
  expect(ids('index.html')).toEqual(['title-asset-urls']);
  expect(ids('src/client/engine/core/Game.ts')).toEqual(['manifest-closure']);
  expect(ids('src/shared/game/bag/starter.generated.ts')).toEqual(['starter-bag', 'manifest-closure']);
  expect(ids('src/shards/pine-hollow/generators/sections.ts')).toEqual(['manifest-closure']);
  expect(ids('src/shards/driftwood-isle/generators/sections.ts')).toEqual(['manifest-closure']);
});

test('every registry output is listed once and committed rows own tracked inputs only', () => {
  const outputs = SOURCE_GENERATORS.flatMap(row => row.outputs);
  expect(SOURCE_GENERATORS.every(row => row.committed)).toBe(true);
  expect(new Set(outputs).size).toBe(outputs.length);
  // QB21 adds the exact title URL table and its static document to the prior outputs.
  expect([...outputs].sort()).toEqual([
    'index.html', 'scripts/title-assets.generated.json', 'src/client/engine/boot/ktx2.generated.ts', 'src/shared/game/bag/starter.generated.ts',
    'src/client/game/boot/audio.generated.ts', 'src/client/game/boot/bytes.generated.ts', 'src/client/game/boot/packs.generated.ts',
    'src/client/game/boot/versions.generated.ts', 'src/server/game/shard/manifest-closure.generated.json',
    'src/server/game/shard/portShares.generated.ts',
    'src/client/game/systems/effects/starter.generated.ts', 'src/client/game/systems/viewmodel/clips.generated.ts', 'src/shared/game/weapons/starter.generated.ts',
    'src/shards.generated.ts',
  ].sort());
  for (const row of SOURCE_GENERATORS) expect(Number(row.generate !== undefined) + Number(row.run !== undefined), row.id).toBe(1);
  for (const row of SOURCE_GENERATORS.filter(entry => entry.committed)) expect(row.inputs.some(glob => glob === 'public/assets/**'), row.id).toBe(false);
  const tracked = spawnSync('git', ['ls-files', '--error-unmatch', '--', ...outputs], { cwd: resolve(import.meta.dirname, '..'), encoding: 'utf8' });
  expect(tracked.status, tracked.stderr).toBe(0);
});

test('KTX2 source regenerates and checks the activated map without an encoder, assets or products', async () => {
  mkdirSync('tmp', { recursive: true });
  const root = mkdtempSync(resolve('tmp', 'gen-source-ktx2-'));
  try {
    mkdirSync(resolve(root, 'scripts'));
    copyFileSync(resolve('scripts/ktx2-tables.mjs'), resolve(root, 'scripts/ktx2-tables.mjs'));
    const input = 'scripts/ktx2-engine-map.json', output = 'src/client/engine/boot/ktx2.generated.ts';
    writeFileSync(resolve(root, input), JSON.stringify({ phone: { '/source.png': '/assets/gpu/source.ktx2' }, desktop: {} }));
    const selection = { changed: [input], committed: true };
    const computed = await sourceTableTexts(root, selection);
    expect(Object.keys(computed)).toEqual([output]);
    expect(readdirSync(root)).toEqual(['scripts']);
    expect(await genSource(root, selection)).toEqual({ touched: [output], owned: [output] });
    const source = readFileSync(resolve(root, output), 'utf8');
    expect(source).toBe(computed[output]);
    expect(source).toContain('Generated by gen:source'); expect(source).toContain('"/source.png": "/assets/gpu/source.ktx2"');
    expect(await genSource(root, { ...selection, check: true })).toEqual({ touched: [], owned: [output] });
    writeFileSync(resolve(root, output), 'hand-edited table');
    await expect(genSource(root, { ...selection, check: true })).rejects.toThrow('stale');
    expect(readFileSync(resolve(root, output), 'utf8')).toBe('hand-edited table');
    await genSource(root, selection); expect(readFileSync(resolve(root, output), 'utf8')).toBe(source);
    writeFileSync(resolve(root, input), JSON.stringify({ phone: [], desktop: {} }));
    await expect(genSource(root, { ...selection, check: true })).rejects.toThrow('must be a mapping');
    expect(readFileSync(resolve(root, output), 'utf8')).toBe(source);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a registry row with no producer refuses before checking or writing its output', () => {
  mkdirSync('tmp', { recursive: true });
  const root = mkdtempSync(resolve('tmp', 'gen-source-invalid-'));
  try {
    mkdirSync(resolve(root, 'scripts')); mkdirSync(resolve(root, 'src'));
    copyFileSync(resolve('scripts/gen-source.mjs'), resolve(root, 'scripts/gen-source.mjs'));
    writeFileSync(resolve(root, 'scripts/source-generators.mjs'), 'export const SOURCE_GENERATORS=[{id:"missing",outputs:["src/table.ts"],inputs:[],committed:true}];export function selectSourceGenerators(){return SOURCE_GENERATORS;}');
    writeFileSync(resolve(root, 'src/table.ts'), 'retained output');
    const child = spawnSync(process.execPath, [resolve(root, 'scripts/gen-source.mjs'), '--check'], { encoding: 'utf8', timeout: 10_000 });
    expect(child.status).toBe(1); expect(child.stderr).toContain('missing needs exactly one producer');
    expect(readFileSync(resolve(root, 'src/table.ts'), 'utf8')).toBe('retained output');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('audio source uses its declared root and refuses malformed catalogues', () => {
  mkdirSync('tmp', { recursive: true });
  const root = mkdtempSync(resolve('tmp', 'gen-source-audio-'));
  try {
    const directory = resolve(root, 'public/assets/music/source-fixture');
    mkdirSync(directory, { recursive: true });
    const file = resolve(directory, 'music.json');
    writeFileSync(file, JSON.stringify({ clips: ['fixture.m4a'], provenance: 'private notes', synth_keeps: ['input'] }));
    const source = audioTableSource(root);
    expect(source).toContain('"source-fixture": {'); expect(source).toContain('"fixture.m4a"');
    expect(source).not.toContain('private notes'); expect(source).not.toContain('synth_keeps');
    expect(source).toContain('SFX_MANIFESTS: Readonly<Record<string, unknown>> = {};');
    writeFileSync(file, '{'); expect(() => audioTableSource(root)).toThrow(SyntaxError);
    writeFileSync(file, '[]'); expect(() => audioTableSource(root)).toThrow('audio manifest must be an object');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('--stage regenerates only the committed tables a commit feeds, and they are current', async () => {
  const root = resolve(import.meta.dirname, '..');
  await expect(genSource(root, { check: true, committed: true, changed: ['src/shared/game/weapons/starterBow.json', 'src/shards/pine-hollow/manifest.json'] }))
    .resolves.toEqual({ touched: [], owned: ['src/shared/game/weapons/starter.generated.ts', 'src/shards.generated.ts', 'src/server/game/shard/manifest-closure.generated.json'] });
});


test('the committed composition table needs only declarations and preserves output and placement identity', () => {
  mkdirSync('tmp', { recursive: true });
  const root = mkdtempSync(resolve('tmp', 'gen-source-shards-'));
  try {
    const write = (path: string, value: object): void => {
      mkdirSync(resolve(root, path, '..'), { recursive: true });
      writeFileSync(resolve(root, path), JSON.stringify(value));
    };
    write('src/shards/island/manifest.json', { slug: 'island' });
    write('src/shards/island/outputs.json', { outputs: [{ slug: 'island-west' }, { slug: 'island-east' }] });
    const placements = [
      { slug: 'island-west', cell: [0, 0], size: [500, 500, 500], instance: 'west' },
      { slug: 'island-east', cell: [1, 0], size: [500, 500, 500], instance: 'east' },
    ];
    write('src/shared/game/grid/singleplayer.json', { placements });
    const source = shardSource(root);
    expect(source).toContain("import m0 from '../out/.app/discovery.island.island-east.generated'");
    expect(source).toContain("import m1 from '../out/.app/discovery.island.island-west.generated'");
    expect(source).toContain('grid: [1,0], size: [500,500,500], instance: "east"');
    expect(source).not.toContain('LEGACY_');
    expect(source).toContain('placed.sort((a, b) => a.order - b.order)');
    const row = SOURCE_GENERATORS.find(entry => entry.id === 'shard-list');
    if (row?.generate === undefined) throw new Error('Missing composition table producer');
    expect(row.committed).toBe(true);
    // The real producer is module-loaded from the checkout; the isolated input root
    // deliberately contains no discovery modules, assets, configs or products.
    write('src/shared/game/grid/singleplayer.json', { placements: placements.slice(0, 1) });
    expect(() => shardSource(root)).toThrow('missing grid placement');
    write('src/shared/game/grid/singleplayer.json', { placements });
    write('src/shards/island/outputs.json', { outputs: [{ slug: 'island-west' }, { slug: 'island-west' }] });
    expect(() => shardSource(root)).toThrow('invalid or duplicate output slug');
    expect(selectSourceGenerators(['src/shards/island/outputs.json']).map(entry => entry.id)).toEqual(['shard-list', 'manifest-closure']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the committed closure follows authored static edges with no product or discovery module', () => {
  mkdirSync('tmp', { recursive: true });
  const root = mkdtempSync(resolve('tmp', 'gen-source-closure-'));
  try {
    const write = (path: string, source: string): void => {
      mkdirSync(resolve(root, path, '..'), { recursive: true });
      writeFileSync(resolve(root, path), source);
    };
    write('src/shards/island/manifest.json', JSON.stringify({ slug: 'island', card: '/src/shards/island/card.webp', bindings: {
      accent: 'sand', budgets: { program: true }, runtimeCost: { module: './data/runtimeCost.json', export: 'default' },
      boot: { explore: { program: true } },
    } }));
    write('src/client/game/shard/manifest.ts', "import './visible';import type {Erased} from './erased';export const lazy=()=>import('./lazy');");
    write('src/client/game/shard/visible.ts', 'export const visible=true;');
    write('src/client/game/shard/erased.ts', 'export interface Erased {}');
    write('src/client/game/shard/lazy.ts', 'export const lazy=true;');
    write('src/shards/island/data/runtimeCost.json', '{}');
    write('src/shards/island/card.webp', 'image');
    write('src/shards/island/extra.webp', 'extra image');
    write('scripts/manifest-art-inputs.json', JSON.stringify({ island: [{ file: 'data/art.json', field: ['extra'] }] }));
    write('src/shards/island/data/art.json', JSON.stringify({ extra: ['/src/shards/island/extra.webp'] }));
    expect(manifestClosure(root)).toEqual({ island: [
      'out/.app/discovery.island.generated.ts', 'src/client/game/shard/manifest.ts', 'src/client/game/shard/visible.ts', 'src/shards/island/card.webp',
      'src/shards/island/data/runtimeCost.json',
      'src/shards/island/extra.webp', 'src/shards/island/manifest.json',
    ] });
    const emitted = authoredManifestSource(root, 'island', { metadataOnly: true, discovery: {
      budgets: {}, 'boot.explore': { art: ['/src/shards/island/extra.webp'] },
    } });
    expect(emitted).toContain('import binding0 from "./data/runtimeCost.json" with { type: \'json\' };');
    expect(emitted).toContain('import image1 from "./extra.webp"');
    expect(() => authoredManifestSource(root, 'island', { metadataOnly: true, discovery: {
      budgets: {}, 'boot.explore': { art: ['/src/shards/island/unlisted.webp'] },
    } })).toThrow('declared static imports differ from discovery');
    write('src/client/game/shard/visible.ts', "import './added';export const visible=true;");
    write('src/client/game/shard/added.ts', 'export const added=true;');
    expect(manifestClosure(root)['island']).toContain('src/client/game/shard/added.ts');
    write('scripts/manifest-art-inputs.json', JSON.stringify({ island: [{ file: '../foreign.json', field: ['extra'] }] }));
    expect(() => manifestClosure(root)).toThrow();
    write('scripts/manifest-art-inputs.json', '{}');
    expect(() => manifestClosure(root)).toThrow('Program Explorer art requires declared source inputs');
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test('shared manifest imports retain separate products and refresh path aliases on the next walk', () => {
  mkdirSync('tmp', { recursive: true });
  const root = mkdtempSync(resolve('tmp', 'gen-source-shared-'));
  try {
    const write = (path: string, source: string): void => {
      mkdirSync(resolve(root, path, '..'), { recursive: true }); writeFileSync(resolve(root, path), source);
    };
    for (const slug of ['one', 'two']) {
      write(`src/shards/${slug}/manifest.json`, JSON.stringify({ slug, card: `/src/shards/${slug}/card.webp`,
        bindings: { accent: 'sand', runtimeCost: { module: './data/runtimeCost.json', export: 'default' } } }));
      write(`src/shards/${slug}/card.webp`, 'image'); write(`src/shards/${slug}/data/runtimeCost.json`, '{}');
    }
    const config = (folder: string): string => JSON.stringify({ compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler', paths: { '@common/*': [`./src/${folder}/*`] } } });
    write('tsconfig.json', config('game/client/shard'));
    write('src/client/game/shard/manifest.ts', "export {visible} from '@common/visible';export type {Erased} from './erased';export const lazy=()=>import('./lazy');");
    write('src/client/game/shard/visible.ts', "import './loop';export const visible=true;");
    write('src/client/game/shard/loop.ts', "import './visible';");
    write('src/client/game/shard/erased.ts', 'export interface Erased {}'); write('src/client/game/shard/lazy.ts', 'export const lazy=true;');
    const first = manifestClosure(root);
    for (const slug of ['one', 'two']) {
      expect(first[slug]).toContain('src/client/game/shard/visible.ts'); expect(first[slug]).toContain('src/client/game/shard/loop.ts');
      expect(first[slug]).toContain(`src/shards/${slug}/data/runtimeCost.json`);
      expect(first[slug]).not.toContain(`src/shards/${slug === 'one' ? 'two' : 'one'}/data/runtimeCost.json`);
      expect(first[slug]).not.toContain('src/client/game/shard/erased.ts'); expect(first[slug]).not.toContain('src/client/game/shard/lazy.ts');
      expect(new Set(first[slug]).size).toBe(first[slug]?.length);
    }
    write('src/replacement/visible.ts', "export const visible='new';"); write('tsconfig.json', config('replacement'));
    const next = manifestClosure(root);
    for (const slug of ['one', 'two']) {
      expect(next[slug]).toContain('src/replacement/visible.ts'); expect(next[slug]).not.toContain('src/client/game/shard/visible.ts');
      expect(next[slug]).not.toContain('src/client/game/shard/loop.ts');
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the stage CLI returns the selected tracked output and never runs build-written rows', () => {
  mkdirSync('tmp', { recursive: true });
  const root = mkdtempSync(resolve('tmp', 'gen-source-stage-'));
  try {
    mkdirSync(resolve(root, 'scripts')); mkdirSync(resolve(root, 'src/shared/game/weapons'), { recursive: true });
    for (const file of ['gen-source.mjs', 'source-generators.mjs', 'gen-starter-weapons.mjs'])
      copyFileSync(resolve('scripts', file), resolve(root, 'scripts', file));
    writeFileSync(resolve(root, 'src/shared/game/weapons/starterBow.json'), '{"damage":17}');
    const output = 'src/shared/game/weapons/starter.generated.ts';
    const run = (...args: string[]) => spawnSync(process.execPath, [resolve(root, 'scripts/gen-source.mjs'), ...args], { encoding: 'utf8', timeout: 10_000 });
    const staged = run('--stage', '--changed=src/shared/game/weapons/starterBow.json');
    expect(staged.status, staged.stderr).toBe(0);
    expect(staged.stdout.trim()).toBe(`gen:source stage ${JSON.stringify([output])}`);
    expect(readFileSync(resolve(root, output), 'utf8')).toContain('STARTER_BOW = {"damage":17}');
    const before = readFileSync(resolve(root, output), 'utf8');
    expect(run('--stage', '--changed=docs/unrelated.md').stdout.trim()).toBe('gen:source stage []');
    expect(readFileSync(resolve(root, output), 'utf8')).toBe(before);
    // A manifest change selects the build-written closure too, but stage may
    // publish only committed rows. A direct selection proves the filter without
    // any product, discovery or native binary in this isolated fixture.
    expect(run('--stage', '--changed=public/assets/unrelated.bin').stdout.trim()).toBe('gen:source stage []');
    const refused = run('--stage', '--check', '--changed=src/shared/game/weapons/starterBow.json');
    expect(refused.status).toBe(1); expect(refused.stderr).toContain('--stage takes');
    expect(readFileSync(resolve(root, output), 'utf8')).toBe(before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
