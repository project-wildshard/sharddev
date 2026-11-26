// oxlint-disable-next-line import/no-nodejs-modules -- the reader reads a real shard folder
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- the reader reads a real shard folder
import { tmpdir } from 'node:os';
// oxlint-disable-next-line import/no-nodejs-modules -- the reader reads a real shard folder
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { KIT_ART_ROOT } from '@wildshard/kit/art';
import { readCookInput } from './cookInput';

// NINE QA 53: Nine's phone (`textures: 'img'`) reads the originals of its GPU twins. `mounts.json` lists only the twins,
// so the product must carry a fenced original the shard holds, or the preparation client 404s it and stalls at Files.

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const TWIN = '/assets/gpu/nine/organic/leaf-atlas-9658a9dd.ktx2', ORIGINAL = '/assets/nine/organic/leaf-atlas.webp';

function shard(files: Record<string, unknown>, assets: readonly string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'sharddev-fenced-'));
  roots.push(root);
  writeFileSync(join(root, 'package.json'), '{}');
  const project = join(root, 'src');
  mkdirSync(project, { recursive: true });
  for (const [name, value] of Object.entries(files)) writeFileSync(join(project, name), JSON.stringify(value));
  for (const url of assets) { const file = join(project, 'static', url.slice(1)); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, url); }
  return project;
}

it('mounts a fenced original the shard holds beside its listed twin', () => {
  const project = shard({
    'mounts.json': { version: 1, outputs: { nine: [TWIN] } },
    'fence-reads.json': { version: 1, files: [`asset:${ORIGINAL}`, 'asset:/assets/music/piano/title.m4a', 'asset-source:src/thumbs/a.jpg', `asset:${TWIN}`] },
  }, [TWIN, ORIGINAL]);
  const input = readCookInput(project, 'nine');
  expect(input?.mounts.map(row => row.url)).toEqual([TWIN, ORIGINAL]);
  expect(new TextDecoder().decode(input?.mounts[1]?.bytes)).toBe(ORIGINAL);
});

it('leaves out fenced reads the shard does not hold and paths that leave static/', () => {
  const project = shard({
    'mounts.json': { version: 1, outputs: { nine: [TWIN] } },
    'fence-reads.json': { version: 1, files: ['asset:/assets/sfx/shared/hit.m4a', 'asset:/assets/../package.json', 'asset:/assets/nine'] },
  }, [TWIN, '/assets/nine/a.webp']);
  expect(readCookInput(project, 'nine')?.mounts.map(row => row.url)).toEqual([TWIN]);
});

// A7 (sdk 0.5.0): a mounted file named `/<path>` lives at `<source>/static/<path>`; the repo's `public/` is not read.
it('cooks every listed mount from the source static/ with no public/ in the repo', () => {
  const own = '/assets/nine/x.bin', baked = '/assets/baked/y.bin';
  const project = shard({ 'mounts.json': { version: 1, outputs: { nine: [own, baked] } } }, [own, baked]);
  expect(existsSync(join(dirname(project), 'public'))).toBe(false);
  const input = readCookInput(project, 'nine');
  expect(input?.mounts.map(row => [row.url, new TextDecoder().decode(row.bytes)])).toEqual([[own, own], [baked, baked]]);
});

// SF2: shared zone art lives in @wildshard/kit; a listed mount the source's static/ lacks comes from the kit, and the shard's
// own copy wins when it has one.
it('mounts shared kit art a shard lists but does not hold, and keeps its own copy first', () => {
  const kit = '/assets/nalati-grasslands/tex/leafy_grass/diffuse.jpg', own = '/assets/nalati-grasslands/tex/leafy_grass/arm.jpg';
  const project = shard({ 'mounts.json': { version: 1, outputs: { 'nalati-grasslands': [kit, own] } } }, [own]);
  const input = readCookInput(project, 'nalati-grasslands');
  expect(input?.mounts.map(row => row.url)).toEqual([kit, own]);
  expect(Buffer.from(input?.mounts[0]?.bytes ?? []).equals(readFileSync(`${KIT_ART_ROOT}tex/leafy_grass/diffuse.jpg`))).toBe(true);
  expect(new TextDecoder().decode(input?.mounts[1]?.bytes)).toBe(own);
  const missing = shard({ 'mounts.json': { version: 1, outputs: { nine: ['/assets/nine/tex/leafy_grass/diffuse.jpg'] } } }, []);
  expect(readCookInput(missing, 'nine')?.mounts).toHaveLength(1);
  const absent = shard({ 'mounts.json': { version: 1, outputs: { nine: ['/assets/nine/tex/no_such/diffuse.jpg'] } } }, []);
  expect(() => readCookInput(absent, 'nine')).toThrow(/ENOENT/u);
});
