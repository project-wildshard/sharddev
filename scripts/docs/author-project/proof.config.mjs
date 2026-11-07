// Bundle retained commons/format TypeScript for Node; keep the installed SDK worker and three identity external.
// oxlint-disable-next-line import/no-default-export -- Rolldown loads this author-owned configuration.
export default {
  input: 'prove-native.ts',
  platform: 'node',
  external: [/^@wildshard\/sdk(?:\/|$)/u, /^node:/u, 'three'],
  output: { dir: 'proof-tools', format: 'esm', entryFileNames: '[name].mjs' },
};
