// oxlint-disable-next-line import/no-nodejs-modules -- Compile exact shipped author inputs in an owned tiny project.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve only repository inputs and the owned fixture.
import { dirname, resolve } from 'node:path';
import { expect, test } from 'vitest';
import * as v from 'valibot';
import { BehaviourBuildSchema, buildBehaviourProject } from './buildBehaviour';
import { hashImmutableBytes } from '@wildshard/engine/host/immutable';

for (const [slug, hash, size] of [
  ['driftwood-isle', '25121a8616589da2265bc6d0537c86eabec4d64d26d0bd757268d80dac2cba1b', 1428],
  ['pine-hollow', '4bca3aaa1d0e5b78ef167939efa53c7a67c50377529cff637044aae9c5c84251', 1688],
] as const) {
  test(`${slug} author build keeps raw director metadata empty after regeneration`, async () => {
    mkdirSync('tmp', { recursive: true });
    const root = mkdtempSync(resolve('tmp/raw-director-author-'));
    const source = resolve('src/shards', slug);
    const put = (file: string, bytes: string | Uint8Array) => {
      const path = resolve(root, file); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes);
    };
    try {
      const descriptor = v.parse(BehaviourBuildSchema, JSON.parse(readFileSync(resolve(slug === 'driftwood-isle' ? 'test/fixtures/driftwood-director-build.json' : 'test/fixtures/pine-director-build.json'), 'utf8')));
      const module = descriptor.modules[0];
      if (module === undefined) throw new Error('Missing original director module');
      expect(module.embedded[0]?.raw).toBe(true);
      module.embedded.push({ file: 'behaviour/legacy.json' });
      put('behaviour/build.json', JSON.stringify(descriptor));
      put('behaviour/director.as', readFileSync(resolve(source, 'behaviour/director.as')));
      put('data/director.json', readFileSync(resolve(source, 'data/director.json')));
      put('behaviour/director.json', JSON.stringify({ module: hash, bytes: 'stale embedded transport' }));
      await buildBehaviourProject(root);
      const metadata = v.parse(v.object({ module: v.string(), bytes: v.string(), generated: v.optional(v.string()) }),
        JSON.parse(readFileSync(resolve(root, 'behaviour/director.json'), 'utf8')));
      expect(metadata).toEqual({ module: hash, bytes: '', ...(module.embedded[0]?.generated === undefined ? {} : { generated: module.embedded[0].generated }) });
      const bytes = readFileSync(resolve(root, 'assets', hash));
      expect(bytes.length).toBe(size);
      expect(hashImmutableBytes(bytes)).toBe(hash);
      const legacy = v.parse(v.object({ module: v.string(), bytes: v.string() }), JSON.parse(readFileSync(resolve(root, 'behaviour/legacy.json'), 'utf8')));
      expect(legacy.module).toBe(hash);
      expect(legacy.bytes.length).toBe(Math.ceil(size / 3) * 4);
      await expect(buildBehaviourProject(root, { check: true })).resolves.toContain('behaviour/director.json');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
