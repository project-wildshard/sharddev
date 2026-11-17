// Phone copies and thumbnails in R2 (WORLDCLAW-TOOLS W2, J27; DRAFTS DR3, which moved them off Vercel Blob): each
// original is converted once, uploaded once to `wildshard-records` under a content-hashed key
// (`drafts/<slug>/<hash>-{full,thumb}.webp`), and remembered in drafts/shards/<slug>/images.json (committed), so a
// re-publish with no new art uploads nothing. The upload is `wrangler r2 object put` on wrangler's own login: no key
// is read or printed here.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { mediaKey } from '../src/atlas.ts';

export interface Copy {
  /** the R2 key in BUCKET */
  key: string;
  bytes: number;
}

/** The private bucket the drafts Worker reads `drafts/` from (DRAFTS D2; www reads `site/media/` from it). */
export const BUCKET = 'wildshard-records';

export interface ImageEntry {
  hash: string;
  enc: string;
  w: number;
  h: number;
  full: Copy;
  thumb: Copy;
}

export type ImageIndex = Record<string, ImageEntry>;

/** The phone copy keeps the original's pixels; the thumbnail is as big as a grid tile on the phone (a third of a 402 pt
 * wide iPhone screen at 3× ≈ 402 px). Both use cwebp's default quality (J65: no invented sizes). `ENC` names the recipe:
 * an index entry made with another recipe is re-made. */
export const THUMB_EDGE = 402;
export const ENC = 'orig+402';

export function hashFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 16);
}

/** Width and height from a JPEG, PNG or WebP header. */
export function imageSize(buf: Uint8Array): { w: number; h: number } {
  const u16be = (o: number): number => ((buf[o] ?? 0) << 8) | (buf[o + 1] ?? 0);
  const u32be = (o: number): number => ((u16be(o) << 16) >>> 0) + u16be(o + 2);
  const u16le = (o: number): number => (buf[o] ?? 0) | ((buf[o + 1] ?? 0) << 8);
  if (buf[0] === 0x89 && buf[1] === 0x50) return { w: u32be(16), h: u32be(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2;
    while (o < buf.length) {
      if (buf[o] !== 0xff) { o++; continue; }
      const marker = buf[o + 1] ?? 0;
      const len = u16be(o + 2);
      // SOF0..SOF15 except DHT (C4), JPG (C8), DAC (CC)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { w: u16be(o + 7), h: u16be(o + 5) };
      }
      o += 2 + len;
    }
  }
  if (buf[8] === 0x57 && buf[9] === 0x45) {
    const chunk = String.fromCodePoint(buf[12] ?? 0, buf[13] ?? 0, buf[14] ?? 0, buf[15] ?? 0);
    if (chunk === 'VP8 ') return { w: u16le(26) & 0x3fff, h: u16le(28) & 0x3fff };
    if (chunk === 'VP8L') {
      const b = (i: number): number => buf[21 + i] ?? 0;
      return { w: 1 + (((b(1) & 0x3f) << 8) | b(0)), h: 1 + (((b(3) & 0xf) << 10) | (b(2) << 2) | ((b(1) & 0xc0) >> 6)) };
    }
    if (chunk === 'VP8X') return { w: 1 + (u16le(24) | ((buf[26] ?? 0) << 16)), h: 1 + (u16le(27) | ((buf[29] ?? 0) << 16)) };
  }
  throw new Error('imageSize: not a JPEG, PNG or WebP');
}

/** The conversions' scratch folder: the repo's gitignored tmp/, never the system temp dir (meta AGENTS.md "Disk"). */
export const SCRATCH = resolve(import.meta.dirname, '..', '..', 'tmp', 'drafts-images');

/** Converts `src` to a WebP, scaled to at most `edge` px on its long side when given; returns its path in a scratch folder. */
export function toWebp(src: string, hash: string, edge: number | null, dims: { w: number; h: number }): string {
  const dir = SCRATCH;
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${hash}-${ENC}-${edge ?? 'orig'}.webp`);
  if (existsSync(out)) return out;
  const resize: string[] = [];
  const long = Math.max(dims.w, dims.h);
  if (edge !== null && long > edge) {
    resize.push('-resize', String(Math.max(1, Math.round((dims.w * edge) / long))), String(Math.max(1, Math.round((dims.h * edge) / long))));
  }
  execFileSync('cwebp', ['-quiet', '-m', '6', ...resize, src, '-o', out]);
  return out;
}

/** Puts one WebP in R2 at `key` (immutable: its name is its content's hash). */
export function upload(path: string, key: string): Copy {
  execFileSync('wrangler', [
    'r2', 'object', 'put', `${BUCKET}/${key}`, '--file', path, '--content-type', 'image/webp',
    '--cache-control', 'public, max-age=31536000, immutable', '--remote',
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  return { key, bytes: statSync(path).size };
}

/** Makes and uploads the copies of every source not yet in `index` (or whose bytes changed). Returns how many uploaded. */
export async function publishImages(slug: string, sources: string[], index: ImageIndex, log: (s: string) => void, root: string): Promise<number> {
  const todo = sources.filter((s) => {
    const e = index[s];
    return !e || e.enc !== ENC || e.hash !== hashFile(join(root, s));
  });
  if (todo.length === 0) return 0;
  let done = 0;
  const work = async (src: string): Promise<void> => {
    const file = join(root, src);
    const hash = hashFile(file);
    const dims = imageSize(readFileSync(file));
    const full = toWebp(file, hash, null, dims);
    const thumb = toWebp(file, hash, THUMB_EDGE, dims);
    const f = upload(full, mediaKey(slug, hash, 'full'));
    const t = upload(thumb, mediaKey(slug, hash, 'thumb'));
    index[src] = { hash, enc: ENC, w: dims.w, h: dims.h, full: f, thumb: t };
    done++;
    if (done % 10 === 0 || done === todo.length) log(`  uploaded ${done} / ${todo.length}`);
  };
  const queue = [...todo];
  const lanes = Array.from({ length: 6 }, async () => {
    for (let src = queue.shift(); src !== undefined; src = queue.shift()) await work(src);
  });
  await Promise.all(lanes);
  return done;
}
