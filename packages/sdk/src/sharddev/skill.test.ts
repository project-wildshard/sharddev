// oxlint-disable-next-line import/no-nodejs-modules -- Read the shipped skills and guide, and scaffold projects into a scratch folder.
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the package root and scratch projects.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeNewProject, writeReferenceProject, writeShardRepo } from './newProject';
import { GUIDE_SOURCE, SKILL_FILE, SKILL_SOURCE, SKILLS, skillFile, skillSource } from './agentFiles';

// SHARD-AUTHORING SA14, SA27 (J314 Q6): the core `wildshard` skill is the loop's order, one pointer into GUIDE.md per
// step; its three siblings are as short and point into GUIDE.md the same way.
const ROOT = resolve(import.meta.dirname, '../..');
const skill = readFileSync(SKILL_SOURCE, 'utf8');
const guide = readFileSync(GUIDE_SOURCE, 'utf8');
const skills = new Map(SKILLS.map(name => [name, readFileSync(skillSource(name), 'utf8')]));

/** GitHub's anchor for a heading: lower case, punctuation dropped, spaces to hyphens (as guide.test.ts). */
const slug = (heading: string): string => heading.toLowerCase().replaceAll(/[^\w\s-]/gu, '').trim().replaceAll(/\s/gu, '-');
const anchors = new Set([...guide.matchAll(/^#{1,6} (.+)$/gmu)].map(match => slug(match[1] ?? '')));
/** Every concrete `GUIDE.md#anchor` a skill names; `<anchor>` placeholders are not pointers. */
const pointersOf = (text: string): string[] => [...text.matchAll(/GUIDE\.md#([a-z0-9-]+)/gu)].map(match => match[1] ?? '');
const pointers = pointersOf(skill);

describe('the wildshard skills', () => {
  it('ships exactly the four skills in skills/', () => {
    expect(readdirSync(resolve(ROOT, 'skills')).toSorted()).toEqual([...SKILLS].toSorted());
  });

  it.each(SKILLS)('%s is a Claude Code skill of that name, under 80 lines', name => {
    const text = skills.get(name) ?? '';
    expect(text).toMatch(new RegExp(`^---\\nname: ${name}\\ndescription: .*\\n---\\n`, 'u'));
    expect(text.split('\n').length).toBeLessThan(80);
  });

  it.each(SKILLS)('%s points only at GUIDE.md headings that exist', name => {
    const named = pointersOf(skills.get(name) ?? '');
    expect(named.length).toBeGreaterThanOrEqual(5);
    expect(named.filter(anchor => !anchors.has(anchor)), `${name} pointers with no GUIDE.md heading`).toEqual([]);
  });

  it.each(SKILLS)('%s keeps to the glossary', name => {
    const text = skills.get(name) ?? '';
    expect(text).not.toMatch(/\bproducts?\b|\bcook|\bpublish/iu);
    expect(text).toMatch(/shard source/u);
  });

  it('wildshard: every loop step points into GUIDE.md, in order', () => {
    expect(pointers.length).toBeGreaterThanOrEqual(8);
    const steps = skill.split(/^## The loop, in order$/mu)[1]?.split(/^## /mu)[0] ?? '';
    const loop = [...steps.matchAll(/^\d+\. \*\*(.+?)\*\*:(.*(?:\n {3}.*)*)/gmu)];
    expect(loop.map(step => step[1])).toEqual(['new', 'dev', 'check', 'hero', 'prepare', 'upload --channel staging', 'upload --channel prod', 'share']);
    for (const step of loop) expect(step[2], `step ${step[1] ?? ''} has no GUIDE.md pointer`).toMatch(/GUIDE\.md#[a-z0-9-]+/u);
  });

  it('marks what is not built yet as the guide does', () => {
    // SA15: dev works for an installed sdk, so its step names the command, not a row.
    expect(skill).not.toMatch(/SA15/u);
    expect(skill).toMatch(/\*\*dev\*\*: `wildshard dev \.`/u);
    expect(skill).toMatch(/not built yet \(SA36, SA37\)/u);
    // J314 Q27 retired the verb `upgrade`; the pin move is `update --pins` (SA18).
    expect(skills.get('wildshard-upgrade')).toMatch(/`wildshard update --pins` does the move/u);
    expect(skills.get('wildshard-upgrade')).not.toMatch(/not built yet/u);
  });

  it('ships in the package and is written by new, byte for byte, for every template', () => {
    const files = (JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as { files: string[] }).files;
    expect(files).toContain('skills');
    const scratch = mkdtempSync(resolve(ROOT, 'tmp', 'skill-new-'));
    try {
      writeReferenceProject(resolve(scratch, 'my-shard'), 'my-shard');
      writeNewProject(resolve(scratch, 'bare-shard'), 'bare-shard');
      writeShardRepo(resolve(scratch, 'clay-hall'), 'clay-hall', { template: 'blender' });
      for (const project of ['my-shard', 'bare-shard', 'clay-hall']) {
        expect(readFileSync(resolve(scratch, project, SKILL_FILE), 'utf8')).toBe(skill);
        for (const name of SKILLS) expect(readFileSync(resolve(scratch, project, skillFile(name)), 'utf8'), `${project} ${name}`).toBe(skills.get(name));
      }
    } finally { rmSync(scratch, { recursive: true, force: true }); }
  });
});
