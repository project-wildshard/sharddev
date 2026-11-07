// oxlint-disable-next-line import/no-nodejs-modules -- Each regression starts a genuinely fresh Node/worker codec isolate.
import { execFileSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- Own only this test's temporary compressed product files.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve real SDK entries and the shipped physics binary.
import { resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- Native ESM imports use exact local file URLs.
import { pathToFileURL } from 'node:url';
import { BoxGeometry, MeshStandardMaterial } from 'three';
import { expect, test } from 'vitest';
import { emptyShardfile } from '@wildshard/engine/host/author';
import { parseGlb } from './assets';
import { staticGlb } from './bake/glb';
import { compressGlb } from './bake/glbCompression';
import { encodeCanonicalJson, hashImmutableBytes } from '@wildshard/engine/host/immutable';

for (const mode of ['public', 'worker']) test(`fresh ${mode} admission prepares compressed geometry in its own isolate`, () => {
  mkdirSync('tmp', { recursive: true });
  const directory = mkdtempSync(resolve('tmp/headless-codec-'));
  const geometry = new BoxGeometry(1, 2, 3), material = new MeshStandardMaterial();
  try {
    const bytes = compressGlb(staticGlb([{ geometry, material }])), hash = hashImmutableBytes(bytes), cost = parseGlb(bytes);
    expect(new TextDecoder().decode(bytes)).toContain('EXT_meshopt_compression');
    const source = emptyShardfile({ slug: 'headless-codec', name: 'Headless codec', author: 'Test', revision: 1, seed: 3 });
    source.files = [{ hash, kind: 'glb', compressed: bytes.length, ...cost, dependencies: [], critical: false }];
    source.library = [hash]; source.budgets.library = { compressed: bytes.length, resident: cost.decoded + cost.gpu };
    const descriptor = resolve(directory, 'shard.json'), model = resolve(directory, 'model.glb'), entry = resolve(directory, 'run.mjs');
    writeFileSync(descriptor, encodeCanonicalJson(source)); writeFileSync(model, bytes);
    const loader = pathToFileURL(resolve('scripts/sim-node-loader.mjs')).href;
    const worker = pathToFileURL(resolve('src/sdk/bake/headlessWorker.ts')).href;
    // Static imports run in a new process. The parent's prepared encoder and
    // decoder cannot make either the public entry or its worker ready for it.
    writeFileSync(entry, `import { HeadlessSimulation } from ${JSON.stringify(pathToFileURL(resolve('src/sdk/headless.ts')).href)};
import { TickWorkerHost } from ${JSON.stringify(pathToFileURL(resolve('src/sdk/tickWorkerHost.ts')).href)};
import { readFileSync } from 'node:fs';
const shard = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const bytes = new Uint8Array(readFileSync(process.argv[3]));
const assets = new Map([[shard.files[0].hash, bytes]]);
const simulation = process.argv[4] === 'public'
  ? await HeadlessSimulation.create(shard, assets, undefined, { deadline: 'advisory' })
  : new TickWorkerHost(new URL(${JSON.stringify(worker)}), { shard, assets, binary: ${JSON.stringify(resolve('public/assets/physics/rapier.wasm'))} }, shard.serverBudget,
    ['--experimental-transform-types', '--import', ${JSON.stringify(loader)}], 'advisory');
try {
  const committed = await simulation.step([]);
  if (committed.tick !== 1 || simulation.quarantined) throw new Error('Fresh codec simulation did not commit');
  console.log('headless-codec:1');
} finally { await simulation.dispose(); }
`);
    expect(execFileSync(process.execPath, ['--experimental-transform-types', '--import', loader, entry, descriptor, model, mode],
      { encoding: 'utf8', timeout: 25_000 })).toContain('headless-codec:1');
  } finally { geometry.dispose(); material.dispose(); rmSync(directory, { recursive: true, force: true }); }
}, 30_000);
