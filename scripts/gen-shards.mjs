// E357 F9: folder discovery is the sole authored shard list.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from '@typescript/typescript6';
import { productManifestPath, authoredManifestSource } from '@wildshard/engine/scripts/authored-manifest.mjs';
import { outputManifest, shardProducts } from '@wildshard/engine/scripts/shard-outputs.mjs';
import { genShardWords } from '@wildshard/engine/scripts/gen-shard-words.mjs';
import { readProgramDiscovery, usesProgramDiscovery } from '@wildshard/engine/scripts/program-discovery.mjs';
import { authoredManifestImports } from '@wildshard/engine/scripts/manifest-static-imports.mjs';

/** Static runtime imports only: lazy plugin/look thunks and erased types stay out of the startup closure. */
export function manifestClosure(root) {
  const configPath = ts.findConfigFile(root, (file) => ts.sys.fileExists(file));
  const config = configPath ? ts.readConfigFile(configPath, (file) => ts.sys.readFile(file)).config : {};
  const { options } = ts.parseJsonConfigFileContent(config, ts.sys, root);
  // All products in this synchronous walk resolve against the same options.
  // Reuse resolution work and immutable syntax, never the closure or file bytes.
  const resolutions = ts.createModuleResolutionCache(root, name => ts.sys.useCaseSensitiveFileNames ? name : name.toLowerCase(), options);
  /** @type {Map<string,{text:string,source:import('@typescript/typescript6').SourceFile}>} */
  const syntax = new Map();
  const result = {};
  for (const product of shardProducts(root, shardFolders(root))) {
    const slug = product.slug, seen = new Set();
    const entry = resolve(root, productManifestPath(root, product));
    const authored = resolve(root, `src/shards/${product.folder}/manifest.json`);
    const visit = (file) => {
      const id = relative(root, file).replaceAll('\\', '/');
      if (seen.has(id)) return;
      seen.add(id);
      if (!/\.[cm]?[jt]sx?$/.test(file)) return;
      const text = file === entry && existsSync(authored)
        ? relocateDiscoverySource(root, product, authoredManifestImports(root, product.folder, product.output === null ? JSON.parse(readFileSync(authored, 'utf8')) : outputManifest(root, product.folder, product.output), product.output !== null)
          .map(specifier => `import ${JSON.stringify(specifier)};`).join('\n'))
        : readFileSync(file, 'utf8');
      let parsed = syntax.get(file);
      if (parsed?.text !== text) {
        parsed = { text, source: ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true) };
        syntax.set(file, parsed);
      }
      const source = parsed.source;
      for (const node of source.statements) {
        if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
        if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) continue;
        if (ts.isImportDeclaration(node)) {
          if (node.importClause?.phaseModifier === ts.SyntaxKind.TypeKeyword) continue;
          const bindings = node.importClause?.namedBindings;
          if (!node.importClause?.name && bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every((e) => e.isTypeOnly)) continue;
        } else if (node.isTypeOnly || (node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.length > 0 && node.exportClause.elements.every((e) => e.isTypeOnly))) continue;
        const specifier = node.moduleSpecifier.text;
        const target = ts.resolveModuleName(specifier, file, options, ts.sys, resolutions).resolvedModule?.resolvedFileName;
        if (target && !target.includes('/node_modules/') && !target.endsWith('.d.ts')) visit(target);
        // TypeScript intentionally does not resolve raster imports; include their bundler module ids too.
        else if (specifier.startsWith('.') && existsSync(resolve(dirname(file), specifier))) visit(resolve(dirname(file), specifier));
      }
    };
    visit(entry);
    result[slug] = [...seen].sort((a, b) => a.localeCompare(b));
  }
  return result;
}

