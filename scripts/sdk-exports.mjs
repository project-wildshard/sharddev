#!/usr/bin/env node
// SHARD-COMPAT ST19a (J486 for the SDK and CLI, audit B3/B7): an SDK export, package bin or CLI verb a shard repo uses is
// never deleted under it. The lock (packages/sdk/exports.lock.json) lists every public name the packages ship; the
// usage census (packages/sdk/export-usage.json) lists which shard repos use each one. `check` refuses a name the lock
// has and the tree lost unless a census under 24 hours old shows no repo using it, naming the users otherwise.
//
//   node scripts/sdk-exports.mjs lock                       write the lock from packages/*/package.json and the CLI help
//   node scripts/sdk-exports.mjs usage --repos <dir,...|@file>  census the shard repos' source, scripts and workflows
//   node scripts/sdk-exports.mjs check                      the delete gate (pnpm check runs it)
//   node scripts/sdk-exports.mjs alias <old> <new>          ST19b: keep a renamed SDK export as a warning alias
//
// ST19b: `alias ./random ./rng` keeps `@wildshard/sdk/random` resolving through a shim under src/deprecated/ that warns
// once per process and re-exports the new module, and records it in packages/sdk/deprecated-exports.json with the SDK
// version it first shipped in. `check` refuses deleting an alias in the release that made it (one release at least).
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

export const LOCK = 'packages/sdk/exports.lock.json';
export const USAGE = 'packages/sdk/export-usage.json';
export const DEPRECATED = 'packages/sdk/deprecated-exports.json';
const DAY_MS = 24 * 60 * 60 * 1000;
/** A shard repo's alias for the SDK (`"@wildshard/sharddev": "npm:@wildshard/sdk@..."`). */
const ALIASES = Object.freeze({ '@wildshard/sharddev': '@wildshard/sdk' });
const SKIP = new Set(['node_modules', '.git', 'tmp', 'out', 'dist', 'public', '.worktrees', 'coverage']);
const SOURCE = /\.(?:[cm]?[jt]sx?|json|ya?ml|sh)$/u;

/** Every public name the workspace ships: package export subpaths, bins and CLI verbs.
 * @param {string} root @returns {string[]} */
export function publicNames(root) {
  /** @type {string[]} */
  const names = [];
  for (const dir of readdirSync(join(root, 'packages')).sort()) {
    const file = join(root, 'packages', dir, 'package.json');
    if (!existsSync(file)) continue;
    const pkg = JSON.parse(readFileSync(file, 'utf8'));
    if (pkg.private === true) continue;
    for (const key of Object.keys(pkg.exports ?? {})) names.push(key === '.' ? pkg.name : `${pkg.name}/${key.replace(/^\.\//u, '')}`);
    for (const bin of Object.keys(typeof pkg.bin === 'string' ? { [pkg.name]: pkg.bin } : pkg.bin ?? {})) names.push(`bin:${bin}`);
  }
  const help = join(root, 'packages/dev/src/cli/help.ts');
  if (existsSync(help)) {
    const text = readFileSync(help, 'utf8');
    const start = text.indexOf('const VERBS'), end = text.indexOf('\n}', start);
    for (const match of text.slice(start, end).matchAll(/^ {2}(?:'([a-z][a-z-]*)'|([a-z][a-z-]*)): `/gmu)) names.push(`verb:${match[1] ?? match[2]}`);
  }
  return [...new Set(names)].sort();
}

/** @param {string} dir @param {string[]} out */
function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (entry.isFile() && SOURCE.test(entry.name) && statSync(path).size < 2_000_000) out.push(path);
  }
}

/** Which locked names each repo's files use: import specifiers (an alias counted as the SDK), and the CLI verbs and
 * bins its scripts and workflows call. @param {string[]} repos @param {readonly string[]} names */
export function census(repos, names) {
  /** @type {Record<string,string[]>} */
  const users = {};
  const exportsByLength = names.filter(name => name.startsWith('@')).sort((a, b) => b.length - a.length);
  const verbs = names.filter(name => name.startsWith('verb:')).map(name => name.slice(5));
  const bins = names.filter(name => name.startsWith('bin:')).map(name => name.slice(4));
  for (const repo of repos) {
    const files = [];
    walk(repo, files);
    const used = new Set();
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/['"`](@wildshard\/[a-z-]+(?:\/[A-Za-z0-9_./-]+)?)['"`]/gu)) {
        let spec = match[1];
        for (const [alias, real] of Object.entries(ALIASES)) if (spec === alias || spec.startsWith(`${alias}/`)) spec = real + spec.slice(alias.length);
        const hit = exportsByLength.find(name => spec === name || (name.endsWith('*') && spec.startsWith(name.slice(0, -1))));
        if (hit !== undefined) used.add(hit);
      }
      if (/\.(?:json|ya?ml|sh)$/u.test(file)) {
        for (const bin of bins) {
          for (const match of text.matchAll(new RegExp(`(?:^|[\\s"'\`;&|(])${bin}\\s+([a-z][a-z-]*)`, 'gmu'))) {
            used.add(`bin:${bin}`);
            if (verbs.includes(match[1])) used.add(`verb:${match[1]}`);
          }
        }
      }
    }
    for (const name of used) (users[name] ??= []).push(basename(repo));
  }
  return users;
}

