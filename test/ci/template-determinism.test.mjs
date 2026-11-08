// Ring 2, not hooks or the five-minute candidate leg. Each case deliberately
// generates a complete procedural world twice from separate empty caches,
// then from relocated source. Three full bakes exceed J186's ten-second
// quick-case budget; a byte-for-byte published product is the outer edge.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, test } from 'node:test';
import { installWildshard } from '../../src/test/helpers/install.ts';

const parent = process.env.WS_PROOF_SCRATCH ?? tmpdir();
mkdirSync(parent, { recursive: true });
const root = mkdtempSync(join(parent, 'template-determinism-'));
after(() => rmSync(root, { recursive: true, force: true }));
const bin = installWildshard(root), app = join(root, 'app');
function bytes(directory, prefix = '') {
  return readdirSync(join(directory, prefix), { withFileTypes: true }).flatMap(row => {
    const file = join(prefix, row.name);
    return row.isDirectory() ? bytes(directory, file) : [[file, createHash('sha256').update(readFileSync(join(directory, file))).digest('hex')]];
  }).sort(([a], [b]) => a.localeCompare(b));
}
for (const slug of ['_template', 'ink-cel-valley', 'pastel-plain']) test(`${slug}: two cold bakes and moved source publish identical bytes`, { timeout: 120_000 }, () => {
  const source = join(app, 'src/shards', slug), moved = join(app, 'relocated', slug);
  cpSync(resolve('src/shards', slug), source, { recursive: true });
  cpSync(source, moved, { recursive: true });
  const published = resolve('src/shards', slug, 'assets/public');
  if (existsSync(published)) cpSync(published, join(app, 'public/assets', slug), { recursive: true });
  const outputs = [];
  for (const [index, input] of [source, source, moved].entries()) {
    const output = join(root, `${slug}-${index}`);
    const done = spawnSync(process.execPath, [bin, 'build', input, output, '--product-only'], {
      cwd: app, encoding: 'utf8', timeout: 38_000,
      env: { ...process.env, WILDSHARD_GEN_CACHE: join(root, `${slug}-gen-${index}`), WILDSHARD_SHARDFILE_CACHE: join(root, `${slug}-compiler-${index}`) },
    });
    assert.ifError(done.error);
    assert.equal(done.status, 0, `${done.stdout}\n${done.stderr}`);
    outputs.push(bytes(output));
  }
  const different = (a, b) => {
    const left = new Map(a), right = new Map(b);
    return [...new Set([...left.keys(), ...right.keys()])].filter(file => left.get(file) !== right.get(file));
  };
  assert.deepEqual(different(outputs[1], outputs[0]), [], 'A second cold bake must publish identical bytes');
  assert.deepEqual(different(outputs[2], outputs[0]), [], 'Relocated source must publish identical bytes');
  console.log(JSON.stringify({ slug, platform: `${process.platform}-${process.arch}`, files: outputs[0].length, product: createHash('sha256').update(JSON.stringify(outputs[0])).digest('hex') }));
});
