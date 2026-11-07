// oxlint-disable-next-line import/no-nodejs-modules -- The regression owns one isolated author process.
import { execFileSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- The regression creates and removes its own tiny product fixture.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve only the repository and owned fixture paths.
import { resolve } from 'node:path';
import { build } from 'vite';
import { BoxGeometry, MeshStandardMaterial } from 'three';
import { expect, test } from 'vitest';
import { emptyShardfile } from '@wildshard/engine/host/author';
import { parseGlb } from './assets';
import { staticGlb } from './bake/glb';
import { compressGlb } from './bake/glbCompression';
import { encodeCanonicalJson, hashImmutableBytes } from '@wildshard/engine/host/immutable';

test('a fresh author process admits compressed bytes immediately after importing the direct writer', async () => {
  mkdirSync('tmp', { recursive: true });
  const directory = mkdtempSync(resolve('tmp/product-codec-ready-'));
  const geometry = new BoxGeometry(1, 2, 3), material = new MeshStandardMaterial();
  try {
    const bytes = compressGlb(staticGlb([{ geometry, material }])), hash = hashImmutableBytes(bytes), cost = parseGlb(bytes);
    expect(new TextDecoder().decode(bytes)).toContain('EXT_meshopt_compression');
    const source = emptyShardfile({ slug: 'codec-ready', name: 'Codec ready', author: 'Test', revision: 1, seed: 3 });
    source.files = [{ hash, kind: 'glb', compressed: bytes.length, ...cost, dependencies: [], critical: false }];
    source.library = [hash]; source.budgets.library = { compressed: bytes.length, resident: cost.decoded + cost.gpu };
    const descriptor = resolve(directory, 'shard.json'), model = resolve(directory, 'model.glb'), entry = resolve(directory, 'writer.mjs');
    writeFileSync(descriptor, encodeCanonicalJson(source)); writeFileSync(model, bytes);
    // Bundle the real public writer and its decoder into a fresh Node module.
    // The parent has already prepared codecs to make the fixture; none of that
    // module state crosses into this process, and the child awaits no decoder.
    const code = `import { admitProduct } from ${JSON.stringify(resolve('src/sharddev/productOutput.ts'))};
import { readFileSync } from 'node:fs';
const source = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const bytes = new Uint8Array(readFileSync(process.argv[3]));
const admitted = admitProduct(source, new Map([[source.files[0].hash, bytes]]), 'warn');
console.log(admitted.identity.slug);`;
    const built = await build({ configFile: false, publicDir: false, logLevel: 'silent',
      plugins: [{ name: 'direct-author-writer-fixture', resolveId(id) { return id === 'virtual:direct-writer' ? id : null; },
        load(id) { return id === 'virtual:direct-writer' ? code : null; } }],
      build: { write: false, target: 'esnext', minify: false,
        rolldownOptions: { input: 'virtual:direct-writer', external: [/^node:/u], output: { codeSplitting: false } } } });
    if (Array.isArray(built) || !('output' in built)) throw new Error('Expected one direct-writer bundle');
    const chunks = built.output.filter(file => file.type === 'chunk'), chunk = chunks[0];
    if (chunks.length !== 1 || chunk === undefined) throw new Error('Expected one isolated writer module');
    writeFileSync(entry, chunk.code);
    expect(execFileSync(process.execPath, [entry, descriptor, model], { encoding: 'utf8', timeout: 20_000 }).trim()).toBe('codec-ready');
  } finally { geometry.dispose(); material.dispose(); rmSync(directory, { recursive: true, force: true }); }
});
