// oxlint-disable-next-line import/no-nodejs-modules -- The codemod edits the shard owner's source and package files.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Resolve only paths under the supplied shard repository.
import { join, relative, resolve } from 'node:path';

const SKIP = new Set(['.git', '.worktrees', 'node_modules', 'tmp', 'out', 'dist', 'build', 'public']);
const MODULES = new Set(['bake/species', 'bake/riderArms', 'bake/specimenCatalogue', 'bake/nativeInteractionFacts', 'weapons/meleeProfile', 'weapons/bowProfile']);
const LITERAL = /(["'`])@wildshard\/(sdk|sharddev)\/([^"'`\s]+)\1/gu;

/** Module literals only: aliases, namespace/type imports and dynamic imports retain their syntax. */
export function rewriteKitImports(source) {
  return source.replaceAll(LITERAL, (whole, quote, name, path) => {
    const query = path.indexOf('?'), subpath = query === -1 ? path : path.slice(0, query), suffix = query === -1 ? '' : path.slice(query);
    if (MODULES.has(subpath)) return `${quote}@wildshard/kit/${subpath}${suffix}${quote}`;
    if (subpath === 'commons/bake/portableMath') return `${quote}@wildshard/${name}/math/portableMath${suffix}${quote}`;
    return whole;
  });
}

/** Move the six kit modules and align its direct pin with the installed SDK release (SDK-SPLIT D5). */
// oxlint-disable-next-line import/no-default-export -- update --pins loads release codemods by their default export.
export default function codemod({ project, to }) {
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/u.test(to)) throw new Error('Kit migration needs the installed SDK version');
  const kit = JSON.parse(readFileSync(new URL('../package.json', import.meta.resolve('@wildshard/kit')), 'utf8'));
  if (kit.name !== '@wildshard/kit' || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/u.test(kit.version)) throw new Error('Kit migration needs an installed kit release');
  const root = resolve(project), changes = [];
  let usesKit = false;
  const visit = folder => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || SKIP.has(entry.name)) continue;
      const file = join(folder, entry.name);
      if (entry.isDirectory()) { visit(file); continue; }
      if (!entry.isFile() || !/\.(?:[cm]?[jt]sx?|md)$/u.test(entry.name)) continue;
      const before = readFileSync(file, 'utf8'), after = rewriteKitImports(before);
      if (after.includes('@wildshard/kit/')) usesKit = true;
      if (before === after) continue;
      writeFileSync(file, after);
      changes.push(`${relative(root, file)}: import shared content from kit`);
    }
  };
  visit(root);
  const file = join(root, 'package.json');
  if (usesKit && existsSync(file)) {
    const pkg = JSON.parse(readFileSync(file, 'utf8'));
    const fields = ['dependencies', 'devDependencies'];
    const existing = fields.find(field => pkg[field]?.['@wildshard/kit'] !== undefined);
    const sdk = fields.find(field => ['@wildshard/sdk', '@wildshard/sharddev'].some(name => pkg[field]?.[name] !== undefined));
    const field = existing ?? sdk ?? 'devDependencies';
    if (pkg[field]?.['@wildshard/kit'] !== kit.version) {
      pkg[field] = { ...pkg[field], '@wildshard/kit': kit.version };
      writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
      changes.push(`package.json: pin @wildshard/kit ${kit.version}`);
    }
  }
  return changes;
}
