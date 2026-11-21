// SHARD-COMPAT CP18 (meta, J486; audit B5, B6): one pin per shard repo. `update --pins` runs it on the move to 0.4.24.
// - `@wildshard/format/immutable` imports that take only `hashImmutableBytes` and `encodeCanonicalJson` (about 160
//   of the shard repos' format imports) come from the sdk's own `immutable` (SA7a), under the name the repo lists the
//   sdk by (`@wildshard/sdk`, or the `@wildshard/sharddev` alias most shards use).
// - A repo whose source no longer imports `@wildshard/engine` (CP18b moved proofs and tests onto
//   `@wildshard/dev/test/*`) drops the engine pin: the SDK family's own pin is the one that runs.
// - A repo that lists `three` gains `@types/three` at the sdk's pin beside it, so its `tsc` finds three's types (the
//   mini's typecheck on the packed graph, 11-21).
// `@wildshard/format` itself stays listed: it is the spec package, and `update --pins` keeps it at the release's pin.
/* oxlint-disable node/no-sync, import/no-nodejs-modules -- A codemod is a one-shot synchronous edit of the shard repo on disk. */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from '@typescript/typescript6';

// `.githooks` and fixture folders hold strings that look like imports (Mirror Salt's pinned-links fixture).
const SKIP = new Set(['.git', '.githooks', '.worktrees', 'node_modules', 'tmp', 'out', 'dist', 'build', 'public', 'fixtures', '__fixtures__']);
const OWNED = new Set(['hashImmutableBytes', 'encodeCanonicalJson']);
const IMMUTABLE = /import(\s+type)?\s*\{([^}]*)\}\s*from\s*(["'])@wildshard\/format\/immutable\3/gu;
const ENGINE = /^@wildshard\/engine(?:\/|$)/u;
const FIELDS = ['dependencies', 'devDependencies'];

/** An import of only the SDK-owned immutable helpers reads them from `<sdk>/immutable`; any other stays. */
export function rewriteImmutableImports(source, sdk = '@wildshard/sdk') {
  return source.replaceAll(IMMUTABLE, (whole, type, names, quote) => {
    const listed = names.split(',').map(name => name.trim().replace(/^type\s+/u, '').split(/\s+as\s+/u)[0]).filter(Boolean);
    if (listed.length === 0 || !listed.every(name => OWNED.has(name))) return whole;
    return `import${type ?? ''} {${names}} from ${quote}${sdk}/immutable${quote}`;
  });
}

/** Whether `source` really imports engine: TypeScript's pre-processor reads its import, export-from, dynamic import
 * and require specifiers, so a string that merely names `@wildshard/engine` (a package.json fixture) is not one. */
export function importsEngine(source) {
  return ts.preProcessFile(source, true, true).importedFiles.some(file => ENGINE.test(file.fileName));
}

/** The `@types/three` the installed sdk pins (its own dependencies). */
function sdkTypesThree() {
  const sdk = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const spec = sdk.dependencies?.['@types/three'];
  return typeof spec === 'string' ? spec : undefined;
}

// oxlint-disable-next-line import/no-default-export -- update --pins loads release codemods by their default export.
export default function codemod({ project }) {
  const root = resolve(project), changes = [], file = join(root, 'package.json');
  const pkg = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const sdk = ['@wildshard/sdk', '@wildshard/sharddev'].find(name => FIELDS.some(field => pkg[field]?.[name] !== undefined));
  let usesEngine = false;
  const visit = folder => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || SKIP.has(entry.name)) continue;
      const path = join(folder, entry.name);
      if (entry.isDirectory()) { visit(path); continue; }
      if (!entry.isFile() || !/\.(?:[cm]?[jt]sx?)$/u.test(entry.name)) continue;
      const before = readFileSync(path, 'utf8'), after = sdk === undefined ? before : rewriteImmutableImports(before, sdk);
      if (!usesEngine && importsEngine(after)) usesEngine = true;
      if (before === after) continue;
      writeFileSync(path, after);
      changes.push(`${relative(root, path)}: immutable helpers from ${sdk}/immutable`);
    }
  };
  visit(root);
  if (!existsSync(file)) return changes;
  const types = sdkTypesThree();
  const threeField = FIELDS.find(field => pkg[field]?.three !== undefined);
  const typed = FIELDS.some(field => pkg[field]?.['@types/three'] !== undefined);
  if (types !== undefined && threeField !== undefined && !typed) {
    pkg[threeField] = { ...pkg[threeField], '@types/three': types };
    writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
    changes.push(`package.json: pin @types/three ${types} beside three`);
  }
  if (usesEngine) return changes;
  let dropped = false;
  for (const field of FIELDS) {
    if (pkg[field]?.['@wildshard/engine'] === undefined) continue;
    delete pkg[field]['@wildshard/engine'];
    dropped = true;
  }
  for (const overrides of [pkg.pnpm?.overrides, pkg.overrides]) {
    if (overrides?.['@wildshard/engine'] === undefined) continue;
    delete overrides['@wildshard/engine'];
    dropped = true;
  }
  if (dropped) {
    writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
    changes.push('package.json: drop the @wildshard/engine pin (no source imports it; the SDK family pins the engine)');
  }
  return changes;
}
