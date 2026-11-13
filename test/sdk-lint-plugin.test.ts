// SHARD-AUTHORING SA6: the SDK's generator-imports rule allows the shard format and Node built-ins (J170).
import { describe, expect, it } from 'vitest';
import plugin, { generatorImportViolation } from '../lint/sdk-plugin.mjs';

const generator = '/repo/src/shards/meadow/generators/rows.ts';

describe('wildshard-sdk/generator-imports', () => {
  it('allows the authoring surface', () => {
    for (const source of ['three', 'three/examples/jsm/utils/BufferGeometryUtils.js', '@wildshard/sharddev/bake/glb',
      '@wildshard/sdk/bake', '@wildshard/commons/x', '@wildshard/engine/host/immutable', '@wildshard/format/movers',
      '@wildshard/shard-format/movers', 'valibot', 'node:fs', 'node:path', 'fs', './rows', '../data/strings.json'])
      expect(generatorImportViolation(generator, source), source).toBeNull();
  });

  it('refuses engine, other packages, paths outside the shard and computed paths', () => {
    for (const source of ['@wildshard/engine/models/model', '@wildshard/engine', '@gltf-transform/core', 'meshoptimizer',
      '../../../../scripts/bake-output.mjs', '../../other/generators/x', '<computed>'])
      expect(generatorImportViolation(generator, source), source).not.toBeNull();
    expect(generatorImportViolation(generator, '@wildshard/sharddev/runtime/x')).toMatch(/trusted SDK runtime/u);
  });

  it('covers data, quests and shard.config.ts but not runtime or other trees', () => {
    expect(generatorImportViolation('/repo/src/shards/meadow/data/a.ts', 'meshoptimizer')).not.toBeNull();
    expect(generatorImportViolation('/repo/src/shards/meadow/quests/a.ts', 'meshoptimizer')).not.toBeNull();
    expect(generatorImportViolation('/repo/src/shards/meadow/shard.config.ts', 'meshoptimizer')).not.toBeNull();
    expect(generatorImportViolation('/repo/src/shards/meadow/runtime/a.ts', 'meshoptimizer')).toBeNull();
    expect(generatorImportViolation('/repo/src/sharddev/a.ts', 'meshoptimizer')).toBeNull();
  });

  it('lets a generator test use its test runner', () => {
    expect(generatorImportViolation('/repo/src/shards/meadow/generators/rows.test.ts', 'vitest')).toBeNull();
  });

  it('is the wildshard-sdk plugin', () => {
    expect(plugin.meta.name).toBe('wildshard-sdk');
    expect(Object.keys(plugin.rules)).toEqual(['generator-imports']);
  });
});
