// oxlint-disable-next-line import/no-nodejs-modules -- This test builds an author project in a folder of its own.
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- This test builds an author project in a folder of its own.
import {join, resolve} from 'node:path';
import {expect, test} from 'vitest';
import {parseManifestMetadata} from '@wildshard/format/minimap';
import {shardFromDiscovery} from '@wildshard/engine/game/shard/discovery';
import {authorManifest, sceneCardUrls} from '@wildshard/sdk/internal/authorManifest';
import {buildProject, newProject} from '@wildshard/build/project';

/** C3: an author's shard has no first-party manifest source, and still wears its own card and enters its own page. */
test('an author project builds with discovery a page revives to itself', async () => {
  mkdirSync('tmp/author-discovery', {recursive: true});
  const root = mkdtempSync(resolve('tmp/author-discovery/case-')), project = join(root, 'project'), out = join(root, 'out');
  try {
    newProject(project, 'trail-side');
    await buildProject(project, out, {outputFormat: 2, client: null});
    const file = join(out, 'mounts/shardfiles/trail-side/discovery.json');
    expect(existsSync(file)).toBe(true);
    const manifest = shardFromDiscovery(JSON.parse(readFileSync(file, 'utf8')));
    expect(manifest).toMatchObject({slug: 'trail-side', name: 'trail-side', status: 'live', spawn: {x: 0, y: 2, z: 0, yaw: 0}});
    expect(manifest.card.thumb).toMatch(/^data:image\/svg\+xml,/u);
  } finally { rmSync(root, {recursive: true, force: true}); }
}, 60_000);

test('a card can\'t carry markup out of a name, and shards differ by seed', () => {
  const shard = (name: string, seed: number): Parameters<typeof authorManifest>[0] => ({identity: {slug: 'a-b', name, seed, author: 'A', revision: 1}, accent: 'sand', spawn: {x: 0, y: 0, z: 0, yaw: 0}}) as unknown as Parameters<typeof authorManifest>[0];
  const row = (name: string, seed: number): ReturnType<typeof parseManifestMetadata> => parseManifestMetadata(authorManifest(shard(name, seed)), 'a-b');
  expect(decodeURIComponent(row('<script>x</script>', 1).card.thumb)).not.toContain('<script');
  expect(row('A', 1).card.thumb).not.toBe(row('A', 2).card.thumb);
});

/** meta NEW-SHARD-E2E F28: `wildshard hero` writes a scene shard's capture to card/<slot>.jpg; the next build's card wears it. */
test('a scene shard\'s captured hero replaces its generated card, slot by slot', async () => {
  mkdirSync('tmp/author-discovery', {recursive: true});
  const root = mkdtempSync(resolve('tmp/author-discovery/case-')), project = join(root, 'project'), out = join(root, 'out');
  try {
    newProject(project, 'trail-side');
    mkdirSync(join(project, 'card'));
    copyFileSync(resolve('../sdk/art/targets/mossgate/t1-01-spawn-yard-fp-front.jpg'), join(project, 'card/thumb.jpg'));
    expect(sceneCardUrls(project, 'trail-side')).toEqual({thumb: '/src/shards/trail-side/card/thumb.jpg'});
    await buildProject(project, out, {outputFormat: 2, client: null});
    const manifest = shardFromDiscovery(JSON.parse(readFileSync(join(out, 'mounts/shardfiles/trail-side/discovery.json'), 'utf8')));
    expect(manifest.card.thumb).toMatch(/^\/shardfiles\/trail-side\/blobs\/image\/[0-9a-f]{64}\.jpg$/u);
    expect(manifest.card.portrait).toMatch(/^data:image\/svg\+xml,/u);
  } finally { rmSync(root, {recursive: true, force: true}); }
}, 60_000);
