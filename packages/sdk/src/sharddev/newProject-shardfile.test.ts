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
    // TR-2 (J434): the starter is a scene module, named only by its own identity.json; nothing names the template's slug.
    const text = readFileSync(resolve(project, 'src/identity.json'), 'utf8');
    expect((JSON.parse(text) as { slug: string }).slug).toBe('my-shard');
    expect(readFileSync(resolve(project, 'src/generators/shard.ts'), 'utf8')).not.toMatch(/_template|mossgate/u);
    // The checkout's own built Template output is never copied into a new project.
    for (const built of ['src/public', 'src/out']) expect(existsSync(resolve(project, built)), built).toBe(false);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});
