// SHARD-COMPAT ST19a: the SDK delete gate (scripts/sdk-exports.mjs).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { after, test } from 'node:test';
import { census, gate, LOCK, main, publicNames, USAGE } from '../../scripts/sdk-exports.mjs';

mkdirSync('tmp', { recursive: true });
const root = mkdtempSync(join(resolve('tmp'), 'sdk-exports-'));
after(() => rmSync(root, { recursive: true, force: true }));

/** A workspace whose SDK ships `exports`, with the lock and a census written from the full set. */
function workspace(name, exports, users, at = new Date().toISOString()) {
  const dir = join(root, name);
  mkdirSync(join(dir, 'packages/sdk'), { recursive: true });
  writeFileSync(join(dir, 'packages/sdk/package.json'), JSON.stringify({ name: '@wildshard/sdk', exports: Object.fromEntries(exports.map(key => [key, `./src/${key}.ts`])) }));
  writeFileSync(join(dir, LOCK), JSON.stringify({ names: ['@wildshard/sdk/random', '@wildshard/sdk/rows'] }));
  writeFileSync(join(dir, USAGE), JSON.stringify({ at, repos: ['shard-a', 'shard-b'], users }));
  return dir;
}

test('the census counts an aliased SDK import and the CLI verbs a repo scripts', () => {
  const repo = join(root, 'shard-a');
  mkdirSync(join(repo, 'src'), { recursive: true });
  writeFileSync(join(repo, 'src/zone.ts'), "import { rng } from '@wildshard/sharddev/random';\n");
  writeFileSync(join(repo, 'package.json'), JSON.stringify({ scripts: { check: 'wildshard check .', up: 'wildshard upload src' } }));
  const users = census([repo], ['@wildshard/sdk/random', '@wildshard/sdk/rows', 'bin:wildshard', 'verb:check', 'verb:upload', 'verb:hero']);
  assert.deepEqual(Object.keys(users).sort(), ['@wildshard/sdk/random', 'bin:wildshard', 'verb:check', 'verb:upload']);
});

test('a seeded export rename refuses while a shard repo uses the old name, and passes at zero users', () => {
  // ./random renamed to ./rng: the old name leaves the tree.
  const used = workspace('used', ['./rng', './rows'], { '@wildshard/sdk/random': ['shard-a'] });
  assert.equal(main(['check'], used), 1);
  const errors = gate(['@wildshard/sdk/random', '@wildshard/sdk/rows'], publicNames(used), JSON.parse(readFileSync(join(used, USAGE), 'utf8')), Date.now());
  assert.match(errors.join('\n'), /@wildshard\/sdk\/random is gone but shard-a still use it/u);
  // The new name is not locked yet either.
  assert.match(errors.join('\n'), /new public name\(s\) not in .*@wildshard\/sdk\/rng/u);
  // Kept as an alias, nothing is deleted.
  const aliased = workspace('aliased', ['./random', './rng', './rows'], { '@wildshard/sdk/random': ['shard-a'] });
  main(['lock'], aliased);
  assert.equal(main(['check'], aliased), 0);
  // At zero users the deletion passes; a stale census does not.
  const unused = workspace('unused', ['./rows'], {});
  assert.equal(main(['check'], unused), 0);
  const stale = workspace('stale', ['./rows'], {}, new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString());
  assert.equal(main(['check'], stale), 1);
});

test('the committed lock matches the tree', () => {
  assert.deepEqual(JSON.parse(readFileSync(LOCK, 'utf8')).names, publicNames(process.cwd()));
});
