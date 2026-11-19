// SHARD-AUTHORING SA43: `wildshard prepare` with no --base serves engine's preparation client around the candidate.
import { afterEach, expect, test } from 'vitest';
// oxlint-disable-next-line import/no-nodejs-modules -- The test owns its fixture folders under the ignored tmp root.
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Fixture paths.
import { dirname, join, resolve } from 'node:path';
import { clientPage } from '../src/sharddev/clientPage';

interface Preview { url: string; slug: string; close: () => Promise<void>; served: () => { release: boolean; serverWorker: boolean } }
interface PreviewWorld {
  readonly signed: string;
  stamp: (page: string) => string;
  move: (folder: string, slug: string, client: string) => Promise<void>;
  close: () => Promise<void>;
}
type Serve = (client: string, dir: string, ports: { clientPage: typeof clientPage; online?: {
  releasePath: string; open: (origin: string) => Promise<PreviewWorld>;
} }) => Promise<Preview>;
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function folder(files: Record<string, string>): string {
  mkdirSync('tmp', { recursive: true });
  const root = mkdtempSync(resolve('tmp', 'preparation-preview-')); roots.push(root);
  for (const [path, text] of Object.entries(files)) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); }
  return root;
}

test('the page carries the candidate inline; its files are served beside the page and where a release serves them', async () => {
  const header = JSON.stringify({ identity: { slug: 'isle', name: 'Isle' }, note: '</script>' });
  const client = folder({ 'index.html': '<html><head></head><body></body></html>', 'version.json': '{"preparationOnly":true}', 'shard.json': 'client' });
  const candidate = folder({ 'shard.json': `${header}\n`, 'sections/a.json': 'A' });
  const outside = folder({ 'secret.txt': 'no' });
  symlinkSync(join(outside, 'secret.txt'), join(candidate, 'link.txt'));
  const { preparationPreview } = await import('../scripts/preparation-preview.mjs') as { preparationPreview: Serve };
  const preview = await preparationPreview(client, candidate, { clientPage });
  const get = async (path: string): Promise<[number, string]> => { const response = await fetch(new URL(path, preview.url)); return [response.status, await response.text()]; };
  try {
    expect(preview.slug).toBe('isle');
    const [, page] = await get('/');
    expect(page).toContain('<script id="ws-shardfile" type="application/json">');
    expect(page).toContain(String.raw`</script>`);
    expect(await get('/shardfiles/isle/shard.json')).toEqual([200, `${header}\n`]);
    expect(await get('/sections/a.json')).toEqual([200, 'A']);
    expect(await get('/shard.json')).toEqual([200, 'client']);
    expect(await get('/version.json')).toEqual([200, '{"preparationOnly":true}']);
    expect((await get('/shardfiles/isle/link.txt'))[0]).toBe(404);
    expect((await get('/shardfiles/isle/%2e%2e/%2e%2e/etc/hosts'))[0]).toBe(404);
  } finally { await preview.close(); }
});

test("S12f: the candidate's mounts are served at their URLs, from mounts/ or the blob cook.json names", async () => {
  const header = JSON.stringify({ identity: { slug: 'isle', name: 'Isle' } });
  const cook = JSON.stringify({ version: 1, mounts: [
    { url: '/shardfiles/isle/discovery.json', path: 'mounts/shardfiles/isle/discovery.json' },
    { url: '/assets/isle/rock.glb', path: 'blobs/glb/abc.glb' },
    { url: '/assets/isle/escape.bin', path: '../outside.bin' },
  ] });
  const client = folder({ 'index.html': '<html><head></head><body></body></html>', 'assets/isle/rock.glb': 'client rock' });
  const candidate = folder({ 'shard.json': header, 'cook.json': cook, 'mounts/shardfiles/isle/discovery.json': '{"d":1}', 'blobs/glb/abc.glb': 'rock' });
  const { preparationPreview } = await import('../scripts/preparation-preview.mjs') as { preparationPreview: Serve };
  const preview = await preparationPreview(client, candidate, { clientPage });
  const get = async (path: string): Promise<[number, string]> => { const response = await fetch(new URL(path, preview.url)); return [response.status, await response.text()]; };
  try {
    expect(await get('/shardfiles/isle/discovery.json')).toEqual([200, '{"d":1}']);
    expect(await get('/assets/isle/rock.glb')).toEqual([200, 'rock']);
    expect((await get('/assets/isle/escape.bin'))[0]).toBe(404);
  } finally { await preview.close(); }
});

test('the online preview serves its release while the local world starts', async () => {
  const client = folder({ 'index.html': '<html><head></head><body></body></html>' });
  const candidate = folder({ 'shard.json': '{"identity":{"slug":"isle"}}' });
  const { preparationPreview } = await import('../scripts/preparation-preview.mjs') as { preparationPreview: Serve };
  let closed = false;
  const preview = await preparationPreview(client, candidate, { clientPage, online: {
    releasePath: '/__dev/release.json',
    open: origin => Promise.resolve({
      signed: '{"body":"exact release"}',
      stamp: page => page.replace('<head>', '<head><script>globalThis.__WS_WORLD__={};</script>'),
      move: async (product, slug, servedClient) => {
        expect([product, slug, servedClient]).toEqual([candidate, 'isle', client]);
        expect(await (await fetch(origin + '/__dev/release.json')).json()).toEqual({ body: 'exact release' });
      },
      close: () => { closed = true; return Promise.resolve(); },
    }),
  } });
  try {
    expect(await (await fetch(preview.url)).text()).toContain('globalThis.__WS_WORLD__={};');
    expect(preview.served()).toEqual({ release: true, serverWorker: false });
    await fetch(preview.url + 'assets/serverWorker-abc.js');
    expect(preview.served()).toEqual({ release: true, serverWorker: true });
  } finally { await preview.close(); }
  expect(closed).toBe(true);
});
