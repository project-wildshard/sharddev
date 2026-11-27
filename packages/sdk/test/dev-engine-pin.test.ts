// SDK-SPLIT SP8c: the sdk's engine (its parity oracle, a dev dependency) is the exact engine @wildshard/dev runs, so a
// new repo's engine pin (newProject reads it from the sdk until SP10) is the one the local game uses.
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

interface Manifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  gitHead?: string;
  wildshardStagingClients?: Record<string, string>;
}
const manifest = (path: string): Manifest => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as Manifest;

test('the sdk pins the engine @wildshard/dev depends on, exactly', () => {
  const sdk = manifest('../package.json'), dev = manifest('../../dev/package.json');
  expect(sdk.dependencies?.['@wildshard/engine']).toBeUndefined();
  // J475: an engine on npm `next` (`-next.<sha8>`) is an exact pin too; a range never is
  expect(sdk.devDependencies?.['@wildshard/engine']).toMatch(/^\d+\.\d+\.\d+(?:-next\.[0-9a-f]{8})?$/u);
  expect(sdk.devDependencies?.['@wildshard/engine']).toBe(dev.dependencies?.['@wildshard/engine']);
});

test('an engine next pin registers its exact client release', () => {
  const dev = manifest('../../dev/package.json');
  const pin = dev.dependencies?.['@wildshard/engine'] ?? '';
  const prefix = /-next\.([0-9a-f]{8})$/u.exec(pin)?.[1];
  if (prefix === undefined) return;
  const engine = manifest('../../dev/node_modules/@wildshard/engine/package.json');
  expect(engine.gitHead).toMatch(new RegExp(`^${prefix}[0-9a-f]{32}$`, 'u'));
  expect(dev.wildshardStagingClients?.[pin]).toBe(engine.gitHead);
});
