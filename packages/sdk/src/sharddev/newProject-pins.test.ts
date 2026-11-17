// oxlint-disable-next-line import/no-nodejs-modules -- Reads the sdk's own package.json.
import { readFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Reads the sdk's own package.json.
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { repoPackageJson } from './newProject';

// SDK-SPLIT SP10: a new repo pins @wildshard/cli (the `wildshard` command) at the sdk's version, and never the engine.
const sdk = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8')) as { version: string; dependencies: Record<string, string>; peerDependencies: Record<string, string> };

test('a code repo pins the cli, the sdk library, shard-format and three', () => {
  const pkg = JSON.parse(repoPackageJson('my-shard', 'sdk')) as { dependencies: Record<string, string> };
  expect(pkg.dependencies).toEqual({ '@wildshard/cli': sdk.version, '@wildshard/format': sdk.dependencies['@wildshard/format'],
    '@wildshard/sdk': sdk.version, three: sdk.peerDependencies['three'] });
});

test('a hand-written repo pins only the cli and shard-format, as dev dependencies', () => {
  const pkg = JSON.parse(repoPackageJson('my-shard', 'blender')) as { devDependencies: Record<string, string>; dependencies?: unknown };
  expect(pkg.dependencies).toBeUndefined();
  expect(pkg.devDependencies).toEqual({ '@wildshard/cli': sdk.version, '@wildshard/format': sdk.dependencies['@wildshard/format'] });
});
