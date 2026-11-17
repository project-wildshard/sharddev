// oxlint-disable-next-line import/no-nodejs-modules -- Exercise a real temporary shard and a separate symlink target.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Keep fixtures inside the test's owned scratch folder.
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import codemod, { rewriteKitImports } from '../codemods/0.4.0.mjs';

const names = ['bake/species', 'bake/riderArms', 'bake/specimenCatalogue', 'bake/nativeInteractionFacts', 'weapons/meleeProfile', 'weapons/bowProfile'];

test('all six module literals migrate with both package names and all import syntaxes', () => {
  for (const name of names) for (const prefix of ['sdk', 'sharddev']) {
    for (const source of [
      `import { value as local, type Shape } from '@wildshard/${prefix}/${name}';`,
      `import type * as Shape from "@wildshard/${prefix}/${name}";`,
      `await import('@wildshard/${prefix}/${name}');`,
      `export { value } from '@wildshard/${prefix}/${name}';`,
    ]) {
      const changed = rewriteKitImports(source);
      expect(changed).toBe(source.replace(`@wildshard/${prefix}/`, '@wildshard/kit/'));
      expect(rewriteKitImports(changed)).toBe(changed);
    }
  }
  expect(rewriteKitImports("import { portableMath } from '@wildshard/sharddev/commons/bake/portableMath';"))
    .toBe("import { portableMath } from '@wildshard/sharddev/math/portableMath';");
  for (const source of ["'@wildshard/sdk/bake/species-extra'", "'@wildshard/sdk/bake/species/private'", "'@wildshard/sdk/random'"])
    expect(rewriteKitImports(source)).toBe(source);
});

test('a shard migration pins kit, leaves generated/foreign files alone and is idempotent', () => {
  const parent = resolve(process.env['VITEST_TMP_ROOT'] ?? 'tmp/vitest');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'kit-codemod-'));
  const outside = mkdtempSync(join(parent, 'kit-foreign-'));
  const source = "import { commonSpeciesRows } from '@wildshard/sharddev/bake/species';\n";
  try {
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src/creatures.ts'), source);
    writeFileSync(join(root, 'package.json'), JSON.stringify({ devDependencies: { '@wildshard/sharddev': 'npm:@wildshard/sdk@0.4.0' } }));
    writeFileSync(join(outside, 'foreign.ts'), source);
    symlinkSync(outside, join(root, 'linked'));
    for (const folder of ['node_modules', '.git', 'tmp', 'dist']) {
      mkdirSync(join(root, folder)); writeFileSync(join(root, folder, 'skip.ts'), source);
    }
    expect(codemod({ project: root, from: '0.3.2', to: '0.4.0' })).toHaveLength(2);
    expect(readFileSync(join(root, 'src/creatures.ts'), 'utf8')).toContain('@wildshard/kit/bake/species');
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { devDependencies: Record<string, string> };
    const sdk = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version: string };
    expect(pkg.devDependencies['@wildshard/kit']).toBe(sdk.version);
    expect(readFileSync(join(outside, 'foreign.ts'), 'utf8')).toBe(source);
    for (const folder of ['node_modules', '.git', 'tmp', 'dist']) expect(readFileSync(join(root, folder, 'skip.ts'), 'utf8')).toBe(source);
    expect(codemod({ project: root, from: '0.3.2', to: '0.4.0' })).toEqual([]);
  } finally { rmSync(root, { recursive: true }); rmSync(outside, { recursive: true }); }
});
