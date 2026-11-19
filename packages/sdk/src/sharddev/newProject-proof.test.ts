// oxlint-disable-next-line import/no-nodejs-modules -- Scaffold a reference project into a scratch folder.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Scaffold a reference project into a scratch folder.
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { writeReferenceProject } from './newProject';

// TEMPLATE-E2E TC-NE5 (meta TEMPLATE-E2E-PLAN, from NEW-SHARD-E2E F5): `check .` on an untouched new repo skipped prove,
// because the starter shipped no tape. TR-2 (J434): the starter is Mossgate Hollow, and its tape walks from spawn to the
// hut door, whose region files the `hut.visit` fact the prove step requires. Proved with this checkout's cli
// (`wildshard prove` on src/shards/mossgate): the full tape files it at tick 160 and restores at 250; cut at tick 120 it
// fails "native fact missing: hut.visit".
test('a new reference project ships a proof tape that requires the hut fact', () => {
  const scratch = resolve(import.meta.dirname, '../../tmp');
  const parent = mkdtempSync(resolve(scratch, 'new-project-proof-')), project = resolve(parent, 'my-shard');
  try {
    writeReferenceProject(project, 'my-shard');
    const proof = JSON.parse(readFileSync(resolve(project, 'src/proof.json'), 'utf8')) as { version: number; tape: unknown[]; requiredFacts: string[] };
    expect(proof.version).toBe(1);
    expect(proof.requiredFacts).toEqual(['hut.visit']);
    expect(proof.tape.length).toBeGreaterThan(200);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});