/** Every product slug (SF88g: a folder's declared outputs, else the folder itself). */
export function shardSlugs(root) { return shardProducts(root, shardFolders(root)).map((row) => row.slug); }
export function shardFolders(root) {
  return readdirSync(resolve(root, 'src/shards'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && ['manifest.ts', 'manifest.json'].some(file => existsSync(resolve(root, 'src/shards', entry.name, file))))
    .map((entry) => entry.name).sort();
}


/**
 * The shard list (E362 AG4): every manifest, imported by the composition root (src/shards.generated.ts, installed by
 * src/shardList.ts) so the game layer imports no shard, and its TypeScript project builds without them.
 */
export function shardSource(root) {
  const products = shardProducts(root, shardFolders(root)), slugs = products.map((row) => row.slug);
  if (slugs.length === 0) throw new Error('gen-shards: no shard manifests');
  const catalogue = resolve(root, 'src/shared/game/grid/singleplayer.json');
  const placements = existsSync(catalogue) ? JSON.parse(readFileSync(catalogue, 'utf8')).placements : null;
  if (placements !== null) {
    const seen = new Set();
    for (const p of placements) {
      if (!slugs.includes(p.slug) || seen.has(p.slug) || !Array.isArray(p.cell) || p.cell.length !== 2 || !p.cell.every(Number.isSafeInteger) || !Array.isArray(p.size) || p.size.length !== 3 || !p.size.every((n) => n === 500) || typeof p.instance !== 'string') throw new Error('gen-shards: invalid grid placement');
      seen.add(p.slug);
    }
    if (seen.size !== slugs.length) throw new Error('gen-shards: missing grid placement');
  }
  const placed = slugs.flatMap((slug, i) => {
    if (placements === null) return [`m${i}`];
    const p = placements.find((entry) => entry.slug === slug);
    return [`{ ...m${i}, placement: { grid: ${JSON.stringify(p.cell)}, size: ${JSON.stringify(p.size)}, instance: ${JSON.stringify(p.instance)} } }`];
  });
  const metadata = placements === null ? '' : ' & { placement: { grid: [number, number]; size: [number, number, number]; instance: string } }';
  return `// Generated by gen:source (scripts/gen-shards.mjs) from authored manifests, outputs and grid placements; do not edit.
import type { ShardManifest } from './game/client/shard/manifest';
${products.map((product, i) => `import m${i} from '${moduleRelative(resolve(root, 'src'), resolve(root, productManifestPath(root, product))).slice(0, -'.ts'.length)}';`).join('\n')}
const placed: (ShardManifest${metadata})[] = [${placed.join(', ')}];
export const SHARDS: typeof placed = placed.sort((a, b) => a.order - b.order);
`;
}

const LOAD = /\bload:\s*\(\)\s*=>\s*import\(\s*['"]\.\.?\/plugin(?:\.ts)?['"]\s*\)/u;
const BUDGET_FILE = 'lint/manifest-closure-budget.json';
/** Only the exported manifest object can opt into the data-descriptor contract. */
export function shardfileDescriptor(text) {
  const source = ts.createSourceFile('manifest.ts', text, ts.ScriptTarget.Latest, true);
  const variables = new Map(); let expression;
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) variables.set(declaration.name.text, declaration.initializer);
    }
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) expression = statement.expression;
  }
  if (expression && ts.isIdentifier(expression)) expression = variables.get(expression.text);
  while (expression && (ts.isSatisfiesExpression(expression) || ts.isAsExpression(expression) || ts.isParenthesizedExpression(expression))) expression = expression.expression;
  if (!expression || !ts.isObjectLiteralExpression(expression)) return null;
  const named = (property, name) => property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) && property.name.text === name;
  const property = expression.properties.find((row) => named(row, 'shardfile'));
  if (property === undefined) return null;
  return { path: ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer) ? property.initializer.text : null,
    load: expression.properties.some((row) => named(row, 'load')) };
}
function descriptorContract(root, slug, text) {
  const descriptor = shardfileDescriptor(text);
  if (descriptor === null) return null;
  const failures = [];
  if (descriptor.path !== `/shardfiles/${slug}/shard.json`) failures.push('shardfile must be the literal canonical /shardfiles/<slug>/shard.json path');
  if (!existsSync(resolve(root, `src/shards/${slug}/shard.config.ts`))) failures.push('shardfile descriptor requires its buildable shard.config.ts project');
  if (descriptor.load) failures.push('shardfile descriptor cannot also load a runtime plugin');
  return failures;
}
/**
 * E362 AG10: a legacy `load` is `() => import('./plugin')`; a data descriptor has a canonical shardfile path and no load.
 * manifest's static closure stays inside its file budget (`lint/manifest-closure-budget.json`: one `default` limit for
 * every shard, not a ratchet); every `ShardManifest` field is read by the engine, the game or the tooling (`fields`).
 * Slug = folder is check-shards' (AG9).
 */
