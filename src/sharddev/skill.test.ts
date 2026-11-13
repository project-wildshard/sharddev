// oxlint-disable-next-line import/no-nodejs-modules -- Read the shipped skill and guide, and scaffold projects into a scratch folder.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the package root and scratch projects.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GUIDE_SOURCE, SKILL_FILE, SKILL_SOURCE, writeNewProject, writeReferenceProject } from './newProject';

// SHARD-AUTHORING SA14 (J314): the `wildshard` skill is the loop's order, one pointer into GUIDE.md per step.
const ROOT = resolve(import.meta.dirname, '../..');
const skill = readFileSync(SKILL_SOURCE, 'utf8');
const guide = readFileSync(GUIDE_SOURCE, 'utf8');

/** GitHub's anchor for a heading: lower case, punctuation dropped, spaces to hyphens (as guide.test.ts). */
const slug = (heading: string): string => heading.toLowerCase().replaceAll(/[^\w\s-]/gu, '').trim().replaceAll(/\s/gu, '-');
const anchors = new Set([...guide.matchAll(/^#{1,6} (.+)$/gmu)].map(match => slug(match[1] ?? '')));
/** Every concrete `GUIDE.md#anchor` the skill names; `<anchor>` placeholders are not pointers. */
const pointers = [...skill.matchAll(/GUIDE\.md#([a-z0-9-]+)/gu)].map(match => match[1] ?? '');

describe('the wildshard skill', () => {
  it('is a Claude Code skill named wildshard, under 80 lines', () => {
    expect(skill).toMatch(/^---\nname: wildshard\ndescription: .*shard repo.*\n---\n/u);
    expect(skill.split('\n').length).toBeLessThan(80);
  });

  it('points every loop step into a GUIDE.md heading that exists', () => {
    expect(pointers.length).toBeGreaterThanOrEqual(8);
    expect(pointers.filter(anchor => !anchors.has(anchor)), 'skill pointers with no GUIDE.md heading').toEqual([]);
    const steps = skill.split(/^## The loop, in order$/mu)[1]?.split(/^## /mu)[0] ?? '';
    const loop = [...steps.matchAll(/^\d+\. \*\*(.+?)\*\*:(.*(?:\n {3}.*)*)/gmu)];
    expect(loop.map(step => step[1])).toEqual(['new', 'dev', 'check', 'hero', 'prepare', 'upload --channel staging', 'upload --channel prod', 'share']);
    for (const step of loop) expect(step[2], `step ${step[1] ?? ''} has no GUIDE.md pointer`).toMatch(/GUIDE\.md#[a-z0-9-]+/u);
  });

  it('keeps to the glossary and marks what is not built yet as the guide does', () => {
    expect(skill).not.toMatch(/\bproducts?\b|\bcook|\bpublish/iu);
    expect(skill).toMatch(/Not built yet \(SA15\)/u);
    expect(skill).toMatch(/not built yet \(SA36, SA37\)/u);
  });

  it('ships in the package and is written by new, byte for byte', () => {
    const files = (JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as { files: string[] }).files;
    expect(files).toContain('skills');
    const scratch = mkdtempSync(resolve(ROOT, 'tmp', 'skill-new-'));
    try {
      writeReferenceProject(resolve(scratch, 'my-shard'), 'my-shard');
      writeNewProject(resolve(scratch, 'bare-shard'), 'bare-shard');
      for (const project of ['my-shard', 'bare-shard']) expect(readFileSync(resolve(scratch, project, SKILL_FILE), 'utf8')).toBe(skill);
    } finally { rmSync(scratch, { recursive: true, force: true }); }
  });
});
