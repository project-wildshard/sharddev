# @wildshard/sdk changelog

Every release has a section here before it is tagged: one to five
bullets in plain language, for shard authors and Jake, never commit
subjects. Notes for work that has landed but not shipped wait under
"Unreleased" at the top. To release, rename that heading by hand to
the next version and date, commit and push it, then run repo-kit's
`release.sh` (it does not read or edit this file).

## v0.4.14 (2026-11-19)

- A slow upload prints its resume command and finishes waiting before the publish job runs out of time.
- Read an upload verdict on another machine with only its upload ID.

## v0.4.13 (2026-11-18)

- Fresh starter shards prepare with the released engine v0.1.46 client, which loads the boar skin.

## v0.4.12 (2026-11-18)

- Built on shard-format 0.43.0: grapple mode profiles, a strike row's overshoot and fur strands are admitted.
- The format's JSON schemas export again with the grapple rows' read-only lists.

## v0.4.11 (2026-11-18)

- `world.creature` makes a serpent from a `trail` row, and a `clipMap` says which clip plays each state or ability.
- Rigged hulls keep the hull book's look: maps, fur sheen and rim or a painterly surface, a pressed flap, a skin per variant.
- Species programs turn into plain layered creature rows (`@wildshard/sdk/species/toRows`).
- Built on shard-format 0.41.0: legless flyers and camelCase species ids in spawns are admitted.

## v0.4.10 (2026-11-18)

- Prepare and preview tiered shard products with the exact engine v0.1.44 author clients.

## v0.4.9 (2026-11-18)

- Nine Dragon Stack scenery takes less graphics memory with compact slabs.

## v0.4.8 (2026-11-18)

- A `world.part` vehicle (the land-sail) has a hull now: its solid meshes stop players on foot and ride with it, never blocking its rider.
- The hull needs an engine with `3165a100` (v0.1.43 or later); an older engine leaves it off, so nothing changes there.

## v0.4.7 (2026-11-18)

- `@wildshard/kit` really is on shard-format 0.26.0 now (0.4.6 still pinned 0.28.0), so builds stop failing on "Named JSON provenance".
- Drop any `pnpm.overrides` that forced kit's shard-format; one format version is now enforced across all six packages.
- Kit's breath, shoot, throw and spit templates wait until every package moves to a newer shard format together.

## v0.4.6 (2026-11-18)

- Cut from main before the kit fix landed: `@wildshard/kit` 0.4.6 still pins shard-format 0.28.0. Use 0.4.7.
- `wildshard build` folds browser-only fallback imports out of a generator's Node bundle instead of refusing it.

## v0.4.5 (2026-11-18)

- `wildshard update --pins` renames more of engine 0.1.35's headless names in a shard's tests, imports inside a function included.
- `wildshard prepare` and `wildshard dev` fetch the clients of the engine actually installed, so an engine override is respected.
- `wildshard check` refuses a creature over 64 bones or 16 hit volumes and warns past its size class's triangle and texture marks.
- `world.creature` builds a skinned creature from a group of named bones; the bake kit can shrink a creature's mesh for the phone.

## v0.4.4 (2026-11-17)

- wildshard dev builds shards whose generators read /assets/ inputs, and serves the shard's public assets.
- wildshard build-shards prepares Basis again when installed from npm (the sdk no longer looks for the engine).
- update --pins keeps a newer shard-format pin and moves the CI tests and lint config to the split packages.

## v0.4.3 (2026-11-17)

- `wildshard new` pins the sdk and `@wildshard/cli` at a release npm has, so a new starter always installs.
- `wildshard check` accepts a shard's imports from `@wildshard/dev` (the map rest, the native raster), where `update --pins` moved them.

## v0.4.2 (2026-11-17)

- A scene part can be a vehicle a player boards and steers: `world.part(..., { panel, vehicle })`, with an optional wind push for a sail.

## v0.4.1 (2026-11-17)

- `wildshard update --pins` moves a shard onto the split packages: it pins `@wildshard/cli` and fixes moved imports.
- A shard whose tests import the engine keeps it as a dev pin that moves with each release.

## v0.4.0 (2026-11-17)

- The `wildshard` command now comes from `@wildshard/cli`: one install brings build, upload and the local game.
- `wildshard build` runs the engine-free `@wildshard/build`, so building a shard never loads the engine.
- New shards pin `@wildshard/cli` instead of the engine; kit, upload, build and dev publish with the sdk.
- Race shards name their resets, and sockets leave shared colliders (Mirror Salt, Glowfen and raft fixes).

## v0.3.9 (2026-11-16)

