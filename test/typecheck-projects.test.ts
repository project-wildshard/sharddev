// oxlint-disable-next-line import/no-nodejs-modules -- Exercise real compiler projects in an owned fixture.
import { spawnSync } from 'node:child_process';
// oxlint-disable-next-line import/no-nodejs-modules -- Own only small temporary compiler inputs and outputs.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve compiler and fixture paths without shell commands.
import { dirname, relative, resolve } from 'node:path';
// oxlint-disable-next-line import/no-nodejs-modules -- Use the current Node executable for the compiler.
import { execPath } from 'node:process';
import ts from '@typescript/typescript6';
import * as v from 'valibot';
import { expect, test } from 'vitest';

function project(file: string): ts.ParsedCommandLine {
  const parsed = ts.getParsedCommandLineOfConfigFile(resolve(file), {}, {
    ...ts.sys, onUnRecoverableConfigFileDiagnostic: diagnostic => { throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')); },
  });
  if (parsed === undefined) throw new Error(`Cannot read ${file}`);
  expect(parsed.errors).toEqual([]);
  return parsed;
}

test('every source file has a layer owner, while the root covers all tests and ambient declarations', () => {
  const pending = [resolve('tsconfig.layers.json')], seen = new Set<string>(), sources = new Set<string>();
  const ownersByProject = new Map<string, ts.ParsedCommandLine>();
  while (pending.length > 0) {
    const file = pending.pop();
    if (file === undefined || seen.has(file)) continue;
    seen.add(file);
    const parsed = project(file);
    ownersByProject.set(file, parsed);
    for (const source of parsed.fileNames) sources.add(source);
    for (const reference of parsed.projectReferences ?? []) pending.push(ts.resolveProjectReferencePath(reference));
  }
  expect(project('tsconfig.json').fileNames).toEqual([]);
  const root = project('test/tsconfig.json'), roots = new Set(root.fileNames);
  const original = ts.parseJsonConfigFileContent({ include: ['src', 'test'], exclude: ['node_modules', 'src/sharddev/dist'] }, ts.sys, resolve('.'));
  expect(original.errors).toEqual([]);
  const missing = original.fileNames.filter(file => !sources.has(file) && !roots.has(file));
  expect(missing.map(file => relative('.', file))).toEqual([]);
  expect(root.fileNames.filter(file => file.includes('/src/') && !/\.d\.(?:[cm]?ts|[^/]+\.ts)$/u.test(file))).toEqual([]);
  expect(root.options.disableSourceOfProjectReferenceRedirect).not.toBe(true);
  const helpers = root.fileNames.filter(file => file.startsWith(`${resolve('scripts')}/`)
    || file === resolve('vite.config.ts') || file.startsWith(`${resolve('vite')}/`));
  expect(helpers.length).toBeGreaterThan(0);
  for (const helper of helpers) {
    const owners = [...ownersByProject].filter(([, parsed]) => parsed.fileNames.includes(helper)).map(([file]) => file);
    expect(owners).toEqual([resolve('test/tsconfig.json')]);
  }
  expect(new Set(root.projectReferences?.map(reference => ts.resolveProjectReferencePath(reference))
    .filter(file => !file.endsWith('/tsconfig.test.json')))).toEqual(
    new Set([...seen].filter(file => /^tsconfig\.(?:engine|game|sdk|sharddev|commons|shards|app)\.json$/u.test(relative('.', file)))),
  );
  for (const reference of root.projectReferences ?? []) expect(seen.has(ts.resolveProjectReferencePath(reference))).toBe(true);
  for (const file of ['scripts/tsconfig.json']) {
    const references = project(file).projectReferences ?? [];
    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) expect(seen.has(ts.resolveProjectReferencePath(reference))).toBe(true);
  }
  expect(project('scripts/tsconfig.json').options.checkJs).toBe(true);
  expect(project('scripts/tsconfig.json').options.strict).toBe(true);
  expect(project('scripts/tsconfig.json').options.skipLibCheck).toBe(true);
  for (const layer of ['engine', 'game', 'sdk', 'sharddev', 'commons', 'shards']) {
    const production = project(`tsconfig.${layer}.json`), tests = project(`src/${layer}/tsconfig.test.json`);
    expect(tests.options.outDir).toBe(production.options.outDir);
    expect(tests.options.tsBuildInfoFile).not.toBe(production.options.tsBuildInfoFile);
    const implementations = new Set(production.fileNames.filter(file => !file.endsWith('.d.ts')));
    expect(tests.fileNames.filter(file => implementations.has(file))).toEqual([]);
    if (layer === 'engine' || layer === 'game' || layer === 'sdk' || layer === 'sharddev') {
      const testConfig = v.parse(v.object({ include: v.array(v.string()) }), tests.raw);
      const productionConfig = v.parse(v.object({ exclude: v.array(v.string()) }), production.raw);
      expect(testConfig.include).toContain('test/**/*.ts');
      expect(productionConfig.exclude).toContain(`src/${layer}/test`);
    }
  }
  const appTests = project('src/tsconfig.test.json'), appProduction = project('tsconfig.app.json');
  expect(appTests.options.types).toContain('node');
  expect(appProduction.options.types).not.toContain('node');
  expect(appTests.options.outDir).toBe(appProduction.options.outDir);
  expect(appTests.options.tsBuildInfoFile).not.toBe(appProduction.options.tsBuildInfoFile);
  expect(appTests.fileNames.length).toBeGreaterThan(0);
  const appSource = new Set(appProduction.fileNames);
  expect(appTests.fileNames.filter(file => !file.endsWith('.d.ts') && appSource.has(file))).toEqual([]);
});

