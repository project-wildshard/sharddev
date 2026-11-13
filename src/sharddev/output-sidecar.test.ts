import { afterEach, expect, test } from 'vitest';
// oxlint-disable-next-line import/no-nodejs-modules -- The test owns bounded local author fixtures.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Fixtures remain under the ignored test scratch root.
import { resolve } from 'node:path';
import { build } from 'vite';
import { emptyShardfile } from './author';
import { readProjectAssets } from './project';

const directories: string[] = [];
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true }); });
test('CLI sidecars emit checked sections without entering browser config imports', async () => {
  mkdirSync('tmp', { recursive: true });
  const path = mkdtempSync(resolve('tmp', 'output-sidecar-')); directories.push(path);
  const config = `export default ${JSON.stringify(emptyShardfile({ slug: 'sidecar-test', name: 'Sidecar', author: 'Test', revision: 1, seed: 3 }))};\n`;
  writeFileSync(resolve(path, 'shard.config.ts'), config);
  mkdirSync(resolve(path, 'generators'));
  writeFileSync(resolve(path, 'generators/output.ts'), `
import {emitPlatformSections} from '@wildshard/sdk/platformSections';
export const output={platform:emitPlatformSections(new Map([['ui/strings',{answer:'42'}]]))};
`);
  const loaded = await readProjectAssets(path);
  expect(loaded.output.platform?.sections.map(row => row.name)).toEqual(['ui/strings']);
  const browser = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
    lib: { entry: resolve(path, 'shard.config.ts'), formats: ['es'], fileName: 'browser-config' } } });
  const first = Array.isArray(browser) ? browser[0] : browser;
  if (first === undefined || !('output' in first)) throw new Error('Browser config did not build');
  const code = first.output.filter(row => row.type === 'chunk').map(row => row.code).join('\n');
  expect(code).not.toContain('createHash'); expect(code).not.toContain('answer');
  writeFileSync(resolve(path, 'shard.config.ts'), `${config}export const output={};\n`);
  await expect(readProjectAssets(path)).rejects.toThrow('unambiguous');
});
