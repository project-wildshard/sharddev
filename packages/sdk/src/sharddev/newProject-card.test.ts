// oxlint-disable-next-line import/no-nodejs-modules -- Scaffold a reference project into a scratch folder.
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Scaffold a reference project into a scratch folder.
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { writeReferenceProject } from './newProject';

// The starter's card is Mossgate's own hero (src/shards/mossgate/card/): a new project never inherits another shard's art.
test('a new reference project wears a generated card, not the template hero', () => {
  const scratch = resolve(import.meta.dirname, '../../tmp');
  const parent = mkdtempSync(resolve(scratch, 'new-project-card-')), project = resolve(parent, 'my-shard');
  try {
    writeReferenceProject(project, 'my-shard');
    // A scene shard's card is its captured `card/<slot>.jpg` (NEW-SHARD-E2E F28); with none, its generated discovery card
    // is the author card. ONE-FORMAT OF6b: no manifest.json copy either.
    expect(existsSync(resolve(project, 'src/manifest.json'))).toBe(false);
    expect(existsSync(resolve(project, 'src/card'))).toBe(false);
    expect(existsSync(resolve(project, 'src/hero.json'))).toBe(false);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});
