import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

test('a packed starter with a different pnpm pin starts no nested pnpm add', () => {
  const dir = mkdtempSync(join(tmpdir(), 'packed-install-guard-'));
  try {
    const pnpm = join(dir, 'pnpm.mjs'), calls = join(dir, 'calls');
    const artifacts = ['build', 'cli', 'dev', 'kit', 'sdk', 'upload'].map(part => {
      const archive = join(dir, part + '.tgz');
      writeFileSync(archive, part);
      return { name: '@wildshard/' + part, version: '0.0.1', archive, sha256: createHash('sha256').update(part).digest('hex') };
    });
    writeFileSync(join(dir, 'release-artifacts.json'), JSON.stringify(artifacts));
    // Stand in for pnpm 10.21.0. Simulate just one self-install so a
    // regression can never start the real recursive chain or reach npm.
    writeFileSync(pnpm, `#!${process.execPath}
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
const [verb, arg] = process.argv.slice(2);
const log = ${JSON.stringify(calls)};
const manifest = ${JSON.stringify(artifacts)};
appendFileSync(log, verb + ' ' + basename(process.cwd()) + '\\n');
if (verb === 'add') process.exit(9);
if (verb === 'new') {
  mkdirSync(arg);
  writeFileSync(join(arg, 'package.json'), '{"packageManager":"pnpm@10.34.9"}');
} else if (verb === 'install' && JSON.parse(readFileSync('package.json', 'utf8')).packageManager === 'pnpm@10.34.9') {
  if (process.env.npm_config_manage_package_manager_versions !== 'false') {
    spawnSync(process.execPath, [${JSON.stringify(pnpm)}, 'add', 'pnpm@10.34.9']);
  }
  console.error('Reached the generated project install');
  process.exit(42);
} else if (verb === 'install') {
  for (const row of manifest) {
    const path = join('node_modules', row.name, 'package.json');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(row));
  }
  writeFileSync('pnpm-lock.yaml', manifest.map(row => 'tarball: file:' + row.archive).join('\\n'));
  mkdirSync('node_modules/.bin');
  symlinkSync(${JSON.stringify(pnpm)}, 'node_modules/.bin/wildshard');
}
`, { mode: 0o700 });
    const verifier = fileURLToPath(new URL('../scripts/verify-packed-install.mjs', import.meta.url));
    const proof = spawnSync(process.execPath, [verifier, dir, pnpm], { cwd: dir, encoding: 'utf8', timeout: 10_000 });
    assert.ifError(proof.error);
    assert.match(proof.stderr, /Reached the generated project install/u);
    const commands = readFileSync(calls, 'utf8').trim().split('\n');
    assert.deepEqual(commands, ['install author', 'new author', 'install packed-isle']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
