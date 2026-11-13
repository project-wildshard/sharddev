# 2026-11-13: generator-imports reads a ?raw import by its path

> Written by: Claude

sdk v0.2.4's `generator-imports` judged the whole specifier, so
`@wildshard/sharddev/commons/scripts/course.as?raw` read as an
unexported subpath though `./commons/scripts/course.as` is exported.
shard-nalati switched the rule off for `kokparProgram.ts` (`ae3c97a`);
shard-nine-dragon's `practiceProgram.ts` would need the same.

- The rule now cuts the specifier at its first `?` or `#` (after the
  first character, so a `#` subpath import stays whole) before every
  check. That is Vite's own split (`splitFileAndPostfix`, `/[?#].*$/`),
  which resolves the path part through the package exports and keeps
  `?raw`, `?url`, `?worker&inline` as a postfix; engine's import rules
  cut the same way. Node keeps a bare `?` in the subpath, so there the
  cut path is only ever the stricter read.
- It also closes `@wildshard/engine?raw` and `@wildshard/sdk/runtime?raw`,
  which slipped past the denylist before (its regexes want `/` or end).
- Test red first on the old rule; an exported `?raw` passes, an
  unexported one, the engine, three/src, another shard and a data-file
  npm package with a query are still refused.

Owed: the shards pin sdk by tag, so nalati's override comes out (and
nine-dragon needs none) after the next sdk release.

Not fixed here (review found it, older): a relative `%2e%2e` segment
resolves as a folder name to `path.resolve` but as `..` to the URL
parser, so it can reach another shard's source unrefused.
