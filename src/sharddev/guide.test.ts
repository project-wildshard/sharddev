// oxlint-disable-next-line import/no-nodejs-modules -- Read the shipped guide and scaffold projects into a scratch folder.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Ask the real CLI for its help, as an author would.
import { spawnSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the package root and scratch projects.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GUIDE_SOURCE, writeNewProject, writeReferenceProject } from './newProject';
import { GUIDE_FILE, REFUSAL_ANCHORS } from './refusals';

// SHARD-AUTHORING SA13 (J314, J317): GUIDE.md is the author's manual, shipped in the package and copied by `new`.
const ROOT = resolve(import.meta.dirname, '../..');
const guide = readFileSync(GUIDE_SOURCE, 'utf8');

/** The verbs `wildshard --help` lists, read from the CLI's own output so help's wording can change freely. */
function helpVerbs(): string[] {
  const help = spawnSync(process.execPath, [resolve(ROOT, 'bin/wildshard.mjs'), '--help'], { encoding: 'utf8' });
  expect(help.status, help.stderr).toBe(0);
  const commands = help.stdout.split(/^Commands:$/mu)[1]?.split(/^Options:$/mu)[0] ?? '';
  return [...new Set([...commands.matchAll(/^ {2}([a-z][a-z-]*)(?= |$)/gmu)].map(match => match[1] ?? ''))];
}

/** GitHub's anchor for a heading: lower case, punctuation dropped, spaces to hyphens. */
const slug = (heading: string): string => heading.toLowerCase().replaceAll(/[^\w\s-]/gu, '').trim().replaceAll(/\s/gu, '-');
const anchors = new Set([...guide.matchAll(/^#{1,6} (.+)$/gmu)].map(match => slug(match[1] ?? '')));

describe('GUIDE.md', () => {
  it('names every verb wildshard --help lists', () => {
    const verbs = helpVerbs();
    expect(verbs.length).toBeGreaterThanOrEqual(5);
    const missing = verbs.filter(verb => !new RegExp(`\`wildshard ${verb}[ \`]`, 'u').test(guide));
    expect(missing, `verbs in wildshard --help with no \`wildshard <verb>\` in ${GUIDE_FILE}`).toEqual([]);
  });

  it('has the seven sections and one heading per refusal anchor', () => {
    for (const section of [1, 2, 3, 4, 5, 6, 7]) expect(guide).toMatch(new RegExp(`^## ${String(section)}\\. `, 'mu'));
    expect(REFUSAL_ANCHORS.filter(anchor => !anchors.has(anchor))).toEqual([]);
  });

  it('keeps to the glossary: check in the loop, no retired words', () => {
    expect(guide).toMatch(/^The loop is: `new`, `dev`, `check`, `hero`, `upload --channel staging`/mu);
    // `hero-not-in-product` is a refusal id (refusals.ts); ids are stable, the prose never says product.
    expect(guide.replaceAll('hero-not-in-product', '')).not.toMatch(/\bproducts?\b|\bcook/iu);
  });

  it('ships in the package and is written by new, byte for byte', () => {
    const files = (JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as { files: string[] }).files;
    expect(files).toContain(GUIDE_FILE);
    const scratch = mkdtempSync(resolve(ROOT, 'tmp', 'guide-new-'));
    try {
      writeReferenceProject(resolve(scratch, 'my-shard'), 'my-shard');
      writeNewProject(resolve(scratch, 'bare-shard'), 'bare-shard');
      for (const project of ['my-shard', 'bare-shard']) expect(readFileSync(resolve(scratch, project, GUIDE_FILE), 'utf8')).toBe(guide);
    } finally { rmSync(scratch, { recursive: true, force: true }); }
  });
});
