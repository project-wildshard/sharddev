// SHARD-AUTHORING SA6: the SDK's generator-imports rule. SA38 (J319): generators are arbitrary Node, so the rule is a
// denylist of Wildshard cheats there; data/, quests/ and shard.config.ts keep the authoring allowlist.
import { describe, expect, it } from 'vitest';
import plugin, { generatorImportViolation } from '../lint/sdk-plugin.mjs';

const generator = '/repo/src/shards/meadow/generators/rows.ts';
const refused = (filename: string, source: string) => {
  const reason = generatorImportViolation(filename, source);
  expect(reason, source).not.toBeNull();
  return reason ?? '';
};

describe('wildshard-sdk/generator-imports in generators/ (denylist, J319)', () => {
  it('allows any npm package, valibot, Node built-ins, three, the format and exported sdk paths', () => {
    for (const source of ['three', 'three/examples/jsm/utils/BufferGeometryUtils.js', 'three/addons/math/SimplexNoise.js',
      '@wildshard/sharddev/bake/glb', '@wildshard/sdk/bake', '@wildshard/sdk/immutable', '@wildshard/sdk/scripts/x.mjs',
      '@wildshard/commons/x', '@wildshard/format/movers', '@wildshard/format/shardSchema', '@wildshard/shard-format/movers',
      'valibot', 'node:fs', 'node:path', 'fs', '@gltf-transform/core', 'meshoptimizer', 'sharp', 'lodash-es', 'left-pad',
      './rows', '../data/strings.json', '../../../../scripts/bake-output.mjs', '/abs/tools/helper.mjs'])
      expect(generatorImportViolation(generator, source), source).toBeNull();
  });

  it('refuses @wildshard/engine and every subpath, host included, and names the sdk/format fix', () => {
    for (const source of ['@wildshard/engine', '@wildshard/engine/models/model', '@wildshard/engine/host/immutable',
      '@wildshard/engine/host/shardfile']) {
      const reason = refused(generator, source);
      expect(reason).toMatch(/^generator-imports: /u);
      expect(reason).toMatch(/@wildshard\/sdk\/immutable|@wildshard\/format\/shardSchema/u);
    }
  });

  it('refuses sdk and sharddev paths outside the sdk package.json exports', () => {
    for (const source of ['@wildshard/sdk/src/sharddev/immutable.ts', '@wildshard/sharddev/bake/nope', '@wildshard/sdk',
      '@wildshard/sdk/lint/sdk-plugin.mjs']) {
      const reason = refused(generator, source);
      expect(reason).toMatch(/^generator-imports: .*exports/u);
    }
    expect(refused(generator, '@wildshard/sharddev/runtime/x')).toMatch(/^generator-imports: trusted SDK runtime/u);
    expect(refused(generator, '@wildshard/sdk/runtime/x')).toMatch(/^generator-imports: trusted SDK runtime/u);
  });

  it("refuses paths into another shard's source, relative or absolute, and another shard's package", () => {
    for (const source of ['../../other/generators/x', '../../other/data/a.json',
      '/repo/src/shards/other/generators/x.ts', '../../../../../shard-dunes/src/shards/sunscar-dunes/generators/sand.ts',
      '@wildshard/shard-dunes', '@wildshard/shard-dunes/src/shards/sunscar-dunes/generators/sand.ts'])
      expect(refused(generator, source)).toMatch(/^generator-imports: .*another shard/u);
  });

  it('refuses package files reached by path instead of by name', () => {
    for (const source of ['../../../../node_modules/@wildshard/engine/src/shared/host/immutable.ts',
      '../../../../node_modules/.pnpm/@wildshard+engine@0.1.13/node_modules/@wildshard/engine/src/x.ts'])
      expect(refused(generator, source)).toMatch(/^generator-imports: .*@wildshard\/engine/u);
    expect(refused(generator, '../../../../node_modules/@wildshard/sdk/src/sharddev/immutable.ts'))
      .toMatch(/^generator-imports: .*by path.*exports/u);
  });

  it('refuses a second copy of three (deep three/src and three files by path)', () => {
    for (const source of ['three/src/math/Vector3.js', 'three/src/Three.js', '../../../../node_modules/three/src/Three.js',
      '../../../../node_modules/.pnpm/three@0.186.0/node_modules/three/build/three.module.js'])
      expect(refused(generator, source)).toMatch(/^generator-imports: .*second copy of three.*import from 'three'/u);
  });

  it('closes the review bypasses: file: URLs, the sdk source by path, dot segments, shard packages by path', () => {
    expect(refused(generator, 'file:///repo/src/shards/other/generators/x.ts')).toMatch(/another shard/u);
    expect(refused(generator, '../../../sharddev/runtime/x.ts')).toMatch(/@wildshard\/sdk files by path/u);
    expect(refused(generator, '/repo/src/sharddev/immutable.ts')).toMatch(/@wildshard\/sdk files by path/u);
    expect(refused(generator, '@wildshard/sdk/scripts/../src/sharddev/runtime/x')).toMatch(/exports/u);
    expect(refused(generator, '../../../../node_modules/@wildshard/shard-dunes/dist/x.js')).toMatch(/another shard/u);
    expect(generatorImportViolation(generator, 'file:///repo/src/shards/meadow/data/a.json')).toBeNull();
  });

  it('finds the shard by the last src/shards/ in the path', () => {
    const nested = '/home/u/src/shards/x/src/shards/meadow/generators/a.ts';
    expect(refused(nested, '@wildshard/engine')).toMatch(/@wildshard\/engine/u);
    expect(refused(nested, '../../other/generators/b')).toMatch(/another shard's source \(other\)/u);
    expect(generatorImportViolation(nested, './b')).toBeNull();
  });

  it('refuses three build files by name and a require() of three', () => {
    expect(refused(generator, 'three/build/three.cjs')).toMatch(/second copy of three/u);
    expect(generatorImportViolation(generator, 'three', true)).toMatch(/second copy of three/u);
    expect(generatorImportViolation(generator, 'left-pad', true)).toBeNull();
  });

  // Vite resolves the path before its first `?` or `#` through the package exports and keeps the rest as a postfix
  // (`?raw`, `?url`, `?worker&inline`), so the rule judges that path: nalati's kokparProgram.ts and nine-dragon's
  // practiceProgram.ts import the exported course.as `?raw`.
  it('reads an import by its path before a Vite ?query or #hash', () => {
    for (const source of ['@wildshard/sharddev/commons/scripts/course.as?raw', '@wildshard/sdk/commons/scripts/course.as?raw',
      '@wildshard/sdk/scripts/x.glsl?url', '@wildshard/sdk/scripts/x.mjs?worker&inline', '@wildshard/sdk/immutable#x',
      './shader.glsl?raw', 'three/addons/x.js?url'])
      expect(generatorImportViolation(generator, source), source).toBeNull();
    for (const source of ['@wildshard/sdk/commons/scripts/nope.as?raw', '@wildshard/sharddev/bake/nope?url',
      '@wildshard/sdk?raw', '@wildshard/sdk/src/commons/scripts/course.as?raw'])
      expect(refused(generator, source)).toMatch(/^generator-imports: .*exports/u);
    expect(refused(generator, '@wildshard/sdk/runtime/x?raw')).toMatch(/trusted SDK runtime/u);
    expect(refused(generator, '@wildshard/engine?raw')).toMatch(/@wildshard\/engine/u);
    expect(refused(generator, '@wildshard/engine#x')).toMatch(/@wildshard\/engine/u);
    expect(refused(generator, 'three/src/Three.js?raw')).toMatch(/second copy of three/u);
    expect(refused(generator, '@wildshard/shard-dunes?raw')).toMatch(/another shard/u);
    expect(refused(generator, '../../other/generators/x.glsl?raw')).toMatch(/another shard/u);
    expect(refused('/repo/src/shards/meadow/data/a.ts', 'meshoptimizer?raw')).toMatch(/only three/u);
    expect(refused('/repo/src/shards/meadow/data/a.ts', '#x?raw')).toMatch(/only three/u);
    expect(generatorImportViolation('/repo/src/shards/meadow/data/a.ts', '@wildshard/sdk/commons/scripts/course.as?raw'))
      .toBeNull();
  });

  it('still requires a literal module path', () => {
    expect(refused(generator, '<computed>')).toMatch(/^generator-imports: .*literal module path/u);
  });
});

describe('wildshard-sdk/generator-imports outside generators/', () => {
  it('keeps the authoring allowlist in data, quests and shard.config.ts', () => {
    for (const filename of ['/repo/src/shards/meadow/data/a.ts', '/repo/src/shards/meadow/quests/a.ts',
      '/repo/src/shards/meadow/shard.config.ts']) {
      expect(refused(filename, 'meshoptimizer')).toMatch(/^generator-imports: .*only three/u);
      expect(refused(filename, '@wildshard/engine/host/immutable')).toMatch(/^generator-imports: /u);
      for (const source of ['three', 'valibot', 'node:fs', '@wildshard/format/movers', '@wildshard/sdk/immutable', './x'])
        expect(generatorImportViolation(filename, source), `${filename} ${source}`).toBeNull();
    }
  });

  it('does not check runtime or other trees', () => {
    expect(generatorImportViolation('/repo/src/shards/meadow/runtime/a.ts', 'meshoptimizer')).toBeNull();
    expect(generatorImportViolation('/repo/src/shards/meadow/runtime/a.ts', '@wildshard/engine/x')).toBeNull();
    expect(generatorImportViolation('/repo/src/sharddev/a.ts', 'meshoptimizer')).toBeNull();
  });

  it('lets a data test use its test runner', () => {
    expect(generatorImportViolation('/repo/src/shards/meadow/data/rows.test.ts', 'vitest')).toBeNull();
    expect(generatorImportViolation('/repo/src/shards/meadow/generators/rows.test.ts', 'vitest')).toBeNull();
  });

  it('is the wildshard-sdk plugin', () => {
    expect(plugin.meta.name).toBe('wildshard-sdk');
    expect(Object.keys(plugin.rules)).toEqual(['generator-imports']);
  });
});
