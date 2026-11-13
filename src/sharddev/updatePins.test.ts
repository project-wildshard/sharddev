// oxlint-disable-next-line import/no-nodejs-modules -- Scaffold shard repos, a fake installed sdk and fixture codemods.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve the package root and scratch projects.
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeShardRepo } from './newProject';
import { CODEMODS_FOLDER, applyCodemods, codemodsBetween, compareVersions, movePins, updatePins, type PinsRunner, type SdkRelease } from './updatePins';
import { runCli } from './cli';

// SHARD-AUTHORING SA18 (J314 Q27, J317 Q16): `wildshard update --pins` moves the pins, installs, applies the release's
// codemods, then runs the new sdk's `update` and `check`. pnpm and the registry are stood in for here; the real move
// (0.2.3 -> 0.2.4 from npm) is the row's proof.
const ROOT = resolve(import.meta.dirname, '../..');
const NEXT: SdkRelease = { version: '9.9.9', pins: { '@wildshard/engine': 'github:project-wildshard/engine#next', '@wildshard/format': 'github:project-wildshard/shard-format#v9.0.0', three: '0.190.0', vite: '8.3.0' } };

const pinsOf = (project: string): Record<string, string> => {
  const parsed = JSON.parse(readFileSync(resolve(project, 'package.json'), 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  return { ...parsed.dependencies, ...parsed.devDependencies };
};
const writeJson = (file: string, value: unknown): void => { mkdirSync(resolve(file, '..'), { recursive: true }); writeFileSync(file, JSON.stringify(value)); };

/** A codemod that appends its own name to `codemods.log` in the repo, so a test sees which ran and in what order. */
const LOGGING_CODEMOD = `import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
export default ({ project, from, to }) => { appendFileSync(resolve(project, 'codemods.log'), \`\${import.meta.url.split('/').at(-1)} \${from}->\${to}\\n\`); return ['logged']; };
`;

/** A fake pnpm: `view` answers `release`; `pnpm install` installs what package.json pins (or `installs` and `three`
 * for the new sdk), and lays the fixture `codemods` into the new sdk. */
function fakeRunner(project: string, release: SdkRelease, options: { installs?: string; three?: string; codemods?: readonly string[]; failCheck?: boolean; codemodSource?: string } = {}): PinsRunner & { calls: string[]; lines: string[] } {
  const calls: string[] = [], lines: string[] = [];
  return {
    calls, lines,
    view: spec => { calls.push(`view ${spec}`); return release; },
    log: line => { lines.push(line); },
    run: (command, args) => {
      const verb = command === 'pnpm' ? `pnpm ${args.join(' ')}` : `sdk ${args.slice(1).join(' ')}`;
      calls.push(verb);
      if (verb === 'pnpm install') {
        const sdk = resolve(project, 'node_modules/@wildshard/sdk'), pins = pinsOf(project), moving = pins['@wildshard/sdk'] === release.version;
        rmSync(resolve(project, 'node_modules'), { recursive: true, force: true });
        writeJson(resolve(sdk, 'package.json'), { name: '@wildshard/sdk', version: moving ? options.installs ?? release.version : pins['@wildshard/sdk'] });
        if (pins.three !== undefined) writeJson(resolve(project, 'node_modules/three/package.json'), { name: 'three', version: moving ? options.three ?? pins.three : pins.three });
        if (moving) for (const version of options.codemods ?? []) { mkdirSync(resolve(sdk, CODEMODS_FOLDER), { recursive: true }); writeFileSync(resolve(sdk, CODEMODS_FOLDER, `${version}.mjs`), options.codemodSource ?? LOGGING_CODEMOD); }
      }
      if (verb === 'sdk check .' && options.failCheck === true) throw new Error('check fail');
      if (verb.startsWith('sdk ')) calls.push(`  codemods.log then: ${existsSync(resolve(project, 'codemods.log')) ? readFileSync(resolve(project, 'codemods.log'), 'utf8').trim().replaceAll('\n', ', ') : 'none'}`);
    },
  };
}

describe('wildshard update --pins (SA18)', () => {
  let scratch = '';
  beforeEach(() => { mkdirSync(resolve(ROOT, 'tmp'), { recursive: true }); scratch = mkdtempSync(resolve(ROOT, 'tmp', 'update-pins-')); });
  afterEach(() => { rmSync(scratch, { recursive: true, force: true }); });

  it('orders versions, prereleases before their release', () => {
    expect(['0.10.0', '0.2.4', '1.0.0-rc.10', '0.2.10', '1.0.0-rc.9', '1.0.0', '1.0.0-rc', '1.0.0-alpha', '0.2.3'].toSorted(compareVersions))
      .toEqual(['0.2.3', '0.2.4', '0.2.10', '0.10.0', '1.0.0-alpha', '1.0.0-rc', '1.0.0-rc.9', '1.0.0-rc.10', '1.0.0']);
    expect(() => compareVersions('latest', '1.0.0')).toThrow(/latest is not a version/u);
  });

  it('moves every pin the repo lists, keeps its field, and touches nothing else', () => {
    const text = `${JSON.stringify({ name: 'isle', version: '0.0.3', scripts: { check: 'wildshard check .' },
      dependencies: { '@wildshard/engine': 'github:project-wildshard/engine#old', '@wildshard/format': 'github:project-wildshard/shard-format#v0.4.6', '@wildshard/sdk': '0.2.3', 'my-lib': '1.0.0', three: '0.186.0' } }, null, 2)}\n`;
    const { text: after, moves } = movePins(text, NEXT);
    expect(JSON.parse(after)).toEqual({ ...JSON.parse(text), dependencies: { '@wildshard/engine': 'github:project-wildshard/engine#next', '@wildshard/format': 'github:project-wildshard/shard-format#v9.0.0', '@wildshard/sdk': '9.9.9', 'my-lib': '1.0.0', three: '0.190.0' } });
    expect(moves.map(move => move.name)).toEqual(['@wildshard/sdk', '@wildshard/engine', '@wildshard/format', 'three']);
    // A blender repo lists the sdk and format as dev dependencies; they stay there. vite, which the sdk pins, is not added.
    const blender = movePins(JSON.stringify({ devDependencies: { '@wildshard/format': 'x', '@wildshard/sdk': '0.2.3' } }), NEXT);
    expect(JSON.parse(blender.text)).toEqual({ devDependencies: { '@wildshard/format': 'github:project-wildshard/shard-format#v9.0.0', '@wildshard/sdk': '9.9.9' } });
    // A pin the release no longer names (engine, after SHARD-COMPAT's engine zero) is left and reported.
    const left = movePins(JSON.stringify({ dependencies: { '@wildshard/engine': 'old', '@wildshard/sdk': '9.9.9' } }), { version: '9.9.9', pins: {} });
    expect(left.moves).toEqual([{ name: '@wildshard/engine', field: 'dependencies', from: 'old', to: undefined }]);
    expect(movePins(after, NEXT)).toEqual({ text: after, moves: [] });
    // engines.node moves with the release (new writes it; .npmrc makes it strict), and a tab indent is kept.
    const tabbed = `{\n\t"engines": {\n\t\t"node": ">=24.18.0"\n\t},\n\t"dependencies": {\n\t\t"@wildshard/sdk": "0.2.3"\n\t}\n}\n`;
    const engines = movePins(tabbed, { ...NEXT, node: '>=26.0.0' });
    expect(engines.text).toBe(`{\n\t"engines": {\n\t\t"node": ">=26.0.0"\n\t},\n\t"dependencies": {\n\t\t"@wildshard/sdk": "9.9.9"\n\t}\n}\n`);
    expect(engines.moves.map(move => move.name)).toEqual(['@wildshard/sdk', 'engines.node']);
  });

  it('picks the codemods above the old sdk and up to the new one, oldest first, and runs them in that order', async () => {
    const sdk = resolve(scratch, 'sdk'), project = resolve(scratch, 'repo');
    mkdirSync(resolve(sdk, CODEMODS_FOLDER), { recursive: true }); mkdirSync(project);
    for (const version of ['0.2.3', '0.2.4', '0.2.10', '0.3.0', '1.0.0']) writeFileSync(resolve(sdk, CODEMODS_FOLDER, `${version}.mjs`), LOGGING_CODEMOD);
    writeFileSync(resolve(sdk, CODEMODS_FOLDER, 'helpers.mjs'), 'throw new Error("not a codemod");\n');
    expect(codemodsBetween(sdk, '0.2.3', '0.3.0').map(file => file.split('/').at(-1))).toEqual(['0.2.4.mjs', '0.2.10.mjs', '0.3.0.mjs']);
    expect(codemodsBetween(sdk, '0.3.0', '0.3.0')).toEqual([]);
    expect(codemodsBetween(resolve(scratch, 'no-sdk'), '0.0.0', '9.0.0')).toEqual([]);
    expect(await applyCodemods(project, sdk, '0.2.3', '0.3.0')).toEqual(['  codemod 0.2.4.mjs', '    logged', '  codemod 0.2.10.mjs', '    logged', '  codemod 0.3.0.mjs', '    logged']);
    expect(readFileSync(resolve(project, 'codemods.log'), 'utf8')).toBe('0.2.4.mjs 0.2.3->0.3.0\n0.2.10.mjs 0.2.3->0.3.0\n0.3.0.mjs 0.2.3->0.3.0\n');
    writeFileSync(resolve(sdk, CODEMODS_FOLDER, '2.0.0.mjs'), 'export const notDefault = 1;\n');
    await expect(applyCodemods(project, sdk, '1.0.0', '2.0.0')).rejects.toThrow(/^update --pins: codemod 2\.0\.0\.mjs failed: it has no default export function/u);
  });

  it('moves a new repo: pins, install, codemods, then the new sdk rewrites the guide and checks', async () => {
    const project = resolve(scratch, 'my-shard');
    writeShardRepo(project, 'my-shard', { empty: true });
    const before = pinsOf(project), runner = fakeRunner(project, NEXT, { codemods: ['0.0.1', '9.9.9'] });
    // The repo pins the sdk this checkout is (its version); the codemod at or below it is skipped.
    await updatePins(project, '9.9.9', runner);
    expect(pinsOf(project)).toEqual({ '@wildshard/engine': NEXT.pins['@wildshard/engine'], '@wildshard/format': NEXT.pins['@wildshard/format'], '@wildshard/sdk': '9.9.9', three: '0.190.0' });
    expect(before['@wildshard/sdk']).not.toBe('9.9.9');
    // Order: view, pins, install, codemods, then the new sdk's update and check, each seeing the codemod's edit.
    const ran = `  codemods.log then: 9.9.9.mjs ${before['@wildshard/sdk'] ?? ''}->9.9.9`;
    expect(runner.calls).toEqual(['view 9.9.9', 'pnpm install', `sdk update ${project}`, ran, 'sdk check .', ran]);
    expect(runner.lines[0]).toBe(`wildshard update --pins: @wildshard/sdk ${before['@wildshard/sdk'] ?? ''} -> 9.9.9`);
    expect(runner.lines.at(-1)).toBe('wildshard update --pins: on @wildshard/sdk 9.9.9, check pass');
  });

  it('refuses a downgrade, another package manager, a wrong install and a failed check, each as update-pins', async () => {
    const project = resolve(scratch, 'my-shard');
    writeShardRepo(project, 'my-shard', { empty: true });
    const now = pinsOf(project)['@wildshard/sdk'] ?? '', manifest = readFileSync(resolve(project, 'package.json'), 'utf8');
    await expect(updatePins(project, '0.0.0', fakeRunner(project, { version: '0.0.0', pins: {} }))).rejects.toThrow(new RegExp(`is on @wildshard/sdk ${now.replaceAll('.', '\\.')}, newer than 0\\.0\\.0; update --pins moves forward only`, 'u'));
    // Each failure before the codemods finish puts package.json back and installs the old sdk again.
    for (const [options, refusal] of [
      [{ installs: '9.9.8' }, /pnpm installed @wildshard\/sdk 9\.9\.8, not 9\.9\.9/u],
      [{ three: '0.186.0' }, /sdk 9\.9\.9 pins three 0\.190\.0, but 0\.186\.0 is installed/u],
      [{ codemods: ['9.9.9'], codemodSource: 'export default () => { throw new Error("no such file"); };\n' }, /codemod 9\.9\.9\.mjs failed: no such file/u],
    ] as const) {
      const runner = fakeRunner(project, NEXT, options);
      const failed = await updatePins(project, '9.9.9', runner).then(() => 'resolved', String);
      expect(failed).toMatch(refusal);
      expect(failed).toContain(`package.json and pnpm-lock.yaml are back on @wildshard/sdk ${now}`);
      expect(readFileSync(resolve(project, 'package.json'), 'utf8')).toBe(manifest);
      expect(runner.calls).toEqual(['view 9.9.9', 'pnpm install', 'pnpm install']);
    }
    // After the codemods, the pins stay moved and the failure says what to run.
    await expect(updatePins(project, '9.9.9', fakeRunner(project, NEXT, { failCheck: true }))).rejects.toThrow(/the pins moved to @wildshard\/sdk 9\.9\.9, but check failed/u);
    expect(pinsOf(project)['@wildshard/sdk']).toBe('9.9.9');
    // A repo whose pin and install disagree (a half-done move) must install first, so no codemod is skipped.
    writeFileSync(resolve(project, 'package.json'), manifest);
    await expect(runCli(['update', project, '--pins=9.9.9'])).rejects.toThrow(new RegExp(`pins @wildshard/sdk ${now.replaceAll('.', '\\.')} but has 9\\.9\\.9 installed[\\s\\S]*\\[update-pins\\]`, 'u'));
    const parsed = JSON.parse(manifest) as Record<string, unknown>;
    writeFileSync(resolve(project, 'package.json'), JSON.stringify({ ...parsed, packageManager: 'npm@11.0.0' }));
    await expect(runCli(['update', project, '--pins=9.9.9'])).rejects.toThrow(/names npm@11\.0\.0 as its package manager[\s\S]*\[update-pins\] fix: .*GUIDE\.md#update-pins/u);
    writeFileSync(resolve(project, 'package.json'), JSON.stringify({ ...parsed, dependencies: { '@wildshard/sdk': 'link:../sdk' } }));
    await expect(runCli(['update', project, '--pins'])).rejects.toThrow(/cannot tell which sdk .* is on: pin @wildshard\/sdk to a version \(not link:\.\.\/sdk\)[\s\S]*\[update-pins\]/u);
  });

  it('parses --pins and --pins=<version> as flags beside [dir]', async () => {
    const project = resolve(scratch, 'my-shard');
    writeShardRepo(project, 'my-shard', { empty: true });
    for (const args of [['--pins='], ['--pins', '--pins=1.0.0'], [project, 'extra', '--pins'], ['-x', '--pins']]) {
      await expect(runCli(['update', ...args])).rejects.toThrow(/usage: wildshard update \[dir\] \[--pins\[=<version>\]\]/u);
    }
    await expect(runCli(['update', '--pins', '0.2.4'])).rejects.toThrow(/name a version as --pins=0\.2\.4/u);
  });

  it('every shipped codemod is named for a version, exports a function, and leaves a new repo as it was', async () => {
    const folder = resolve(ROOT, CODEMODS_FOLDER), files = readdirSync(folder);
    expect(files.length).toBeGreaterThan(0);
    const project = resolve(scratch, 'my-shard');
    writeShardRepo(project, 'my-shard', { empty: true });
    const before = readFileSync(resolve(project, 'package.json'), 'utf8');
    for (const file of files) {
      expect(file).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\.mjs$/u);
      const version = file.slice(0, -'.mjs'.length);
      expect(await applyCodemods(project, ROOT, '0.0.0', version)).toContain(`  codemod ${file}`);
    }
    expect(readFileSync(resolve(project, 'package.json'), 'utf8')).toBe(before);
    expect((JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as { files: string[] }).files).toContain(CODEMODS_FOLDER);
  });
});
