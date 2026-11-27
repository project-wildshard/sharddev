import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { runCli } from '../src/sharddev/cli';
import { newProject } from '@wildshard/build/project';
import { KIT_ART_ROOT } from '@wildshard/kit/art';
// oxlint-disable-next-line import/extensions -- the dev CLI's own script, as shards run it
import { runWildshard } from '../scripts/wildshard.mjs';

// SF2 (meta standalone shardfiles, Jake SD1): a shard names the kit's shared ground set under its own mount path and does not
// hold it; the build carries the kit's bytes in the shardfile, and nothing in it names an engine URL.
const scratch = resolve(import.meta.dirname, '../tmp');
mkdirSync(scratch, { recursive: true });
const base = mkdtempSync(join(scratch, 'kit-art-pack-'));
afterAll(() => { rmSync(base, { recursive: true, force: true }); });

const SLUG = 'kit-meadow', MAPS = ['diffuse.jpg', 'nor_gl.jpg', 'arm.jpg'] as const;
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

// SF7: `wildshard build` runs the CLI as one bundle under the repo's tmp/, where the kit's own import.meta.url once pointed
// (Nine Dragon's sky missed the kit); both the source CLI and that bundle must carry the kit's bytes.
const RUNNERS = [['the source CLI', runCli], ['the bundled CLI', runWildshard]] as const;

describe.each(RUNNERS)('a shard naming the kit\'s leafy_grass (SF2), built by %s', (name, run) => {
  it('carries the kit\'s bytes under its own mount path and names no engine URL', async () => {
    const root = join(base, `${SLUG}-${name.split(' ')[1] ?? name}`), shard = join(root, 'src');
    newProject(shard, SLUG);
    writeFileSync(join(root, 'package.json'), '{"name":"fixture","private":true}\n');
    const urls = MAPS.map(map => `/assets/${SLUG}/tex/leafy_grass/${map}`);
    writeFileSync(join(shard, 'mounts.json'), JSON.stringify({ version: 1, outputs: { [SLUG]: urls } }));
    const out = join(root, 'out', SLUG);
    await run(['build', root, out, '--folder-only']);
    const cook = JSON.parse(readFileSync(join(out, 'cook.json'), 'utf8')) as { mounts: { url: string; path: string; hash: string }[] };
    expect(cook.mounts.map(row => row.url).filter(url => url.startsWith('/assets/')).sort()).toEqual([...urls].sort());
    for (const map of MAPS) {
      const row = cook.mounts.find(mount => mount.url.endsWith(`/${map}`));
      const kit = readFileSync(`${KIT_ART_ROOT}tex/leafy_grass/${map}`);
      expect(sha(readFileSync(join(out, row?.path ?? 'missing')))).toBe(sha(kit));
    }
    const named = readFileSync(join(out, 'cook.json'), 'utf8') + readFileSync(join(out, 'shard.json'), 'utf8');
    expect(named).not.toMatch(/"\/assets\/(?:tex|hdri|gpu)\//u);
  }, 300_000);
});
