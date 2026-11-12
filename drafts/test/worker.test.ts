// DRAFTS DR4: the drafts Worker reads only drafts/<slug>/<hash>-<full|thumb>.webp from the shared wildshard-records
// bucket. www's site/media/ (and anything else in it) is a 404 that never reaches R2.
import { describe, expect, it } from 'vitest';
import { handle, mediaKey, type Env } from '../worker.ts';

function env(log: string[]): Env {
  return {
    ASSETS: { fetch: async () => new Response('<!doctype html>', { status: 200 }) },
    MEDIA: {
      get: async (key) => {
        log.push(key);
        return key === 'drafts/thin-ice/45553c6a10656f9f-thumb.webp'
          ? { httpEtag: '"e"', body: new Blob(['webp']).stream(), writeHttpMetadata: () => undefined }
          : null;
      },
    },
  };
}

describe('drafts Worker: the drafts/ prefix rule', () => {
  it('maps /media/<slug>/<hash>-<size>.webp to drafts/<slug>/…', () => {
    expect(mediaKey('/media/thin-ice/45553c6a10656f9f-full.webp')).toBe('drafts/thin-ice/45553c6a10656f9f-full.webp');
    expect(mediaKey('/media/thin-ice/45553c6a10656f9f-thumb.webp')).toBe('drafts/thin-ice/45553c6a10656f9f-thumb.webp');
  });

  it.each([
    '/media/site/media/x.mp4',
    '/media/site/media/trailer-1080-9fc85807.mp4',
    '/media/thin-ice/../site/media/x.mp4',
    '/media/thin-ice/%2e%2e/x-full.webp',
    '/media/thin-ice/45553c6a10656f9f-full.png',
    '/media/thin-ice/45553c6a10656f9f.webp',
    '/media/Thin-Ice/45553c6a10656f9f-full.webp',
    '/media/thin-ice/sub/45553c6a10656f9f-full.webp',
    '/media/45553c6a10656f9f-full.webp',
    '/media/',
  ])('refuses %s', (path) => {
    expect(mediaKey(path)).toBeNull();
  });

  it('a path outside drafts/ answers 404 without touching R2', async () => {
    const log: string[] = [];
    const res = await handle(new Request('https://drafts.wildshard.io/media/site/media/x.mp4'), env(log));
    expect(res.status).toBe(404);
    expect(log).toEqual([]);
  });

  it('a draft picture comes from R2, immutable and noindex', async () => {
    const log: string[] = [];
    const res = await handle(new Request('https://drafts.wildshard.io/media/thin-ice/45553c6a10656f9f-thumb.webp'), env(log));
    expect(res.status).toBe(200);
    expect(log).toEqual(['drafts/thin-ice/45553c6a10656f9f-thumb.webp']);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('cache-control')).toContain('immutable');
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
  });

  it('a missing picture is a 404; a write is refused', async () => {
    const log: string[] = [];
    expect((await handle(new Request('https://drafts.wildshard.io/media/thin-ice/0000000000000000-full.webp'), env(log))).status).toBe(404);
    expect((await handle(new Request('https://drafts.wildshard.io/media/thin-ice/45553c6a10656f9f-thumb.webp', { method: 'PUT' }), env(log))).status).toBe(404);
    expect(log).toEqual(['drafts/thin-ice/0000000000000000-full.webp']);
  });

  it('pages come from the static assets, revalidated', async () => {
    const res = await handle(new Request('https://drafts.wildshard.io/'), env([]));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
  });
});
