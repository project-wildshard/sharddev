// The drafts site's Worker (meta DRAFTS-PLAN DR4, D2, D3): `wildshard-drafts` at https://drafts.wildshard.io. Static
// assets do the work; this only:
// - serves the draft pictures from R2 at /media/<slug>/<hash>-<full|thumb>.webp (key drafts/<slug>/<hash>-….webp);
// - sets the cache headers the Vercel project's public/vercel.json used to set, and keeps search engines out.
// The bucket is the private wildshard-records, shared with wildshard-www (site/media/): only a content-hashed WebP under
// drafts/ is ever read, so /media/site/media/x.mp4 is a 404 that never reaches R2.

interface Fetcher {
  fetch: (request: Request) => Promise<Response>;
}

interface R2Object {
  readonly httpEtag: string;
  readonly body?: ReadableStream;
  writeHttpMetadata: (headers: Headers) => void;
}

interface R2Bucket {
  get: (key: string, options: { onlyIf: Headers }) => Promise<R2Object | null>;
}

export interface Env {
  readonly ASSETS: Fetcher;
  readonly MEDIA: R2Bucket;
}

const MEDIA = /^\/media\/(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*)\/(?<name>[0-9a-f]{8,64}-(?:full|thumb)\.webp)$/u;
const YEAR = 'public, max-age=31536000, immutable';

const CACHE: readonly (readonly [string, string])[] = [
  ['/assets/', YEAR],
  ['/fonts/', YEAR],
];

function cacheFor(path: string): string {
  const hit = CACHE.find(([prefix]) => path.startsWith(prefix));
  return hit ? hit[1] : 'public, max-age=0, must-revalidate';
}

/** The R2 key a request path reads, or null: only drafts/<slug>/<hash>-<full|thumb>.webp, nothing else in the bucket. */
export function mediaKey(path: string): string | null {
  const m = MEDIA.exec(path)?.groups;
  return m?.['slug'] !== undefined && m['name'] !== undefined ? `drafts/${m['slug']}/${m['name']}` : null;
}

async function media(request: Request, env: Env, key: string): Promise<Response> {
  const object = await env.MEDIA.get(key, { onlyIf: request.headers });
  if (!object) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('content-type', 'image/webp');
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', YEAR);
  if (!object.body) return new Response(null, { status: 304, headers });
  return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
}

export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  let response: Response;
  if (url.pathname.startsWith('/media/')) {
    const key = request.method === 'GET' || request.method === 'HEAD' ? mediaKey(url.pathname) : null;
    response = key === null ? new Response('Not found', { status: 404 }) : await media(request, env, key);
  } else {
    const asset = await env.ASSETS.fetch(request);
    response = new Response(asset.body, asset);
    if (asset.ok) response.headers.set('cache-control', cacheFor(url.pathname));
  }
  // Public to anyone with the link (J67, D3), never in a search index (as on Vercel).
  response.headers.set('x-robots-tag', 'noindex');
  return response;
}

const worker = { fetch: handle };

// oxlint-disable-next-line import/no-default-export -- the Workers runtime loads the module's default export
export default worker;
