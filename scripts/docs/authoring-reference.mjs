import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from '@typescript/typescript6';

const HERE = import.meta.dirname;
const directive = /<!-- example: ([a-z][a-z-]*) -->/gu;

/** Every retained example must be referenced once; no unchecked inline TypeScript hides in the guide. */
export function authoringExamples(directory = HERE) {
  const guide = readFileSync(resolve(directory, 'authoring-guide.md'), 'utf8');
  if (guide.includes('```')) throw new Error('Authoring guide code belongs in checked example sources');
  const names = [...guide.matchAll(directive)].map(match => match[1]);
  const files = readdirSync(resolve(directory, 'authoring')).filter(file => file.endsWith('.ts')).map(file => file.slice(0, -3)).sort();
  if (names.length === 0 || new Set(names).size !== names.length || JSON.stringify([...names].sort()) !== JSON.stringify(files)) throw new Error('Authoring example coverage differs from retained sources');
  return names.map(name => ({ name, file: resolve(directory, 'authoring', `${name}.ts`), source: readFileSync(resolve(directory, 'authoring', `${name}.ts`), 'utf8') }));
}

/** Render the exact tested example bytes into the generated SDK guide. No generated example has a separate manual copy. */
export function authoringGuide(directory = HERE) {
  const examples = new Map(authoringExamples(directory).map(example => [example.name, example.source]));
  return readFileSync(resolve(directory, 'authoring-guide.md'), 'utf8').replaceAll(directive, (_match, name) => {
    const source = examples.get(name);
    if (source === undefined) throw new Error(`Missing authoring example ${name}`);
    return `\`\`\`ts\n${source.trimEnd()}\n\`\`\``;
  });
}

/** Semantic TypeScript checks for the exact examples rendered in the public guide, using the repository's strict options. */
export function checkAuthoringExamples(root, files = authoringExamples().map(example => example.file)) {
  const configFile = resolve(root, 'tsconfig.json');
  const config = ts.readConfigFile(configFile, ts.sys.readFile);
  if (config.error !== undefined) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  const program = ts.createProgram(files, { ...parsed.options, noEmit: true });
  const diagnostics = [...program.getOptionsDiagnostics()];
  for (const file of files) {
    const source = program.getSourceFile(file);
    if (source === undefined) throw new Error(`Missing checked authoring source ${file}`);
    diagnostics.push(...program.getSyntacticDiagnostics(source), ...program.getSemanticDiagnostics(source));
  }
  return diagnostics.map(row => `${row.file?.fileName ?? configFile}: ${ts.flattenDiagnosticMessageText(row.messageText, '\n')}`);
}

/** Exact public binding coverage for SDK/format tables; absent/duplicate/stale entries or missing doc lines fail. */
export function authoringApiCoverage(surface, documents) {
  const failures = [], coverage = {};
  for (const layer of ['sharddev', 'format']) {
    const expected = surface.indexes[layer];
    if (expected === undefined || expected.length === 0) throw new Error(`Missing public ${layer} inventory`);
    const page = documents[`docs/api/${layer.toUpperCase()}.md`];
    if (page === undefined) throw new Error(`Missing generated ${layer} document`);
    const rows = [...page.matchAll(/^\| `([^`]+)` \| [^|]+ \| (@wildshard\/[^ |]+) \| (.*) \|$/gmu)];
    const entries = new Map();
    for (const row of rows) {
      const key = `${row[2]}#${row[1]}`;
      if (entries.has(key)) failures.push(`Duplicate documentation: ${key}`);
      entries.set(key, row[3]);
    }
    let documented = 0;
    for (const row of expected) {
      const key = `${row.from}#${row.name}`, description = entries.get(key);
      if (!row.doc || description === undefined || description === '—' || description.trim() === '') failures.push(`Undocumented public binding: ${key}`);
      else documented++;
      entries.delete(key);
    }
    for (const key of entries.keys()) failures.push(`Stale documentation: ${key}`);
    coverage[layer] = { total: expected.length, documented };
  }
  return { coverage, failures };
}