test('layer config fields use compiler JSONC grammar and still refuse invalid configs', () => {
  mkdirSync('tmp', { recursive: true });
  const root = mkdtempSync(resolve('tmp/typecheck-jsonc-')), file = resolve(root, 'tsconfig.json');
  try {
    mkdirSync(resolve(root, 'src'), { recursive: true });
    writeFileSync(resolve(root, 'src/value.ts'), 'export const value = 1;');
    writeFileSync(file, `{
      // Layer configs support comments and trailing commas, just like tsc.
      "include": ["src",], "exclude": ["src/private",],
    }`);
    const parsed = project(file);
    expect(v.parse(v.object({ include: v.array(v.string()), exclude: v.array(v.string()) }), parsed.raw))
      .toEqual({ include: ['src'], exclude: ['src/private'] });
    expect(parsed.fileNames).toContain(resolve(root, 'src/value.ts'));
    writeFileSync(file, '{"include":[}');
    expect(() => project(file)).toThrow();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('private game fixtures stay Node-only and root consumers read their declarations', () => {
  mkdirSync('tmp', { recursive: true });
  const root = mkdtempSync(resolve('tmp/typecheck-game-fixture-'));
  const put = (file: string, contents: string): void => {
    mkdirSync(dirname(resolve(root, file)), { recursive: true });
    writeFileSync(resolve(root, file), contents);
  };
  const compiler = resolve('node_modules/typescript/bin/tsc');
  const run = (...args: string[]): ReturnType<typeof spawnSync> => spawnSync(execPath, [compiler, ...args], {
    cwd: root, encoding: 'utf8', timeout: 10_000,
  });
  try {
    const common = { strict: true, composite: true, declaration: true, emitDeclarationOnly: true,
      module: 'ESNext', moduleResolution: 'bundler', target: 'ES2022', skipLibCheck: true };
    put('tsconfig.game.json', JSON.stringify({ compilerOptions: { ...common, outDir: 'out', types: [] },
      include: ['src/game'], exclude: ['**/*.test.ts', 'src/test/game'] }));
    put('src/game/tsconfig.test.json', JSON.stringify({ compilerOptions: { ...common, outDir: '../../out',
      rootDir: '../..', types: ['node'] }, include: ['**/*.test.ts', 'test/**/*.ts'],
      references: [{ path: '../../tsconfig.game.json' }] }));
    put('src/game/value.ts', 'export const value: number = 1;\n');
    put('src/test/game/helper.ts', 'import {value} from "../value"; export const fixturePid: number = process.pid + value;\n');
    const built = run('-b', 'src/game/tsconfig.test.json');
    expect(built.status, String(built.stdout) + String(built.stderr)).toBe(0);
    put('tsconfig.json', JSON.stringify({ compilerOptions: { strict: true, noEmit: true, types: [], skipLibCheck: true,
      module: 'ESNext', moduleResolution: 'bundler' }, include: ['test'], references: [
      { path: './tsconfig.game.json' }, { path: './src/game/tsconfig.test.json' },
    ] }));
    put('test/helper.ts', 'import {fixturePid} from "../src/test/game/helper"; import {value} from "../src/game/value"; export const result: number = fixturePid + value;\n');
    const checked = run('--noEmit', '--listFiles');
    expect(checked.status, String(checked.stdout) + String(checked.stderr)).toBe(0);
    const files = String(checked.stdout).replaceAll('\\', '/').split('\n');
    expect(files).toContain(`${root}/out/src/test/game/helper.d.ts`);
    expect(files).toContain(`${root}/out/src/game/value.d.ts`);
    expect(files).not.toContain(`${root}/src/test/game/helper.ts`);
    expect(files).not.toContain(`${root}/src/game/value.ts`);
    put('test/helper.ts', 'import {fixturePid} from "../src/test/game/helper"; import {value} from "../src/game/value"; export const result: string = fixturePid + value;\n');
    const badConsumer = run('--noEmit');
    expect(badConsumer.status, String(badConsumer.stdout) + String(badConsumer.stderr)).not.toBe(0);
    expect(String(badConsumer.stdout) + String(badConsumer.stderr)).toContain('TS2322');
    put('src/game/value.ts', 'export const value: number = process.pid;\n');
    const badProduction = run('-b', 'tsconfig.game.json', '--force');
    expect(badProduction.status, String(badProduction.stdout) + String(badProduction.stderr)).not.toBe(0);
    expect(String(badProduction.stdout) + String(badProduction.stderr)).toContain('Cannot find name');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('tests consume emitted declarations; source and test errors each still refuse', () => {
  mkdirSync('tmp', { recursive: true });
  const root = mkdtempSync(resolve('tmp/typecheck-projects-'));
  const put = (file: string, contents: string): void => {
    mkdirSync(dirname(resolve(root, file)), { recursive: true });
    writeFileSync(resolve(root, file), contents);
  };
  const compiler = resolve('node_modules/typescript/bin/tsc');
  const run = (...args: string[]): ReturnType<typeof spawnSync> => spawnSync(execPath, [compiler, ...args], {
    cwd: root, encoding: 'utf8', timeout: 10_000,
  });
  const source = 'export const value: number = 1;\n';
  try {
    put('tsconfig.source.json', JSON.stringify({ compilerOptions: { strict: true, composite: true, declaration: true,
      module: 'ESNext', moduleResolution: 'bundler', allowArbitraryExtensions: true,
      emitDeclarationOnly: true, outDir: 'out', types: [], skipLibCheck: true }, include: ['src'] }));
    put('tsconfig.json', JSON.stringify({ compilerOptions: { strict: true, noEmit: true, types: [], skipLibCheck: true,
      module: 'ESNext', moduleResolution: 'bundler', allowArbitraryExtensions: true,
      disableSourceOfProjectReferenceRedirect: false }, references: [{ path: './tsconfig.source.json' }], include: ['test'] }));
    put('src/value.ts', source);
    put('src/payload.d.json.ts', 'declare const payload: {label: string}; export default payload;\n');
    put('test/value.ts', 'import { value } from "../src/value"; import data from "../src/payload.json"; const result: number = value; const label: string = data.label; export { result, label };\n');
    const lint = (): ReturnType<typeof spawnSync> => spawnSync(resolve('node_modules/.bin/oxlint'),
      ['--type-aware', '--no-ignore', '--config', resolve('.oxlintrc.json'), '--tsconfig', resolve(root, 'tsconfig.json'), resolve(root, 'test/lint.ts')],
      { cwd: resolve('.'), encoding: 'utf8', timeout: 10_000 });
    put('test/lint.ts', 'import { value } from "../src/value";\n\nexport const result = value + 1;\n');
    const coldLint = lint();
    expect(coldLint.status, String(coldLint.stdout) + String(coldLint.stderr)).toBe(0);
    put('test/lint.ts', 'export function result(): number { return JSON.parse("1"); }\n');
    const unsafeLint = lint();
    expect(unsafeLint.status).not.toBe(0);
    expect(String(unsafeLint.stdout) + String(unsafeLint.stderr)).toContain('no-unsafe-return');
    put('test/lint.ts', 'export const result = 1;\n');
    const missing = run('--noEmit');
    expect(missing.status).not.toBe(0);
    expect(String(missing.stdout) + String(missing.stderr)).toContain('TS6305');
    const built = run('-b', 'tsconfig.source.json');
    expect(built.status, String(built.stdout) + String(built.stderr)).toBe(0);
    const checked = run('--listFilesOnly');
    expect(checked.status, String(checked.stdout) + String(checked.stderr)).toBe(0);
    const files = String(checked.stdout).replaceAll('\\', '/').split('\n');
    expect(files).toContain(`${root}/out/src/value.d.ts`);
    expect(files).not.toContain(`${root}/src/value.ts`);
    put('tsconfig.scripts.json', JSON.stringify({ compilerOptions: { strict: true, noEmit: true,
      checkJs: true, allowJs: true, skipLibCheck: true, types: [], module: 'ESNext', moduleResolution: 'bundler' },
      references: [{ path: './tsconfig.source.json' }], include: ['scripts'] }));
    put('scripts/check.js', 'import {value} from "../src/value";\n/** @type {number} */\nexport const result = String(value);\n');
    const badScript = run('--noEmit', '-p', 'tsconfig.scripts.json');
    expect(badScript.status).not.toBe(0);
    expect(String(badScript.stdout) + String(badScript.stderr)).toContain('TS2322');
    put('test/value.ts', 'import data from "../src/payload.json"; const result: number = data.label; export { result };\n');
    const badTest = run('--noEmit');
    expect(badTest.status).not.toBe(0);
    expect(String(badTest.stdout) + String(badTest.stderr)).toContain('TS2322');
    put('src/value.ts', source.replace('= 1', '= "bad"'));
    const badSource = run('-b', 'tsconfig.source.json');
    expect(badSource.status).not.toBe(0);
    expect(String(badSource.stdout) + String(badSource.stderr)).toContain('TS2322');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('CI and local checks build source before tests and retain every tool/site project', () => {
  const manifest: unknown = JSON.parse(readFileSync('package.json', 'utf8'));
  if (typeof manifest !== 'object' || manifest === null) throw new Error('Missing package manifest');
  const scripts: unknown = Reflect.get(manifest, 'scripts');
  if (typeof scripts !== 'object' || scripts === null) throw new Error('Missing package scripts');
  const local: unknown = Reflect.get(scripts, 'typecheck');
  if (typeof local !== 'string') throw new Error('Missing typecheck command');
  const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8');
  const job=workflow.split('\n  typecheck-lint:')[1]?.split('\n  derived-docs:')[0]??'';
  expect(job).toContain('bash scripts/typecheck-lint.sh');
  const ci=readFileSync('scripts/typecheck-lint.sh','utf8');
  for (const command of [local, ci]) {
    const layers = command.indexOf('tsc -b tsconfig.layers.json');
    expect(layers).toBeGreaterThanOrEqual(0);
    expect(command.match(/tsc -b tsconfig.layers\.json/gu)).toHaveLength(1);
    expect(command).not.toContain('tsc --noEmit');
    for (const path of ['test', 'api', 'scripts', 'drafts', 'drafts/tools', 'admin', 'admin/tools']) {
      expect(project('tsconfig.layers.json').projectReferences?.some(reference => ts.resolveProjectReferencePath(reference) === resolve(path,'tsconfig.json'))).toBe(true);
    }
  }
});

test('workspace Node tests consume declarations without giving production Node globals', () => {
  mkdirSync('tmp', { recursive: true });
  const root = mkdtempSync(resolve('tmp/typecheck-workspace-'));
  const put = (file: string, contents: string): void => {
    mkdirSync(dirname(resolve(root, file)), { recursive: true });
    writeFileSync(resolve(root, file), contents);
  };
  const compiler = resolve('node_modules/typescript/bin/tsc');
  const run = (...args: string[]): ReturnType<typeof spawnSync> => spawnSync(execPath, [compiler, ...args], {
    cwd: root, encoding: 'utf8', timeout: 10_000,
  });
  try {
    put('tsconfig.engine.json', JSON.stringify({ compilerOptions: { strict: true, composite: true, declaration: true,
      module: 'ESNext', moduleResolution: 'bundler', target: 'ES2022', types: [], skipLibCheck: true,
      emitDeclarationOnly: true, outDir: 'out' }, include: ['src/engine'], exclude: ['**/*.test.ts', 'src/test/engine'] }));
    put('src/engine/tsconfig.test.json', JSON.stringify({ compilerOptions: { strict: true, composite: true,
      declaration: true, emitDeclarationOnly: true, outDir: '../../out', rootDir: '../..', types: ['node'], skipLibCheck: true,
      module: 'ESNext', moduleResolution: 'bundler', target: 'ES2022' }, include: ['**/*.test.ts', 'test/**/*.ts'],
      references: [{ path: '../../tsconfig.engine.json' }] }));
    put('src/engine/tsconfig.json', JSON.stringify({ files: [], references: [
      { path: '../../tsconfig.engine.json' }, { path: './tsconfig.test.json' },
    ] }));
    put('src/engine/internal.ts', 'export class Internal { readonly value: number = 1; }\n');
    put('src/test/engine/helper.ts', 'import {Internal} from "../internal"; export function make(): Internal { return new Internal(); }\n');
    put('tsconfig.json', JSON.stringify({ compilerOptions: { strict: true, noEmit: true, types: [], skipLibCheck: true,
      module: 'ESNext', moduleResolution: 'bundler' }, include: ['test'], references: [
      { path: './tsconfig.engine.json' }, { path: './src/engine/tsconfig.test.json' },
    ] }));
    put('test/helper.ts', 'import {make} from "../src/test/engine/helper"; export const result: number = make().value;\n');
    put('src/engine/value.ts', 'export const value: number = 1;\n');
    put('src/engine/value.test.ts', '// oxlint-disable-next-line import/no-nodejs-modules -- Read the real Node executable in this compiler fixture.\nimport {readFileSync} from "node:fs";\nimport {value} from "./value";\n\nexport const size: number = readFileSync(process.execPath).length + value;\n');
    const lint = (): ReturnType<typeof spawnSync> => spawnSync(resolve('node_modules/.bin/oxlint'),
      ['--type-aware', '--no-ignore', '--config', resolve('.oxlintrc.json'), resolve(root, 'src/engine/value.test.ts')],
      { cwd: resolve('.'), encoding: 'utf8', timeout: 10_000 });
    const cold = lint();
    expect(cold.status, String(cold.stdout) + String(cold.stderr)).toBe(0);
    const built = run('-b', 'src/engine/tsconfig.json');
    expect(built.status, String(built.stdout) + String(built.stderr)).toBe(0);
    const checked = run('-p', 'src/engine/tsconfig.test.json', '--listFilesOnly');
    expect(checked.status, String(checked.stdout) + String(checked.stderr)).toBe(0);
    const files = String(checked.stdout).replaceAll('\\', '/').split('\n');
    expect(files).toContain(`${root}/out/src/engine/value.d.ts`);
    expect(files).not.toContain(`${root}/src/engine/value.ts`);
    const rootCheck = run('--noEmit', '--listFiles');
    expect(rootCheck.status, String(rootCheck.stdout) + String(rootCheck.stderr)).toBe(0);
    const rootFiles = String(rootCheck.stdout).replaceAll('\\', '/').split('\n');
    expect(rootFiles).toContain(`${root}/out/src/test/engine/helper.d.ts`);
    expect(rootFiles).toContain(`${root}/out/src/engine/internal.d.ts`);
    expect(rootFiles).not.toContain(`${root}/src/test/engine/helper.ts`);
    expect(rootFiles).not.toContain(`${root}/src/engine/internal.ts`);
    const sdkOptions = { strict: true, composite: true, declaration: true, emitDeclarationOnly: true,
      outDir: '../../out', rootDir: '../..', types: ['node'], skipLibCheck: true,
      module: 'ESNext', moduleResolution: 'bundler', target: 'ES2022' };
    put('tsconfig.sdk.json', JSON.stringify({ compilerOptions: { strict: true, composite: true, declaration: true,
      module: 'ESNext', moduleResolution: 'bundler', target: 'ES2022', types: [], skipLibCheck: true,
      emitDeclarationOnly: true, outDir: 'out' }, include: ['src/sdk'], exclude: ['**/*.test.ts', 'src/sdk/test'] }));
    put('src/sdk/value.ts', 'export const value: number = 1;\n');
    put('src/sdk/test/helper.ts', 'export const fixturePid: number = process.pid;\n');
    put('src/sdk/value.test.ts', 'import {make} from "../engine/test/helper"; export const result: number = make().value;\n');
    put('src/sdk/tsconfig.test.json', JSON.stringify({ compilerOptions: sdkOptions, include: ['**/*.test.ts'],
      references: [{ path: '../../tsconfig.engine.json' }] }));
    const missingTestReference = run('--noEmit', '-p', 'src/sdk/tsconfig.test.json');
    expect(missingTestReference.status).not.toBe(0);
    expect(String(missingTestReference.stdout) + String(missingTestReference.stderr)).toContain('TS6307');
    put('src/sdk/tsconfig.test.json', JSON.stringify({ compilerOptions: sdkOptions, include: ['**/*.test.ts', 'test/**/*.ts'],
      references: [{ path: '../../tsconfig.engine.json' }, { path: '../engine/tsconfig.test.json' }, { path: '../../tsconfig.sdk.json' }] }));
    const sdkProduction = run('-b', 'tsconfig.sdk.json');
    expect(sdkProduction.status, String(sdkProduction.stdout) + String(sdkProduction.stderr)).toBe(0);
    const sdkCheck = run('--noEmit', '-p', 'src/sdk/tsconfig.test.json', '--listFiles');
    expect(sdkCheck.status, String(sdkCheck.stdout) + String(sdkCheck.stderr)).toBe(0);
    const sdkFiles = String(sdkCheck.stdout).replaceAll('\\', '/').split('\n');
    expect(sdkFiles).toContain(`${root}/out/src/test/engine/helper.d.ts`);
    expect(sdkFiles).not.toContain(`${root}/src/test/engine/helper.ts`);
    expect(sdkFiles).not.toContain(`${root}/src/engine/internal.ts`);
    expect(sdkFiles).toContain(`${root}/src/sdk/test/helper.ts`);
    const sdkTestsBuild = run('-b', 'src/sdk/tsconfig.test.json');
    expect(sdkTestsBuild.status, String(sdkTestsBuild.stdout) + String(sdkTestsBuild.stderr)).toBe(0);
    put('tsconfig.json', JSON.stringify({ compilerOptions: { strict: true, noEmit: true, types: [], skipLibCheck: true,
      module: 'ESNext', moduleResolution: 'bundler' }, include: ['test'], references: [
      { path: './tsconfig.engine.json' }, { path: './src/engine/tsconfig.test.json' },
      { path: './tsconfig.sdk.json' }, { path: './src/sdk/tsconfig.test.json' },
    ] }));
    put('test/sdk-helper.ts', 'import {fixturePid} from "../src/sdk/test/helper"; export const result: number = fixturePid;\n');
    const sdkRoot = run('--noEmit', '--listFiles');
    expect(sdkRoot.status, String(sdkRoot.stdout) + String(sdkRoot.stderr)).toBe(0);
    const sdkRootFiles = String(sdkRoot.stdout).replaceAll('\\', '/').split('\n');
    expect(sdkRootFiles).toContain(`${root}/out/src/sdk/test/helper.d.ts`);
    expect(sdkRootFiles).not.toContain(`${root}/src/sdk/test/helper.ts`);
    put('test/sdk-helper.ts', 'import {fixturePid} from "../src/sdk/test/helper"; export const result: string = fixturePid;\n');
    const badSdkRoot = run('--noEmit');
    expect(badSdkRoot.status, String(badSdkRoot.stdout) + String(badSdkRoot.stderr)).not.toBe(0);
    expect(String(badSdkRoot.stdout) + String(badSdkRoot.stderr)).toContain('TS2322');
    put('test/sdk-helper.ts', 'import {fixturePid} from "../src/sdk/test/helper"; export const result: number = fixturePid;\n');
    put('src/sdk/value.test.ts', 'import {make} from "../engine/test/helper"; export const result: string = make().value;\n');
    const badSdkTest = run('--noEmit', '-p', 'src/sdk/tsconfig.test.json');
    expect(badSdkTest.status).not.toBe(0);
    expect(String(badSdkTest.stdout) + String(badSdkTest.stderr)).toContain('TS2322');
    put('src/sdk/value.ts', 'export const value: number = process.pid;\n');
    const badSdkProduction = run('-b', 'tsconfig.sdk.json', '--force');
    expect(badSdkProduction.status, String(badSdkProduction.stdout) + String(badSdkProduction.stderr)).not.toBe(0);
    expect(String(badSdkProduction.stdout) + String(badSdkProduction.stderr)).toContain('Cannot find name');
    put('src/sdk/value.ts', 'export const value: number = 1;\n');
    put('test/helper.ts', 'import {make} from "../src/test/engine/helper"; export const result: string = make().value;\n');
    const badHelper = run('--noEmit');
    expect(badHelper.status).not.toBe(0);
    expect(String(badHelper.stdout) + String(badHelper.stderr)).toContain('TS2322');
    put('src/engine/value.ts', 'export const value: number = process.pid;\n');
    const badProduction = run('-b', 'src/engine/tsconfig.json');
    expect(badProduction.status).not.toBe(0);
    expect(String(badProduction.stdout) + String(badProduction.stderr)).toContain('Cannot find name');
    put('src/engine/value.ts', 'export const value: number = 1;\n');
    const unitFile = resolve(root, 'src/engine/value.test.ts'), unitTimes = statSync(unitFile);
    put('src/engine/value.test.ts', 'import {value} from "./value";export const result: string = value;\n');
    // A preserved/coarse source mtime may make the incremental builder reuse its clean result.
    // This negative checks the actual compiler refusal, independently of timestamp cache freshness.
    utimesSync(unitFile, unitTimes.atime, unitTimes.mtime);
    const badTest = run('-b', 'src/engine/tsconfig.json', '--force', '--verbose');
    expect(badTest.status, String(badTest.stdout) + String(badTest.stderr)).not.toBe(0);
    expect(String(badTest.stdout) + String(badTest.stderr)).toContain('TS2322');
    put('src/engine/value.test.ts', 'export function result(): number { return JSON.parse("1"); }\n');
    const unsafe = lint();
    expect(unsafe.status).not.toBe(0);
    expect(String(unsafe.stdout) + String(unsafe.stderr)).toContain('no-unsafe-return');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
