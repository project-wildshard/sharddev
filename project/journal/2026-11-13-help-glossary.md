# 2026-11-13 help in the glossary's words (SA2)

- Lane opus-sa2, meta SHARD-AUTHORING SA2 (J317). Every verb has
  `--help` now (`wildshard <verb> --help`, `wildshard help <verb>`),
  from one table, `src/cli/help.ts`; bin/wildshard.mjs prints it before
  routing, so `new --help` no longer makes a folder called `--help`.
- Help, usage, refusal fixes and progress lines speak the glossary:
  shard source, shard file, upload, channel, flip, prepare. Gone from
  author text: product, cook, tarball, revision (now "catalogue
  number" in upload's last line), head, shard project. `pack` stays
  only as the deprecated alias's entry.
- Flags and rule ids unchanged (`--product-only` still works, just
  undocumented). The refusal regexes take the new and old words, since
  api-server still says "in the shardfile".
- `src/cli/help.test.ts` runs each verb's `--help` through the bin and
  fails on a retired word; installed-author checks four verbs.
- Left: `newProject.ts`'s generated README still says "product"; that
  file was another lane's dirty work, so it waits.
