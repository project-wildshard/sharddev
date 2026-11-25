// oxlint-disable-next-line import/no-nodejs-modules -- Own bounded author fixtures under the repository scratch root.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve only owned author and output paths.
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { buildProject, newProject } from '@wildshard/build/project';
import { SHARDFILE_VERSION } from '@wildshard/format/version';
import { validateOutputProduct } from '@wildshard/sdk/outputProduct';
import { writeNewProject } from '../../sdk/src/sharddev/newProject';
import { runCli } from '../src/sharddev/cli';
test('new projects build the current format from build-only data without a custom runtime', async () => {
  mkdirSync('tmp', { recursive: true });
  const scratch = mkdtempSync(resolve('tmp', 'template-layout-'));
  try {
    const repo = resolve(scratch, 'new-world'), project=resolve(repo,'src'), output = resolve(scratch, 'output');
    await runCli(['new', repo, 'new-world', '--empty']);
    expect(() => writeNewProject(repo, 'new-world')).toThrow('fresh directory');
    // `--empty` is a bare scene (A9), whose generator returns its own output; build-only rows ride the bare shard file's
    // `generators/output.ts` sidecar, so this author starts its `src/` from that fixture.
    rmSync(project, { recursive: true, force: true });
    newProject(project, 'new-world');
    // Add a real platform row through the generated sidecar, as an author would.
    writeFileSync(resolve(project, 'generators/output.ts'), `import { emitPlatformSections } from '@wildshard/sdk/platformSections';
export const output = { platform: emitPlatformSections(new Map([['actors/moves', [
  { id: 'new-world.approach', kind: 'stalk', speed: 1, turn: 4, ground: true,
    above: 0, standOff: 0, ready: { kind: 'range' } }
]]])) };
`);
    await buildProject(project, output, { client: null, copyRuntime: true });
    const product = validateOutputProduct(output);
    expect(product.index.formatVersion).toBe(SHARDFILE_VERSION);
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
// Meta MOSSGATE-ZONE MZ8 (QA 11-19 row 30): Jake's flat mauve sky, painted over the tree crowns, was Cinder Orchard's, a
// pre-J434 `wildshard new` of the legacy Template (no sky dome of its own; its compendium refused at `level.kit`). Mossgate
// draws its sunset dome. A new repo starts from Mossgate's own sky, and the legacy Template cannot be asked for.
test('wildshard new starts from Mossgate\'s sky dome, never the legacy Template', async () => {
  mkdirSync('tmp', { recursive: true });
  const scratch = mkdtempSync(resolve('tmp', 'new-sky-'));
  try {
    const repo = resolve(scratch, 'sky-world');
    await runCli(['new', repo, 'sky-world']);
    const template = resolve(import.meta.dirname, '../../sdk/src/shards/mossgate/generators');
    expect(readFileSync(resolve(repo, 'src/generators/sky.ts'), 'utf8')).toBe(readFileSync(resolve(template, 'sky.ts'), 'utf8'));
    expect(readFileSync(resolve(repo, 'src/generators/world.ts'), 'utf8')).toContain('world.sky(sunsetSky()');
    await expect(runCli(['new', resolve(scratch, 'legacy'), 'legacy', '--template', 'sdk'])).rejects.toThrow(/retired/u);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});
