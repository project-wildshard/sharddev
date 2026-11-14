// SHARD-AUTHORING SA8 (J317): `three` is a peer of the sdk, pinned exact, and every CLI entry point refuses a wrong one.
// The sdk is laid out as an installed package (node_modules/@wildshard/sdk) beside a `three` of another version, and the
// real entry point runs from there: it must refuse, naming both versions, before it loads anything else.
// oxlint-disable-next-line import/no-nodejs-modules -- Run each bin entry point as an author would.
import { spawnSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- Lay the sdk out as an installed package beside a wrong three.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the package root and scratch projects.
import { join, resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- The pin check takes the sdk package.json URL.
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { threeRefusal } from './threePin.mjs';

const REPO = resolve(import.meta.dirname, '../..');
const PACKAGE = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as { readonly name: string; readonly version: string; readonly bin: Readonly<Record<string, string>>; readonly peerDependencies: { readonly three: string } };
const PIN = PACKAGE.peerDependencies.three;
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

/** A project whose node_modules holds this sdk (its package.json, bin and the gate) and `three` at `three`. (A missing
 *  three is not tested here: tmp/ sits inside this repo, so the lookup reaches its own three.) */
function project(three: string): { readonly root: string; readonly sdk: string } {
  mkdirSync(join(REPO, 'tmp'), { recursive: true });
  const root = mkdtempSync(join(REPO, 'tmp', 'three-pin-'));
  roots.push(root);
  const sdk = join(root, 'node_modules/@wildshard/sdk');
  mkdirSync(join(sdk, 'src/sharddev'), { recursive: true });
  cpSync(join(REPO, 'package.json'), join(sdk, 'package.json'));
  cpSync(join(REPO, 'bin'), join(sdk, 'bin'), { recursive: true });
  for (const file of ['threeGate.mjs', 'threePin.mjs']) cpSync(join(REPO, 'src/sharddev', file), join(sdk, 'src/sharddev', file));
  // Linking needs the entry point's other static import; reaching it means the gate let the run through.
  mkdirSync(join(sdk, 'src/sharddev/bake'), { recursive: true });
  writeFileSync(join(sdk, 'src/sharddev/bake/format-hook.mjs'), 'throw new Error("past the three gate");\n');
  mkdirSync(join(root, 'node_modules/three'), { recursive: true });
  writeFileSync(join(root, 'node_modules/three/package.json'), JSON.stringify({ name: 'three', version: three }));
  return { root, sdk };
}

describe('three is a peer pinned exact (SA8)', () => {
  it('the sdk lists three only as an exact peer', () => {
    expect(PIN).toMatch(/^\d+\.\d+\.\d+$/u);
    expect(JSON.stringify(PACKAGE)).not.toMatch(/"dependencies":\{[^}]*"three"/u);
  });

  it('passes the pinned three and refuses another, naming both', () => {
    expect(threeRefusal(pathToFileURL(join(project(PIN).sdk, 'package.json')))).toBeUndefined();
    expect(threeRefusal(pathToFileURL(join(project('0.185.0').sdk, 'package.json'))))
      .toBe(`[three-version] three 0.185.0 is installed, but ${PACKAGE.name} ${PACKAGE.version} needs three ${PIN} exactly. fix: pnpm add three@${PIN} --save-exact (GUIDE.md#three-version)`);
  });

  it('every CLI entry point refuses a wrong three before it loads anything else', () => {
    const { root, sdk } = project('0.185.0');
    const entries = [...new Set(Object.values(PACKAGE.bin))];
    expect(Object.keys(PACKAGE.bin).toSorted()).toEqual(['sharddev', 'wildshard']);
    for (const entry of entries) {
      // The copy has no format hook and no CLI: reaching past the gate would fail with another error.
      const run = spawnSync(process.execPath, [join(sdk, entry), 'check', '.'], { cwd: root, encoding: 'utf8' });
      expect(run.status, entry).toBe(1);
      expect(run.stderr, entry).toContain(`three 0.185.0 is installed, but ${PACKAGE.name} ${PACKAGE.version} needs three ${PIN} exactly`);
    }
    const help = spawnSync(process.execPath, [join(sdk, entries[0] ?? ''), 'check', '--help'], { cwd: root, encoding: 'utf8' });
    expect(help.stderr).not.toContain('[three-version]');
    expect(help.stderr).toContain('past the three gate');
  });
});