- Async uploads show cooking and activation progress, with full refusal reports.
- Inspect an async upload with its status command, or use --no-wait to return with its ID.
- Uploads warn when the API holds a shard back from placement.
- New Mossgate templates have flatter entrances and chests that pay on interaction.

## v0.3.8 (2026-11-16)

- `wildshard prepare` and `dev` use engine 0.1.32, so a shard with its own runtime prepares and publishes.

## v0.3.7 (2026-11-16)

- `wildshard prove` and `check` play a stand-still proof tape on the Template again instead of refusing its Wasm imports.
- A shard's baked map rebuilds when the sdk code that bakes it changes, not only when its own files change.
- The sdk's species and engine types match engine 0.1.31 and shard format 0.12.0 again.

## v0.3.6 (2026-11-16)

- A scene shard's lanterns can hang and swing (`hang`), and a touchable part is a body players push, like Mossgate's crate by the gate.
- A proof tape can talk to an NPC, pick a choice and check what the player carries (`requiredItems`); the GUIDE shows how.
- A shard config that imports the sdk's boot inventory builds again (it split into two modules on 0.3.4 and 0.3.5).
- Built on engine 0.1.31 and shard format 0.12.0.

## v0.3.5 (2026-11-16)

- GUIDE section 2b shows how to write a scene shard, and the GUIDE explains uploading from a shard repo's Actions.
- `wildshard grid` prints which grid cells are taken and which are free on a channel.
- A scene shard's player starts with the iron sword; the scene template's grass and ferns are detail layers.
- `prove --help`, the GUIDE and the proof-tape refusal show a tape's shape.
- `new` prints its next command, `check` prints no Node warning, and the road, synth and manifest refusals say what to change.

## v0.3.4 (2026-11-16)

- Upload with the account credential saved by wildshard account, without a creator private key (MU2).
- Bound prepare's headless WebKit startup and explain the installer fallback before fetching its client (MU3).
- Capture a scene shard's hero without requiring a manifest (MU1).
- Return to the shard after a dev save, and allow the same tab to re-enter without a missing packs book (MU4).
- Boot the watch page and show part edits without reloading, including with a capped frame rate (MU5).

## v0.3.3 (2026-11-16)

- `wildshard hero` works on a scene shard with no manifest.json; the next build's card wears the capture.
- Every `wildshard hero` refusal is one `[hero-<rule>]` line with its fix, never a stack trace.
- A creature can be written in three.js: `creatureGlb` turns bones, meshes and clips into a skinned rig.
- `world.trigger` and `world.interact` place quest triggers and interactions at a scene node.
- A two-sided three.js material (grass, ivy and fern cards) is two-sided in the built shard too.

## Unreleased

- A creature can be written in three.js: `creatureGlb` turns a Group of named bone nodes, meshes and
  AnimationClips into a skinned GLB rig, `creatureSkin` writes its skin rows, and a PointLight under a
  bone becomes a look lamp that follows the creature (`creatureLampRows`, shard-format v0.5.9).
- `world.trigger` and `world.interact` place quest triggers and interactions at a scene node.
- A two-sided three.js material (grass, ivy and fern cards) is two-sided
  in the built shard too: `wildshard build` used to drop the back faces
  that `wildshard watch` and three.js draw.

## v0.3.2 (2026-11-15)

- A panel part's material is one draw, even where it crosses a tile
  edge; a panel past 18 MB is refused by part name at build, with
  the fix, instead of failing at upload.
- Fixed: a source shard with several outputs (Open Plots) builds each
  output's shard file again: the hero check no longer looks for the
  source's own card in an output that wears its own.

## v0.3.1 (2026-11-15)

- New: a three.js scene shard now carries alpha cards and decals,
  sprites and points as one draw each, declared motion (flicker,
  pulse, sway, uvScroll), TSL materials and a painted sky
  (`world.sky`). A still `InstancedMesh` stays instanced.
- New: `world.part(name, build, { panel: 'my.gate' })` makes a part a
  panel: its meshes and solids hide together when a `targets.panels`
  row says so, as a gate that opens.
- `wildshard watch` takes look edits live in under 0.1 s, ground edits
  in about 0.12 s, and restarts the simulation for a quest edit, keeping
  the player where they stand. On engine 0.1.21 it draws parts with
  lamps or water (they were refused as a duplicate frame observer).
- Fixed: scene colours leave in sRGB and the ground is a lit PBR
  surface, so scene shards are no longer too dark and saturated. The
  sdk moves to engine 0.1.21 and shard-format 0.5.7.
- New: behaviour scripts import `./wildshard`, a prelude that reads
  state and events and writes commands by name, so a script holds no
  memory addresses. The Template's door is written on it.

## v0.3.0 (2026-11-14)

