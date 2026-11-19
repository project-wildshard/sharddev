// oxlint-disable-next-line import/no-nodejs-modules -- Scaffold a reference project into a scratch folder.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Scaffold a reference project into a scratch folder.
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { writeReferenceProject } from './newProject';

// TEMPLATE-E2E TC-NE5 (meta TEMPLATE-E2E-PLAN, from NEW-SHARD-E2E F5): `check .` on an untouched new repo skipped prove,
// because the starter shipped no tape. TR-2 (J434): the starter is Mossgate Hollow, and its tape walks from spawn to the
// hut door, whose region files the `hut.visit` fact the prove step requires. TR-12: it walks on to brazier A and lights
// it (an `interact` on its prompt): the scene's state lane sets the field, its spent condition raises the flag, and the
// first-flame quest files `mossgate.first-light` once the player goes through the moss gate it opened (MOSSGATE-ZONE MZ4,
// J454: no quest ends on one trigger). Proved with this checkout's cli (`wildshard prove` on Mossgate's source):
// `hut.visit` at tick 160, `mossgate.first-light` at tick 856, restored at 442.
test('a new reference project ships a proof tape that requires the hut and first-flame facts', () => {
  const scratch = resolve(import.meta.dirname, '../../tmp');
  const parent = mkdtempSync(resolve(scratch, 'new-project-proof-')), project = resolve(parent, 'my-shard');
  try {
    writeReferenceProject(project, 'my-shard');
    const proof = JSON.parse(readFileSync(resolve(project, 'src/proof.json'), 'utf8')) as { version: number; tape: unknown[]; requiredFacts: string[] };
    expect(proof.version).toBe(1);
    expect(proof.requiredFacts).toEqual(['hut.visit', 'mossgate.first-light']);
    expect(proof.tape.length).toBeGreaterThan(800);
    expect(proof.tape.flat()).toContainEqual({ kind: 'interact', id: 'mossgate.brazier-a.use' });
  } finally { rmSync(parent, { recursive: true, force: true }); }
});
