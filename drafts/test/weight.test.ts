// W15 (J15): drafts cost the deployed game nothing. The game imports nothing from drafts/, ships no draft file, and
// its only trace of a draft is the COMING SOON card's data, whose pictures are absolute URLs loaded when the card shows.
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
  it('a draft card\'s pictures are absolute https URLs, never files in the game build', () => {
    for (const d of DRAFT_TITLES) {
      for (const u of [d.thumb, d.hero]) if (u) expect(u, d.slug).toMatch(/^https:\/\/[^/]+\/.+\.webp$/);
      // the old Vercel site until DRAFTS DR5 points the card at drafts.wildshard.io
      expect(d.url).toMatch(new RegExp(`^https://(wildshard-drafts\\.vercel\\.app|drafts\\.wildshard\\.io)/#/${d.slug}$`));
    }
  });
});
