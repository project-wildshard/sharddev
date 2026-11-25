// sdk 0.5.1 (A7 R3): each published package's engines.node is the root's. `wildshard upgrade` copies the sdk's into a
// shard repo, and 0.5.0's `>=24.18.0` replaced the repos' `>=24.18.0 <25`, which their node-engines test refuses
// (Node 26 on hosted runners: 302ede7c).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));

test('every published package that names a Node names the root\'s range, upper bound included', () => {
  const root = read('package.json').engines.node;
  assert.match(root, /^>=\d+\.\d+\.\d+ <\d+$/u);
  for (const name of ['cli', 'sdk', 'kit', 'build', 'upload', 'dev']) {
    const node = read(`packages/${name}/package.json`).engines?.node;
    if (node !== undefined) assert.equal(node, root, `packages/${name} engines.node`);
  }
  assert.equal(read('packages/sdk/package.json').engines.node, root, 'the sdk names one: upgrade copies it');
});
