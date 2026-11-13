// oxlint-disable-next-line import/no-nodejs-modules -- The fixture owns its source and product directories.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve only the owned fixture paths.
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import * as v from 'valibot';
import { emptyShardfile } from '../author';
import { readProjectAssets } from '../project';
import { writeOutputProduct } from '../outputProduct';
import { encodeCanonicalJson, hashImmutableBytes } from '../immutable';

test('generated discovery is admitted once and stored only in product metadata', async () => {
  mkdirSync('tmp', { recursive: true });
  const directory = mkdtempSync(resolve('tmp', 'project-discovery-'));
  const source = emptyShardfile({ slug: 'discovery-fixture', name: 'Discovery', author: 'Test', revision: 1, seed: 3 });
  const discovery = { 'boot.files': ['first.glb', 'second.glb'], 'boot.explore': { art: ['portrait.webp'] } };
  try {
    writeFileSync(resolve(directory, 'shard.config.ts'), `export default function generate() { return {shard:${JSON.stringify(source)},output:{},discovery:${JSON.stringify(discovery)}}; }`);
    const built = await readProjectAssets(directory);
    expect(built.output.discovery).toEqual(discovery);
    const output = resolve(directory, 'out');
    const index = writeOutputProduct(built.shard, built.assets, output, built.output);
    const receipt: unknown = JSON.parse(readFileSync(resolve(output, 'validation.json'), 'utf8'));
    const checked = v.parse(v.object({ discovery: v.strictObject({ hash: v.string(), values: v.unknown() }) }), receipt);
    expect(checked.discovery.values).toEqual(discovery);
    expect(checked.discovery.hash).toBe(hashImmutableBytes(new TextEncoder().encode(encodeCanonicalJson(discovery))));
    expect(index.files).toHaveLength(0);
    expect(index.sections.some(row => row.name.includes('discovery'))).toBe(false);
    writeFileSync(resolve(directory, 'shard.config.ts'), `export default function generate() { return {shard:${JSON.stringify(source)},output:{},discovery:{load:{module:'./generator.ts'}}}; }`);
    await expect(readProjectAssets(directory)).rejects.toThrow();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
