// sdk 0.5.0 R1 (A7): own peer ranges admit the release version; release/v0.5.0's packed install refused on kit's.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { ownPeerProblems, prereleaseEngineProblems, satisfies } from '../scripts/own-peers.mjs';
import { pendingNextPackages } from '../scripts/release-next.mjs';

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

test('a final release refuses an engine prerelease dependency; a prerelease SDK may carry one (QA 11-25 row 139)', () => {
  const dev = { name: '@wildshard/dev', dependencies: { '@wildshard/engine': '0.1.93-next.4daadc70' } };
  assert.equal(prereleaseEngineProblems(dev, '0.7.0').length, 1);
  assert.deepEqual(prereleaseEngineProblems(dev, '0.7.1-next.1'), []);
  assert.deepEqual(prereleaseEngineProblems({ ...dev, dependencies: { '@wildshard/engine': '0.1.96' } }, '0.7.1'), []);
  assert.equal(prereleaseEngineProblems({ name: '@wildshard/x', optionalDependencies: { '@wildshard/engine': '0.1.96-next.48084eb2' } }, '0.7.1').length, 1);
  assert.deepEqual(prereleaseEngineProblems({ name: '@wildshard/sdk', peerDependencies: { '@wildshard/engine': '*' } }, '0.7.1'), []);
});

test('the SDK publisher routes all six packages with an exact next engine to npm next', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/npm-publish.yml', import.meta.url), 'utf8');
  const selector = /- name: Choose one npm channel[^]*?node <<'NODE'\n([^]*?)\n *NODE/u.exec(workflow)?.[1];
  assert.ok(selector);
  const channel = (engine, ref = 'v0.9.0') => {
    let output;
    runInNewContext(selector, {
      process: { env: { RELEASE_REF: ref, GITHUB_OUTPUT: 'output' } },
      require: name => {
        if (name === 'node:fs') return { appendFileSync: (file, value) => { output = value; } };
        if (name === './package.json') return { version: '0.9.0' };
        assert.equal(name, './packages/dev/package.json');
        return { dependencies: { '@wildshard/engine': engine } };
      },
    });
    return output;
  };
  assert.equal(channel('0.1.99-next.6385c3d0'), 'tag=next\n');
  assert.equal(channel('0.1.99'), 'tag=latest\n');
  assert.equal(channel('0.1.99-beta.2'), 'tag=latest\n');
  assert.throws(() => channel('0.1.99-next.6385c3d0', 'v0.9.1'), /Tag and package version differ/u);
  assert.match(workflow, /test "\$DIST_TAG" = next[^]*?test "\$verdict" = success/u);
  assert.match(workflow, /RELEASE_TAG="\$RELEASE_REF" node src\/scripts\/release-workspace\.mjs pack/u);
  assert.match(workflow, /execFileSync\('npm', \['publish'[^\n]*'--tag', tag\]/u);
});

test('SDK next waits even when only Dev still resolves to the previous version', async () => {
  const seen = [];
  const read = stale => async url => {
    const [encoded, route] = new URL(url).pathname.split('/').slice(-2);
    const name = decodeURIComponent(encoded);
    if (route === 'dist-tags') {
      seen.push(name);
      return Response.json({ next: stale && name === '@wildshard/dev' ? '0.9.0' : '0.9.1' });
    }
    assert.equal(route, 'next');
    return Response.json({ version: '0.9.1' });
  };
  assert.deepEqual(await pendingNextPackages('0.9.1', read(true)), ['@wildshard/dev (next is 0.9.0)']);
  assert.deepEqual(seen.sort(), ['build', 'cli', 'dev', 'kit', 'sdk', 'upload'].map(name => `@wildshard/${name}`));
  assert.deepEqual(await pendingNextPackages('0.9.1', read(false)), []);
});
