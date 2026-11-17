// J186: actual publishable tarballs, not generator rows. CI only.
import '@wildshard/engine/scripts/format-hook.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';

const { readTar } = await import('@wildshard/format/tar');
const { manifestFolders, shardProducts } = await import('@wildshard/engine/scripts/shard-outputs.mjs');
const sdk = dirname(createRequire(import.meta.url).resolve('@wildshard/sdk/package.json'));
const bin = resolve(sdk, 'bin/wildshard.mjs');
const expected = shardProducts(process.cwd(), manifestFolders(process.cwd()));
assert.ok(expected.length, 'This checkout must declare its products');
assert.deepEqual(readdirSync('out', { withFileTypes: true }).filter(row => row.isDirectory() && !row.name.startsWith('.') && row.name !== 'tars').map(row => row.name).sort(), expected.map(row => row.slug).sort());
for (const { slug } of expected) test(`${slug}: publishable tarball includes its real discovery document`, { timeout: 9_500 }, () => {
  const parent = process.env.WS_PROOF_SCRATCH ?? tmpdir();
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'shard-package-'));
  try {
    const tar = join(root, `${slug}.tar`);
    const done = spawnSync(process.execPath, [bin, 'pack', resolve('out', slug), '--out', tar], { encoding: 'utf8', timeout: 8_000 });
    assert.ifError(done.error);
    assert.equal(done.status, 0, `${done.stdout}\n${done.stderr}`);
    const files = readTar(readFileSync(tar));
    const discoveries = [...files].filter(([name]) => name.endsWith('/discovery.json'));
    assert.equal(discoveries.length, 1, 'Each shipped product must be discoverable');
    const [, bytes] = discoveries[0], document = JSON.parse(new TextDecoder().decode(bytes));
    assert.equal(document.slug, slug);
    assert.ok(document.data.shardfile, 'The discovery document must point to the actual shardfile');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
