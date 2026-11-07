# Standalone author setup (OS-F10)

The author needs no game checkout, renderer service, linked workspace or global CLI.
Use **Node 24 LTS**, npm 10 or newer and a POSIX shell (macOS/Linux or Windows WSL).
The reference generators are ordinary retained TypeScript. Blender is optional; Python,
Herdr and the repository's bake scripts are not author prerequisites.

## Install a matched release

Until registry publication, a release consists of **three version-matched local tarballs**:
SDK, format and commons. Get all three from one release; do not invent registry versions
or install workspace source aliases. The SDK archive includes both compiled clients,
its native worker, portable declarations, the CLI and the author reference sources.
Format supplies the defining schemas; commons supplies build-time packs.

From an empty directory called `author-outpost`, with the archives in `../release/`:

```sh
npm init -y
npm pkg set type=module
npm pkg set 'overrides.@wildshard/sdk=$@wildshard/sdk'
npm pkg set 'overrides.@wildshard/format=$@wildshard/format'
npm install ../release/wildshard-sdk-0.0.0.tgz ../release/wildshard-format-0.0.0.tgz ../release/wildshard-commons-0.0.0.tgz three@0.186.0
npm install --save-dev typescript@7.0.2 @types/node@24.13.6 @types/three@0.186.0 rolldown@1.2.13
node node_modules/@wildshard/sharddev/dist/author-template/bootstrap.mjs .
```

Archive filenames track the actual release version; the current development version is
`0.0.0`. The overrides make internal SDK/format dependencies use those exact local
archives, rather than an unrelated registry copy. Bootstrap preserves the installed
dependencies and refuses to overwrite existing authored inputs. Do not use `--ignore-scripts`
for installation: native build-tool dependencies need their normal platform setup.

## Inspect, generate, build and play

```sh
npm run typecheck
npm run synth
npm run generate
npm run build
npm run validate
npm run dev
```

`wildshard` is the package-local executable in npm scripts. `synth` reads
`shard.config.ts` and writes inspectable `scene.json`; it does not publish a shard.
`generate` executes `generate.ts`, which calls the readable `generators/world.ts`
and emits `assets/world.glb`. `build` runs that generator before the official SDK
bakes, validates and emits `dist/shard.json`, immutable assets and the normal client.
`validate` proves the product's native simulation and entries. `dev` serves a rebuilt
static author client on a printed local URL, watches the retained inputs and closes on Ctrl-C.
Open that URL to play; an author graph or successful schema parse alone is not a gameplay proof.

Edit `data/identity.ts` first: stable slug, readable name, author, revision and seed.
The floor is ordinary `Mesh`/`BoxGeometry`/`MeshStandardMaterial`; `PlayerStart` and
four `Entry.midpoints()` belong to the same graph. The official GLB reader installs
mesh collision from that retained source. This is a small floor reference, not an outpost
with every one-shot behavior already implemented.

`shard.config.ts` builds a project-local catalogue from `generators/spear.ts`, selects
the stable `starter-spear/model` and `starter-spear/contacts` identities, copies their byte-derived costs and exports the pinned
`commons` bytes for the builder. Pack imports install nothing. See the executable
[commons example](author-project/shard.config.ts); assets remain immutable
content hashes in the product. Add gameplay through the documented rows, then repeat
build/validate and the brief's actual behavior checks.

## Produce the release archives (maintainers only)

From a clean repository export, use the machine build queue for the SDK's prepack:

```sh
mkdir -p release
pnpm --filter @wildshard/sdk pack --pack-destination ../../release
pnpm --filter @wildshard/format pack --pack-destination ../../release
pnpm --filter @wildshard/commons pack --pack-destination ../../release
```

SDK prepack acquires `heavy-lane.py build` before building both clients. Release
consumers only install the resulting archives; they never run that repository hook.
Use the same source revision for every archive and retain its identity with the release.
The standalone proof checks installed files, runs generation/synth/build/validation and
requires no symlink back to the repository. No generated GLB or project output replaces
its retained TypeScript generator.

## Prove the rendered client from an isolated seat

Use the [isolated browser driver](../../docs/authoring/isolated-browser.md) when the
author seat denies checkout reads and permits only API network calls. A maintainer
opens the exact built product in one owned muted browser; the seat sends bounded
real keyboard input and reads installed SDK proof ports over file pipes. The original
read/network sandbox stays unchanged. Pass `seatProofPage(channel)` as the executing
proof's real client argument; no supplied observations, CDP endpoint or arbitrary
page evaluator enters the seat. Close the owned driver when the proof finishes.

## Run retained proof programs with installed commons

Node 24 does not strip TypeScript inside `node_modules`. Commons packs and format
contracts intentionally ship readable TypeScript; running a proof that imports them
directly with `node proof.ts` will fail. Bundle that proof into ordinary ESM first:

```sh
npm run build
npm run proof:native
# For your own proof entry:
npm run proof:bundle -- --input audit-product.ts
node proof-tools/audit-product.mjs dist
```

Bootstrap copies `proof.config.mjs` and an executing `prove-native.ts`. The runner
reads the exact built product and immutable files, checks its starter-spear catalogue
closure, and invokes the SDK's native validation. When changing packs, update that
explicit pack list to match `shard.config.ts`. The bundle includes commons/format
source but keeps `@wildshard/engine/host/*`, `three`, and Node built-ins external: the SDK
retains its real installed worker URL and the client/proof share one three.js identity.
The config never rewrites installed packages or enables Node's unsupported type stripping.

`prove-mesa.ts` exports `proveMesaOutpost`; importing it is not an executing proof.
Your entry must call it with the actual product bytes, real entered client and authored
route. Its native, replay, scene and equipped-item checks remain mandatory. A native
validation summary alone gives no credit for those rendered-client gates.

After producing the matched archives, the retained milestone proof runs the consumer path above.
The `format` archive comes from `pnpm pack` in the `project-wildshard/shardfile` clone, at the tag the SDK pins:

```sh
node scripts/docs/proof-standalone.mjs release /tmp/fresh-author-proof
```

The destination must not exist. It installs actual archives, refuses checkout links, copies the retained
sources, typechecks them and runs synth/generate/build/validate. Its small summary records browser play
as unmeasured; serving a compiled client is not a browser gameplay receipt.
