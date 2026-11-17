// SDK-SPLIT SP8c: the sdk's engine (its parity oracle, a dev dependency) is the exact engine @wildshard/dev runs, so a
// new repo's engine pin (newProject reads it from the sdk until SP10) is the one the local game uses.
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const manifest = (path: string): { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

test('the sdk pins the engine @wildshard/dev depends on, exactly', () => {
  const sdk = manifest('../package.json'), dev = manifest('../../dev/package.json');
  expect(sdk.dependencies?.['@wildshard/engine']).toBeUndefined();
  expect(sdk.devDependencies?.['@wildshard/engine']).toMatch(/^\d+\.\d+\.\d+$/u);
  expect(sdk.devDependencies?.['@wildshard/engine']).toBe(dev.dependencies?.['@wildshard/engine']);
});
