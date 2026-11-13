# The shard author's guide

> Written by: Claude

> **State:** living, 2026-11-13, sharddev `@wildshard/sdk` 0.2.x (SHARD-AUTHORING SA13). This file ships in the
> package and `wildshard new` copies it into every new project. Steps marked **not built yet** name the plan row
> (meta repo `docs/plans/SHARD-AUTHORING-PLAN.md`) that builds them; until then, do what that step says instead.

This guide is for people and agents making a Wildshard shard. Read sections 1 and 2 first; use the rest when you need
it. Facts that change with every release (each budget's number, each command's flags) are not copied here: each one
names the command or page that prints it. Only limits a decision fixed, such as the audio budget (J303), are written in.

**Words.** A **shard source** is your folder: data, generators, scripts and assets. **Build** turns the shard source
into a **shard file** (`<slug>.shardfile`), the one file you upload. **Bake** is the part of build that turns parts of
the shard source into data (maps, colliders, compiled scripts). **Upload** sends a shard file to the Wildshard API for a
**channel**, `--channel staging` or `--channel prod`; section 5 shows which of the three sites (preview, staging,
production) each one moves. The **hero** is the shard's card: three images (thumb, portrait,
landscape) shown on SHARD SELECT. A **budget** is a limit on what the shard costs a player (section 3). A **refusal**
is a command stopping with a rule id, a fix and a link into section 6.

**Running `wildshard` today.** The real `@wildshard/sdk` is not on npm yet: the npm copy is a README-only placeholder
(NPM-PUBLISH NP4 publishes the real one). Until then, run the CLI from a checkout of
`github.com/project-wildshard/sharddev`, for example `alias wildshard='node /path/to/sharddev/bin/wildshard.mjs'`.
This guide writes `wildshard <verb>`. `wildshard --help` lists every verb; `wildshard <verb> --help` prints one.
`wildshard --version` prints the sdk, engine, shard-format and `three` versions. `new` writes a `package.json` that pins
`@wildshard/sdk`, shard-format, engine and `three` exactly; once the sdk is on npm, `pnpm install` then
`pnpm exec wildshard <verb>` runs the copy it pins. Add npm packages of your own with `pnpm add <name>`.

## 1. The loop

