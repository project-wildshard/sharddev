// oxlint-disable-next-line import/no-nodejs-modules -- The injected build context owns declared input directories.
import { lstatSync, readdirSync, realpathSync } from 'node:fs';
// oxlint-disable-next-line import/no-nodejs-modules -- Confine URL prefixes to their explicitly owned physical roots.
import { resolve, sep } from 'node:path';

/** Fresh presence facts only: no file payload or native service enters the author module. */
export function projectInputFiles(roots: readonly { readonly prefix: string; readonly directory: string }[], prefixes: readonly string[], project?: string): readonly string[] {
  if (prefixes.length === 0 || prefixes.length > 8) throw new Error('Invalid generation inventory prefix count');
  const selected = [...prefixes].sort();
  for (const [index, prefix] of selected.entries()) {
    if (!/^\/?(?:[a-zA-Z0-9._-]+\/)+$/u.test(prefix) || prefix.split('/').some(part => part === '.' || part === '..')) throw new Error('Invalid generation inventory prefix');
    const previous = selected[index - 1];
    if (previous !== undefined && prefix.startsWith(previous)) throw new Error('Overlapping generation inventory prefixes');
  }
  const files: string[] = []; let directories = 0;
  for (const prefix of selected) {
    const matches = prefix.startsWith('/') ? roots.filter(root => prefix.startsWith(root.prefix)) : project === undefined ? [] : [{ prefix: '', directory: project }], root = matches[0];
    if (matches.length !== 1 || root === undefined) throw new Error('Generation inventory needs exactly one declared root');
    const relative = prefix.slice(root.prefix.length), directory = resolve(root.directory, relative);
    if (directory !== root.directory && !directory.startsWith(root.directory + sep)) throw new Error('Generation inventory escaped its declared root');
    let parent = root.directory;
    for (const part of relative.split('/').filter(Boolean)) {
      parent = resolve(parent, part);
      const stat = lstatSync(parent);
      if (stat.isSymbolicLink()) throw new Error('Linked generation inventory input');
      if (!stat.isDirectory()) throw new Error('Generation inventory prefix is not a directory');
    }
    const pending = [{ directory, url: prefix, depth: 0 }];
    while (pending.length > 0) {
      const next = pending.pop(); if (next === undefined) throw new Error('Missing generation inventory directory');
      if (++directories > 4096 || next.depth > 32) throw new Error('Generation inventory directory bound exceeded');
      if (realpathSync(next.directory) !== next.directory) throw new Error('Linked generation inventory input');
      const entries = readdirSync(next.directory, { withFileTypes: true });
      if (entries.length > 8192) throw new Error('Generation inventory entry bound exceeded');
      for (const entry of entries) {
        if (entry.isSymbolicLink()) throw new Error('Linked generation inventory input');
        const path = resolve(next.directory, entry.name), url = next.url + entry.name;
        if (entry.isDirectory()) pending.push({ directory: path, url: `${url}/`, depth: next.depth + 1 });
        else if (entry.isFile()) {
          if (files.length >= 4096) throw new Error('Generation inventory file bound exceeded');
          files.push(url);
        } else throw new Error('Nonregular generation inventory input');
      }
    }
  }
  return files.sort();
}
