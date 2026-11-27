import { afterEach, expect, test } from 'vitest';
// oxlint-disable-next-line import/no-nodejs-modules -- The test lays out a dev build product on disk.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Fixtures remain under the ignored test scratch root.
import { join, resolve } from 'node:path';
import { devFile, devMountFile } from './dev';

// SDK-SPLIT SP13c: `wildshard dev` on engine 0.1.35 answered 404 for `/shardfiles/<slug>/discovery.json`, so no hero
// capture could enter the page. The folder build writes it at `<product>/shardfiles/<slug>/discovery.json`.
const directories: string[] = [];
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }); });
function product(): string {
  mkdirSync('tmp', { recursive: true });
  const root = mkdtempSync(resolve('tmp', 'dev-file-')); directories.push(root);
  mkdirSync(join(root, 'shardfiles', 'brasscap-mesa'), { recursive: true });
  writeFileSync(join(root, 'index.html'), '<html></html>');
  writeFileSync(join(root, 'cook.json'), '{}');
  writeFileSync(join(root, 'shardfiles', 'brasscap-mesa', 'discovery.json'), '{}');
  return root;
}

test('the shard root reads the product root first, then the product\'s own shardfiles folder', () => {
  const root = product(), shard = '/shardfiles/brasscap-mesa/';
  expect(devFile([root, ''], shard, '/shardfiles/brasscap-mesa/cook.json')?.file).toBe(join(root, 'cook.json'));
  expect(devFile([root, ''], shard, '/shardfiles/brasscap-mesa/discovery.json')?.file)
    .toBe(join(root, 'shardfiles', 'brasscap-mesa', 'discovery.json'));
  expect(devFile([root, ''], shard, '/')?.file).toBe(join(root, 'index.html'));
  expect(devFile([root, ''], shard, '/shardfiles/brasscap-mesa/missing.json')).toBeUndefined();
  expect(devFile([root, ''], shard, '/shardfiles/brasscap-mesa/../../outside.json')).toBeUndefined();
});


test('author pages serve recorded mount URLs from the built product', () => {
  const root = product(), url = '/assets/brasscap-mesa/music/piano/music.json';
  const hash = 'a'.repeat(64), path = `blobs/json/${hash}.json`;
  mkdirSync(join(root, 'blobs/json'), { recursive: true });
  writeFileSync(join(root, path), '{}');
  writeFileSync(join(root, 'cook.json'), JSON.stringify({ version: 1, mounts: [{ url, path, hash, bytes: 2 }] }));
  const mount = devMountFile(root);
  expect(mount(url)?.file).toBe(join(root, path));
  expect(mount('/assets/brasscap-mesa/music/piano/unlisted.json')).toBeUndefined();
});
