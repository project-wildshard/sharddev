// Phone copies and thumbnails on Vercel Blob (WORLDCLAW-TOOLS W2, J27, J28): each original is converted once, uploaded
// once under a content-hashed name, and remembered in drafts/shards/<slug>/images.json (committed), so a re-publish with
// no new art uploads nothing.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

export interface Copy {
  url: string;
  bytes: number;
}

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

/** Converts `src` to a WebP, scaled to at most `edge` px on its long side when given; returns its path in a scratch folder. */
export function toWebp(src: string, hash: string, edge: number | null, dims: { w: number; h: number }): string {
  const dir = join(tmpdir(), 'wildshard-drafts');
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

export function blobToken(): string {
  const env = process.env['BLOB_READ_WRITE_TOKEN'];
  if (env) return env;
  const file = join(homedir(), '.config', 'wildshard-drafts', 'blob.env');
  if (existsSync(file)) {
    const m = /BLOB_READ_WRITE_TOKEN="?([^"\n]+)"?/.exec(readFileSync(file, 'utf8'));
    if (m?.[1]) return m[1];
  }
  throw new Error('no Blob token: set BLOB_READ_WRITE_TOKEN or write ~/.config/wildshard-drafts/blob.env (drafts/README.md)');
}

export async function upload(path: string, pathname: string, token: string): Promise<Copy> {
  const { put } = await import('@vercel/blob');
  const body = readFileSync(path);
  const res = await put(pathname, body, {
    access: 'public',
    token,
    contentType: 'image/webp',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 31_536_000,
  });
  return { url: res.url, bytes: statSync(path).size };
}

/** Makes and uploads the copies of every source not yet in `index` (or whose bytes changed). Returns how many uploaded. */
export async function publishImages(slug: string, sources: string[], index: ImageIndex, log: (s: string) => void): Promise<number> {
  const todo = sources.filter((s) => {
    const e = index[s];
    return !e || e.enc !== ENC || e.hash !== hashFile(s);
  });
  if (todo.length === 0) return 0;
  const token = blobToken();
  let done = 0;
  const work = async (src: string): Promise<void> => {
    const hash = hashFile(src);
    const dims = imageSize(readFileSync(src));
    const full = toWebp(src, hash, null, dims);
    const thumb = toWebp(src, hash, THUMB_EDGE, dims);
    const [f, t] = await Promise.all([
      upload(full, `draft/${slug}/${hash}-full.webp`, token),
      upload(thumb, `draft/${slug}/${hash}-thumb.webp`, token),
    ]);
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
