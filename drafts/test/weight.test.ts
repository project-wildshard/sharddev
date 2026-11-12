// W15 (J15): drafts cost the deployed game nothing. The game imports nothing from drafts/, ships no draft file, and
// its only trace of a draft is the COMING SOON card in engine: its data, two small key-art copies in engine's
// public/drafts/ (OFF-VERCEL OV10) and a button to https://drafts.wildshard.io (DRAFTS DR5).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DRAFT_TITLES } from '@wildshard/engine/game/draftTitles';

const ROOT = resolve(import.meta.dirname, '..', '..');

function files(dir: string, re: RegExp): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p, re));
    else if (re.test(name)) out.push(p);
  }
  return out;
}

describe('drafts cost the game nothing (J15)', () => {
  it('no game module imports from drafts/', () => {
    const offenders = files(join(ROOT, 'src'), /\.(ts|js|css)$/).filter((p) => /from\s+['"][^'"]*\bdrafts\//.test(readFileSync(p, 'utf8')));
    expect(offenders).toEqual([]);
  });
  it('the game\'s public/ holds no draft files', () => {
    expect(existsSync(join(ROOT, 'public', 'draft'))).toBe(false);
    expect(existsSync(join(ROOT, 'public', 'drafts'))).toBe(false);
  });
  it('a draft card\'s pictures are the game\'s own key-art copies and its button opens drafts.wildshard.io', () => {
    // CI installs engine at package.json's pin, which predates DR5 until the next engine bump: that card still has
    // the Blob pictures and the Vercel link, so it is accepted whole, never mixed. Drop `old` with that bump.
    const old = (d: (typeof DRAFT_TITLES)[number]): boolean =>
      [d.thumb, d.hero].every((u) => u.startsWith('https://64yencbq8tncsy39.public.blob.vercel-storage.com/draft/'))
      && d.url === `https://wildshard-drafts.vercel.app/#/${d.slug}`;
    for (const d of DRAFT_TITLES) {
      if (old(d)) continue;
      expect(d.thumb, d.slug).toMatch(new RegExp(`^/drafts/${d.slug}/[0-9a-f]+-thumb\\.webp$`));
      expect(d.hero, d.slug).toMatch(new RegExp(`^/drafts/${d.slug}/[0-9a-f]+-full\\.webp$`));
      expect(d.url).toBe(`https://drafts.wildshard.io/#/${d.slug}`);
    }
  });
});
