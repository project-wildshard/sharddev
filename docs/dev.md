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
- `node --test test/ci/navigation-author.test.mjs`: a packed SDK in an
  outside author builds and packs navigation, queries the emitted mesh,
  proves wet/trail/water rules and refuses an invalid policy. CI only;
  Nalati owns the authored wet-field/product counterpart.
- `pnpm lint:fix` / `pnpm format`: the hooks only check; these fix.
- `node src/cli/main.ts --help`: the CLI without installing it. `serve [--port n]` starts the server (default 4403); `pack <product>` tars a built product into a shardfile and `upload <shardfile>` sends one to api-server (`docs/design.md`).
- `pnpm md:wrap`: rewraps Markdown prose to ~72 columns.
- `src/scripts/ask-new.sh "<Jake's words>"`: opens an ask (`docs/tasks/asks/README.md`).

## Authored script-port proofs

The explicit CI-only numeric output proof is
`node --import @wildshard/engine/scripts/sim-node-loader.mjs --experimental-transform-types --test test/ci/channel-values.test.mjs`.
Six public consumer cases preserve signed zero, clocks, private
recurrence, mutable source values and atomic refusal/recovery. The
actual crab/thrall generators have their 300-frame equivalence proofs
in Driftwood and Pine. These tests keep 9.5-second full-body elapsed
and timeout guards, outside hooks. They edit no runtime or pose source.

The explicit CI-only observation proof is
`node --import @wildshard/engine/scripts/sim-node-loader.mjs --experimental-transform-types --test test/ci/headless-observation.test.mjs`.
It uses public installed engine APIs, real workers, all offline ticks,
an independent control and restored continuation, plus protocol fault
and stream-ownership refusals. Every case keeps a 9.5-second limit.
It does not run in commit or push hooks. It replaced the inherited
observation file, which is deleted (ENGINE-MOVE-CLEANUP PG3).

`@wildshard/sdk/test/compileDualScriptV2` exposes the existing
test-only dual compiler to installed author repositories. It captures
the same actual AS closure for both wrappers, requires every authored
source to be reachable, and admits both compiled artifacts through the
public format contracts. Owners execute their own input and continuation
laws against those artifacts. It does not select an ABI2 product, change
the wire or replace the shipping compiler. The content repo owns the
fixture and its explicit CI-only, sub-ten-second runner.

## Hero freshness

A shard's hero (its SHARD SELECT card: thumb 640x360, portrait 804x1626,
landscape 1600x900) is a picture of its world. `src/shards/<name>/hero.json`
records the hash of the shard's content when the hero was captured, and
`wildshard pack` refuses a product whose source now hashes differently, or
whose card names image files with no stamp. A generated `data:` card and a
product with no `src/shards/<name>` source pass with a note.

Rendering needs a real GPU and a served build of the exact candidate, so it
is a separate command, not a pack step. Serve the candidate in an engine
build (`scripts/serve-build.sh --shard <slug>`), then, from the shard
project root, run
`pnpm exec wildshard hero src/shards/<name> --base <served-build-url>`.
It enters the shard through SHARD SELECT in headless Chromium (Metal),
shoots the view `hero.json`'s `camera` declares (engine
`scripts/hero-shots.mjs`'s view shape) or else the spawn view, writes the
three files the manifest's card names, and re-stamps `hero.json`. Hero
files, the stamp, tests and generated files are not content.

`pnpm exec wildshard hero src/shards/<name> --stamp-existing` captures
nothing: it stamps the hero files already there as current, keeping a
declared `camera`. It is for a shard repo that gains this check with
curated heroes and no stamp. **Use it only when you have looked at those
images and they show the current content**: a wrong stamp hides a stale
hero until the next content change.

## J198 preparation

After building a candidate, serve that exact product in an engine preview.
Run `wildshard prepare <product-dir> --base <exact-preview-url>` through
engine `scripts/browser-lane.sh`. The command owns a fresh, muted iPhone
WebKit context and closes it on success or failure. It uses the served save
epoch for fixtures, verifies the candidate header or compiled admission
receipt, and refuses a document/build change during capture. Grid-only
products use the existing one-shot travel arrival in a fresh document;
there is no invented picker card or new game URL switch.

