# Developing sharddev

Living doc: commands, layout, code rules and git hooks. AGENTS.md links
here; what the repo does is `docs/prd.md`, how it is built `docs/design.md`.

## Commands

Run from the repo root.

- `pnpm install`: installs deps and points `core.hooksPath` at `.githooks/`,
  through `pnpm:devPreinstall`. Never use `prepare` here (`../leftover/docs/repo-kit.md`).
- `pnpm check`: typecheck + lint + format:check + unit tests + asks. The pre-push hook runs it.
- `pnpm test`: `node:test` on `src/**/*.test.ts` outside `src/ci`, run as .ts by Node's type stripping.
- `pnpm test:hooks`: the `.githooks/` suite (CI, and pre-commit when hooks change).
- `pnpm dev`: esbuild watch + the server on http://127.0.0.1:4403.
- `pnpm build`: builds the web app into `src/dist/web`.
- `pnpm test:ci`: `src/ci`, outer-edge tests: `wildshard` as an install lays it out, on a real product. CI only, never a hook (J186).
- `pnpm test:e2e`: Playwright against a built app. CI only.
- `pnpm lint:fix` / `pnpm format`: the hooks only check; these fix.
- `node src/cli/main.ts --help`: the CLI without installing it. `serve [--port n]` starts the server (default 4403); `pack <product>` tars a built product into a shardfile and `upload <shardfile>` sends one to api-server (`docs/design.md`).
- `pnpm md:wrap`: rewraps Markdown prose to ~72 columns.
- `src/scripts/ask-new.sh "<Jake's words>"`: opens an ask (`docs/tasks/asks/README.md`).

## J198 preparation

After building a candidate, serve that exact product in an engine preview.
Run `wildshard prepare <product-dir> --base <exact-preview-url>` through
engine `scripts/browser-lane.sh`. The command owns a fresh, muted iPhone
WebKit context and closes it on success or failure. It uses the served save
epoch for fixtures, verifies the candidate header or compiled admission
receipt, and refuses a document/build change during capture.

The producer computes a dependency fence plus the recorded manifest reads,
chooses the existing whole/fence pack policy, and records actual linked GLSL
pairs. It emits required cook version 2 and a `sdk: "0.3"` header, validates
all resulting bytes, then updates an existing receipt index digest without
inventing a new validator or cost. `wildshard pack` remains the final tar
validation boundary. A failed capture leaves the candidate draft untouched.

This source needs format `8d4478566c6dfe2b384adbf6c26fe08159f027b8`
or its eventual release. Meta DOWNLOAD-THEN-C D5 still owns the consumer
pin, mandatory preparation in the publication recipes, renderer identity
agreement and replacement of the 28 legacy heads. A captured document build
ID is recorded provenance; it is not an engine renderer fingerprint.

The explicit CI-only installed-product proof is
`node --test src/ci/cook-preparation.test.ts`. For an unpublished format,
`WILDSHARD_FORMAT_PROOF` can point at its packed package; it changes only
the disposable installed fixture, never the live checkout or workspace.

## Layout

The root stays thin: README.md and AGENTS.md (humans only), CLAUDE.md
(`@AGENTS.md`), package.json, pnpm-lock.yaml, .npmrc, .gitignore,
.editorconfig, `docs/`, `project/`, `src/` and the dot dirs. Scratch
goes in `tmp/<task>/` and is deleted when done.

- `src/cli/`: the CLI (`--version`, `--help`, `serve`, `pack`, `upload`; more commands arrive with the import). `bin.mjs` is the installed entry: Node won't strip types under `node_modules`, so it installs format's hook first.
- `src/cli/pack/`: `wildshard pack`: read the product, tar, validate, write.
- `src/cli/upload/`: `sharddev upload`: check, compress, sign, ticket, PUT, commit.
- `src/test/helpers/`: shared test helpers; `git.ts` makes real git repos in temp dirs.
- `src/server/`: the Hono app (`GET /api/health`) and `serve.ts`.
- `src/shared/`: valibot schemas used on both sides of the wire.
- `src/web/`: the Preact web app, with its own `tsconfig.json` (DOM lib).
- `src/tools/build-web.ts`: esbuild into `src/dist/web` (`--dev` watches and serves).
- `src/e2e/`: Playwright smoke test (CI).
- `src/scripts/`: repo tooling (asks, md-wrap), plain JS.
- `docs/`: living docs. `docs/plans/` is the queue, `docs/tasks/asks/`
  the receipts.
- `project/`: history. `journal/`, `origins/` (the meta-repo plans this
  repo came from), `archive/`.

## Generation cache

The author loader keys each bundled cached callback on its lexical recipe,
declared input bytes, compiler and host. An opaque higher-order callback
keeps the conservative program key. Cache indexes are in
`~/.cache/wildshard/gen/v3/keys`; content lives once in `gen/blobs`.
`WILDSHARD_GEN_CACHE` selects an isolated cache for a proof.

Generation schedules a low-priority collector on Mac and Linux. G430 keeps
up to three recent keys per job, expires one-day history, then evicts LRU
keys toward a 20 GB cache cap. A background allocation census reserves
space for legacy indexes and codec memos outside the shared pool. Live
leases, current successful receipts and
legacy hardlinks survive even when their bytes exceed the cap. Removed
checkouts release their receipts. Legacy key directories and codec memos
are outside the new collector until their readers adopt its lock protocol.
The storage mutex uses a native SQLite transaction, released by the OS on
process death; no stale owner-file repair is needed.

The quick outer-edge proof is explicit, outside the hook test set:
`pnpm exec vitest run --config test/ci/generation-cache.vitest.mjs`.
The separate native CLI boundary proof avoids paying for a second test
loader: `node --test test/ci/generation-cli.test.mjs`.

## Code rules

- TypeScript only, imports with explicit `.ts`/`.tsx` extensions.
- Every function has an explicit return type. `src/.oxlintrc.json` denies
  every category (D28); disable a rule only with a one-line reason beside it.
- Pin dependencies exactly (`.npmrc` has `save-exact=true`).
- Other Wildshard repos are git dependencies pinned by tag
  (`github:project-wildshard/<repo>#vX.Y.Z`). They are private, so CI reads
  them with the org GitHub App token.
- Tests use real things (git in temp dirs, real files and processes); never
  mock git. No LLM, `claude`, herdr or network in tests.

## Git hooks

| Hook | Checks | Bypass |
| --- | --- | --- |
| commit-msg | Conventional Commits subject ≤ 50, body ≤ 72, one `Assisted-by: AGENT:MODEL` trailer, no AI `Co-Authored-By` | `SKIP_ATTRIB=1` (human-only commit) |
| pre-commit | `main` in the main checkout (D27), staged set echo, whitespace, 1 MB cap, credentials, sh / mjs syntax, new-plan Status line, journal (D25) | `ALLOW_BRANCH=1`, `ALLOW_BIG=1`, `ALLOW_SECRET=1`, `SKIP_JOURNAL=1` |
| pre-commit | lint + format:check on staged code, typecheck; 8 s budget | `SKIP_BUDGET=1` (time only), `SKIP_CHECK=1` |
| pre-push | outgoing commits: size, credentials, syntax; then `pnpm check` | `ALLOW_BIG=1`, `ALLOW_SECRET=1`, `SKIP_CHECK=1` |

Bypasses are for the case they name, never for a red gate: fix the code,
not the gate.
