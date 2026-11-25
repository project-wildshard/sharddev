// sdk 0.5.0 R1 (A7): own peer ranges admit the release version; release/v0.5.0's packed install refused on kit's.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ownPeerProblems, satisfies } from '../../scripts/own-peers.mjs';

test('a caret below 1.0.0 keeps its minor; bounds and || combine as npm reads them', () => {
  assert.equal(satisfies('^0.3.2 || ^0.4.0', '0.4.34'), true);
  assert.equal(satisfies('^0.3.2 || ^0.4.0', '0.5.0'), false);
  assert.equal(satisfies('^0.3.2', '0.3.1'), false);
  assert.equal(satisfies('>=0.3.2 <1.0.0', '0.5.0'), true);
  assert.equal(satisfies('>=0.3.2 <1.0.0', '1.0.0'), false);
  assert.equal(satisfies('*', '9.9.9'), true);
  assert.throws(() => satisfies('~0.4.0', '0.4.1'), /unsupported range part ~0\.4\.0/u);
});

test('the refusal names the package, the peer and the version', () => {
  const own = new Set(['@wildshard/sdk', '@wildshard/kit']);
  assert.deepEqual(ownPeerProblems({ name: '@wildshard/kit', peerDependencies: { '@wildshard/sdk': '^0.4.0', three: '^0.1.0' } }, own, '0.5.0'),
    ['@wildshard/kit peers @wildshard/sdk ^0.4.0, which 0.5.0 does not satisfy']);
});

test('the workspace\'s own peer ranges admit its version and the next minor', () => {
  const root = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const own = new Set(['kit', 'upload', 'sdk', 'build', 'dev', 'cli'].map((name) => `@wildshard/${name}`));
  const [major, minor] = root.version.split('.').map(Number);
  for (const name of ['kit', 'upload', 'sdk', 'build', 'dev', 'cli']) {
    const manifest = JSON.parse(readFileSync(new URL(`../../packages/${name}/package.json`, import.meta.url), 'utf8'));
    assert.deepEqual(ownPeerProblems(manifest, own, root.version), [], name);
    // A minor is cut from main without editing these ranges (release:stamp writes versions only), so it must fit already.
    assert.deepEqual(ownPeerProblems(manifest, own, `${major}.${minor + 1}.0`), [], `${name}, next minor`);
  }
});
