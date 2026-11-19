// oxlint-disable-next-line import/no-nodejs-modules -- Scaffold a reference project into a scratch folder.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Scaffold a reference project into a scratch folder.
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { writeReferenceProject } from './newProject';

// TEMPLATE-E2E TC-NE5 (meta TEMPLATE-E2E-PLAN, from NEW-SHARD-E2E F5): `check .` on an untouched new repo skipped prove,
// because the starter shipped no tape. It ships the Template chest tape: a walk from spawn, E at the chest, and the
// `template.chest` fact the prove step requires. Proved end to end with published cli 0.4.11 (engine 0.1.44): the full
// tape passes `check .`, the tape cut at tick 120 fails it.
test('a new reference project ships a proof tape that requires the chest fact', () => {
  const scratch = resolve(import.meta.dirname, '../../tmp');
  const parent = mkdtempSync(resolve(scratch, 'new-project-proof-')), project = resolve(parent, 'my-shard');
  try {
    writeReferenceProject(project, 'my-shard');
    const proof = JSON.parse(readFileSync(resolve(project, 'src/proof.json'), 'utf8')) as { version: number; tape: unknown[]; requiredFacts: string[] };
    expect(proof.version).toBe(1);
    expect(proof.requiredFacts).toEqual(['template.chest']);
    expect(proof.tape.length).toBeGreaterThan(200);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});
