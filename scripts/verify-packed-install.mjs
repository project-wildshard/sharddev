// SP23: run outside the checkout with only the release tarballs.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, delimiter, dirname, isAbsolute, join, resolve, sep } from 'node:path';

const pnpm = process.argv[3];
assert.ok(pnpm && isAbsolute(pnpm), 'Pass the bootstrapped pnpm executable as an absolute path');
const artifacts = JSON.parse(readFileSync(resolve(process.argv[2], 'release-artifacts.json'), 'utf8'));
const names = ['build', 'cli', 'dev', 'kit', 'sdk', 'upload'].map(name => `@wildshard/${name}`);
assert.deepEqual(artifacts.map(({ name }) => name).sort(), names);
const root = mkdtempSync(resolve('packed-install-'));
const home = join(root, 'home');
const app = join(root, 'author');
for (const directory of [home, app]) mkdirSync(directory);

// No checkout loaders, prefilled cache, or user npm configuration.
const env = {
  HOME: home,
  PATH: (process.env.PATH ?? '').split(delimiter)
    .filter(path => isAbsolute(path) && !path.includes(`${sep}node_modules${sep}`)).join(delimiter),
  CI: 'true',
};
const run = (command, args, cwd = app) => execFileSync(command, args, {
  cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 180_000,
});
const installArgs = ['install', '--no-frozen-lockfile', '--config.enable-global-virtual-store=false'];
const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const bin = join(app, 'node_modules/.bin/wildshard');
const author = (...args) => run(bin, args);
const source = 'packed-isle/src';
const project = join(app, 'packed-isle');

function install() {
  const pins = Object.fromEntries(artifacts.map(({ name, archive, sha256 }) => {
    assert.equal(digest(archive), sha256, name);
    return [name, `file:${archive}`];
  }));
  writeFileSync(join(app, 'package.json'), JSON.stringify({
    name: 'packed-install-proof', private: true, dependencies: pins, pnpm: { overrides: pins },
  }));
  console.info(run(pnpm, installArgs));
  const lock = readFileSync(join(app, 'pnpm-lock.yaml'), 'utf8');
  for (const { name, version, archive } of artifacts) {
    const path = realpathSync(join(app, 'node_modules', name, 'package.json'));
    assert.ok(path.startsWith(realpathSync(app) + '/node_modules/'), path);
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    assert.deepEqual([manifest.name, manifest.version], [name, version]);
    assert.ok(lock.split('\n').some(line => line.includes('tarball: file:') && line.includes(basename(archive))), name);
    console.info(`installed ${name}@${version} from its tarball`);
  }
  return pins;
}