/** The delete gate. @param {readonly string[]} locked @param {readonly string[]} current
 * @param {{at:string,repos:string[],users:Record<string,string[]>}|undefined} usage @param {number} now @returns {string[]} */
export function gate(locked, current, usage, now) {
  const have = new Set(current), errors = [];
  const gone = locked.filter(name => !have.has(name));
  if (gone.length > 0) {
    if (usage === undefined) errors.push(`${gone.length} public name(s) left the SDK with no usage census (${USAGE}); run node scripts/sdk-exports.mjs usage --repos <the shard repos>: ${gone.join(', ')}`);
    else if (now - Date.parse(usage.at) > DAY_MS) errors.push(`${USAGE} is older than 24 hours (${usage.at}); re-run the census before deleting ${gone.join(', ')}`);
    else for (const name of gone) if ((usage.users[name] ?? []).length > 0) errors.push(`${name} is gone but ${usage.users[name].join(', ')} still use it: keep it as a warning alias for a release (ST19b) until no repo does`);
  }
  const added = current.filter(name => !locked.includes(name));
  if (added.length > 0) errors.push(`new public name(s) not in ${LOCK}: ${added.join(', ')}; run node scripts/sdk-exports.mjs lock`);
  return errors;
}

/** ST19b: aliases deleted in the same SDK version that made them. @param {Record<string,{to:string,since:string}>} deprecated
 * @param {readonly string[]} current @param {string} version @returns {string[]} */
export function aliasErrors(deprecated, current, version) {
  return Object.entries(deprecated).filter(([old, row]) => !current.includes(old) && row.since === version)
    .map(([old, row]) => `${old} became an alias of ${row.to} in ${version}; it ships for one release before it can go`);
}

