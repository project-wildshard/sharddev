# sharddev: design

Status: draft 2026-11-05: scaffold only; the real design arrives with the import.

Living doc: **how** this repo is built. What it does and why is
`docs/prd.md`. Keep this true as the code changes.

## Today

Only the scaffold exists:

- `src/cli/`: the CLI (`--version`, `--help`; commands arrive with the import).
- `src/test/helpers/`: shared test helpers; `git.ts` makes real git repos in temp dirs.
- `src/server/`: the Hono app (`GET /api/health`) and `serve.ts`.
- `src/shared/`: zod schemas used on both sides of the wire.
- `src/web/`: the Preact web app, with its own `tsconfig.json` (DOM lib).
- `src/tools/build-web.ts`: esbuild into `src/dist/web` (`--dev` watches and serves).
- `src/e2e/`: Playwright smoke test (CI).
- `src/scripts/`: repo tooling (asks, md-wrap), plain JS.

## Dependencies

- `engine`, by git tag (`github:project-wildshard/<repo>#vX.Y.Z`)
- `shardfile`, by git tag (`github:project-wildshard/<repo>#vX.Y.Z`)

## Boundaries the checks enforce

- Imports only the engine's published exports, never its internals

## Coming with the import

- src/sdk/cli.ts (minus validate) and the in-tree sharddev package from P1 F4
- `src/sdk/bake/`
- `scripts/build-shardfiles.mjs`
- `scripts/shardfile-cache.mjs`
- `src/engine/explore/`
- `drafts/`
- `scripts/docs/author-project`
