// oxlint-disable-next-line import/no-nodejs-modules -- Exercise a real temporary shard repo.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Keep fixtures inside the test's owned scratch folder.
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import codemod, { rewriteCliBin, rewriteSplitImports } from '../codemods/0.4.1.mjs';

// SDK-SPLIT SP13: the split codemod moves the modules that left the sdk and pins the cli; the engine follows its imports.
const sdk = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { devDependencies: Record<string, string> };
const ENGINE = sdk.devDependencies['@wildshard/engine'];

test('moved modules go to dev and build under both package names; the rest stay', () => {
  for (const prefix of ['sdk', 'sharddev']) {
    expect(rewriteSplitImports(`import { watch } from '@wildshard/${prefix}/watch/watch';`)).toBe("import { watch } from '@wildshard/dev/watch/watch';");
    expect(rewriteSplitImports(`await import("@wildshard/${prefix}/test/scriptScenario");`)).toBe('await import("@wildshard/dev/test/scriptScenario");');
    expect(rewriteSplitImports(`import type { Project } from '@wildshard/${prefix}/project';`)).toBe("import type { Project } from '@wildshard/build/project';");
    expect(rewriteSplitImports(`import { bundleNativeRaster } from '@wildshard/${prefix}/bake/nativeRaster';`)).toBe("import { bundleNativeRaster } from '@wildshard/dev/bake/nativeRaster';");
  }
  expect(rewriteSplitImports("import { synthScene } from '@wildshard/sdk/synth';")).toBe("import { synthScene } from '@wildshard/build/synth';");
  // A scripts/ file the sdk no longer ships moved to dev; one it still ships stays.
  expect(rewriteSplitImports("import { ground } from '@wildshard/sharddev/scripts/bake/navmeshGround.ts';")).toBe("import { ground } from '@wildshard/dev/scripts/bake/navmeshGround.ts';");
  expect(rewriteSplitImports("import x from '@wildshard/sdk/scripts/compile-script.mjs';")).toBe("import x from '@wildshard/sdk/scripts/compile-script.mjs';");
  for (const source of ["'@wildshard/sdk/projectGeneration'", "'@wildshard/sdk/rows'", "'@wildshard/sdk/project/x'", "'@wildshard/engine/sim'"])
    expect(rewriteSplitImports(source)).toBe(source);
});

test('a CI test that runs the wildshard bin resolves it from the cli', () => {
  expect(rewriteCliBin("const bin=join(dirname(require.resolve('@wildshard/sharddev/package.json')),'bin/wildshard.mjs');"))
    .toBe("const bin=join(dirname(require.resolve('@wildshard/cli/package.json')),'bin/wildshard.mjs');");
  const kept = "const sdk=require.resolve('@wildshard/sharddev/package.json');";
  expect(rewriteCliBin(kept)).toBe(kept);
});

test('the author lint config loads the sdk\'s engine plugin', () => {
  const parent = resolve(process.env['VITEST_TMP_ROOT'] ?? 'tmp/vitest');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'split-codemod-lint-'));
  try {
    writeFileSync(join(root, 'package.json'), `${JSON.stringify({ dependencies: { '@wildshard/sharddev': 'npm:@wildshard/sdk@0.4.4', '@wildshard/cli': '0.4.4' } }, null, 2)}\n`);
    writeFileSync(join(root, '.oxlintrc.author.json'), '{ "jsPlugins": ["./node_modules/@wildshard/engine/lint/wildshard-plugin.js", "./node_modules/@wildshard/sharddev/lint/sdk-plugin.mjs"] }\n');
    expect(codemod({ project: root, from: '0.3.9', to: '0.4.4' })).toContain(".oxlintrc.author.json: lint with the sdk's engine plugin");
    expect(readFileSync(join(root, '.oxlintrc.author.json'), 'utf8')).toBe('{ "jsPlugins": ["./node_modules/@wildshard/sharddev/lint/engine-plugin.mjs", "./node_modules/@wildshard/sharddev/lint/sdk-plugin.mjs"] }\n');
    expect(codemod({ project: root, from: '0.3.9', to: '0.4.4' })).toEqual([]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a repo that imports the engine keeps it as a dev pin at dev\'s engine; the cli and homes are pinned; idempotent', () => {
  const parent = resolve(process.env['VITEST_TMP_ROOT'] ?? 'tmp/vitest');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'split-codemod-'));
  try {
    mkdirSync(join(root, 'src')); mkdirSync(join(root, 'test'));
    writeFileSync(join(root, 'src/page.ts'), "import { page } from '@wildshard/sharddev/watch/page';\n");
    writeFileSync(join(root, 'test/sim.test.ts'), "import { run } from '@wildshard/engine/sim';\n");
    writeFileSync(join(root, 'package.json'), `${JSON.stringify({ dependencies: { '@wildshard/engine': '0.1.18', '@wildshard/sharddev': 'npm:@wildshard/sdk@0.4.1' },
      pnpm: { overrides: { '@wildshard/engine': '0.1.18' } } }, null, 2)}\n`);
    expect(codemod({ project: root, from: '0.3.9', to: '0.4.1' })).toHaveLength(4);
    expect(readFileSync(join(root, 'src/page.ts'), 'utf8')).toContain("'@wildshard/dev/watch/page'");
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Record<string, Record<string, unknown>>;
    expect(pkg['dependencies']).toEqual({ '@wildshard/sharddev': 'npm:@wildshard/sdk@0.4.1', '@wildshard/cli': '0.4.1', '@wildshard/dev': '0.4.1' });
    expect(pkg['devDependencies']).toEqual({ '@wildshard/engine': ENGINE });
    expect(pkg['pnpm']).toEqual({ overrides: { '@wildshard/engine': ENGINE } });
    const bytes = readFileSync(join(root, 'package.json'), 'utf8');
    expect(codemod({ project: root, from: '0.3.9', to: '0.4.1' })).toEqual([]);
    expect(readFileSync(join(root, 'package.json'), 'utf8')).toBe(bytes);
  } finally { rmSync(root, { recursive: true }); }
});

test('a repo that never imports the engine drops its pin and override', () => {
  const parent = resolve(process.env['VITEST_TMP_ROOT'] ?? 'tmp/vitest');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'split-codemod-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { '@wildshard/engine': '0.1.35', '@wildshard/sdk': '0.4.1' }, pnpm: { overrides: { '@wildshard/engine': '0.1.35' } } }));
    expect(codemod({ project: root, from: '0.4.0', to: '0.4.1' })).toEqual(['package.json: pin @wildshard/cli 0.4.1', 'package.json: drop the engine pin (nothing imports it; the cli brings it)']);
    expect(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))).toEqual({ dependencies: { '@wildshard/sdk': '0.4.1', '@wildshard/cli': '0.4.1' }, pnpm: { overrides: {} } });
  } finally { rmSync(root, { recursive: true }); }
});
