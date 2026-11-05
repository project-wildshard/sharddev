# format dependency

- First private git dependency: `@wildshard/format` from
  `github:project-wildshard/shardfile#v0.1.0`. It is here to prove
  the org CI can install it (meta repo B7): the kit's CI now mints a
  read-only token from the org GitHub App and rewrites
  `git@github.com:` (how pnpm-lock.yaml records the repo) to https
  with that token before `pnpm install`.
- The test (`src/test/format-dep.test.ts`) imports a type only. tsc
  reads the raw `.ts` in node_modules; Node erases the import, so the
  "no type stripping under node_modules" limit never bites. A runtime
  import would need esbuild or a strip-types hook (J53, J82).
- It lives in `src/test/`, not `src/shared/`: the web tsconfig also
  checks `src/shared` with no Node types, so `node:test` fails there.
