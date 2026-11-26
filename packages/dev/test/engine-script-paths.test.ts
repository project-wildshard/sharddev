// oxlint-disable-next-line import/no-nodejs-modules -- Read the installed engine and this package's scripts on disk.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the engine this package installs.
import { createRequire } from 'node:module';
// oxlint-disable-next-line import/no-nodejs-modules -- Paths inside this package.
import { join, resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- The helper returns a file URL.
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { engineScriptUrl } from '../scripts/dev-world.mjs';

// Meta QA 11-25 row 139: engine 0.1.96 is lean (its scripts live in src/scripts/), and `wildshard memory` imported
// `<engine>/scripts/debug-settings.mjs` by hand, so main's ci product job failed once the pin moved. Every engine script
// read by path goes through dev-world's engineScriptUrl, which knows both layouts.
const dev = resolve(import.meta.dirname, '..');

test('engineScriptUrl finds the installed engine\'s debug-settings, dev-world and rig-listeners scripts', () => {
  const manifest = createRequire(join(dev, 'package.json')).resolve('@wildshard/engine/package.json');
  for (const name of ['debug-settings.mjs', 'dev-world.mjs', 'rig-listeners.mjs']) expect(existsSync(fileURLToPath(engineScriptUrl(manifest, name))), name).toBe(true);
});

test('no dev script or test joins an engine root with scripts/ by hand', () => {
  const files = ['scripts', 'test', 'src'].flatMap(folder => readdirSync(join(dev, folder), { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && /\.m?[jt]s$/u.test(entry.name) && !entry.parentPath.includes('node_modules')).map(entry => join(entry.parentPath, entry.name)));
  // A file whose `root` is the installed engine's folder (async-upload-parent joined `scripts/bake-loader.mjs` to it).
  const engineRootNamed = /\broot\s*=\s*dirname\([^;]*@wildshard\/engine\/package\.json/u;
  const hand = files.filter(file => {
    const text = readFileSync(file, 'utf8');
    return /(?:dirname\(engine\w*\)|engineRoot|engineDir)\s*,\s*['"](?:src\/)?scripts\//u.test(text)
      || (engineRootNamed.test(text) && /join\(root\s*,\s*['"](?:src\/)?scripts\//u.test(text));
  });
  expect(hand).toEqual([]);
});
