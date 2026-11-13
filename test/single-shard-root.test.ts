import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { generatorImportViolation } from '../lint/sdk-plugin.mjs';
import { servedName } from '../scripts/capture-hero.mjs';
import { runCli } from '../src/sharddev/cli';
import { readCookInput } from '../src/sharddev/cookInput';
import { newProject } from '../src/sharddev/project';
import { shardRepoRoot } from '../src/sharddev/shardSource';

// SHARD-AUTHORING SA44: a single-shard repo keeps its source at `src/` (J317), one folder below the repo root, where
// `src/shards/<slug>/` is three. The build's mounts (`public/`), the hero's served name (`out/`) and the author lint
// find the repo and the shard from either layout, with the same result.
const scratch = resolve(import.meta.dirname, '../tmp');
mkdirSync(scratch, { recursive: true });
const base = mkdtempSync(join(scratch, 'single-shard-root-'));
afterAll(() => { rmSync(base, { recursive: true, force: true }); });

const SLUG = 'mount-isle', MOUNT = '/assets/mount-isle/sign.bin';
const LAYOUTS = [['src', 'src'], ['shards', `src/shards/${SLUG}`]] as const;

/** A repo whose shard (at `source`) mounts one `public/` file, as driftwood's `mounts.json` does. */
function repo(name: string, source: string): { root: string; shard: string } {
  // An empty source has no manifest.json, so a src/ source is named by its repo folder (SA16): name that the slug.
  const root = join(base, name, SLUG), shard = join(root, source);
  newProject(shard, SLUG);
  writeFileSync(join(root, 'package.json'), '{"name":"fixture","private":true}\n');
  mkdirSync(join(root, 'public/assets/mount-isle'), { recursive: true });
  writeFileSync(join(root, 'public', MOUNT.slice(1)), 'mounted bytes');
  writeFileSync(join(shard, 'mounts.json'), JSON.stringify({ version: 1, outputs: { [SLUG]: [MOUNT] } }));
  return { root, shard };
}

/** Every output file by its path and content hash. */
function tree(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const name of readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
    const file = join(dir, name);
    if (statSync(file).isFile()) files[relative(dir, file)] = createHash('sha256').update(readFileSync(file)).digest('hex');
  }
  return files;
}

describe('a shard at src/ finds its repo root (SA44)', () => {
  const repos = Object.fromEntries(LAYOUTS.map(([name, source]) => [name, repo(name, source)]));

  it('names the repo root from either layout, and the nearest package.json for any other folder', () => {
    for (const { root, shard } of Object.values(repos)) expect(shardRepoRoot(shard)).toBe(root);
    const loose = join(base, 'loose/packages/world');
    mkdirSync(loose, { recursive: true });
    writeFileSync(join(base, 'loose/package.json'), '{}\n');
    expect(shardRepoRoot(loose)).toBe(join(base, 'loose'));
  });

  it('reads a mounts.json file from the repo public/ at src/, as at src/shards/<slug>/', () => {
    for (const { shard } of Object.values(repos)) {
      expect(readCookInput(shard, SLUG)?.mounts.map(row => [row.url, Buffer.from(row.bytes).toString()])).toEqual([[MOUNT, 'mounted bytes']]);
    }
  });

  it('builds the same shard file from either layout, and the hero reads its served name from out/', async () => {
    const built: Record<string, Record<string, string>> = {};
    for (const [name, { root, shard }] of Object.entries(repos)) {
      const out = join(root, 'out', SLUG);
      await runCli(['build', root, out, '--folder-only']);
      built[name] = tree(out);
      const product = JSON.parse(readFileSync(join(out, 'shard.json'), 'utf8')) as { identity: { name: string } };
      expect(servedName(shard)).toBe(product.identity.name);
    }
    expect(Object.keys(built.src ?? {})).toContain('shard.json');
    expect(built.src).toEqual(built.shards);
  });

  it('lints generators, data and shard.config.ts at src/ with the same verdicts as at src/shards/<slug>/', () => {
    for (const [file, source] of [['data/rows.ts', '@wildshard/engine'], ['data/rows.ts', 'lodash-es'], ['shard.config.ts', '@wildshard/engine/host/x'],
      ['generators/make.ts', '@wildshard/engine'], ['generators/make.ts', 'lodash-es'], ['data/rows.ts', './strings.json'], ['quests/a.ts', 'valibot']] as const) {
      const verdicts = Object.values(repos).map(({ shard }) => generatorImportViolation(join(shard, file), source));
      expect(verdicts[0], `${file} ${source}`).toBe(verdicts[1]);
    }
    const { shard } = repos.src ?? { shard: '' };
    expect(generatorImportViolation(join(shard, 'data/rows.ts'), '@wildshard/engine')).toMatch(/^generator-imports: /u);
    expect(generatorImportViolation(join(shard, 'generators/make.ts'), 'lodash-es')).toBeNull();
    // A repo whose src/ is no shard source checks nothing, as before.
    expect(generatorImportViolation(join(base, 'loose/src/data/rows.ts'), '@wildshard/engine')).toBeNull();
  });
});