The producer computes a dependency fence plus the recorded manifest reads,
chooses the existing whole/fence pack policy, and records actual linked GLSL
pairs. It emits required cook version 3 and a `sdk: "0.3"` header, validates
all resulting bytes, then updates an existing receipt index digest without
inventing a new validator or cost. `wildshard pack` remains the final tar
validation boundary. A failed capture leaves the candidate draft untouched.

This source pins format `82bfee4748873b03a8f9be5dafab34f745cb265b` (v0.4.3).
Preparation binds the product, complete mounts and engine renderer digest.
The served document stamp must agree with its version metadata throughout
capture. A page build ID remains provenance, separate from this renderer
fingerprint. Only a preparation-only engine preview can admit a stale
candidate for recapture; the production gate refuses such an artifact.
Final engine cook rejects a different renderer before writing any parts.

For a new publication, `pack:shards` refuses an unprepared draft. Set
`WILDSHARD_PREPARATION_URL` to the exact preparation preview and run
`engine/scripts/browser-lane.sh pnpm pack:shards` from the author repo.
The recipe prepares each draft before packing. An already prepared product
can be packed again without a browser. Generic legacy archive readers and
exact-byte repair remain compatible; they do not bless a new draft.

Meta DOWNLOAD-THEN-C D5 owns the remaining publication recipes and the
replacement of the 28 legacy heads. Existing sdk 0.2 archives retain their
explicit compatibility reader; preparing one emits the strict sdk 0.3 form.

The explicit CI-only installed-product proof is
`node --test src/ci/cook-preparation.test.ts`. For an unpublished format,
`WILDSHARD_FORMAT_PROOF` can point at its packed package; it changes only
the disposable installed fixture, never the live checkout or workspace.

The explicit CI-only route proof runs after a real build:

```sh
node --experimental-transform-types --test test/ci/owned-journey.test.mjs
```

It drives 1,800 actual input ticks, checks waypoint progress and grounded
settling, disposes the real runtime and refuses a later tick. Routes live
in this repo; no quest flags, poses or host state are forced. Each case
keeps a 9.5 s limit and stays outside commit/push hooks.

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

## Installed map author proof

Run `node --test test/ci/map-author.test.mjs` explicitly, outside hooks.
Five quick cases exercise a packed SDK from a real outside author: real
nonempty map geometry, every legacy RGBA byte, lossless product intake,
repeatable packed output, undeclared-input refusal and selected/placed
baked geometry. Each case is capped at 20 s and each CLI call at 15 s.
Hosted builds take 6.2-7.4 s, and one slow runner took every build to
about 8.0 s, which the old 8 s spawn kill failed. Temporary products
are removed at the end. The reviewed SDK waiting ceiling is now 47.

## Installed keyed sky codec

After the frozen install, run
`node --import @wildshard/engine/scripts/sim-node-loader.mjs --experimental-transform-types --test test/ci/keyed-sky-codec.test.mjs`.
CI runs this explicitly outside hooks. Its 9.5-second timeout and elapsed
assertion include actual package installation, all calculations and
cleanup. The installed public author export packs every colour/gain byte
against an independent numerical half-float reference, retains the
historical worker checksum and unrounded horizon, and preserves gzip
bytes and selected typed-array views. Engine owns the companion clock,
weather-number and admission cases. This does not claim rendered pixels;
the original waiting SDK file remains for its owner to retire.

## Installed interaction placements

Run the explicit CI-only case with
`node --import @wildshard/engine/scripts/sim-node-loader.mjs --experimental-transform-types --test test/ci/interaction-placement.test.mjs`.
It resolves the public binding/reader from the actual packed SDK install,
keeps original table law and order, checks immutable source rows, and
retains every missing, duplicate, foreign, mismatched and nonfinite
placement refusal. Its 9.5 s bound includes packing and own cleanup.
Engine owns the real greeting-progress and native floor/frame companion;
the original waiting SDK file remains for its owner to retire.
