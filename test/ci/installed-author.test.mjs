// J186: shipped CLI from outside the checkout, CI only, no hook discovery.
import '@wildshard/engine/scripts/sim-node-loader.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

// SA2 (J317): the installed help speaks the glossary; src/cli/help.test.ts holds the full retired-word list.
test('the installed bin prints each verb\'s help in the glossary\'s words', { timeout: 9_500 }, () => {
  const all = run(['--help']).stdout;
  assert.match(all, /^Usage: wildshard /u);
  for (const verb of ['new', 'check', 'build', 'upload']) {
    const help = run([verb, '--help']).stdout;
    assert.match(help, new RegExp(`^Usage: wildshard ${verb} `, 'u'));
    assert.doesNotMatch(help, /\b(?:products?|publish\w*|promot\w*|cook\w*|tarball|head)\b/iu, verb);
  }
  assert.match(run(['upload', '--help']).stdout, /shard file/u);
});
test('a packed CLI scaffolds outside its checkout and refuses overwriting it', { timeout: 9_500 }, () => {
  run(['new', source, 'outside-isle', '--empty']);
  run(['new', source, 'outside-isle', '--empty'], false);
});
// SA3 (J170): build writes the shard file, <slug>.shardfile beside the folder; there is no pack step.
const shardfile = join(app, 'outside-isle.shardfile'), sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
let built;
// J198: what build writes is a draft (sdk 0.2); it warns, names the rule and still writes the shard file.
const DRAFT = /^warning: outside-isle is an unprepared draft \(sdk 0\.2\): .*\n {2}\[shardfile-draft\] fix: Run `wildshard prepare /mu;
test('the new author builds without making undocumented asset folders', { timeout: 9_500 }, () => {
  const done = run(['build', source, join(app, 'first'), '--shardfile-only']);
  assert.match(done.stdout, DRAFT);
  built = sha(shardfile);
});
test('a second fresh-generation build has exactly the same shipped bytes', { timeout: 9_500 }, () => {
  run(['build', source, join(app, 'second'), '--shardfile-only']);
  assert.deepEqual(bytes(join(app, 'second')), bytes(join(app, 'first')));
  assert.equal(sha(shardfile), built);
});
test('build of a built folder writes the same shard file, and pack is its deprecated alias', { timeout: 9_500 }, () => {
  run(['build', join(app, 'first'), join(app, 'again.shardfile')]);
  assert.equal(sha(join(app, 'again.shardfile')), built);
  const packed = run(['pack', join(app, 'first'), '--out', join(app, 'packed.tar')]);
  assert.equal(sha(join(app, 'packed.tar')), built);
  assert.match(packed.stderr, /pack is deprecated: `wildshard build` writes the shard file/u);
});
test('--folder-only (old name --product-only) builds the folder and writes no shard file', { timeout: 9_500 }, () => {
  rmSync(shardfile);
  run(['build', source, join(app, 'folder'), '--folder-only']);
  run(['build', source, join(app, 'product'), '--product-only']);
  assert.deepEqual(bytes(join(app, 'folder')), bytes(join(app, 'first')));
  assert.deepEqual(bytes(join(app, 'product')), bytes(join(app, 'first')));
  assert.equal(existsSync(shardfile), false);
});
test('moving the authored source does not change the shipped bytes', { timeout: 9_500 }, () => {
  cpSync(source, join(app, 'moved'), { recursive: true });
  run(['build', join(app, 'moved'), join(app, 'third'), '--product-only']);
  assert.deepEqual(bytes(join(app, 'third')), bytes(join(app, 'first')));
});
test('installed validation accepts the outside author output', { timeout: 9_500 }, () => {
  run(['validate', join(app, 'first')]);
});
// SA4: the loop's third step is one verb with one verdict; --json keeps stdout to the verdict document alone.
test('installed check --json gives a verdict on the new author project', { timeout: 9_500 }, () => {
  const done = run(['check', source, join(app, 'checked'), '--json']);
  const result = JSON.parse(done.stdout);
  assert.equal(result.verdict, 'pass', done.stdout);
  assert.deepEqual(result.steps.map(step => step.name), ['lint', 'build', 'validate', 'prove', 'report']);
  for (const step of result.steps) assert.ok(Number.isInteger(step.ms));
  // Lint skips until the sdk ships oxlint and its author config (SA8); prove skips with no proof.json.
  assert.deepEqual(result.steps.map(step => step.status), ['skip', 'pass', 'pass', 'skip', 'pass']);
  assert.deepEqual(result.refusals, []);
  // J198: the draft is a warning in the document, never a refusal.
  assert.deepEqual(result.warnings.map(row => [row.step, row.rule, row.guide]), [['build', 'shardfile-draft', 'GUIDE.md#shardfile-draft']]);
  // SA3: check's build writes the shard file too, and its note names it.
  assert.match(result.steps[1].note, /outside-isle\.shardfile$/u);
  assert.equal(sha(shardfile), built);
});
test('installed check prints the draft warning once, in its verdict', { timeout: 9_500 }, () => {
  const done = run(['check', source, join(app, 'checked')]);
  assert.equal(`${done.stdout}${done.stderr}`.match(/unprepared draft/gu)?.length, 1, done.stdout);
  assert.match(done.stdout, /^ {2}build: warning: outside-isle is an unprepared draft \(sdk 0\.2\)/mu);
  assert.match(done.stdout, /^check pass in /mu);
});
test('installed check --json fails a missing project with its refusal', { timeout: 9_500 }, () => {
  // Flags go anywhere: --json before the project still prints the document alone.
  const result = JSON.parse(run(['check', '--json', join(app, 'missing-source')], false).stdout);
  assert.equal(result.verdict, 'fail');
  assert.deepEqual(result.steps.map(step => step.status).slice(1), ['fail', 'skip', 'skip', 'skip']);
  assert.equal(result.refusals[0].step, 'build');
  // SA21: the refusal names its rule, a fix and its GUIDE.md section.
  assert.equal(result.refusals[0].rule, 'source-file-missing');
  assert.equal(result.refusals[0].guide, 'GUIDE.md#source-file-missing');
  assert.match(result.refusals[0].fix, /^\S.+\.$/u);
  assert.equal(result.output, null);
});
test('installed --version names the sdk, engine, shard-format and three chain', { timeout: 9_500 }, () => {
  const names = run(['--version']).stdout.trim().split('\n').map(line => line.split(' ')[0]);
  assert.deepEqual(names, ['@wildshard/sdk', '@wildshard/engine', '@wildshard/format', 'three']);
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
  const author = createRequire(join(app, 'node_modules/@wildshard/sdk/package.json'));
  const engine = createRequire(author.resolve('@wildshard/engine/package.json'));
  const a = await import(pathToFileURL(author.resolve('@wildshard/format/shardSchema')).href);
  const b = await import(pathToFileURL(engine.resolve('@wildshard/format/shardSchema')).href);
  assert.ok(a.ShardfileSchema);
  assert.equal(a.ShardfileSchema, b.ShardfileSchema);
  assert.equal(author('three').Vector3, engine('three').Vector3);
});
/** `wildshard prepare`'s last step on `folder` with a fixture recording (as src/ci/cook-preparation.test.ts), no WebKit. */
function prepare(folder) {
  const sdk = join(bin, '../..'), header = readFileSync(join(folder, 'shard.json')), recording = join(root, 'recording.json');
  writeFileSync(recording, JSON.stringify({ headerHash: createHash('sha256').update(header).digest('hex'), renderer: '1'.repeat(64), reads: [],
    programs: { version: 2, build: 'wire-fixture-only', lines: ['void main() {}'], shaders: [[0]], programs: [[0, 0]] } }));
  const finish = `import {readFileSync} from 'node:fs';