/** ST19b: keep `old` as a warning alias of `next` (both SDK export keys, `./name`). @param {string} root @param {string} old @param {string} next */
export function alias(root, old, next) {
  const file = join(root, 'packages/sdk/package.json'), pkg = JSON.parse(readFileSync(file, 'utf8'));
  const target = pkg.exports?.[next];
  if (typeof target !== 'string') throw new Error(`${next} is not an SDK export`);
  if (old === next || !/^\.\/[A-Za-z0-9_/-]+$/u.test(old)) throw new Error(`bad alias name ${old}`);
  const shim = `./src/deprecated/${old.slice(2)}.ts`, depth = old.slice(2).split('/').length;
  const up = '../'.repeat(depth + 1), oldName = `${pkg.name}/${old.slice(2)}`, newName = `${pkg.name}/${next.slice(2)}`;
  mkdirSync(dirname(join(root, 'packages/sdk', shim)), { recursive: true });
  writeFileSync(join(root, 'packages/sdk', shim), `// SHARD-COMPAT ST19b: ${oldName} is a deprecated alias of ${newName} since ${pkg.version}.\n`
    + `// It goes once scripts/sdk-exports.mjs usage finds no shard repo importing it.\n`
    + `import { warnDeprecatedExport } from '${up}src/sharddev/deprecation.ts'\n`
    + `warnDeprecatedExport('${oldName}', '${newName}', '${pkg.version}')\n`
    + `export * from '${up}${target.replace(/^\.\//u, '')}'\n`);
  pkg.exports[old] = shim;
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
  const listed = join(root, DEPRECATED), rows = existsSync(listed) ? JSON.parse(readFileSync(listed, 'utf8')) : {};
  rows[oldName] = { to: newName, since: pkg.version };
  writeFileSync(listed, `${JSON.stringify(rows, null, 1)}\n`);
  return shim;
}

/** @param {string[]} argv @param {string} root @returns {number} */
export function main(argv, root = process.cwd()) {
  const [verb, ...rest] = argv;
  const current = publicNames(root);
  if (verb === 'lock') {
    writeFileSync(join(root, LOCK), `${JSON.stringify({ about: 'SHARD-COMPAT ST19a: every public SDK export, bin and CLI verb; scripts/sdk-exports.mjs check refuses deleting one a shard repo uses', names: current }, null, 1)}\n`);
    console.log(`sdk-exports: ${current.length} names locked in ${LOCK}`);
    return 0;
  }
  if (verb === 'usage') {
    const at = rest.indexOf('--repos'), value = at < 0 ? undefined : rest[at + 1];
    if (value === undefined) throw new Error('usage needs --repos <dir,...|@file>');
    const text = value.startsWith('@') ? readFileSync(value.slice(1), 'utf8') : value.replaceAll(',', '\n');
    const repos = text.split('\n').map(line => line.trim()).filter(Boolean).map(path => resolve(path));
    const users = census(repos, current);
    writeFileSync(join(root, USAGE), `${JSON.stringify({ at: new Date().toISOString(), repos: repos.map(repo => basename(repo)), users: Object.fromEntries(Object.entries(users).sort(([a], [b]) => a.localeCompare(b))) }, null, 1)}\n`);
    console.log(`sdk-exports: ${Object.keys(users).length} of ${current.length} names used across ${repos.length} repos (${USAGE})`);
    return 0;
  }
  if (verb === 'check') {
    const lock = JSON.parse(readFileSync(join(root, LOCK), 'utf8'));
    const usage = existsSync(join(root, USAGE)) ? JSON.parse(readFileSync(join(root, USAGE), 'utf8')) : undefined;
    const deprecated = existsSync(join(root, DEPRECATED)) ? JSON.parse(readFileSync(join(root, DEPRECATED), 'utf8')) : {};
    const version = JSON.parse(readFileSync(join(root, 'packages/sdk/package.json'), 'utf8')).version;
    const errors = [...gate(lock.names, current, usage, Date.now()), ...aliasErrors(deprecated, current, version)];
    for (const error of errors) console.error(`sdk-exports: ${error}`);
    if (errors.length === 0) console.log(`sdk-exports: ${current.length} public names, none deleted under a user`);
    return errors.length === 0 ? 0 : 1;
  }
  if (verb === 'alias') {
    const [old, next] = rest;
    if (old === undefined || next === undefined) throw new Error('alias needs <old> <new>, SDK export keys such as ./random ./rng');
    console.log(`sdk-exports: ${old} now warns and re-exports ${next} (${alias(root, old, next)})`);
    return 0;
  }
  console.error('usage: node scripts/sdk-exports.mjs lock | usage --repos <dirs> | check | alias <old> <new>');
  return 2;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = main(process.argv.slice(2));
