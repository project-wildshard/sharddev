import { afterEach, expect, test } from 'vitest';
// oxlint-disable-next-line import/no-nodejs-modules -- The test owns bounded local author fixtures.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Fixtures remain under the ignored test scratch root.
import { resolve } from 'node:path';
import { bundle } from '@wildshard/sdk/internal/bundle';
import { emptyShardfile } from '@wildshard/sdk/author';
import { readProjectAssets } from './project';

const directories: string[] = [];
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true }); });
test('CLI sidecars emit checked sections without entering browser config imports', async () => {
  mkdirSync('tmp', { recursive: true });
  const path = mkdtempSync(resolve('tmp', 'output-sidecar-')); directories.push(path);
  const config = `export default ${JSON.stringify(emptyShardfile({ slug: 'sidecar-test', name: 'Sidecar', author: 'Test', saveRevision: 1, seed: 3 }))};\n`;
  writeFileSync(resolve(path, 'shard.config.ts'), config);
  mkdirSync(resolve(path, 'generators'));
  writeFileSync(resolve(path, 'generators/output.ts'), `
import {emitPlatformSections} from '@wildshard/sdk/platformSections';
export const output={platform:emitPlatformSections(new Map([['ui/strings',{answer:'42'}]]))};
`);
  const loaded = await readProjectAssets(path);
  expect(loaded.output.platform?.sections.map(row => row.name)).toEqual(['ui/strings']);
  const browser = await bundle({ entry: resolve(path, 'shard.config.ts'), fileName: 'browser-config' });
  const first = browser;
  const code = first.output.filter(row => row.type === 'chunk').map(row => row.code).join('\n');
  expect(code).not.toContain('createHash'); expect(code).not.toContain('answer');
  writeFileSync(resolve(path, 'shard.config.ts'), `${config}export const output={};\n`);
  await expect(readProjectAssets(path)).rejects.toThrow('unambiguous');
});
