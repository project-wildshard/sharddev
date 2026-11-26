// oxlint-disable-next-line import/no-nodejs-modules -- Hash the frozen witness files the CI21 source suite reads.
import { createHash } from 'node:crypto';
// oxlint-disable-next-line import/no-nodejs-modules -- The witnesses are files in this package's fixtures.
import { readFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the fixture folder from this test.
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import provenance from './fixtures/ci21-nu3/provenance.json' with { type: 'json' };

// Meta QA 11-25 row 139: a4781ad9 edited one CI21 witness (a comment) without its provenance hash, and main's ci went
// red in the CI21 source step, which no local check runs. This runs in the sdk's own suite, so pre-push sees it.
test('every CI21 witness file matches the sha256 its provenance records', () => {
  const root = resolve(import.meta.dirname, 'fixtures/ci21-nu3');
  const stale = [...provenance.files, ...provenance.engineFiles.files]
    .filter(row => createHash('sha256').update(readFileSync(resolve(root, row.path))).digest('hex') !== row.sha256)
    .map(row => row.path);
  expect(stale, 'edit a witness: record its new sha256 and sourceBlob in provenance.json').toEqual([]);
});
