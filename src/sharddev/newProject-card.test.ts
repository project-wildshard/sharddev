// oxlint-disable-next-line import/no-nodejs-modules -- Scaffold a reference project into a scratch folder.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Scaffold a reference project into a scratch folder.
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { writeReferenceProject } from './newProject';

// The template's card is Mossgate's own hero (src/shards/_template/card/): a new project never inherits another shard's art.
test('a new reference project wears a generated card, not the template hero', () => {
  const scratch = resolve(import.meta.dirname, '../../tmp');
  const parent = mkdtempSync(resolve(scratch, 'new-project-card-')), project = resolve(parent, 'my-shard');
  try {
    writeReferenceProject(project, 'my-shard');
    for (const file of ['manifest.json', 'data/card.json']) {
      const { card } = JSON.parse(readFileSync(resolve(project, file), 'utf8')) as { card: Record<string, string> };
      for (const url of Object.values(card)) expect(url.startsWith('data:image/svg+xml,')).toBe(true);
    }
    expect(existsSync(resolve(project, 'card'))).toBe(false);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});