- Breaking: the sdk moves to shard-format 0.5.3 and engine 0.1.19.
  shard-format 0.5 renamed its modules: `@wildshard/format/product`
  is now `shardfileAssets`, `productValidation` is
  `shardfileValidation`, `productAudio` is `shardfileAudio` and
  `directorProduct` is `directorDocument`. A shard source that
  imports one of those changes the path; `wildshard update --pins`
  moves the pins.
- New: write a shard as a three.js scene (`@wildshard/sdk/scene/shard`)
  and run `wildshard watch <source>`: each edited part swaps into the
  running page in about a second, without a reload.
- Retired: `wildshard new --template blender`. A shard is TypeScript
  three.js scene source, and Blender makes the `.glb` models it
  loads. Repos made with it still check and upload.
- New: `three` is a peer of `@wildshard/sdk`, pinned exact. Every
  `wildshard` and `sharddev` command checks the installed `three`
  first and refuses, naming the version it wants and the one it
  found, so a wrong `three` fails before anything is built.

## v0.2.13 (2026-11-13)

- Fix: `wildshard prepare` with no `--base` timed out. Its preview
  served the candidate's mounted files (its `discovery.json` under
  `mounts/shardfiles/<slug>/`, and the public files it owns) from
  the wrong place, so the page's boot stopped at "Discovery of
  <slug> answered 404". The preview now serves each mount at its
  URL from where the product's `cook.json` says it is kept.

## v0.2.12 (2026-11-13)

- New: a hand-picked hero card can be marked `"curated": true` in
  `hero.json`. After a content change, `wildshard hero
  --stamp-existing` re-stamps the art already there, and a
  `--base` capture refuses instead of shooting the spawn view over
  it.

## v0.2.11 (2026-11-13)

- Fix: `wildshard prepare <folder>` with no `--base` now finds
  engine's preparation client on its own release, so an author
  needs no `WILDSHARD_PREPARATION_CLIENT_URL` and no engine checkout.
- Engine moves from 0.1.17 to 0.1.18.

## v0.2.10 (2026-11-13)

- Fix: a recording the build re-encodes now gets a new name, the
  hash of the bytes it serves (`island-calm-05125ed8.m4a` becomes
  `island-calm-3d097258.m4a`), so a returning player never keeps
  the old file from a year-long cache. The shard's own sfx.json and
  music.json follow the new names, and the build refuses a product
  that still names an old one.

## v0.2.9 (2026-11-13)

- Change: the sdk installs engine 0.1.17 and the shard format 0.4.9
  from npm, not from GitHub, so `npm install @wildshard/sdk` works
  with npm alone and needs no git. A new shard repo pins both from
  npm too.
- Engine moves from 0.1.16 to 0.1.17.

## v0.2.8 (2026-11-13)

- Fix: a shard kept at a repo's `src/` (one shard per repo) builds
  again when its `mounts.json` names files under `public/`. The
  build, `wildshard hero` and the map baker now find the repo root
  from either layout, not only from `src/shards/<slug>/`.
- Fix: the `generator-imports` lint rule now checks a shard at `src/`
  as well as one at `src/shards/<slug>/`.

## v0.2.7 (2026-11-13)

- New: `wildshard dev .` works from an npm install. Its first run
  fetches engine's dev client once (about 300 MB) into
  `~/.cache/wildshard/dev-client/`; the page reloads when you save.
  Ctrl-C stops it and frees the port.
- New: `wildshard hero . --base <url>` captures your hero from the URL
  `wildshard dev` prints, so you need no engine checkout for it. A new
  shard's generated card becomes `card/thumb.jpg`, `card/portrait.jpg`
  and `card/landscape.jpg`.
- Fix: the `dev` page no longer logs a 404 for `programs/<slug>.json`.
- `check` now checks each output a shard declares.

## v0.2.6 (2026-11-13)

- Fix: `wildshard update --pins` now works on the shard repos that
  list the sdk as `@wildshard/sharddev`, by a GitHub commit or tag pin
  or an `npm:@wildshard/sdk@<version>` alias. It keeps the repo's sdk
  name and pin style: a commit pin moves to the commit the release's
  `v<version>` tag names, a tag pin moves to the new tag. If that
  release has no tag on GitHub, it refuses and tells you to pin
  `npm:@wildshard/sdk@<version>` instead. `wildshard update` takes
  those repos too.
- Fix: `update --pins` now also moves the `pnpm.overrides` entries
  for the packages it moves (such as `@wildshard/format`), so the old
  version no longer stays installed.
- Fix: the long `wildshard cache counters` line no longer ends every
  `wildshard` command; set `WILDSHARD_CACHE_REPORT=1` to see it.