export function manifestContract(root, closure, fields = false) {
  const failures = [];
  const budgetPath = resolve(root, BUDGET_FILE);
  const budgets = existsSync(budgetPath) ? JSON.parse(readFileSync(budgetPath, 'utf8')).budgets : {};
  for (const product of shardProducts(root, shardFolders(root))) {
    const slug = product.slug, folder = product.folder;
    const json = existsSync(resolve(root, `src/shards/${folder}/manifest.json`));
    const source = readFileSync(resolve(root, json ? `src/shards/${folder}/manifest.json` : `src/shards/${folder}/manifest.ts`), 'utf8');
    const descriptor = json ? null : descriptorContract(root, slug, source);
    const authored = !json ? null : product.output === null ? JSON.parse(source) : outputManifest(root, folder, product.output);
    const dataOnly = json && authored.shardfile === `/shardfiles/${slug}/shard.json` && authored.bindings?.load === undefined && authored.bindings?.entry === undefined && existsSync(resolve(root, `src/shards/${folder}/shard.config.ts`));
    if (descriptor !== null) failures.push(...descriptor.map((message) => `src/shards/${slug}/manifest.ts: ${message}`));
    else if (!dataOnly && (json ? authored.bindings?.entry === undefined && authored.bindings?.load?.module !== './plugin' : !LOAD.test(source))) failures.push(`src/shards/${slug}/manifest.ts: load must be \`() => import('./plugin')\` (a lazy plugin, never a static import)`);
    if (/^import\s[^;]*['"]\.\.?\/plugin(?:\.ts)?['"]/mu.test(source)) failures.push(`src/shards/${slug}/manifest.ts imports ./plugin statically: it would ride in cold boot`);
    const budget = budgets[slug] ?? budgets.default, size = closure[slug]?.length ?? 0;
    if (typeof budget === 'number' && size > budget) failures.push(`src/shards/${slug}/manifest.ts: its static closure is ${size} files, over its budget ${budget} (${BUDGET_FILE}); move the new imports behind load / a lazy thunk`);
  }
  if (fields) {
    const file = resolve(root, 'src/client/game/shard/manifest.ts');
    const decl = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    let names = [];
    decl.forEachChild((n) => { if (ts.isInterfaceDeclaration(n) && n.name.text === 'ShardManifest') names = n.members.filter(ts.isPropertySignature).map((m) => m.name.getText(decl)); });
    const texts = [];
    const scan = (dir) => {
      if (!existsSync(resolve(root, dir))) return;
      for (const entry of readdirSync(resolve(root, dir), { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) scan(path);
        else if (/\.[cm]?[jt]s$/u.test(entry.name) && !entry.name.endsWith('.generated.ts')) texts.push(readFileSync(resolve(root, path), 'utf8'));
      }
    };
    for (const dir of ['src/engine', 'src/game', 'lint', 'scripts']) scan(dir);
    const all = texts.join('\n');
    for (const name of names) if (!new RegExp(`\\.${name}\\b|['"]${name}['"]`, 'u').test(all)) failures.push(`ShardManifest.${name}: nothing in the engine, the game or the tooling reads it; drop the field`);
  }
  return failures;
}

/** A product's discovery module source (its manifest.json bindings, its composed output when it declares one). */
function discoverySource(root, product) {
  const composed = product.output === null ? null : outputManifest(root, product.folder, product.output);
  const metadata = composed ?? JSON.parse(readFileSync(resolve(root, `src/shards/${product.folder}/manifest.json`), 'utf8'));
  const program = usesProgramDiscovery(metadata);
  return relocateDiscoverySource(root, product, authoredManifestSource(root, product.slug, { folder: product.folder, composed,
    ...(program ? { discovery: readProgramDiscovery(root, product.slug) } : {}) }));
}

function moduleRelative(from, to) {
  const path = relative(from, to).replaceAll('\\', '/');
  return path.startsWith('.') ? path : `./${path}`;
}

/** Rebase only actual module specifiers, never identically spelled authored data strings. */
export function relocateDiscoverySource(root, product, text) {
  const original = resolve(root, 'src/shards', product.folder), destination = dirname(resolve(root, productManifestPath(root, product)));
  if (original === destination) return text;
  const source = ts.createSourceFile('discovery.ts', text, ts.ScriptTarget.Latest, true), edits = [];
  const visit = node => {
    const specifier = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ? node.moduleSpecifier
      : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : undefined;
    if (specifier !== undefined && ts.isStringLiteral(specifier) && specifier.text.startsWith('.'))
      edits.push({ start: specifier.getStart(source), end: specifier.getEnd(), value: JSON.stringify(moduleRelative(destination, resolve(original, specifier.text))) });
    ts.forEachChild(node, visit);
  };
  visit(source);
  let output = text;
  for (const edit of edits.sort((left, right) => right.start - left.start)) output = output.slice(0, edit.start) + edit.value + output.slice(edit.end);
  return output;
}

/** Publish a complete replacement without truncating the module concurrent readers hold.
 * @param {string} path @param {string} source */
function writeDiscovery(path, source) {
  if (existsSync(path) && readFileSync(path, 'utf8') === source) return;
  const temporary = `${path}.${randomUUID()}.tmp`;
  mkdirSync(dirname(path), { recursive: true });
  try { writeFileSync(temporary, source, { flag: 'wx' }); renameSync(temporary, path); }
  finally { rmSync(temporary, { force: true }); }
}

/** Refresh every provider whose receipt/bindings are available. A missing or stale
 * product never deletes its last published module: a later generation failure must
 * not break concurrent source readers. genShards still requires current products and
 * strictly replaces these modules after program construction; no placeholder is emitted. */
export function refreshDiscovery(root = resolve(import.meta.dirname, '..')) {
  for (const product of shardProducts(root, shardFolders(root))) {
    if (!existsSync(resolve(root, `src/shards/${product.folder}/manifest.json`))) continue;
    const path = resolve(root, productManifestPath(root, product));
    let source;
    try { source = discoverySource(root, product); } catch { continue; }
    writeDiscovery(path, source);
    // Retire the old source wrapper only after its complete replacement exists.
    const prior = resolve(root, 'src/shards', product.folder, product.output === null ? 'discovery.generated.ts' : `discovery.${product.slug}.generated.ts`);
    if (prior !== path && existsSync(prior)) rmSync(prior);
  }
  retireDiscoveryBank(root);
}

/** This generator owns only its marked discovery modules, never other .app products. */
function retireDiscoveryBank(root) {
  const bank = resolve(root, 'out/.app');
  if (!existsSync(bank)) return;
  const owned = new Set(shardProducts(root, shardFolders(root)).map(product => resolve(root, productManifestPath(root, product))));
  for (const file of readdirSync(bank)) {
    if (!/^discovery\.[a-z0-9_.-]+\.generated\.ts$/u.test(file)) continue;
    const path = resolve(bank, file);
    if (!owned.has(path) && readFileSync(path, 'utf8').startsWith('// Generated by scripts/gen-shards.mjs — do not edit or commit.\n')) rmSync(path);
  }
}

/** The build-written shard tables (the shard list, the manifest closure), which import and walk every product's
 *  discovery module, by output path. genShards writes them; gen:source registers both. */
export function shardTables(root) {
  const closure = manifestClosure(root);
  return { 'src/shards.generated.ts': shardSource(root), 'src/server/game/shard/manifest-closure.generated.json': `${JSON.stringify(closure, null, 2)}\n` };
}

/** Emit the manifest inputs the boot writer actually consumes. Title data
 * is emitted by the final genShards pass after boot tables are complete. */
export function genShardInputs(root = resolve(import.meta.dirname, '..'), check = false, initializeMissing = false, shard = '') {
  genShardWords(root, check, shard);
  for (const product of shardProducts(root, shardFolders(root))) {
    if (!existsSync(resolve(root, `src/shards/${product.folder}/manifest.json`))) continue;
    const path = resolve(root, productManifestPath(root, product)), source = discoverySource(root, product);
    if (check && existsSync(path) && readFileSync(path, 'utf8') !== source) throw new Error(`gen-shards: stale ${path}`);
    if (!check || !existsSync(path)) writeDiscovery(path, source);
  }
  // SF88g: a discovery module no product owns any more (a folder that now declares outputs, a dropped output) is removed,
  // so no tree, mirror or loader keeps importing a retired product's manifest
  const owned = new Set(shardProducts(root, shardFolders(root)).map((product) => resolve(root, productManifestPath(root, product))));
  for (const folder of shardFolders(root)) for (const file of readdirSync(resolve(root, 'src/shards', folder))) {
    const path = resolve(root, 'src/shards', folder, file);
    if (!/^discovery(?:\.[a-z0-9-]+)?\.generated\.ts$/u.test(file) || owned.has(path)) continue;
    if (check) throw new Error(`gen-shards: stale ${relative(root, path)} (run pnpm gen)`);
    rmSync(path);
  }
  if (!check) retireDiscoveryBank(root);
  writeTables(root, shardTables(root), check, initializeMissing);
}

function writeTables(root, outputs, check, initializeMissing) {
  for (const [name, source] of Object.entries(outputs)) {
    const out = resolve(root, name);
    const exists = existsSync(out), same = exists && readFileSync(out, 'utf8') === source;
    // A staged-tree export lacks these untracked tables. Only that caller initializes missing outputs;
    // committed vocabulary above and any existing runtime table still have strict --check semantics.
    const initialize = initializeMissing && !exists;
    if (check && !same && !initialize) throw new Error(`gen-shards: stale ${name} (run pnpm gen)`);
    if ((!check || initialize) && !same) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, source); }
  }
}

/** Full standalone generation and strict checking. */
export function genShards(root = resolve(import.meta.dirname, '..'), check = false, initializeMissing = false, shard = '') {
  genShardInputs(root, check, initializeMissing, shard);
}

// C3: the client builds from a catalogue and its packs, so a tree with no shard source has nothing to generate.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href && existsSync(resolve(import.meta.dirname, '../src/shards'))) {
  try {
    const shard = process.argv.find((arg) => arg.startsWith('--shard='))?.slice(8);
    genShards(undefined, process.argv.includes('--check'), false, shard);
    // Vite runs discovery before boot byte tables exist. Budget generation belongs to pnpm gen after those tables.
    if (process.argv.includes('--check')) {
      const root = resolve(import.meta.dirname, '..'), failures = manifestContract(root, manifestClosure(root), true);
      if (failures.length > 0) throw new Error(`gen-shards: the manifest contract (AG10):\n  ${failures.join('\n  ')}`);
      const { genBudgetDerivations } = await import('@wildshard/engine/scripts/gen-budget-derivations.mjs');
      await genBudgetDerivations(undefined, true, shard);
    }
  }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
