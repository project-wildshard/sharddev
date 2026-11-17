// oxlint-disable-next-line import/no-nodejs-modules -- Own bounded author fixtures under the repository scratch root.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve only owned author and output paths.
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { buildProject } from '@wildshard/sdk/project';
import { validateOutputProduct } from '@wildshard/sdk/outputProduct';
import { writeNewProject } from '../../sdk/src/sharddev/newProject';
import { runCli } from '../src/sharddev/cli';
test('new projects build v2 from build-only data without a custom runtime', async () => {
  mkdirSync('tmp', { recursive: true });
  const scratch = mkdtempSync(resolve('tmp', 'template-layout-'));
  try {
    const repo = resolve(scratch, 'new-world'), project=resolve(repo,'src'), output = resolve(scratch, 'output');
    await runCli(['new', repo, 'new-world', '--empty']);
    expect(() => writeNewProject(repo, 'new-world')).toThrow('fresh directory');
    // Add a real platform row through the generated sidecar, as an author would.
    writeFileSync(resolve(project, 'generators/output.ts'), `import { emitPlatformSections } from '@wildshard/sdk/platformSections';
export const output = { platform: emitPlatformSections(new Map([['actors/moves', [
  { id: 'new-world.approach', kind: 'stalk', speed: 1, turn: 4, ground: true,
    above: 0, standOff: 0, ready: { kind: 'range' } }
]]])) };
`);
    await buildProject(project, output, { client: null, copyRuntime: true });
    const product = validateOutputProduct(output);
    expect(product.index.formatVersion).toBe(2);
    expect(product.index.identity.slug).toBe('new-world');
    expect(product.index.runtime).toBeNull();
    expect(product.index.sections.length).toBeGreaterThan(0);
    const moves = product.index.sections.find(section => section.name === 'actors/moves');
    if (moves === undefined) throw new Error('Missing authored move section');
    expect(JSON.parse(readFileSync(resolve(output, moves.path), 'utf8'))).toMatchObject([
      { id: 'new-world.approach', kind: 'stalk', speed: 1, turn: 4, ground: true,
        above: 0, standOff: 0, ready: { kind: 'range' } },
    ]);
    expect(existsSync(resolve(output, 'runtime'))).toBe(false);
    // J186: old monorepo layout lists and README prose are not product contracts.
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});
