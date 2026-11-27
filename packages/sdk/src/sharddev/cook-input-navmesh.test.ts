// oxlint-disable-next-line import/no-nodejs-modules -- the reader reads a real shard folder
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- the reader reads a real shard folder
import { tmpdir } from 'node:os';
// oxlint-disable-next-line import/no-nodejs-modules -- the reader reads a real shard folder
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { readCookInput } from './cookInput';

// SF7c: Nine Dragon and Signal Dunes held the platform's navmesh in static/ but left it out of `mounts.json`, and the
// standalone-art check refused the build. The product carries it without the author listing it.

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const NAVMESH = '/assets/nine/baked/navmesh.bin', FAR = '/assets/nine/baked/far.glb';

function shard(mounts: readonly string[] | undefined, assets: readonly string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'sharddev-navmesh-'));
  roots.push(root);
  writeFileSync(join(root, 'package.json'), '{}');
  const project = join(root, 'src');
  mkdirSync(project, { recursive: true });
  if (mounts !== undefined) writeFileSync(join(project, 'mounts.json'), JSON.stringify({ version: 1, outputs: { nine: mounts } }));
  for (const url of assets) { const file = join(project, 'static', url.slice(1)); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, url); }
  return project;
}

it('carries the navmesh the shard holds when mounts.json left it out', () => {
  const input = readCookInput(shard([FAR], [FAR, NAVMESH]), 'nine');
  expect(input?.mounts.map(row => row.url)).toEqual([FAR, NAVMESH]);
  expect(new TextDecoder().decode(input?.mounts[1]?.bytes)).toBe(NAVMESH);
});

it('carries a listed navmesh once, and none the shard does not hold or another slug names', () => {
  expect(readCookInput(shard([NAVMESH, FAR], [FAR, NAVMESH]), 'nine')?.mounts.map(row => row.url)).toEqual([NAVMESH, FAR]);
  expect(readCookInput(shard([FAR], [FAR]), 'nine')?.mounts.map(row => row.url)).toEqual([FAR]);
  expect(readCookInput(shard([FAR], [FAR, '/assets/other/baked/navmesh.bin']), 'nine')?.mounts.map(row => row.url)).toEqual([FAR]);
});

it('adds nothing to a shard with no mounts.json', () => {
  expect(readCookInput(shard(undefined, [NAVMESH]), 'nine')).toBeUndefined();
});
