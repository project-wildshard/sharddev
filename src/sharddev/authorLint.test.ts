// oxlint-disable-next-line import/no-nodejs-modules -- Lay out a scratch sdk and shard repo.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Lay out a scratch sdk and shard repo.
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authorLintPlan } from './authorLint';

// SS3 follow-up: `wildshard check` lints an npm-installed shard repo with the repo's own `.oxlintrc.author.json`.
describe('the author lint check runs (authorLintPlan)', () => {
  let scratch = '', sdk = '', repo = '';
  const oxlint = (root: string): string | undefined => (root === repo || root === sdk ? `${root}/oxlint` : undefined);
  const write = (path: string, text: string): void => { mkdirSync(resolve(path, '..'), { recursive: true }); writeFileSync(path, text); };
  beforeAll(() => {
    mkdirSync('tmp', { recursive: true });
    scratch = mkdtempSync(resolve('tmp', 'author-lint-'));
    sdk = resolve(scratch, 'sdk'); repo = resolve(scratch, 'shard-isle');
    write(resolve(sdk, '.oxlintrc.author.json'), '{}');
    write(resolve(repo, '.oxlintrc.author.json'), '{}');
    write(resolve(repo, 'src/shard.config.ts'), 'export default {};\n');
  });
  afterAll(() => { rmSync(scratch, { recursive: true, force: true }); });

  it("runs a repo's own config from the repo root over src, with its oxlint and ratchet", () => {
    expect(authorLintPlan(resolve(repo, 'src'), sdk, oxlint)).toEqual({ kind: 'run', bin: `${repo}/oxlint`, cwd: repo,
      args: ['-c', resolve(repo, '.oxlintrc.author.json'), '--format', 'json', 'src'], env: {} });
    write(resolve(repo, 'lint/ratchet.json'), '{}');
    expect(authorLintPlan(resolve(repo, 'src'), sdk, oxlint)).toMatchObject({ env: { WILDSHARD_RATCHET_FILE: resolve(repo, 'lint/ratchet.json') } });
    expect(authorLintPlan(resolve(repo, 'src'), sdk, (root: string) => (root === sdk ? 'sdk-oxlint' : undefined))).toMatchObject({ bin: 'sdk-oxlint', cwd: repo });
  });

  it('finds a multi-shard repo\'s root from src/shards/<slug>', () => {
    write(resolve(repo, 'src/shards/dunes/shard.config.ts'), 'export default {};\n');
    expect(authorLintPlan(resolve(repo, 'src/shards/dunes'), sdk, oxlint)).toMatchObject({ cwd: repo,
      args: ['-c', resolve(repo, '.oxlintrc.author.json'), '--format', 'json', 'src/shards/dunes'] });
  });

  it("falls back to the SDK's config from the SDK root, else skips naming the missing config", () => {
    const loose = resolve(scratch, 'loose/isle');
    mkdirSync(loose, { recursive: true });
    writeFileSync(resolve(scratch, 'loose/package.json'), '{}');
    expect(authorLintPlan(loose, sdk, oxlint)).toEqual({ kind: 'run', bin: `${sdk}/oxlint`, cwd: sdk,
      args: ['-c', resolve(sdk, '.oxlintrc.author.json'), '--format', 'json', loose], env: {} });
    const plan = authorLintPlan(loose, resolve(scratch, 'npm-sdk'), oxlint);
    expect(plan.kind).toBe('skip');
    expect(plan.kind === 'skip' ? plan.note : '').toMatch(/has no \.oxlintrc\.author\.json/u);
    expect(authorLintPlan(resolve(repo, 'src'), sdk, () => undefined).kind).toBe('skip');
  });
});
