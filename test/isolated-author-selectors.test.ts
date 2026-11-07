// oxlint-disable-next-line import/no-nodejs-modules -- Compile the exact author source without a product or runtime owner.
import { readFileSync } from 'node:fs';
import ts from '@typescript/typescript6';
import { expect, test } from 'vitest';

for (const file of ['driftwood-isle/generators/sections', 'driftwood-isle/generators/namedSchemas',
  'nalati-grasslands/generators/dressingScene', 'nalati-grasslands/generators/speciesRows', 'far-reach/generators/paintedLook']) {
  test(`${file} retains standalone defining selector declarations`, () => {
    const fileName = `src/shards/${file}.ts`;
    const output = ts.transpileDeclaration(readFileSync(fileName, 'utf8'), { fileName, reportDiagnostics: true,
      compilerOptions: { strict: true, exactOptionalPropertyTypes: true, isolatedDeclarations: true } });
    expect(output.diagnostics).toEqual([]);
    expect(output.outputText.length).toBeGreaterThan(0);
    expect(output.outputText.length).toBeLessThan(100_000);
  });
}