function buildAndProve(pins) {
  console.info(author('new', 'packed-isle'));
  const file = join(project, 'package.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  manifest.pnpm = { ...manifest.pnpm, overrides: { ...manifest.pnpm?.overrides, ...pins } };
  writeFileSync(file, JSON.stringify(manifest));
  console.info(run(pnpm, installArgs, project));
  console.info(author('build', source, 'built', '--folder-only'));
  const report = JSON.parse(author('prove', 'built/shard.json', `${source}/proof.json`));
  assert.ok(report.ticks > 0 && report.ledger.facts.length > 0, 'starter tape must file a fact');
  console.info(`proved ${report.ticks} ticks, ${report.ledger.facts.length} facts`);
  console.info(author('build', 'built', 'built.shardfile'));
  console.info(author('pack', 'built', '--out', 'packed.shardfile'));
  assert.equal(digest(join(app, 'built.shardfile')), digest(join(app, 'packed.shardfile')));
}

// SHARD-COMPAT CP18 (the mini, 11-21): a shard typechecks on the published graph. TypeScript comes from the installed
// SDK (`@typescript/typescript6`), so the check needs nothing the author lacks.
function typecheck(dir) {
  const sdk = ['@wildshard/sdk', '@wildshard/sharddev'].map(name => join(dir, 'node_modules', name, 'package.json'))
    .find(file => { try { return realpathSync(file) !== ''; } catch { return false; } });
  assert.ok(sdk, `${dir} has no installed SDK`);
  const ts = dirname(createRequire(realpathSync(sdk)).resolve('@typescript/typescript6/package.json'));
  try {
    run(process.execPath, [join(ts, 'bin/tsc6'), '-p', 'tsconfig.json'], dir);
  } catch (error) {
    console.error(String(error.stdout ?? ''));
    throw new Error(`tsc refused ${basename(dir)} on the packed graph`, { cause: error });
  }
  console.info(`typechecked ${basename(dir)} on the packed graph`);
}

// A real shard repo (WS_REAL_SHARD=<owner/repo>, set on release branches) on the packed graph, its pins moved as
// `wildshard update --pins` would: the SDK family to the tarballs, format and engine to the packed SDK's own pins.
function realShard(repo, pins) {
  const dir = join(root, 'real-shard');
  run('git', ['clone', '--quiet', '--depth=1', `https://github.com/${repo}.git`, dir], root);
  const sdk = JSON.parse(readFileSync(realpathSync(join(app, 'node_modules/@wildshard/sdk/package.json')), 'utf8'));
  const derived = { '@wildshard/format': sdk.dependencies['@wildshard/format'], '@wildshard/engine': sdk.devDependencies?.['@wildshard/engine'] };
  const file = join(dir, 'package.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  for (const field of ['dependencies', 'devDependencies']) {
    for (const name of Object.keys(manifest[field] ?? {})) {
      const to = name === '@wildshard/sharddev' ? pins['@wildshard/sdk'] : pins[name] ?? derived[name];
      if (to !== undefined) manifest[field][name] = to;
    }
  }
  // The 0.4.24 codemod's @types/three beside three.
  const threeField = ['dependencies', 'devDependencies'].find(field => manifest[field]?.three !== undefined);
  if (threeField !== undefined && sdk.dependencies['@types/three'] !== undefined) manifest[threeField]['@types/three'] ??= sdk.dependencies['@types/three'];
  const overrides = { ...manifest.pnpm?.overrides };
  for (const name of Object.keys(overrides)) if (name in derived && derived[name] !== undefined) overrides[name] = derived[name];
  // A patch for a previous, exact version cannot apply to the replacement tarball.
  const packedVersions = new Map(artifacts.map(({ name, version }) => [name, version]));
  for (const selector of Object.keys(manifest.pnpm?.patchedDependencies ?? {})) {
    const at = selector.lastIndexOf('@');
    const version = selector.slice(at + 1);
    const packedVersion = packedVersions.get(selector.slice(0, at));
    if (packedVersion !== undefined && /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/u.test(version) && version !== packedVersion)
      delete manifest.pnpm.patchedDependencies[selector];
  }
  manifest.pnpm = { ...manifest.pnpm, overrides: { ...overrides, ...pins } };
  writeFileSync(file, JSON.stringify(manifest));
  console.info(run(pnpm, [...installArgs, '--ignore-scripts'], dir));
  typecheck(dir);
}

function synth() {
  mkdirSync(join(project, 'scene'));
  writeFileSync(join(project, 'scene/shard.config.ts'), `
    import { BoxGeometry, Mesh, MeshBasicMaterial, Scene } from 'three';
    export const identity = { slug: 'packed-synth' };
    export const scene = new Scene();
    scene.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
  `);
  const output = run(bin, ['synth', 'scene'], project);
  const scene = /synthesized (.+?\.json) \([0-9a-f]+\)/u.exec(output);
  assert.ok(scene, output);
  const file = realpathSync(resolve(project, scene[1]));
  assert.ok(file.startsWith(join(realpathSync(project), 'scene') + sep), file);
  assert.ok(Object.keys(JSON.parse(readFileSync(file, 'utf8'))).length > 0);
  console.info(output);
}

async function serve() {
  // A fixture provides the client shell. The installed CLI builds and serves the shard.
  const client = join(root, 'dev-client');
  mkdirSync(client);
  writeFileSync(join(client, 'index.html'), '<!doctype html><html><head></head><body></body></html>');
  writeFileSync(join(client, 'build-flags.json'), '{"devserver":true}');
  // MEMORY-STRUCTURE STR5: dev starts the installed engine's Node world, which reads the client's version.json (a release epoch starts at 1).
  const engine = dirname(createRequire(realpathSync(join(app, 'node_modules/@wildshard/dev/package.json'))).resolve('@wildshard/engine/package.json'));
  writeFileSync(join(client, 'version.json'), JSON.stringify({ build: 'fixture', clientVersion: JSON.parse(readFileSync(join(engine, 'package.json'), 'utf8')).version, saveEpoch: 1 }));
  const dev = spawn(bin, ['dev', source], {
    cwd: app, env: { ...env, WILDSHARD_DEV_CLIENT: client }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  const closed = new Promise(done => dev.once('close', done));
  const timeout = setTimeout(() => dev.kill('SIGKILL'), 60_000);
  try {
    const page = await new Promise((ready, reject) => {
      let output = '';
      dev.stdout.on('data', chunk => {
        output += chunk;
        const match = /wildshard dev: (http:\/\/\S+)/u.exec(output);
        if (match) ready(match[1]);
      });
      dev.once('error', reject);
      dev.once('exit', code => reject(new Error(`wildshard dev exited ${code}\n${output}`)));
    });
    const html = await fetch(page, { signal: AbortSignal.timeout(5_000) });
    assert.ok(html.ok);
    assert.match(await html.text(), /__wildshard_dev_revision/u);
    const product = await fetch(new URL('/shardfiles/packed-isle/shard.json', page), { signal: AbortSignal.timeout(5_000) });
    assert.ok(product.ok);
    assert.equal((await product.json()).identity.slug, 'packed-isle');
    console.info('dev served the freshly built shard');
  } finally {
    dev.kill('SIGTERM');
    await closed;
    clearTimeout(timeout);
  }
}

try {
  const pins = install();
  buildAndProve(pins);
  typecheck(project);
  if (process.env.WS_REAL_SHARD) realShard(process.env.WS_REAL_SHARD, pins);
  synth();
  await serve();
} finally {
  rmSync(root, { recursive: true, force: true });
}
