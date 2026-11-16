#!/usr/bin/env node
// CI21's imported tests participate in the normal typed lint and compiler gates.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lintEnvironment } from '../kit/scripts/bin-tools.mjs';
import ts from '@typescript/typescript6';

const manifest = JSON.parse(readFileSync(new URL('../test/ci21-sdk-tail.json', import.meta.url), 'utf8'));
const compiler = JSON.parse(readFileSync(new URL('../tsconfig.author.json', import.meta.url), 'utf8'));
const targets = manifest.files.map(file => file.targetPath);
const pending = JSON.parse(readFileSync(new URL('../test/lift-pending.json', import.meta.url), 'utf8'));
for (const target of targets) if (pending.includes(target)) throw new Error(`CI21 destination is excluded from the default suite: ${target}`);
const admitted = [...targets, ...manifest.supportPaths];
if (JSON.stringify([...compiler.files].sort()) !== JSON.stringify([...admitted].sort())) throw new Error('CI21 compiler paths differ from the recorded test/support destinations');

/** Find real test declarations, including each/template titles, without reading comments as tests. */
function testRoot(expression) {
  if (ts.isIdentifier(expression)) return ['test', 'it', 'describe'].includes(expression.text) ? expression.text : null;
  if (ts.isPropertyAccessExpression(expression)) {
    const root = testRoot(expression.expression);
    if (root !== null && expression.name.text !== 'each') throw new Error('CI21 ports must run in the default blocking suite');
    return root;
  }
  return ts.isCallExpression(expression) ? testRoot(expression.expression) : null;
}
function titles(path) {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true), found = [];
  const imported = new Set();
  for (const statement of source.statements) if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === 'vitest') {
    const bindings = statement.importClause?.namedBindings;
    if (bindings !== undefined && ts.isNamedImports(bindings)) for (const element of bindings.elements) {
      const original = element.propertyName?.text ?? element.name.text;
      if (['test', 'it', 'describe'].includes(original)) {
        if (original !== element.name.text) throw new Error(`CI21 test aliases need explicit admission: ${path}`);
        imported.add(original);
      }
    }
  }
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.initializer !== undefined && testRoot(node.initializer) !== null) throw new Error(`CI21 test aliases need explicit admission: ${path}`);
    if (ts.isCallExpression(node) && testRoot(node.expression) !== null) {
      const root = testRoot(node.expression);
      if (root === 'describe' || !imported.has(root)) throw new Error(`CI21 cases must be direct named Vitest imports: ${path}`);
      const title = node.arguments[0];
      if (title !== undefined && (ts.isStringLiteralLike(title) || ts.isTemplateExpression(title))) {
        if (![node.arguments[1], node.arguments[2]].some(body => body !== undefined && (ts.isArrowFunction(body) || ts.isFunctionExpression(body)))) throw new Error(`CI21 case has no executable body: ${path}`);
      }
      if (title !== undefined && ts.isStringLiteralLike(title)) found.push(title.text);
      else if (title !== undefined && ts.isTemplateExpression(title)) found.push(title.getText(source));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}
