// SHARD-SOURCE AP36c: the Template's data files as an author writes them: a value that fits in 120 columns stays on one
// line (a colour, a spawn, a short row), a longer one opens one level, and a list of plain values packs into lines.
// Bake scripts that write the Template's data/ use this, so `--check` compares the same bytes the tree holds.

/** @param {unknown} value @param {number} [width] @returns {string} the file's text, with its final newline */
export function formatJson(value, width = 120) {
  const flat = v => {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return `[${v.map(flat).join(', ')}]`;
    const entries = Object.entries(v).filter(([, item]) => item !== undefined);
    return entries.length === 0 ? '{}' : `{ ${entries.map(([key, item]) => `${JSON.stringify(key)}: ${flat(item)}`).join(', ')} }`;
  };
  const write = (v, indent, lead) => {
    const line = flat(v);
    if (indent + lead + line.length <= width || v === null || typeof v !== 'object') return line;
    const pad = ' '.repeat(indent + 2), close = `\n${' '.repeat(indent)}`;
    if (!Array.isArray(v)) return `{\n${Object.entries(v).map(([key, item]) => `${pad}${JSON.stringify(key)}: ${write(item, indent + 2, JSON.stringify(key).length + 2)}`).join(',\n')}${close}}`;
    if (v.some(item => item !== null && typeof item === 'object')) return `[\n${v.map(item => `${pad}${write(item, indent + 2, 0)}`).join(',\n')}${close}]`;
    const lines = [];
    for (const item of v.map(item => JSON.stringify(item))) {
      const last = lines.at(-1);
      if (last !== undefined && pad.length + last.length + 2 + item.length <= width) lines[lines.length - 1] = `${last}, ${item}`;
      else lines.push(item);
    }
    return `[\n${lines.map(line => `${pad}${line}`).join(',\n')}${close}]`;
  };
  return `${write(value, 0, 0)}\n`;
}

if (process.argv[1] === import.meta.filename) {
  const { readFileSync, writeFileSync } = await import('node:fs');
  for (const path of process.argv.slice(2)) writeFileSync(path, formatJson(JSON.parse(readFileSync(path, 'utf8'))));
}
