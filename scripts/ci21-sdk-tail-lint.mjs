#!/usr/bin/env node
// CI21's imported tests participate in the normal typed lint and compiler gates.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import ts from '@typescript/typescript6';

const manifest = JSON.parse(readFileSync(new URL('../test/ci21-sdk-tail.json', import.meta.url), 'utf8'));
const compiler = JSON.parse(readFileSync(new URL('../tsconfig.author.json', import.meta.url), 'utf8'));
const targets = manifest.files.map(file => file.targetPath);
const admitted = [...targets, ...manifest.supportPaths];
if (JSON.stringify([...compiler.files].sort()) !== JSON.stringify([...admitted].sort())) throw new Error('CI21 compiler paths differ from the recorded test/support destinations');

/** Find real test declarations, including each/template titles, without reading comments as tests. */
function testRoot(expression) {
  if (ts.isIdentifier(expression)) return ['test', 'it'].includes(expression.text) ? expression.text : null;
  if (ts.isPropertyAccessExpression(expression)) {
    const root = testRoot(expression.expression);
    if (root !== null && ['skip', 'only', 'todo'].includes(expression.name.text)) throw new Error('CI21 ports must run in the default blocking suite');
    return root;
  }
  return ts.isCallExpression(expression) ? testRoot(expression.expression) : null;
}
function titles(path) {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true), found = [];
  const visit = node => {
    if (ts.isCallExpression(node) && testRoot(node.expression) !== null) {
      const title = node.arguments[0];
      if (title !== undefined && ts.isStringLiteralLike(title)) found.push(title.text);
      else if (title !== undefined && ts.isTemplateExpression(title)) found.push(title.getText(source));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}
for (const file of manifest.files) {
  if (JSON.stringify(titles(file.targetPath)) !== JSON.stringify(file.targetTests ?? file.originalTests)) throw new Error(`CI21 test declarations differ from their source record: ${file.targetPath}`);
}
const selected = process.argv.slice(2);
if (selected.some(file => !admitted.includes(file))) throw new Error('CI21 lint accepts only recorded test/support paths');
const paths = selected.length === 0 ? admitted : selected;
process.stdout.write(`CI21 typed lint: ${targets.length} recorded tests, ${manifest.supportPaths.length} support files; linting ${paths.length} paths\n`);
// Explicit admission includes only the recorded boundary helpers, alongside the port tests.
const run = spawnSync('node_modules/.bin/oxlint', ['--type-aware', '--tsconfig', 'tsconfig.author.json', '-c', '.oxlintrc.author.json', '--deny-warnings', ...paths], {
  stdio: 'inherit', env: { ...process.env, WILDSHARD_RATCHET_FILE: 'lint/ratchet.json' },
});
if (run.error !== undefined) throw run.error;
process.exitCode = run.status ?? 1;
