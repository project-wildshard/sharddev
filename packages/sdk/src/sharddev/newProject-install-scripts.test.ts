// oxlint-disable-next-line import/no-nodejs-modules -- Scaffold new projects into a scratch folder.
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Scaffold new projects into a scratch folder.
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { writeNewProject, writeReferenceProject } from './newProject';

// SA39 (J319): generators may install any npm package, so `new` writes pnpm's install-script allowlist. pnpm 10 runs no
// dependency script unless `allowBuilds` lists it `true`; nothing a new shard installs needs one, so the list is empty.
const POLICY = `packages:
  - .

# Install scripts (SA39): a dependency runs its preinstall, install or postinstall
# script only when it is listed \`true\` below. Wildshard's own packages need none.
# pnpm skips any other package's script and names it after \`pnpm install\`; allow
# one with \`pnpm approve-builds\` (or \`name: true\` here) only if you trust it.
# pnpm 10.34 or later reads this list; pnpm 10.0 to 10.33 runs no script at all;
# pnpm 9, npm and yarn run every script, so install with pnpm 10.34 or later.
allowBuilds: {}
`;

test.each([['reference', writeReferenceProject], ['empty', writeNewProject]] as const)('a new %s project carries the install-script allowlist', (_, write) => {
  const scratch = resolve(import.meta.dirname, '../../tmp');
  mkdirSync(scratch, { recursive: true });
  const parent = mkdtempSync(resolve(scratch, 'new-project-builds-'));
  try {
    write(resolve(parent, 'my-shard'), 'my-shard');
    expect(readFileSync(resolve(parent, 'my-shard/pnpm-workspace.yaml'), 'utf8')).toBe(POLICY);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});
