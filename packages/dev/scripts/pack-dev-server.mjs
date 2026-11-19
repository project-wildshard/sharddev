// Copy the server compiled at engine publication, with engine's frozen
// dependencies. Packing the SDK needs no engine compiler or patches.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const engineManifest = fileURLToPath(import.meta.resolve('@wildshard/engine/package.json'));
const engineBundle = join(dirname(engineManifest), 'dist/dev-server');
const output = resolve(import.meta.dirname, '../dist/dev-server');
const { version } = JSON.parse(readFileSync(engineManifest, 'utf8'));
if (!existsSync(join(engineBundle, 'bundle.json'))) throw new Error(`Pin an engine that carries a dev server bundle (installed ${version})`);
const hash = createHash('sha256').update(version);
for (const file of readdirSync(engineBundle, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name)).sort()) {
  hash.update(file.slice(engineBundle.length)).update(readFileSync(file));
}
const stamp = hash.digest('hex') + '\n';
const receipt = join(output, 'engine-bundle');
const current = () => existsSync(receipt) && readFileSync(receipt, 'utf8') === stamp;
if (!current()) {
  mkdirSync(dirname(output), { recursive: true });
  const staged = mkdtempSync(output + '-');
  try {
    cpSync(engineBundle, staged, { recursive: true });
    writeFileSync(join(staged, 'engine-version'), version + '\n');
    writeFileSync(join(staged, 'engine-bundle'), stamp);
    // Every pack of the same install can share the completed copy.
    if (!current()) {
      rmSync(output, { recursive: true, force: true });
      try { renameSync(staged, output); } catch (error) { if (!current()) throw error; }
    }
  } finally { rmSync(staged, { recursive: true, force: true }); }
}
