// J186: shipped CLI from outside the checkout, CI only, no hook discovery.
import '@wildshard/engine/scripts/format-hook.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { installWildshard } from '../../src/test/helpers/install.ts';

const parent = process.env.WS_PROOF_SCRATCH ?? tmpdir();
mkdirSync(parent, { recursive: true });
const root = mkdtempSync(join(parent, 'installed-author-'));
after(() => rmSync(root, { recursive: true, force: true }));
const bin = installWildshard(root), app = join(root, 'app'), source = join(app, 'isle');
let cache = 0;
function run(args, success = true) {
  const done = spawnSync(process.execPath, [bin, ...args], {
    cwd: app, encoding: 'utf8', timeout: 8_000,
    env: { ...process.env, WILDSHARD_GEN_CACHE: join(root, `generation-${cache++}`), WILDSHARD_SHARDFILE_CACHE: join(root, `compiler-${cache}`) },
  });
  assert.ifError(done.error);
  if (success) assert.equal(done.status, 0, `${done.stdout}\n${done.stderr}`);
  else assert.notEqual(done.status, 0, 'The real installed bin must refuse this input');
  return done;
}
function bytes(directory, prefix = '') {
  return readdirSync(join(directory, prefix), { withFileTypes: true }).flatMap(row => {
    const file = join(prefix, row.name);
    return row.isDirectory() ? bytes(directory, file) : [[file, createHash('sha256').update(readFileSync(join(directory, file))).digest('hex')]];
  }).sort(([a], [b]) => a.localeCompare(b));
}

test('a packed CLI scaffolds outside its checkout and refuses overwriting it', { timeout: 9_500 }, () => {
  run(['new', source, 'outside-isle']);
  run(['new', source, 'outside-isle'], false);
});
test('the new author builds without making undocumented asset folders', { timeout: 9_500 }, () => {
  run(['build', source, join(app, 'first'), '--product-only']);
});
test('a second cold build has exactly the same shipped bytes', { timeout: 9_500 }, () => {
  run(['build', source, join(app, 'second'), '--product-only']);
  assert.deepEqual(bytes(join(app, 'second')), bytes(join(app, 'first')));
});
test('moving the authored source does not change the shipped bytes', { timeout: 9_500 }, () => {
  cpSync(source, join(app, 'moved'), { recursive: true });
  run(['build', join(app, 'moved'), join(app, 'third'), '--product-only']);
  assert.deepEqual(bytes(join(app, 'third')), bytes(join(app, 'first')));
});
test('installed validation and packing accept its real output and refuse a broken product', { timeout: 9_500 }, () => {
  run(['validate', join(app, 'first')]);
  run(['pack', join(app, 'first'), '--out', join(root, 'isle.tar')]);
  run(['build', source, join(app, 'bad'), '--unknown-flag'], false);
  run(['validate', join(app, 'missing')], false);
});
test('author and engine share the format schema and Three instance without a test dedupe', { timeout: 9_500 }, async () => {
  const author = createRequire(join(app, 'node_modules/@wildshard/sharddev/package.json'));
  const engine = createRequire(author.resolve('@wildshard/engine/package.json'));
  const a = await import(pathToFileURL(author.resolve('@wildshard/format/shardSchema')).href);
  const b = await import(pathToFileURL(engine.resolve('@wildshard/format/shardSchema')).href);
  assert.ok(a.ShardfileSchema);
  assert.equal(a.ShardfileSchema, b.ShardfileSchema);
  assert.equal(author('three').Vector3, engine('three').Vector3);
});
