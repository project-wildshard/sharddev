// oxlint-disable-next-line import/no-nodejs-modules -- Real shard repos and a real installed sdk with codemod files on disk.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Fixture paths stay beneath the lane's repository scratch.
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pendingMigrations, readStamp, writeStamp } from './migrations';
import { closeFixtures, fixtureRoot } from './test/ownedScratch';

// SDK 0.5.0 plan M1: a repo's stamp names what it was last migrated to; pendingMigrations lists the installed sdk's
// migrations that have not run on it, by the stamp's window and by each migration's own `pending`.
afterAll(closeFixtures);

/** A migration that is pending while `old.txt` is in the repo. */
const STATEFUL = (version: string): string => `import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
export const title = 'migration ${version}';
export const guide = 'migrate-${version.replaceAll('.', '-')}';
export const pending = async ({ project }) => existsSync(resolve(project, 'old.txt')) ? 'old.txt exists' : undefined;
export default () => [];
`;
/** A pre-0.5.0 style codemod: no pending, no title. Its `pending` here would fire, to show it is never asked. */
const OLD = 'export const pending = () => \'never asked\';\nexport default () => [];\n';

let root: string, sdk: string, repo: string;
beforeEach(() => {
  root = fixtureRoot('migrations-');
  sdk = join(root, 'sdk'); repo = join(root, 'repo');
  mkdirSync(join(sdk, 'codemods'), { recursive: true }); mkdirSync(repo);
  writeFileSync(join(sdk, 'package.json'), '{ "name": "@wildshard/sdk", "version": "0.7.0" }\n');
  const codemods: Record<string, string> = {
    '0.4.24.mjs': OLD, '0.5.0.mjs': STATEFUL('0.5.0'), '0.6.0.mjs': 'export const title = \'no state check\';\nexport default () => [];\n',
    '0.7.0.mjs': STATEFUL('0.7.0'), '0.8.0.mjs': STATEFUL('0.8.0'), 'README.md': 'not a codemod',
  };
  for (const [name, text] of Object.entries(codemods)) writeFileSync(join(sdk, 'codemods', name), text);
  writeFileSync(join(repo, 'package.json'), '{\n    "name": "isle",\n    "dependencies": { "@wildshard/sdk": "0.7.0" }\n}\n');
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });
const versions = async (installed = '0.7.0'): Promise<string[]> => (await pendingMigrations(repo, sdk, installed)).map(found => found.version);

describe('the stamp', () => {
  it('reads none from a repo that has never been migrated, then the version writeStamp wrote', () => {
    expect(readStamp(repo)).toBeUndefined();
    writeStamp(repo, '0.5.0');
    expect(readStamp(repo)).toBe('0.5.0');
    writeStamp(repo, '0.7.0');
    expect(readStamp(repo)).toBe('0.7.0');
  });

  it('keeps the rest of package.json: key order, indent and the trailing newline', () => {
    writeStamp(repo, '0.5.0');
    expect(readFileSync(join(repo, 'package.json'), 'utf8')).toBe('{\n    "name": "isle",\n    "dependencies": {\n        "@wildshard/sdk": "0.7.0"\n    },\n    "wildshard": {\n        "migrated": "0.5.0"\n    }\n}\n');
  });

  it('refuses a stamp that is not a version', () => {
    writeFileSync(join(repo, 'package.json'), '{ "wildshard": { "migrated": "soon" } }\n');
    expect(() => readStamp(repo)).toThrow(/must be an sdk version/u);
    expect(() => { writeStamp(repo, 'soon'); }).toThrow(/not a version/u);
  });
});

describe('pendingMigrations', () => {
  it('lists the stamp window in a stamped repo, whatever each pending says, up to the installed sdk', async () => {
    writeStamp(repo, '0.5.0');
    expect(await versions()).toEqual(['0.6.0', '0.7.0']);
    const [six, seven] = await pendingMigrations(repo, sdk, '0.7.0');
    expect(six).toEqual({ version: '0.6.0', file: join(sdk, 'codemods/0.6.0.mjs'), title: 'no state check' });
    expect(seven).toMatchObject({ title: 'migration 0.7.0', guide: 'migrate-0-7-0' });
    expect(seven?.reason).toBeUndefined();
    writeStamp(repo, '0.7.0');
    expect(await versions()).toEqual([]);
  });

  it('adds a migration older than the stamp whose pending fires: a wrong stamp or a half-finished run', async () => {
    writeStamp(repo, '0.6.0');
    writeFileSync(join(repo, 'old.txt'), 'left behind');
    const found = await pendingMigrations(repo, sdk, '0.7.0');
    expect(found.map(row => row.version)).toEqual(['0.5.0', '0.7.0']);
    expect(found[0]).toMatchObject({ reason: 'old.txt exists', guide: 'migrate-0-5-0' });
  });

  it('lists only the firing pendings in a repo with no stamp, never asking a pre-0.5.0 codemod', async () => {
    expect(await versions()).toEqual([]);
    writeFileSync(join(repo, 'old.txt'), 'old layout');
    expect(await versions()).toEqual(['0.5.0', '0.7.0']);
    // Nothing newer than the installed sdk, even when its pending would fire.
    expect(await versions('0.8.0')).toEqual(['0.5.0', '0.7.0', '0.8.0']);
  });

  it('drops a migration out once its pending clears', async () => {
    writeFileSync(join(repo, 'old.txt'), 'old layout');
    expect(await versions()).toEqual(['0.5.0', '0.7.0']);
    rmSync(join(repo, 'old.txt'));
    expect(await versions()).toEqual([]);
  });

  it('names the migration whose pending throws', async () => {
    writeFileSync(join(sdk, 'codemods/0.7.0.mjs'), 'export const pending = () => { throw new Error(\'cannot read\'); };\nexport default () => [];\n');
    await expect(pendingMigrations(repo, sdk, '0.7.0')).rejects.toThrow(/migration 0\.7\.0's pending\(\) failed .*cannot read/u);
  });
});