import {finishPreparation} from ${JSON.stringify(join(sdk, 'scripts/prepare-product.mjs'))};
const [dir,file]=process.argv.slice(1);
await finishPreparation(dir,JSON.parse(readFileSync(file,'utf8')),readFileSync(dir+'/shard.json'));`;
  const done = spawnSync(process.execPath, ['--import', join(sdk, 'src/sharddev/bake/format-hook.mjs'), '--input-type=module', '-e', finish, folder, recording], { encoding: 'utf8' });
  assert.equal(done.status, 0, done.stderr);
}
async function upload(context, server, file) {
  // An asynchronous child leaves this process free to serve the real HTTP requests.
  const { spawn } = await import('node:child_process');
  const { once } = await import('node:events');
  const child = spawn(process.execPath, [bin, 'upload', file, '--channel', 'staging', '--server', server.url], {
    cwd: app, env: { ...process.env, WILDSHARD_CREATOR_PRIVATE_KEY: server.privateKey, WILDSHARD_API_KEY: server.apiKey }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  context.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
  let output = ''; child.stdout.on('data', bytes => { output += bytes; }); child.stderr.on('data', bytes => { output += bytes; });
  const [code] = await once(child, 'close');
  return { code, output };
}
test('the outside author uploads its newly built and prepared tarball through the real CLI to the local service double', { timeout: 9_500 }, async context => {
  const server = await openUploadServer(context);
  // A real author's app has a package.json and a git HEAD; upload sends both (AC16).
  writeFileSync(join(app, 'package.json'), '{ "name": "outside-author", "version": "1.0.0", "private": true }\n');
  const git = args => assert.equal(spawnSync('git', ['-c', 'user.name=Outside Author', '-c', 'user.email=author@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: app, encoding: 'utf8' }).status, 0, `git ${args.join(' ')}`);
  git(['init', '-q']); git(['add', 'package.json']); git(['commit', '-q', '--no-verify', '-m', 'outside author']);
  // J198, J259: the draft refuses before any request; api-server would answer it 422 after the whole file.
  const draft = await upload(context, server, join(root, 'isle.tar'));
  assert.notEqual(draft.code, 0, draft.output);
  assert.match(draft.output, /outside-isle is an unprepared draft \(sdk 0\.2\)[^\n]*\n {2}\[shardfile-draft\] fix: /u);
  assert.equal(server.state.apiRequests.length, 0);
  // Prepared, then written again by build <folder>, it uploads as before.
  cpSync(join(app, 'first'), join(app, 'prepared'), { recursive: true });
  prepare(join(app, 'prepared'));
  assert.doesNotMatch(run(['build', join(app, 'prepared'), join(root, 'prepared.tar')]).stdout, /draft/u);
  const prepared = await upload(context, server, join(root, 'prepared.tar'));
  assert.equal(prepared.code, 0, prepared.output);
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
