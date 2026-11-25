// oxlint-disable-next-line import/no-nodejs-modules -- A bounded author folder under the repository scratch root.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve only owned author paths.
import { resolve } from 'node:path';
import { afterAll, expect, test } from 'vitest';

import { devProject, imageRootFile } from './dev';

mkdirSync('tmp', { recursive: true });
const scratch = mkdtempSync(resolve('tmp', 'dev-manifest-')), lane = `dev-manifest-${process.pid}`, before = process.env['WS_LANE_NAME'];
process.env['WS_LANE_NAME'] = lane;
afterAll(() => {
  if (before === undefined) delete process.env['WS_LANE_NAME']; else process.env['WS_LANE_NAME'] = before;
  for (const dir of [scratch, resolve('tmp', lane)]) rmSync(dir, { recursive: true, force: true });
});

// SDK-SPLIT SP13f: Signal Dunes' generators read `/assets/...` inputs; dev refused them ("Generation input needs exactly
// one declared root") because only build handed the generation its manifest's image roots.
test('dev builds with the manifest source build is given', async () => {
  const manifest = { folder: 'dunes', imageRoots: [{ prefix: '/assets/', directory: resolve(scratch, 'static/assets') }] };

  const seen: unknown[] = [];
  const build = (_source: string, _target?: string, options?: unknown): Promise<never> => { seen.push(options); return Promise.reject(new Error('stop after the build call')); };

  await expect(devProject(scratch, { manifest, build })).rejects.toThrow('stop after the build call');

  expect(seen[0]).toMatchObject({ devserver: true, manifest });
});

test('dev serves a file under an image root, and nothing outside it', () => {
  mkdirSync(resolve(scratch, 'static/assets/dunes/sky'), { recursive: true });
  writeFileSync(resolve(scratch, 'static/assets/dunes/sky/dusk.webp'), 'sky');
  writeFileSync(resolve(scratch, 'static/secret.txt'), 'no');
  const manifest = { folder: 'dunes', imageRoots: [{ prefix: '/assets/', directory: resolve(scratch, 'static/assets') }] };

  expect(imageRootFile(manifest, '/assets/dunes/sky/dusk.webp')?.file).toBe(resolve(scratch, 'static/assets/dunes/sky/dusk.webp'));
  expect(imageRootFile(manifest, '/assets/../secret.txt')).toBeUndefined();
  expect(imageRootFile(manifest, '/other/dusk.webp')).toBeUndefined();
  expect(imageRootFile(undefined, '/assets/dunes/sky/dusk.webp')).toBeUndefined();
});