The loop is: `new`, `dev`, `check`, `hero`, `upload --channel staging`, then `upload --channel prod`, then share the
link. Run each command from the project folder. `.` names the project: commands find its shard source at `src/` (or a
repo's one `src/shards/<slug>/`).

| # | Step | Command | Today |
|---|---|---|---|
| 1 | Start | `wildshard new my-shard` | Works. Writes a shard repo in `my-shard/`: the reference world (Template 1, Mossgate) as its shard source at `src/`, plus `package.json`, `tsconfig.json`, `.gitignore`, `.npmrc`, a README, this guide and the `wildshard` skill |
| 2 | Walk it | `wildshard dev .` | **Not built yet (SA15).** See "Walking your shard" below |
| 3 | Check | `wildshard check .` | Works: lint, build, validate, prove and the report card, one verdict |
| 4 | Hero | `wildshard hero . --base <url>` | Works only with an engine checkout: it needs your shard in a served engine build. See "The hero" below |
| 5 | Prepare | `wildshard prepare public/shardfiles/my-shard --base <url>`, then `wildshard build public/shardfiles/my-shard` | Works only with an engine checkout. See "Uploading" below |
| 6 | Upload to staging | `wildshard upload public/shardfiles/my-shard.shardfile --channel staging --version 0.0.1` | Works only for the Wildshard team today: it needs the team's creator key. See "Uploading" below |
| 7 | Upload to production | the same with `--channel prod` and a higher version | The same. Try staging first |
| 8 | Share | `https://staging.wildshard.io/slug/my-shard` | **Not built yet (SA36, SA37).** See section 5 |

`check` is the one verb to run after every change: it runs `build`, `validate` and `prove` for you. The one separate
`build` in the loop is `build <folder>` after `prepare`. Done when the last line reads `check pass in N s` (exit code
0); `check fail` lists each refusal. `wildshard check . --json` prints one JSON document (verdict, steps, refusals
with `rule`, `fix` and `guide`) for agents and scripts.

### Every verb

| Verb | What it is for |
|---|---|
| `wildshard new <dir> [slug] [--template sdk\|blender] [--empty]` | Start a shard repo in a folder that does not exist yet, its shard source at `src/`. The slug is the folder's name unless you give one. `--template sdk` (the default) copies the reference world; `--template blender` copies the hand-written Blender template (below); any other template refuses before writing. `--empty` writes a bare shard source instead of the reference world |
| `wildshard dev <source>` | Serve the shard source on localhost and rebuild on every save (section 4). **Not built yet** for an installed sdk (SA15) |
| `wildshard check <source> [folder] [--json]` | The loop's check: lint, build, validate, prove, report card, verdict |
| `wildshard hero <source> --base <url>` | Capture the hero from a served build and stamp `hero.json`. `--stamp-existing` marks the images already there as current: only when you have looked at them and they show the current world |
| `wildshard upload <file> --channel staging\|prod` | Send a prepared shard file to the API (section 5) |
| `wildshard account <email>` | Make your account once and save its key, which upload sends (see "Uploading", step 5) |
| `wildshard whoami` | Say which account key upload would send (from `WILDSHARD_API_KEY` or the key file), show its first characters, and print its account's email and how many slugs it owns (`--server` or `WILDSHARD_API_URL`) |
| `wildshard delete <slug> [--yes]` | Delete your shard from the catalogue, every channel and the grid, after you type its slug (see "Deleting a shard") |
| `wildshard build <source>` | Build alone: bake the shard source into `public/shardfiles/<slug>/` and write `public/shardfiles/<slug>.shardfile`. `wildshard build <folder>` writes the shard file of a built folder (after `prepare`) |
| `wildshard prepare <folder> --base <url>` | Record the built folder in phone WebKit against an exact engine preview, which turns a draft into the uploadable form (see "Uploading") |
| `wildshard validate <source \| folder>` | Shard-format's checks and the headless budget run, alone |
| `wildshard prove <source> <proof.json>` | Play a proof tape headlessly and print what happened |
| `wildshard synth <source>` | Run `shard.config.ts`'s scene exports and write the scene as data |
| `wildshard schema [list\|shardfile\|<root>] [pointer]` | Print the JSON Schema of the shard file, or of one section or field |
| `wildshard serve` | The sharddev web app on localhost (tools for this repo, not for your shard) |
| `wildshard build-shards` | Build every shard source under a repo's `src/shards/` (repos holding several shards) |
| `wildshard pack <folder>` | Old name for `wildshard build <folder>`; use `build` |

### Walking your shard

`wildshard dev .` is how you will walk a shard on your machine: it serves the shard on localhost and reloads the page
when you save. It is **not built yet (SA15)**: today it stops with "wildshard dev requires the SDK devserver client",
also from a sharddev checkout. Engine has to publish the dev client first (HOW-WE-BUILD ENG-16, then SD-2).

Until then there are two ways to walk a shard, and neither works from this folder alone:

- **In an engine checkout:** build an engine preview that carries your built shard file folder, then enter it from
  SHARD SELECT. These steps are not written down for authors yet (HOW-WE-BUILD F5 writes them, in sharddev
  `docs/second-machine.md`): ask the Wildshard team.
- **On staging, after an upload:** only once the Wildshard team has placed the shard on the grid (section 5).

What you can do from this folder alone: `wildshard check .` builds the shard, runs it headlessly against its budgets
and, with a `proof.json` tape, plays its quests headlessly (`prove`).

### The hero

The hero is three images: thumb 640x360, portrait 804x1626 and landscape 1600x900. `wildshard new` gives your shard a
generated card (a `data:` image) so it has one from the start. Build accepts that card with a note. To capture a real
hero:

1. Point `card.thumb`, `card.portrait` and `card.landscape` in `manifest.json` at image files inside the shard source
   (for example `card/thumb.jpg`). Hero capture refuses a `data:` card.
2. Serve an engine build that carries this exact shard (see "Walking your shard": an engine checkout today).
3. Run `wildshard hero . --base <served-build-url>`. It opens the build in headless Chromium, enters your shard from
   SHARD SELECT, shoots the view `hero.json`'s `camera` names (or the spawn view), writes the three files and stamps
   `hero.json` with a hash of your content.

Build then refuses a shard file whose content changed after the hero was stamped (`hero-stale`), and upload refuses a
new version whose hero is the same as the previous version's (`hero-unchanged`). Section 6 has every hero refusal.

### Uploading

An upload sends one shard file to the API (`https://api.wildshard.io`) and names its channel. Do these in order,
before every upload:

1. **Hero.** A new version needs a new hero (J306). After your last change to the world, capture one
   (`wildshard hero . --base <url>`, "The hero" above). Done when `hero.json` and the three card images are rewritten.
2. **Commit.** Upload names the commit the bytes came from and refuses uncommitted changes to tracked files. The first
   time: `git init`, then commit (the `.gitignore` `new` wrote keeps `public/shardfiles/` and `node_modules/` out).
   Every time: commit everything, the hero included. Done when `git status` is clean.
3. **Check.** `wildshard check .` builds the shard file. It is a **draft** (`sdk: "0.2"`): check prints a
   `shardfile-draft` warning, and upload and the API refuse a draft. Done at `check pass`.
4. **Prepare.** `wildshard prepare public/shardfiles/<slug> --base <url>`, with the URL of an exact engine preview made
   for preparation, turns the draft into the uploadable form (`sdk: "0.3"`). Then `wildshard build
   public/shardfiles/<slug>` writes the prepared shard file. That preview comes from an engine checkout today, so an
   author outside the Wildshard team cannot prepare yet: the steps are not written down for authors (HOW-WE-BUILD F5);
   ask the Wildshard team.
5. **Keys.** Set `WILDSHARD_API_URL=https://api.wildshard.io` (or pass `--server`) and
   `WILDSHARD_CREATOR_PRIVATE_KEY`, the base64 creator key upload signs with. There is one Wildshard creator key and
   no per-author creator keys yet: ask the Wildshard team for it, and never commit it. Upload also sends your
   **account key**, which says whose shard it is: the first upload of a slug makes it yours, and nobody else's key can
   upload to it. Make the account once with `wildshard account you@example.com`: it saves the key to
   `~/.config/wildshard/sharddev-key` (only you can read it) and the API never shows it again, so keep that file. An
   email that has an account already is refused (`account-exists`); a lost key needs an operator reset by the
   Wildshard team. In CI, set `WILDSHARD_API_KEY` instead: it wins over the file. `wildshard whoami` says which key
   upload will send and whose it is. Done when `wildshard whoami` prints `key wsk_…` and `account <your email>`.
6. **Upload,** with a version `X.Y.Z` higher than the last one uploaded (`0.0.1` the first time). Upload reads
   `version` from the repo's `package.json` (`new` writes `0.0.1`; raise it before each upload), or pass `--version`:

```sh
wildshard upload public/shardfiles/my-shard.shardfile --channel staging --version 0.0.1
```

Upload checks the shard file as the API will, checks the hero, signs, compresses and sends it, then prints the
version and what moved. Uploading the same bytes again sends nothing.

### Deleting a shard

`wildshard delete my-shard` deletes a shard you uploaded, with the same account key: only the key that first uploaded
a slug can delete it. It makes two calls to the API, with you in between:

1. **Start.** It prints what the delete touches: the shard's versions, the channels pointing at it, the grid cells
   placing it, and a plain line saying whether a signed release still plays it. A shard a live release plays can still be deleted: that release
   keeps its copy until its next release.
2. **Type the slug.** Type `my-shard` and press Enter. Anything else deletes nothing (`delete-not-confirmed`). You
   have 10 minutes; after that the confirmation lapses and you start again (`delete-expired`).
3. **Finalize.** The shard leaves the catalogue, every channel and the grid at once. Its downloads stop after the
   daily prune, once no signed release names it.

In a script, `wildshard delete my-shard --yes` skips the typing. A deleted slug stays yours: uploading a new version
of it with your key brings it back, on preview only. Done when the last line starts `deleted my-shard at`.

## 2. The shard source

A project made by `wildshard new` is a repo with one shard source at `src/`. Inside `src/`:

| Path | What it is | Ships in the shard file? |
|---|---|---|
| `shard.config.ts` | The build entry: exports `generate` (default) and `buildOptions`. Build runs it | No: its output does |
| `data/` | JSON rows: identity (`data/identity.json`, the slug), card, layout, creatures, items, quests, text, audio, look, budgets (`data/budgets.json`) | As baked sections, never as code |
| `generators/` | TypeScript that runs at build time (any Node package, J319) to make terrain, props, maps and sections | No: what they produce does |
| `behaviour/` | AssemblyScript (`.as`) scripts and `hooks.json`. Build compiles them to Wasm | The compiled Wasm |
| `assets/` | Source assets, named by their SHA-256 | The ones the shard uses, by hash |
| `look/` | Recorded entry reads for the build | No |
| `manifest.json` | The card and discovery fields: name, `card` images, `shardfile` path | The card, as data |
| `hero.json` | The hero stamp (`wildshard hero` writes it) | No |
| `proof.json` | Optional: a proof tape `check` plays with `prove` | No |
| `audio-waiver.json` | Optional: a dated waiver for the audio budget | Into the shard file's admission data |

At the repo root, around `src/`:

| Path | What it is | Ships in the shard file? |
|---|---|---|
| `package.json` | Pins `@wildshard/sdk`, shard-format, engine and `three` exactly, and pnpm 10.34.9 (`packageManager`); its `version` is what upload sends | No |
| `tsconfig.json`, `.npmrc`, `.gitignore` | TypeScript settings for `src/`; exact versions for `pnpm add`; what git leaves out (build output, `node_modules/`) | No |
| `README.md`, `GUIDE.md` | This repo's README, and this guide | No |
| `pnpm-workspace.yaml` | pnpm's install-script allowlist (SA39): a dependency's install script runs only if listed | No |
| `.claude/skills/wildshard/SKILL.md` | The `wildshard` skill (SA14): the loop's order for Claude Code, pointing into this guide | No |
| `public/shardfiles/` | Build output: the built folder and `<slug>.shardfile`. Never edit; never commit | It is the shard file |

**Two files to change together.** `src/manifest.json` and `src/data/card.json` hold the same card: `new` writes
both, build refuses a shard whose two copies differ, and hero capture reads `manifest.json`, so change both together.

Blender files (`.blend`), mockups and other working files never ship: keep them in a folder of your own, such as
`blender/`, and export what the shard needs into `assets/`. A shard never ships runtime TypeScript: everything that
runs in the game is data, or Wasm compiled from `behaviour/`. `shard.config.ts` and `generators/` run only at build
time; lint refuses runtime code there (section 6).

**Repo layout (J317).** A repo with one shard keeps its shard source at `src/` (`src/shard.config.ts`,
`src/data/`, ...); a repo with several keeps `src/shards/<slug>/`. Commands take the repo (`.`) and find the shard
source at `src/`, or at the one `src/shards/<slug>/` a repo holds; in a repo with several, name the shard source
(`src/shards/<slug>`). The slug is `manifest.json`'s, whatever the repo folder is called. A `src/` source builds
into the repo's `public/shardfiles/`; a `src/shards/<slug>/` source into its own folder's. SA24 moves the existing
single-shard repos to `src/`.

**The hand-written template (`--template blender`).** shard-format's `blender-template`: no sdk at runtime, no
three.js, no `shard.config.ts`. Its `src/` is a shard file folder held by hand: `shard.json` (the index),
`sections/` (the JSON you edit), `blobs/` (baked files, Blender models among them, each named by its SHA-256),
`mounts/` (what the boot reads first, with its receipt) and `validation.json`. `check` lint skips it (no code); its
build runs shard-format's `shard-format pack`, which settles every hash and size the sections measure and validates
the whole folder, then writes the built folder and shard file as any build does. A changed blob is a new file under
its new hash, with every row that names it changed to match. `package.json` lists only `@wildshard/sdk` (the CLI) and
shard-format, as dev dependencies; there is no `tsconfig.json`.

**What a shard may declare.** The runtime contract lists every section, `client/plan` kind, named file, script rule,
budget and limit a shard file may carry, and what validation refuses:
[shard-format `docs/RUNTIME-CONTRACT.md`](https://github.com/project-wildshard/shard-format/blob/main/docs/RUNTIME-CONTRACT.md).
Read with it [`SHARDFILE.md`](https://github.com/project-wildshard/shard-format/blob/main/docs/SHARDFILE.md) (the
fields), [`SCRIPT-ABI.md`](https://github.com/project-wildshard/shard-format/blob/main/docs/SCRIPT-ABI.md) (the Wasm
scripts) and [`PLATFORM-FILE-FAMILIES.md`](https://github.com/project-wildshard/shard-format/blob/main/docs/PLATFORM-FILE-FAMILIES.md)
(the named files). `wildshard schema list` prints the section roots from your installed copy.

## 3. Budgets

A budget is a limit on what your shard costs a player's phone or desktop: bytes to download, memory, draw calls,
triangles, script time and audio. Build measures the shard, and the **report card** compares each cost with its limit.
A cost over a hard limit is a refusal; one over a soft line is a warning. The numbers change with releases, so this
guide names them and points at what prints them:

| Budget | What it limits | Checked by | Where the numbers are |
|---|---|---|---|
| Download | Bytes before the shard is playable (critical) and in all (library) | `check` (report), `build`, `validate` | `wildshard check .` prints "N MB download, ~S s to playable"; RUNTIME-CONTRACT §6 |
| Draws, triangles | Draw calls and triangles in the near and far views | `check` (report) | The report step's refusals: `metric: actual over limit` |
| Memory | Resident, loading and playing bytes | `check` (report) | Report only for now: printed, not refused (RUNTIME-CONTRACT §6) |
| Script CPU and fuel | Time and instructions per tick of your Wasm scripts | `check` (report), from a headless run | The report step; SCRIPT-ABI.md |
| Frame targets | fps and per-system milliseconds per device | The running game reports against them; `check` does not | Your `data/budgets.json` |
| Server | Tick time, memory, entities, commands per tick | `validate` | `shard.json` `admission.serverBudget`; RUNTIME-CONTRACT §6 |
| Audio | Your shard's own recordings: green to 6 MB, amber 6 to 10 MB, red over 10 MB (J303) | `build` and `upload` | `check` prints "audio green: ... MB"; shard-format `docs/audio.md` |
| File limits | Sizes and counts: source bytes, files, ids, text, Wasm modules | `validate`, `upload` | RUNTIME-CONTRACT §7 |

`wildshard check . --json` is the one place to read them for your shard: the `report` step's `note` and each refusal's
`message` carry the measured value and its limit. Shard-format's codes for every budget finding are in
[`docs/VALIDATION-CODES.md`](https://github.com/project-wildshard/shard-format/blob/main/docs/VALIDATION-CODES.md)
(sections "performance" and "audio"). Section 6 says what to do when one refuses.

## 4. What reloads under `dev`

`wildshard dev` is **not built yet** for an installed sdk (SA15); this is how it behaves once it runs.

- **Every saved file in the shard source rebuilds the whole shard**, about 0.1 s after the last save, and the open page
  reloads itself when the new build is ready. Nothing is patched in place: data, generators, behaviour scripts,
  assets, `shard.config.ts` and `manifest.json` all take the same path.
- **A failed rebuild keeps the last good build** on the page and prints the refusal in the terminal and the browser
  console. Fix it and save again.
- **Not watched:** `node_modules/`, `.git/`, `dist/`, `public/` and `.worktrees/`. After `pnpm install` or an sdk
  update, stop `dev` and start it again.
- **Not made by `dev`:** a shard file to upload. `dev` builds a private copy for the page. Run `wildshard check .`
  for the shard file, and capture the hero again before you upload a changed world.

## 5. Channels and the grid

**Channels (J301).** Every upload names one:

| `--channel` | preview (`preview.wildshard.io`) | staging (`staging.wildshard.io`) | production (`play.wildshard.io`) |
|---|---|---|---|
| `staging` | moves to this version | moves to this version | stays |
| `prod` | moves | moves | moves |

There is no default: upload without `--channel` refuses. Upload to staging; once the Wildshard team has placed the
shard (below), walk it there; then upload the next version with `--channel prod`. The same bytes cannot go to staging
and then to prod: production needs a new version, and a new version needs a new hero (J306).

**The grid.** The world is a grid of cells, one shard per cell, and players walk from cell to cell. Today it is 5×5,
and only the Wildshard team places a shard on it. An uploaded shard with no cell is recorded on its channels, but no
player can reach it there yet.

**Not built yet:**

- **The 7×7 grid that fills itself (J314; SA29 to SA35).** A brand-new slug's first upload will get the nearest free
  cell in the outer ring, and that cell is the slug's for life, on every channel it reaches: a staging upload places
  it on preview and staging, and a later prod upload puts it at the same cell on production.
- **`wildshard upload --no-place` (SA32):** upload without taking a cell. Upload will also print the cell it got, or
  "grid full, not placed".
- **The share link (SA36, SA37):** `https://staging.wildshard.io/slug/<slug>` (and the same path on preview and
  production) will show your shard's name and hero with a Play button that spawns you at its cell, and unfurl with
  the hero when pasted into a chat. A shard with no cell shows its card with Play off: "not on the grid yet".

**How to share today:** there is no per-shard link yet. Once the Wildshard team has placed your shard, share
`https://staging.wildshard.io` and its cell; until then, share the hero images and the shard file.

## 6. Refusals and their fixes

Every refusal prints the refusing code's own words, then one line:

```text
[<rule>] fix: <what to do> (GUIDE.md#<rule's heading>)
```

`wildshard check . --json` carries the same `rule`, `fix` and `guide` on each refusal. The headings below are those
links, one per rule. The printed `fix` is the short answer; each heading adds why. Shard-format's own refusals also
carry a stable code, listed in
[`docs/VALIDATION-CODES.md`](https://github.com/project-wildshard/shard-format/blob/main/docs/VALIDATION-CODES.md).

### Any command

#### usage

A verb got arguments or flags it does not take. `wildshard <verb> --help` prints what it takes.

### New

#### new-target

`new` needs a folder that does not exist yet and a kebab-case slug (`my-shard`, not `My Shard`). It never writes into
an existing folder.

#### new-template

`--template` names `sdk` (the reference world, the default) or `blender` (the hand-written Blender template). Any
other name refuses before `new` writes anything. Leave the flag out or pass `--template sdk` or `--template blender`.

#### new-refused

`new` could not copy the reference world shipped with the sdk. Reinstall the sdk.

### Build

#### source-file-missing

A path the command was given, or a file the shard source names, is not there. Check the path in the message.

#### source-import-missing

An import in `shard.config.ts`, `generators/` or `data/` names a file or package that is not there. Fix the path, or
add the package to `package.json` and install.

#### json-syntax

A JSON file in the shard source does not parse. The message gives the line and column.

#### source-syntax

A TypeScript or AssemblyScript file does not parse. The message gives the file and line.

#### config-default-export

`shard.config.ts` must default-export its `generate` function, as `new` wrote it.

#### config-file-access

Code that `shard.config.ts` imports read a file with `node:fs`. Read files through the build context (`ctx.cached`),
so build knows the input and can cache it.

#### project-folder-slug

The shard source's folder name and its slug (`data/identity.json`) differ. Rename one to match the other.

#### source-schema

A field in your data does not have the shape the shard file needs. The message gives the path;
`wildshard schema shardfile <pointer>` prints the expected shape.

#### build-refused

Build stopped for a reason no rule above names. Read the message: it names the file, field or generator. Fix it and
run `wildshard check .` again.

### Validate

#### validate-refused

Shard-format's checks refused the built shard. The message names the check; RUNTIME-CONTRACT §8 lists what is refused.
If a fresh, unedited build still fails, report it with the message.

### Prove

#### proof-tape-invalid

`proof.json` does not have the proof tape's shape. Fix it where the message says.

#### proof-failed

The tape played, but a step it expected did not happen. Fix the data, or the tape step.

### Budgets

Each of these is the report card naming a budget over its limit (section 3). The message gives the measured value and
the limit.

#### budget-unmeasured

A cost could not be measured: too few headless ticks for scripts, or native gameplay that needs a browser run.

#### budget-download

Too many bytes to download, before play (critical) or in all (library). Shrink or drop assets, or load them later.

#### budget-draws

Too many draw calls in a view. Merge meshes that share a material, or show fewer objects from that view.

#### budget-triangles

Too many triangles in a view. Use lower-detail meshes or fewer props there.

#### budget-memory

A memory total is over its line. Smaller or fewer textures and meshes. Memory reports only, for now.

#### budget-script-cpu

Behaviour scripts take too long per tick. Spread work over ticks, or run it on events.

#### budget-script-fuel

Behaviour scripts run too many instructions per tick. Shorten the hottest loops.

#### budget-over

A budget not named above is over its limit. The message names it; `wildshard check . --json` lists each.

#### budget-refused

Build or validate refused the whole report card. Run `wildshard check .`: its report step names each budget over.

### The shard file and the hero

#### hero-stale

The shard's content changed after its hero was captured, or the card names images `hero.json` has no stamp for. The
hero must show the current world: capture it again (`wildshard hero . --base <url>`). Only if the images already show
the current world, `wildshard hero . --stamp-existing`.

#### hero-not-in-product

The shard file does not carry the captured hero: it was built before the capture. Run `wildshard check .`, then
prepare again ("Uploading", steps 3 and 4).

#### hero-unchanged

Upload only: this new version's hero is the same as the previous version's (J306: a new version needs a new hero).
Capture a new hero, build, prepare and upload again.

#### audio-refused

The audio rules found a red problem: a recording that will not play, runs too long, or a shard over 10 MB of its own
audio. Fix each red finding, or add a dated waiver in `audio-waiver.json`. Shard-format `docs/audio.md` explains each.

#### shardfile-draft

A warning from `build` and `check`, a refusal from `upload`: the shard file is a draft (`sdk: "0.2"`). Prepare it
first ("Uploading", step 1).

#### shardfile-link

The built folder holds a symbolic link; a shard file holds only real files. Replace the link, then check and prepare
again ("Uploading", steps 3 and 4).

#### shardfile-folder-missing

There is no built folder to write a shard file from. Run `wildshard check .` (or `wildshard build .`) first.

#### shardfile-invalid

The shard file breaks a format check. Upload the shard file `prepare` and `build <folder>` wrote, unedited.

#### shardfile-refused

Writing or checking the shard file failed for another reason. Check and prepare again ("Uploading", steps 3 and 4).

### Upload

Upload checks all of these before a byte is sent.

#### upload-shardfile-missing

The path is not a shard file. Pass the one build wrote: `public/shardfiles/<slug>.shardfile`.

#### upload-channel

No `--channel`, or one that is not `staging` or `prod` (section 5).

#### upload-credentials

`WILDSHARD_API_URL` (or `--server`) or `WILDSHARD_CREATOR_PRIVATE_KEY` is not set ("Uploading", step 5).

#### upload-level

`--level` is the compression level, 0 to 11. Leave it out for the default.

#### upload-version

No version: set `version` (X.Y.Z) in `package.json`, or pass `--version X.Y.Z`, higher than the last one uploaded.

#### upload-commit

The shard source is not in a git checkout, or `--commit` is not a full 40-character sha. Upload names the commit
its bytes came from.

#### upload-uncommitted

Tracked files have uncommitted changes. Commit, then check and prepare again before you upload ("Uploading").

#### upload-sdk-missing

Upload could not find the sdk, engine or shard-format version to send. Install the project's packages.

#### upload-refused

The API refused, or a check no rule above names. The message says what it wants: a format refusal means check and
prepare again; a server refusal (409 or 422) names the field, the version or the hero.

### Account

The account key upload sends ("Uploading", step 5), `wildshard account` and `wildshard whoami`.

#### account-key-missing

Upload found no account key: `WILDSHARD_API_KEY` is unset and `~/.config/wildshard/sharddev-key` is not there. It
refuses before anything is sent, because the API refuses an upload with no key. Run `wildshard account <email>` once,
or set `WILDSHARD_API_KEY`.

#### account-exists

That email has an account already, and the API shows a key only once, when the account is made. Use the key you
saved for it. A lost key stays lost until the Wildshard team resets it.

#### account-key-file

`~/.config/wildshard/sharddev-key` already holds a key, and `account` never overwrites one by accident: you would lose
the key to an account you made. Keep it, or pass `--force` to replace the file; the old key keeps working.

#### account-refused

The API refused the account for another reason: a malformed email is 400, and more than five tries a minute is 429
(wait a minute).

### Delete

`wildshard delete <slug>` ("Deleting a shard"). No account key refuses before anything is sent
(`account-key-missing`, above).

#### delete-not-confirmed

You typed something other than the slug, or nothing, so the delete was not finalized and nothing changed. Run it
again and type the slug exactly; in a script, pass `--yes`.

#### delete-expired

The confirmation from the start call was spent, or its 10 minutes passed, so finalize changed nothing. Run
`wildshard delete <slug>` again and type the slug within 10 minutes.

#### delete-not-owner

The key you sent does not own this shard: only the account whose key first uploaded a slug can delete it (the
Wildshard team can delete any shard). `wildshard whoami` shows which key you send. A 401 means the API does not know
the key at all.

#### delete-unknown

The API has no shard by that slug (404), or the slug is not a valid one (400). Check its spelling against the
catalogue.

#### delete-placed

The API refused because a grid cell places the shard: an API that can't yet free a grid cell on delete answers
this. Ask the Wildshard team to move the shard off the grid, then delete again.

#### delete-refused

The API refused for another reason, or `--server` is not https (the key goes only to https or localhost). The
message says which.

### Lint

`check` lints the shard source with the sdk's rules. Each wildshard lint rule keeps a shard to data and build-time
code; its printed fix says what to change.

#### lint-not-run

The linter that ships with the sdk did not run. Reinstall the sdk.

#### lint-refused

A lint finding with no rule of its own. Fix what it names at the file and line shown.

#### lint-rules

A lint rule that is not Wildshard's own (oxlint's built-in rules). Its own help line is printed as the fix.

#### lint-generator-imports

An import the rule denies. In `generators/` any npm package, valibot, shard-format and `node:*` are fine (J319); the
rule denies engine, sdk paths outside its exports, another shard's source and a second copy of `three`. In `data/` and
`shard.config.ts` only `three`, valibot, shard-format, the sdk and Node built-ins are allowed.

#### lint-engine-internal

Shard code imports a game-only engine export; use the sdk's shard-facing one.

#### lint-engine-sides

Client and server code are mixed; import the shared module instead.

#### lint-engine-words

Shard and game names belong in content data, not in engine code.

#### lint-exec-max-buffer

An exec call that captures output needs an explicit `maxBuffer`.

#### lint-layer

An import reaches upward or into another shard; import through the public index.

#### lint-no-active-chunk

Read current content through the game layer, not the active chunk.

#### lint-no-active-singleton

Take the service from your context, not a global singleton.

#### lint-no-authored-html

Set text with `textContent`, never HTML.

#### lint-no-base64

Binary content stays binary: ship bytes as an asset, never base64 text.

#### lint-no-build-time-import

Runtime code imports build-time code. Move the shared part into a runtime module.

#### lint-no-client-plan-reflection

Pass data to a client feature; never reflect into shard TypeScript.

#### lint-no-generated-import

Do not import a generated file; call the function that makes it, or read the built folder.

#### lint-no-generated-json-import

Read generated JSON as data at build time, not through an import.

#### lint-no-global-listener-patch

Register listeners through your scope, not on globals.

#### lint-no-hook-chain

Subscribe to the typed event instead of chaining hooks.

#### lint-no-inline-ui-string

Player-facing text goes in the string table, `data/text.json`.

#### lint-no-level-identity

Put level and style choices in data instead of branching on the shard's identity.

#### lint-no-module-mock

Test through a seam (pass the dependency in), not a module mock.

#### lint-no-production-test-import

Production code imports a test module. Move what it needs out of the test.

#### lint-no-raw-animation-mixer

Use the engine's animation API, not a raw three.js mixer.

#### lint-no-raw-hud

Mount HUD through the numbered HUD slots your scope owns.

#### lint-no-raw-input

Read input through the input service, not DOM listeners.

#### lint-no-raw-random-time

Use the engine's seeded random and clock, never `Math.random` or `Date`: the game must replay the same way.

#### lint-no-raw-save

Save through the saves service, not `localStorage`.

#### lint-no-raw-shader-patch

Patch shaders through the shader registry.

#### lint-no-reexport

Import a name from the module that defines it; do not re-export it.

#### lint-no-renderer-type

Renderer types stay inside rendering code; pass plain data out.

#### lint-no-runtime-generator

Generators run at build time only: import them from `shard.config.ts`, bakers and other generators.

#### lint-no-runtime-in-build

Build code imports runtime code. Share a plain data module instead.

#### lint-no-shard-branch

A shard-specific choice belongs in the shard's data, not a branch on its name.

#### lint-no-shard-host-callback

Give host APIs data, not TypeScript callbacks: a shard file carries no code engine runs.

#### lint-no-shard-runtime

The shard source holds authoring and declarations; gameplay goes in `behaviour/` scripts.

#### lint-no-url-switch

No URL query switches; read settings from the shard's data.

#### lint-public-index

Import a package by its public export, not a file path inside it.

#### lint-runtime-commons

Runtime code imports build-time commons; use the runtime export.

#### lint-runtime-performance

Runtime code must bound its work: no per-frame allocation, raw rendering, DOM, timers or fetch.

#### lint-runtime-standalone

Runtime code imports only the runtime surface.

#### lint-sdk-no-facade

Import the sdk's own export; do not alias a game or engine binding.

#### lint-shard-engine-imports

Shard source imports `@wildshard/sdk`, never engine internals (J158).

#### lint-shard-game-imports

Shard source imports `@wildshard/sdk`, never the game.

#### lint-shard-game-plugins

Import only the game plugin exports that define your runtime.

#### lint-shard-names

Name no other shard outside its own folder.

#### lint-shard-sandbox

Services, globals, settings and assets stay inside the shard's context.

#### lint-shard-services

Get engine services from `ShardContext`.

#### lint-sim-no-render

Code the headless simulation imports must not render.

## 7. `wildshard update`

**Not built yet (SA28).** `new` writes the `wildshard` skill (SA14) but no `AGENTS.md` and no sibling skills yet (SA27,
SA28). `wildshard update` will rewrite this guide and the four `wildshard` skills in `.claude/skills/` from the
installed sdk, and touch nothing else; it will leave an `AGENTS.md` you changed and say so. `wildshard update --pins` (SA18, after the sdk is on npm)
will also move the sdk, shard-format and `three` versions, install, apply the release's code changes and run the
build.

Until then: after you move to a newer sdk, copy `GUIDE.md` from the sdk (the sharddev checkout's root, or
`node_modules/@wildshard/sdk/GUIDE.md` once installed from npm) over this one, and the sdk's
`skills/wildshard/SKILL.md` over `.claude/skills/wildshard/SKILL.md`.
