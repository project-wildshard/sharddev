// J186: shipped CLI from outside the checkout, CI only, no hook discovery.
import '@wildshard/engine/scripts/sim-node-loader.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { installWildshard } from '../../src/test/helpers/install.ts';
import { openUploadServer } from '../../src/test/helpers/upload-server.ts';

const parent = process.env.WS_PROOF_SCRATCH ?? tmpdir();
mkdirSync(parent, { recursive: true });
const root = mkdtempSync(join(parent, 'installed-author-'));
after(() => rmSync(root, { recursive: true, force: true }));
const bin = installWildshard(root), app = join(root, 'app'), source = join(app, 'isle');
let cache = 0;
function run(args, success = true, environment = {}) {
  const done = spawnSync(process.execPath, [bin, ...args], {
    cwd: app, encoding: 'utf8', timeout: 8_000,
    // The quick author's day reuses its verified compiler. Ring 2 owns the
    // separate fully cold compiler + generation proofs on all real templates.
    env: { ...process.env, ...environment, WILDSHARD_GEN_CACHE: join(root, `generation-${cache++}`), WILDSHARD_SHARDFILE_CACHE: join(root, 'compiler') },
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
  run(['new', source, 'outside-isle', '--empty']);
  run(['new', source, 'outside-isle', '--empty'], false);
});
test('the new author builds without making undocumented asset folders', { timeout: 9_500 }, () => {
  run(['build', source, join(app, 'first'), '--product-only']);
});
test('a second fresh-generation build has exactly the same shipped bytes', { timeout: 9_500 }, () => {
  run(['build', source, join(app, 'second'), '--product-only']);
  assert.deepEqual(bytes(join(app, 'second')), bytes(join(app, 'first')));
});
test('moving the authored source does not change the shipped bytes', { timeout: 9_500 }, () => {
  cpSync(source, join(app, 'moved'), { recursive: true });
  run(['build', join(app, 'moved'), join(app, 'third'), '--product-only']);
  assert.deepEqual(bytes(join(app, 'third')), bytes(join(app, 'first')));
});
test('installed validation accepts the outside author output', { timeout: 9_500 }, () => {
  run(['validate', join(app, 'first')]);
});
test('installed packing admits the outside author output', { timeout: 9_500 }, () => {
  run(['pack', join(app, 'first'), '--out', join(root, 'isle.tar')]);
});
test('the installed build refuses an invalid invocation', { timeout: 9_500 }, () => {
  run(['build', source, join(app, 'bad'), '--unknown-flag'], false);
});
test('installed validation refuses a missing product', { timeout: 9_500 }, () => {
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
test('the outside author uploads its newly built tarball through the real CLI to the local service double', { timeout: 9_500 }, async context => {
  const server = await openUploadServer(context);
  // A real author's app has a package.json and a git HEAD; upload sends both (AC16).
  writeFileSync(join(app, 'package.json'), '{ "name": "outside-author", "version": "1.0.0", "private": true }\n');
  const git = args => assert.equal(spawnSync('git', ['-c', 'user.name=Outside Author', '-c', 'user.email=author@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: app, encoding: 'utf8' }).status, 0, `git ${args.join(' ')}`);
  git(['init', '-q']); git(['add', 'package.json']); git(['commit', '-q', '--no-verify', '-m', 'outside author']);
  // An asynchronous child leaves this process free to serve the real HTTP requests.
  const { spawn } = await import('node:child_process');
  const { once } = await import('node:events');
  const child = spawn(process.execPath, [bin, 'upload', join(root, 'isle.tar'), '--server', server.url], {
    cwd: app, env: { ...process.env, WILDSHARD_CREATOR_PRIVATE_KEY: server.privateKey }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  context.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
  let output = ''; child.stdout.on('data', bytes => { output += bytes; }); child.stderr.on('data', bytes => { output += bytes; });
  const [code] = await once(child, 'close');
  assert.equal(code, 0, output);
  assert.deepEqual([...server.state.revisions.values()], [{ revision: 1, version: '1.0.0' }]);
});
test('the newly built outside-author product boots and accepts real worker input', { timeout: 9_500 }, async () => {
  const { loadHeadlessProduct } = await import('@wildshard/engine/host/headlessProduct');
  const { HeadlessSimulation } = await import('@wildshard/engine/host/headless');
  const { productHeadlessSections } = await import('@wildshard/engine/host/headlessSections');
  const { outputDescriptor } = await import('@wildshard/engine/game/shardfile/outputDescriptor');
  const product = await loadHeadlessProduct(join(app, 'first'));
  const descriptor = outputDescriptor(product.shardfile);
  assert.ok(descriptor);
  const assets = new Map(descriptor.index.files.map(file => [file.commons === true ? `commons:${file.hash}` : file.hash, readFileSync(join(app, 'first', file.path))]));
  const runtime = await HeadlessSimulation.create(product.shardfile, assets, undefined, { deadline: 'advisory', sections: productHeadlessSections(product), ...(product.shardfile.runtime === null ? {} : { product: join(app, 'first') }) });
  try {
    const commit = await runtime.step([{ source: 'outside-author', commands: [{ kind: 'player', moveX: 0, moveZ: -1, yaw: 0 }] }]);
    assert.equal(commit.tick, 1);
  } finally { await runtime.dispose(); }
});