- To upgrade from sdk 0.2.4 or later, commit your work, then run the
  newest CLI once (older CLIs cannot do this move themselves):
  `pnpm --package=@wildshard/sdk@latest dlx wildshard update --pins`.
  GUIDE.md and the `wildshard-upgrade` skill now start there.

## v0.2.5 (2026-11-13)

- New: `wildshard update --pins` moves your shard repo to a newer sdk
  in one step: npm's latest, or the one you name with
  `--pins=<version>`. It moves the sdk, engine, format, three.js and
  Node versions in `package.json`, installs them, applies the new
  sdk's fixes to your code, then runs `update` and `check`. Commit
  your work first: it refuses a repo with uncommitted or untracked
  changes (`update-pins-dirty`) or whose `package.json` is not
  committed in git (`update-pins-no-git`), so `git diff` afterwards
  shows only what the upgrade changed. If anything fails before the
  code fixes are done, `package.json` and the lock file go back as
  they were; if `update` or `check` fails after that, you stay on the
  new versions: fix what it reports, then run `wildshard check .`.
- Removed from the sdk, because no shard used them: `phasedBossFight`
  (`@wildshard/sdk/phasedBoss`), `speciesBrains`
  (`@wildshard/sdk/speciesBrains`), `ClipCtx`, `playClips` and
  `clipAnimate` (`@wildshard/sdk/species/clips`), `appendGeometry`
  (`@wildshard/sdk/kit/bakedGeometry`), and the types `PhasedBossPorts`,
  `PhasedBossFight`, `PhasedBossBody`, `PhasedBossState`,
  `RoamingBossFight` and `SpeciesBrains`. The sdk's `MeleeProfile`
  no longer has the engine's runtime `pickup` field. The data row
  types you write a shard with are all still there. If your shard
  imported one of the removed names, it no longer builds.
- GUIDE.md and the refusal messages now say to export audio as AAC
  at 48 kHz in an `.m4a` file. The old advice offered WAV, which the
  audio check marks amber.
- Fixes to the `generator-imports` lint. It now accepts an exported
  sdk path with a suffix such as `?raw`, so an override that turned
  the rule off for such an import can be dropped after upgrading; an
  engine path with a suffix, such as `@wildshard/engine?raw`, is now
  refused. It also refuses an import path with a percent-escape such
  as `%2e%2e` or `%2f`, a backslash, a tab or a newline, which could
  reach another shard's files unnoticed: write the path plainly.

## v0.2.4 (2026-11-13)

- New: `wildshard update`. After you move to a newer sdk, run it in
  your shard repo to rewrite GUIDE.md and the four `wildshard` skills
  from the sdk you now have installed. Edits you made to those files
  are lost, so keep your own notes in AGENTS.md.
- `wildshard new` also writes files for coding agents: AGENTS.md,
  CLAUDE.md (which points Claude Code at AGENTS.md) and
  `.agents/skills/` links, so Codex sees the same skills. `update`
  adds any that are missing to an older repo and leaves the ones you
  changed alone.
- Each refusal now points at the right rule, picked from the error's
  own code, and GUIDE.md has a heading for every rule, 17 of them new
  (for example a broken `shard.json` is now `shardfile-index`).
- Audio checks are stricter, and a shard that uploaded before may now
  be refused. An audio file saved as FLAC, AIFF, Ogg, MP3 or another
  format the game cannot play is now red, and every audio file counts
  toward the shard's audio size limit (amber over 6 MB, red over
  10 MB). Export such files again as AAC at 48 kHz in an `.m4a` file.
  `build` prints each audio finding with the rule that explains it.

## v0.2.3 (2026-11-13)

- The toolkit is now called `@wildshard/sdk`, and this is its first
  real version on npm: `npm install @wildshard/sdk` instead of a
  GitHub link. The command is still `wildshard`.
- `wildshard new <dir>` now writes a whole shard project, ready to
  install, with a README and the wildshard agent skills;
  `--template blender` starts a hand-written shard that needs no sdk
  at runtime.
- `wildshard build` now writes the `.shardfile` itself (there is no
  separate pack step) and re-encodes music and sound effects to
  smaller AAC files (sound effects go mono unless marked stereo).
  `wildshard check` runs every check in one go and gives one verdict.
- Uploading changed: `upload` needs `--channel staging|prod`, a build
  that went through `wildshard prepare`, and your account key (make
  one with `wildshard account <email>`). `wildshard whoami` shows the
  key's account, `wildshard delete <slug>` deletes a shard you own,
  and `upload --no-place` uploads without putting it on the grid.
- `wildshard help` and `wildshard <command> --help` explain every
  command, refusals name the rule that failed and how to fix it, and
  GUIDE.md is the full author's manual.
