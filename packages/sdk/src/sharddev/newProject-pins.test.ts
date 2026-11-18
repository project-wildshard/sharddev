// oxlint-disable-next-line import/no-nodejs-modules -- Reads the sdk's own package.json.
import { readFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Asks npm which releases exist, as `wildshard new` does.
import { execFileSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- Reads the sdk's own package.json.
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { releasePin, repoPackageJson } from './newProject';

// SDK-SPLIT SP10: a new repo pins @wildshard/cli (the `wildshard` command) at the sdk's version, and never the engine.
const sdk = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8')) as { version: string; dependencies: Record<string, string>; peerDependencies: Record<string, string> };
const both = (): readonly string[] => [sdk.version];

test('a code repo pins the cli, the sdk library, shard-format and three', () => {
  const pkg = JSON.parse(repoPackageJson('my-shard', 'sdk', both)) as { dependencies: Record<string, string> };
  expect(pkg.dependencies).toEqual({ '@wildshard/cli': sdk.version, '@wildshard/format': sdk.dependencies['@wildshard/format'],
    '@wildshard/sdk': sdk.version, three: sdk.peerDependencies['three'] });
});

test('a hand-written repo pins the cli, the sdk and shard-format, as dev dependencies', () => {
  const pkg = JSON.parse(repoPackageJson('my-shard', 'blender', both)) as { devDependencies: Record<string, string>; dependencies?: unknown };
  expect(pkg.dependencies).toBeUndefined();
  expect(pkg.devDependencies).toEqual({ '@wildshard/cli': sdk.version, '@wildshard/format': sdk.dependencies['@wildshard/format'], '@wildshard/sdk': sdk.version });
});

// TEMPLATE-E2E TC-NE5: a starter made on sdk 0.3.9 pinned @wildshard/cli 0.3.9, which npm never had (the cli first shipped
// at 0.4.0), so it could not install. The pin follows the newest release npm has both packages at.
test('a pin never names a cli release npm does not have', () => {
  const sdkVersions = ['0.3.8', '0.3.9', '0.4.0', '0.4.1'], cliVersions = ['0.0.0-stage', '0.4.0', '0.4.1'];
  expect(releasePin('0.3.9', sdkVersions, cliVersions)).toBe('0.4.1');
  expect(releasePin('0.4.0', sdkVersions, cliVersions)).toBe('0.4.0');
  expect(releasePin('0.4.2', sdkVersions, cliVersions)).toBe('0.4.2');
  expect(releasePin('0.3.10', sdkVersions, cliVersions)).toBe('0.4.1');
  expect(releasePin('0.4.2', undefined, cliVersions)).toBe('0.4.2');
  expect(() => releasePin('0.3.9', ['0.3.9'], ['0.4.0'])).toThrow(/no release of both/u);
  const pkg = JSON.parse(repoPackageJson('my-shard', 'sdk', name => (name === '@wildshard/cli' ? ['0.0.1'] : ['0.0.1', sdk.version]))) as { dependencies: Record<string, string> };
  expect(pkg.dependencies['@wildshard/cli']).toBe('0.0.1');
  expect(pkg.dependencies['@wildshard/sdk']).toBe('0.0.1');
});

test('the pins `wildshard new` writes today are on npm', { timeout: 60_000 }, () => {
  const pkg = JSON.parse(repoPackageJson('my-shard', 'sdk')) as { dependencies: Record<string, string> };
  const listed = (name: string): string[] => JSON.parse(execFileSync('pnpm', ['view', name, 'versions', '--json'], { encoding: 'utf8' })) as string[];
  // On a release branch the sdk is the version being cut, newer than npm's; its own publish brings both packages.
  if (releasePin(sdk.version, listed('@wildshard/sdk'), listed('@wildshard/cli')) === sdk.version && !listed('@wildshard/sdk').includes(sdk.version)) return;
  for (const name of ['@wildshard/cli', '@wildshard/sdk']) expect(listed(name), name).toContain(pkg.dependencies[name]);
});