for (const file of manifest.files) {
  if (file.wireSplit !== undefined && file.caseSplit === true) throw new Error(`CI21 split modes are mutually exclusive: ${file.targetPath}`);
  for (const row of file.assertionCompanions ?? []) {
    if (!/^[a-f0-9]{40}$/u.test(row.revision ?? '') || !/^[a-f0-9]{40}$/u.test(row.targetBlob ?? '') || row.targetPath !== file.sourcePath || !['project-wildshard/engine','project-wildshard/shard-nalati'].includes(row.repository) || !Array.isArray(row.originalTests) || row.originalTests.length === 0 || row.originalTests.some(title => !file.originalTests.includes(title))) throw new Error(`CI21 companion must pin its revision, blob and original cases: ${file.targetPath}`);
  }
  if (file.targetTests !== undefined) {
    if (file.wireSplit !== undefined) {
      const split = file.wireSplit, companions = file.wireCompanions ?? [];
      const targets = file.originalTests.filter(title => title !== split.originalTest);
      if (!file.originalTests.includes(split.originalTest) || JSON.stringify(targets) !== JSON.stringify(file.targetTests) || !/^[a-f0-9]{40}$/u.test(split.fixtureBlob ?? '') || !Array.isArray(split.requiredKeys) || split.requiredKeys.length === 0 || new Set(split.requiredKeys).size !== split.requiredKeys.length) throw new Error(`CI21 wire split must retain exact source cases and fixture: ${file.targetPath}`);
      if (!/^test\/fixtures\/[a-z-]+\.json$/u.test(split.fixtureSourcePath ?? '')) throw new Error(`CI21 original wire fixture path differs: ${file.targetPath}`);
      const fixtureBytes = readFileSync(new URL(`../${split.fixtureSourcePath}`, import.meta.url));
      const fixtureBlob = createHash('sha1').update(`blob ${fixtureBytes.length}\0`).update(fixtureBytes).digest('hex');
      const fixture = JSON.parse(fixtureBytes.toString('utf8'));
      if (fixtureBlob !== split.fixtureBlob || !Array.isArray(fixture) || fixture.some(row => typeof row.name !== 'string' || !Number.isSafeInteger(row.bytes) || !/^[a-f0-9]{64}$/u.test(row.hash ?? '')) || JSON.stringify(fixture.map(row => row.name).sort()) !== JSON.stringify([...split.requiredKeys].sort())) throw new Error(`CI21 wire keys must match the unchanged original fixture: ${file.targetPath}`);
      if (companions.length < 2 || companions.some(row => !/^project-wildshard\/shard-(?:nalati|driftwood|dunes)$/u.test(row.repository ?? '') || !/^test\/[a-z-]+\.test\.ts$/u.test(row.targetPath ?? '') || !/^[a-f0-9]{40}$/u.test(row.revision ?? '') || !/^[a-f0-9]{40}$/u.test(row.targetBlob ?? '') || row.fixtureBlob !== split.fixtureBlob || row.fixturePath !== split.fixtureSourcePath || JSON.stringify(row.originalTests) !== JSON.stringify([split.originalTest]) || !Array.isArray(row.wireKeys) || row.wireKeys.length === 0)) throw new Error(`CI21 wire split requires pinned shard cases and original fixture: ${file.targetPath}`);
      const keys = companions.flatMap(row => row.wireKeys);
      if (new Set(keys).size !== keys.length || JSON.stringify([...keys].sort()) !== JSON.stringify([...split.requiredKeys].sort())) throw new Error(`CI21 wire split must cover every key exactly once: ${file.targetPath}`);
      process.stdout.write(`CI21 wire split: ${targets.length} SDK cases + ${companions.length} shard cases, ${keys.length} original wires (${file.targetPath})\n`);
    } else if (file.caseSplit === true) {
      const companions = file.assertionCompanions ?? [];
      if (companions.length === 0 || companions.some(row => !/^[a-f0-9]{40}$/u.test(row.revision ?? '') || row.targetPath !== file.sourcePath || !['project-wildshard/engine','project-wildshard/shard-nalati'].includes(row.repository) || !Array.isArray(row.originalTests) || row.originalTests.length === 0)) throw new Error(`CI21 split requires pinned native companions: ${file.targetPath}`);
      const covered = [...file.targetTests, ...companions.flatMap(row => row.originalTests)];
      if (new Set(covered).size !== covered.length || covered.length !== file.originalTests.length || covered.some(title => !file.originalTests.includes(title))) throw new Error(`CI21 split must partition every original case exactly once: ${file.targetPath}`);
      process.stdout.write(`CI21 split: ${file.targetTests.length} SDK + ${covered.length - file.targetTests.length} owner declarations (${file.targetPath})\n`);
    } else if (file.targetTests.length !== file.originalTests.length) throw new Error(`CI21 renamed case count differs: ${file.targetPath}`);
    for (const [index, title] of file.targetTests.entries()) if (file.caseSplit !== true && file.wireSplit === undefined && title !== file.originalTests[index]) process.stdout.write(`CI21 rename: ${file.originalTests[index]} -> ${title} (${file.targetPath})\n`);
  }
  if (JSON.stringify(titles(file.targetPath)) !== JSON.stringify(file.targetTests ?? file.originalTests)) throw new Error(`CI21 test declarations differ from their source record: ${file.targetPath}`);
}
const selected = process.argv.slice(2);
if (selected.some(file => !admitted.includes(file))) throw new Error('CI21 lint accepts only recorded test/support paths');
const paths = selected.length === 0 ? admitted : selected;
process.stdout.write(`CI21 typed lint: ${targets.length} recorded tests, ${manifest.supportPaths.length} support files; linting ${paths.length} paths\n`);
// Explicit admission includes only the recorded boundary helpers, alongside the port tests.
const run = spawnSync(process.execPath, ['kit/scripts/bin-tools.mjs', '--type-aware', '--tsconfig', 'tsconfig.author.json', '-c', '.oxlintrc.author.json', '--deny-warnings', ...paths], {
  stdio: 'inherit', env: { ...lintEnvironment(), WILDSHARD_RATCHET_FILE: 'lint/ratchet.json' },
});
if (run.error !== undefined) throw run.error;
process.exitCode = run.status ?? 1;
