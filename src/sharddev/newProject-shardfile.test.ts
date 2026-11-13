// oxlint-disable-next-line import/no-nodejs-modules -- Scaffold a reference project into a scratch folder.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Scaffold a reference project into a scratch folder.
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { writeReferenceProject } from './newProject';

// UP5 found (2026-11-13): a new project kept `/shardfiles/_template/shard.json`, so its build booted Template's file,
// which it never built, and hung at "Preparing application services". It loads its own slug's shard file.
test('a new reference project points at its own shard file, never the template', () => {
  const scratch = resolve(import.meta.dirname, '../../tmp');
  const parent = mkdtempSync(resolve(scratch, 'new-project-shardfile-')), project = resolve(parent, 'my-shard');
  try {
    writeReferenceProject(project, 'my-shard');
    for (const file of ['manifest.json', 'data/card.json']) {
      const text = readFileSync(resolve(project, 'src', file), 'utf8');
      expect((JSON.parse(text) as { shardfile: string }).shardfile).toBe('/shardfiles/my-shard/shard.json');
      expect(text).not.toContain('_template');
    }
    // The checkout's own built Template output is never copied into a new project.
    expect(existsSync(resolve(project, 'src/public/shardfiles'))).toBe(false);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});
