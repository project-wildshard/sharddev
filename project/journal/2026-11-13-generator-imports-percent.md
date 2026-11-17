# 2026-11-13: generator-imports refuses percent-escaped import paths

> Written by: Claude

The `claude -p` review of `fdea821` found that a relative import with
`%2e%2e` segments could reach another shard's source unrefused.

- Checked first: Node resolves a relative specifier as a URL, so
  `./%2e%2e/%2E./other/x.mjs` loads `../../other/x.mjs`, and it refuses
  `%2f` (`ERR_INVALID_MODULE_SPECIFIER`). Vite 8 (Rolldown) decodes
  nothing and fails all of them unresolved. The lint used
  `path.resolve`, which keeps `%2e%2e` as a folder name inside the
  shard, so it passed. A `file:` URL with `%2f` made the rule throw.
- Fix: refuse any `%XX` escape in the path (before the `?`/`#`
  postfix) instead of decoding. Node and Vite disagree on what an
  escape means, so no single decode matches the build, and no author
  path needs one. A percent-escape in a `?query` still passes.
- The `claude -p` review found the same gap through characters the
  URL parser rewrites: `\` reads as `/`, and tabs and newlines drop
  out. Those are refused too, and a relative path must now name the
  same file through `new URL` (Node) as through `path.resolve`, a
  catch-all for any rewrite not listed. A `file:` URL with a host is
  refused instead of throwing.
- Tests red first: encoded `..` to another shard (generators and
  data), `%2f` slashes (relative, sdk, `file:`), encoded
  `@wildshard/engine` names, backslashes, tabs, newlines, a trailing
  space and a `file://host` URL.

Not fixed here: engine's `lint/shard-imports.mjs` resolves the raw
specifier with `path.resolve` too, so it has the same hole.
