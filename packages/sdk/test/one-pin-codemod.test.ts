// oxlint-disable-next-line import/no-nodejs-modules -- Exercise a real temporary shard repo.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Keep fixtures inside the test's owned scratch folder.
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import codemod, { rewriteImmutableImports } from '../codemods/0.4.24.mjs';

// SHARD-COMPAT CP18: the immutable helpers come from the sdk, and a repo that no longer imports engine drops its pin.
test('only the sdk-owned immutable helpers move', () => {
  expect(rewriteImmutableImports("import { hashImmutableBytes } from '@wildshard/format/immutable';"))
    .toBe("import { hashImmutableBytes } from '@wildshard/sdk/immutable';");
  expect(rewriteImmutableImports('import {encodeCanonicalJson, hashImmutableBytes as hash} from "@wildshard/format/immutable"'))
    .toBe('import {encodeCanonicalJson, hashImmutableBytes as hash} from "@wildshard/sdk/immutable"');
  const kept = "import { hashImmutableBytes, immutableBytes } from '@wildshard/format/immutable';";
  expect(rewriteImmutableImports(kept)).toBe(kept);
  expect(rewriteImmutableImports("import { hashImmutableBytes } from '@wildshard/format/immutable';", '@wildshard/sharddev'))
    .toBe("import { hashImmutableBytes } from '@wildshard/sharddev/immutable';");
  const other = "import { parseShardfile } from '@wildshard/format/shardSchema';";
  expect(rewriteImmutableImports(other)).toBe(other);
});

function repo(source: string): string {
  const parent = resolve(process.env['VITEST_TMP_ROOT'] ?? 'tmp/vitest');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'one-pin-codemod-'));
  mkdirSync(join(root, 'test'));
  writeFileSync(join(root, 'test', 'a.test.ts'), source);
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({ devDependencies: { '@wildshard/sharddev': 'npm:@wildshard/sdk@0.4.24', '@wildshard/engine': '0.1.64', '@wildshard/format': 'npm:@wildshard/shard-format@0.68.0' }, pnpm: { overrides: { '@wildshard/engine': '0.1.64' } } }, null, 2)}\n`);
  return root;
}

test('a repo with no engine import drops the engine pin and keeps format', () => {
  const root = repo("import { hashImmutableBytes } from '@wildshard/format/immutable';\nimport { openShardProof } from '@wildshard/dev/test/proof';\n");
  try {
    const said = codemod({ project: root, from: '0.4.23', to: '0.4.24' });
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { devDependencies: Record<string, string>; pnpm: { overrides: Record<string, string> } };
    expect(pkg.devDependencies['@wildshard/engine']).toBeUndefined();
    expect(pkg.pnpm.overrides['@wildshard/engine']).toBeUndefined();
    expect(pkg.devDependencies['@wildshard/format']).toBe('npm:@wildshard/shard-format@0.68.0');
    expect(readFileSync(join(root, 'test', 'a.test.ts'), 'utf8')).toContain("'@wildshard/sharddev/immutable'");
    expect(said.length).toBe(2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a repo that still imports engine keeps its pin', () => {
  const root = repo("import { leadPlayer } from '@wildshard/engine/sim/leadPlayer';\n");
  try {
    expect(codemod({ project: root, from: '0.4.23', to: '0.4.24' })).toEqual([]);
    expect(readFileSync(join(root, 'package.json'), 'utf8')).toContain('"@wildshard/engine": "0.1.64"');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
