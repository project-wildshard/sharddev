# The shard author's guide

> Written by: Claude

> **State:** living, 2026-11-16, `@wildshard/sdk` 0.3.x (SHARD-AUTHORING SA13; SHARD-SOURCE SS-NE rows). This file ships in the
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

**Running `wildshard` today.** Install the published SDK with `pnpm add @wildshard/sdk` or
`npm install @wildshard/sdk`, then run `pnpm exec wildshard <verb>` (or `npx wildshard <verb>`). Both work from 0.3.
Run either in a folder with its own `package.json` (`npm init -y` makes one): in a folder without one, npm installs
into the nearest folder above that has one, maybe your home folder (`wildshard` then warns that it runs from there).
`new` writes a pnpm project, so use pnpm inside it.
This guide writes `wildshard <verb>`. `wildshard --help` lists every verb;
`wildshard <verb> --help` prints one. `wildshard --version` prints the sdk, engine, shard-format and `three` versions.
`new` writes a `package.json` that pins `@wildshard/sdk`, shard-format, engine and `three` exactly;
run `pnpm install` in the new project, then `pnpm exec wildshard <verb>` to use the copy it pins.
Add npm packages of your own with `pnpm add <name>`.

**The six packages.** `new` pins `@wildshard/cli` (the `wildshard` command) and `@wildshard/sdk` (what your source
imports); the cli brings `@wildshard/build` and `@wildshard/upload` (both engine-free) and `@wildshard/dev` (the local
game, `check`, `prove`, `watch`: the only one with the engine). `@wildshard/kit` holds shared creatures. All six share
one version.

**Install size.** A fresh `new` repo installs about 580 MB into `node_modules` (`du -sh`, cli 0.4.11 with engine
0.1.44, measured 2026-11-18). pnpm hard-links it from its global store, so a second repo on the same sdk adds little.
The largest parts are binaryen, the script compiler (two copies, about 200 MB), the engine (about 50 MB), then
TypeScript, three, kit, happy-dom, sharp and rolldown (12 to 23 MB each). The first build adds about 20 MB in `out/`.

Run `wildshard memory <folder>` on a built shard folder to measure its phone-tier boot with the installed engine.
The command prints the process peak, the phone estimate and the verdict. It exits 1 above the 1.5 GB phone limit.

**`npm audit` on a fresh install.** From sdk 0.3.10 it reports no high finding of the sdk's own; what is left comes
through the engine's exact pins until its next release. Accepted, with reasons: vite 8.3.0 (high; launch-editor's
Windows editor-open flaws and dev-server file reads; the engine pins vite 8.3.0 as a peer, and `wildshard dev` and
`watch` listen on 127.0.0.1 only), and hono 4.13.13 and @hono/node-server 2.1.5 (moderate; the engine's game server
pins them). The engine moves to the fixed releases; then the sdk follows.

Shared creature content and author geometry live in `@wildshard/kit`. Its
[public modules](docs/api/KIT.md) define the species, arm, pickup, body and
weapon helpers; the SDK supplies the compiler and CLI. `wildshard update --pins`
applies the release codemod for the moved modules and adds the matching kit pin.
The [checked author examples](docs/api/SHARDDEV.md) show ordinary declared model
files and item rows. Kit content is copied at build time; a running shard reads
its own admitted files.

## 1. The loop

The loop is: `new`, `dev`, `check`, `hero`, `upload --channel staging`, then `upload --channel prod`, then share the
link. Run each command from the project folder. `.` names the project: commands find its shard source at `src/` (or a
repo's one `src/shards/<slug>/`).

| # | Step | Command | Today |
|---|---|---|---|
| 1 | Start | `wildshard new my-shard` | Works, and prints the folder it made and what to run next. Writes a shard repo in `my-shard/`: Mossgate Hollow as one three.js scene module (`src/generators/world.ts`; its braziers, gates, lever, chest, rack and lift in `src/generators/play.ts`; its quests and two talks in `src/generators/quests.ts` and `gameplay.ts`; its proof tape `src/proof.json`; `pnpm watch` shows each save; section 2b) as its shard source at `src/`, plus `package.json`, `tsconfig.json`, `.gitignore`, `.npmrc`, a README, this guide, the four `wildshard` skills and the agent files (`AGENTS.md`, `CLAUDE.md`, `.agents/skills/`) |
| 2 | Walk it | `wildshard dev .` | Works. The first run fetches engine's dev client once. See "Walking your shard" below |
| 3 | Check | `wildshard check .` | Works: lint, build, validate, prove and the report card, one verdict |
| 4 | Hero | `wildshard hero . --base <url>` | Works, with `wildshard dev .` running: `<url>` is the one it prints. See "The hero" below |
| 5 | Prepare | `wildshard prepare out/my-shard`, then `wildshard build out/my-shard` | The first run fetches engine's preparation client once. See "Uploading" below |
| 6 | Upload to staging | `wildshard upload out/my-shard.shardfile --channel staging --version 0.0.1` | Works only for the Wildshard team today: it needs the team's creator key. See "Uploading" below |
| 7 | Upload to production | the same with `--channel prod` and a higher version | The same. Try staging first |
| 8 | Share | `https://staging.wildshard.io/slug/my-shard` | **Not built yet (SA36, SA37).** See section 5 |

`check` is the one verb to run after every change: it runs `build`, `validate` and `prove` for you. The one separate
`build` in the loop is `build <folder>` after `prepare`. Done when the last line reads `check pass in N s` (exit code
0); `check fail` lists each refusal. `wildshard check . --json` prints one JSON document (verdict, steps, refusals
with `rule`, `fix` and `guide`) for agents and scripts.

### Every verb

| Verb | What it is for |
|---|---|
| `wildshard new <dir> [slug] [--template scene] [--empty]` | Start a shard repo in a folder that does not exist yet, its shard source at `src/`. The slug is the folder's name unless you give one. It copies Mossgate Hollow as one three.js scene module (`--template scene`, the default: `src/generators/world.ts` is the world, `play.ts` what the player uses in it, `quests.ts` and `gameplay.ts` its quests, talks and rack, `src/proof.json` the tape `check` plays, and `wildshard watch .` shows each save); any other template refuses before writing, and `--template sdk` and `--template blender` are retired (below). `--empty` writes a bare scene instead of the reference world: `src/generators/world.ts` with a blue sky, flat green ground, a hemisphere light, a sun and the spawn |
| `wildshard update [dir] [--guide <path>] [--pins[=<version>]]` | Rewrite this guide (at `--guide`'s path, which `package.json` remembers) and the four `wildshard` skills from the installed sdk. `--pins` first moves the repo to a newer sdk release (npm's latest, or `--pins=<version>`), installs it and applies its codemods, and runs `check` after (section 7) |
| `wildshard dev <source>` | Serve the shard source on localhost and rebuild on every save (section 4). The first run fetches engine's dev client once ("Walking your shard") |
| `wildshard watch <source>` | For a shard written as a three.js scene (`@wildshard/sdk/scene/shard`): serve it once, then swap each edited part into the running page in about a second, no reload. A look, ground or spawn edit still reloads. A repo `new` made runs it as `pnpm watch` |
| `wildshard check <source> [folder] [--json]` | The loop's check: lint, build, validate, prove, report card, verdict |
| `wildshard content <folder> [--bar templates]` | Count the content in a built shard; the template bar lists every shortfall. `--bar=templates` also works |
| `wildshard hero <source> --base <url>` | Capture the hero from a served build and stamp `hero.json`. `--stamp-existing` marks the images already there as current: only when you have looked at them and they show the current world |
| `wildshard upload <file> --channel staging\|prod` | Send a prepared shard file to the API (section 5) |
| `wildshard migrate --dry-run <file>` | Ask the API what admission would do with a shard file, storing nothing: its format against the API's, the migrations it would run, deprecations, the chain id and the digest it would record (`--server` or `WILDSHARD_API_URL`) |
| `wildshard account <email>` | Make your account once and save its key, which upload sends (see "Uploading", step 5) |
| `wildshard whoami` | Say which account key upload would send (from `WILDSHARD_API_KEY` or the key file), show its first characters, and print its account's email and how many slugs it owns (`--server` or `WILDSHARD_API_URL`) |
| `wildshard grid [--channel staging\|prod\|preview]` | Print the world grid on a channel: each taken cell and its shard, then the free cells. No key needed (section 5) |
| `wildshard delete <slug> [--yes]` | Delete your shard from the catalogue, every channel and the grid, after you type its slug (see "Deleting a shard") |
| `wildshard build <source>` | Build alone: bake the shard source into `out/<slug>/` and write `out/<slug>.shardfile`. `wildshard build <folder>` writes the shard file of a built folder (after `prepare`) |
| `wildshard prepare <folder> [--base <url>]` | Record the built folder in phone WebKit against engine's preparation client (or the exact engine preview `--base` names), which turns a draft into the uploadable form (see "Uploading") |
| `wildshard validate <source \| folder>` | Shard-format's checks and the static budgets, alone; `check` runs the headless budget run |
| `wildshard prove <source> <proof.json>` | Play a proof tape headlessly and print what happened ("Proof tapes" below) |
| `wildshard prove <source> <walk.mjs> --base <url>` | Play a walk proof on a `dev` page in headless Chromium: walk to an NPC, talk, answer, fight, and assert the flags and quest steps the server says ("Walk proofs" below) |
| `wildshard synth <source>` | Run `shard.config.ts`'s `scene` and `identity` exports (an older scene form) and write the scene as data. A `defineShard` scene shard (section 2b) needs no synth: `check` builds it and `watch` shows it |
| `wildshard schema [list\|shardfile\|<root>] [pointer]` | Print the JSON Schema of the shard file, or of one section or field |
| `wildshard serve` | The sharddev web app on localhost (tools for this repo, not for your shard) |
| `wildshard build-shards` | Build every shard source in the repo: its `src/` (a single-shard repo) and each `src/shards/<folder>/` (repos holding several shards) |
| `wildshard pack <folder>` | Old name for `wildshard build <folder>`; use `build` |

### Walking your shard

`wildshard dev .` walks the shard on your machine: it serves the shard on localhost and reloads the page when you
save (section 4). The first URL ends in `?skipintro` and walks straight into your shard. The second opens `?explore=world`
for flying and model inspection. `wildshard watch .` prints both URLs too. Ctrl-C stops the server and frees the port.

The first run fetches engine's dev client once, from the engine release at this sdk's engine pin, into
`~/.cache/wildshard/dev-client/` (about 300 MB; `$WILDSHARD_DEV_CLIENT_CACHE` moves it). Later runs, and every project
on the same sdk, reuse it. If the download fails, `dev` stops and says which release it asked for; nothing half-fetched
is kept, so run it again.

`dev` serves this shard alone: no other shards, no grid and no other players. To see it beside the rest of the
world, upload it to staging once the Wildshard team has placed it on the grid (section 5).

**Driving a `dev` page from a script** (a headless walk with Playwright or the like). The page answers
`window.__wildshard.state()` (the player, the creatures and the flags) at once. The calls that move the world for you,
`__wildshard.pose({ x, z, yaw })`, `nav.path(a, b)`, `combat.equip(id)` and `combat.target(kind, near)`, refuse with
`Probe control requires the harness pins` unless the page boots with the harness pins set. Set them before the page
loads, for example `await page.addInitScript(() => { window.__wildshardHarness = { seed: 1, capture: null }; })`;
`seed` fixes the page's random numbers, so two walks see the same world. `combat.target` holds the creature it returns
still until `combat.hold(creature, false)`. A creature's `brain` in `state()` is the page's copy: on a `dev` page the
server runs the brains, so it reads `idle` while the creature chases and bites; read its position and `hp` to see it act.

### Proof tapes

A proof tape is `src/proof.json`: player input, tick by tick, and the quest facts it must earn. `wildshard check .`
plays it (the `prove` step; with no tape, prove is skipped), and `wildshard prove . src/proof.json` plays it alone and
prints what happened as JSON. The shape:

```json
{
  "version": 1,
  "tape": [
    [{ "kind": "player", "moveX": 0, "moveZ": -1, "yaw": 0 }],
    [{ "kind": "player", "moveX": 0, "moveZ": -1, "yaw": 0, "jump": true }],
    [{ "kind": "player", "moveX": 0, "moveZ": 0, "yaw": 0 }]
  ],
  "checkpointTick": 2,
  "requiredFacts": ["meadow.visit"]
}
```

- **`tape`**: one list per tick, 1 to 4,096 ticks (the simulation runs 60 ticks a second), each with that tick's
  commands (at most 1,024). A `player` command is the stick (`moveX`, `moveZ`, each -1 to 1) and the facing (`yaw`, in
  radians), plus a press this tick: `jump: true`, `dodge: true`, or `attack: { "targetId": "<id>" }`. An `interact`
  command uses one of the shard's `targets.interactions` (a `world.interact` id, section 2b), or talks to an NPC:
  `"wren"` presses E on the talk `wren` and `"wren:accept"` picks its choice `accept` ("The proof tape" below).
  `wildshard schema` does not print the tape; this list is its whole shape for authors.
- **`checkpointTick`**: the tick, from 1 to the tape's length, where prove saves the cell, unloads it and loads it
  again. The player must come back where they stood, and the rest of the tape must play as it would have.
- **`requiredFacts`**: the facts the run must file, each a quest's `onComplete.fact`, at least one, no repeats.

Write a long tape with a few lines of code rather than by hand, for example 300 ticks of walking:

```sh
node -e 'const walk=[{kind:"player",moveX:0,moveZ:-1,yaw:0}];require("fs").writeFileSync("src/proof.json",JSON.stringify({version:1,tape:Array.from({length:300},()=>walk),checkpointTick:150,requiredFacts:["meadow.visit"]}))'
```

**Known, sdk 0.3.x:** a valid tape can still fail in the engine's save step (`traveler pose changed on restore` on a
scene shard, `restored regional suffix diverged` when a creature is moving at the checkpoint); a failing prove with
those words is not your tape's fault. A tape is input tick by tick, so walking it to an NPC means counting ticks: to
play a quest the way a player does, by name (walk to Wren, answer "I will help."), write a walk proof ("Walk proofs"
below) instead.

### The hero

The hero is three images: thumb 640x360, portrait 804x1626 and landscape 1600x900. `wildshard new` gives your shard a
generated card (a `data:` image) so it has one from the start. Build accepts that card with a note. To capture a real
hero:

1. Run `wildshard dev .` and leave it running. Any served build that carries this exact shard works too (an engine
   checkout's, entered from SHARD SELECT).
2. Run `wildshard hero . --base <url>` with the URL `dev` printed. It opens that page in headless Chromium, enters your
   shard, shoots the view `hero.json`'s `camera` names (or the spawn view), writes the three files and stamps
   `hero.json` with a hash of your content. A `data:` card becomes `card/thumb.jpg`, `card/portrait.jpg` and
   `card/landscape.jpg`, named in `data/card.json`. A scene shard (a `shard.config.ts` and no `data/card.json`) gets
   the same three files; its next build's card wears them.
3. Look at the three images, then stop `dev` with Ctrl-C.

A refusal is one line that starts with its rule, `[hero-<rule>]`, never a stack: `hero-no-source` (no shard here),
`hero-no-name` (a scene shard with no build, captured from a served build that isn't `dev`), `hero-no-card`,
`hero-card-file`, `hero-curated`, `hero-size` and `hero-page-error`.

Build then refuses a shard file whose content changed after the hero was stamped (`hero-stale`), and upload refuses a
new version whose hero is the same as the previous version's (`hero-unchanged`). Upload, and the API, also refuse a
shard file with no captured hero or the generated card (`hero-missing`) and a card image of the wrong size
(`hero-size`). Section 6 has every hero refusal.

**A curated hero** is hand-picked art, not a capture. Put `"curated": true` in `hero.json` and the art is kept: after a
content change, `wildshard build` re-stamps `hero.json` itself when the images are the stamped ones (commit the new
stamp), `wildshard hero . --stamp-existing` re-stamps swapped images, and `wildshard hero . --base`
refuses rather than shoot the spawn view over them. A new version still needs a new picture (`hero-unchanged`): swap
the art, then `--stamp-existing`. Remove `curated` to capture again.

### Reading a browser proof

A staging MMO page keeps authoritative quests and creatures in its worker client. Use the engine's shared reader in
a Playwright proof (the same reader serves local `wildshard dev`):

```js
import { readProofState } from '@wildshard/sdk/headless/scripts/proof-state.mjs';
const state = await page.evaluate(readProofState, { creatureKinds: ['boar'] });
if (!state) throw new Error('Enter the shard before reading gameplay');
console.log(state.quest.flags, state.quest.quests, state.creatures, state.seat);
```

Request the creature kinds your walk checks; the reader uses live worker rows for those kinds. `quest.flags` combines
shared and player flags; `quest.quests` contains the player's quest progress (including a null `step` when complete).
The local probe's original quest fields are retained. `seat` includes the server's cell number, instance, slug and the
page's visual `inside` cell, so a crossing can distinguish them. Wire cells are one-based; zero means the road on a
grid page. An unmapped seat says `unknown`, never a guessed slug. Without a worker, local probe creatures and quests
are retained; without its dev net reader, the worker report still supplies flags and quest steps (`phased` is null
because that report combines the two flag scopes). This is observation only: no flags, quests or creatures are changed.

### The proof tape

`proof.json` is a tape the server plays headlessly, one row of commands per tick, then checks what happened.
`wildshard check` plays it; `wildshard prove . proof.json` plays it alone and prints the report.

```json
{
  "version": 1,
  "checkpointTick": 120,
  "requiredFacts": ["honey.thief"],
  "requiredItems": { "honeycomb": 3, "smoker": 1 },
  "tape": [
    [{ "kind": "player", "moveX": 0, "moveZ": -1, "yaw": 0 }],
    [{ "kind": "interact", "id": "wren" }],
    [{ "kind": "interact", "id": "wren:accept" }],
    []
  ]
}
```

- **`player`** moves the player this tick (`moveX`, `moveZ` from -1 to 1, `yaw` in radians). The stick is world
  space: `moveX: 1` walks towards +x and `moveZ: -1` towards −z whatever the `yaw`, which turns only the facing (the
  page turns W by the camera before it sends the stick). A diagonal leg is both: `moveX: 0.7, moveZ: -0.7`.
- **`interact`** presses E. Its `id` is one of `targets.interactions`, or a talk: `"wren"` presses E on the talk
  `wren` (it closes a line with no choices), and `"wren:accept"` picks the choice `accept` of the node the player
  stands at. The player must be within the talk's `radius`, as on the page. An `id` that names nothing refuses with
  the tick and every id the tape could name there.
- **`requiredFacts`** are the quest facts (`onComplete.fact`) the tape must file. **`requiredItems`** (optional) are
  the stacks the player must hold when the tape ends, at least this many of each, counted across every pack.
- The report's `inventory` lists every pack's stacks when the tape ends; `ledger.facts` lists the facts filed. A scene
  or shard's player holds what the tape was paid under `player`: `coins` from quest `onComplete.coins` and kills,
  each kill's roll off the shard's loot tables by item, and the ledger's item rewards. A native shard's own packs
  appear under their own ids (`pack`).
- `checkpointTick` is where the proof saves, unloads and restores the shard mid-tape; it must fall inside the tape.

### Walk proofs

A walk proof plays your shard on a `dev` page the way a player does, by name instead of by tick: walk to Wren, press
E, answer "I will help.", kill the bear, and check what the server then says. It is a small script, say
`proof/honey-thief.walk.mjs`, whose default export gets the walk helpers:

```js
// The honey thief: Wren's talk, the bear, three hives, the turn-in.
export default async function honeyThief({ talk, choose, fight, expectFlags, expectQuest }) {
  await talk('wren');                  // walk to the talk, press E, wait for its box
  await choose('accept');              // a choice by its id ...
  await expectFlags(['honey.met']);
  await expectQuest('honey-thief', 'bear');
  await fight('honey-bear');           // a spawn id (or a species kind), until none is alive
  for (const hive of ['hive-1', 'hive-2', 'hive-3']) {
    await talk(hive);
    await choose('Gather a honeycomb.'); // ... or by its words on screen
  }
  await talk('wren');
  await choose('three honeycombs');    // ... or a part of them, any case, when only one answer has it
  await expectFlags(['honey.returned', 'honey.complete']);
  await expectQuest('honey-thief', 'complete');
}
```

Run `wildshard dev .`, then, in a second terminal, `wildshard prove . proof/honey-thief.walk.mjs --base <the URL dev
printed>`. It opens the page in headless Chromium (muted, 60 fps, no window), enters your shard as a new player, runs
the script and prints a JSON report: the verdict, each step with its time and what it saw (the talk's node and the
answers it offered, the swings a fight took), and the server's flags and quest steps at the end. Exit 0 is a pass.
`check` does not run walk proofs: they need a `dev` page. A page error during the walk fails it.

- **`talk(id)`** walks to the talk (`targets.talks`), presses E and waits for its dialogue box. It returns the node
  the server put this player at and the answers the box offers, each with its choice id and label.
- **`choose(answer)`** picks an answer of the open talk by its choice id, its label, or a part of one label (any
  case), presses its number, and waits for the server to move the talk to its next node. Two choices may share a
  label; the one your flags let the page offer is the one picked.
- **`walkTo(target, reach)`** walks to a talk, an interaction or a spawn by id, or to `{ x, z }`, within `reach`
  metres (1.5 unless given). The page's server moves the player; the walk holds W and steers.
- **`fight(target)`** walks to the nearest live creature of a spawn's species (or a species kind) and swings until
  the server shows none alive.
- **`expectFlags(all, none)`** waits until the server says the player has every flag in `all` and none in `none`;
  **`expectQuest(id, step)`** waits until the quest is at `step`: a step id, `unstarted` or `complete`. Each waits
  up to 8 s for the server.
- **`state()`** reads the server's word for the player now (position, `hp`, `kills`, `flags`, `quests`), and
  **`page`** is the Playwright page, for anything else.

Every refusal says what the page showed instead: `talk wren at node hello has no answer "three honeycombs" now; it
offers: accept ("I will help.")`, `flags: missing honey.bear-dead; the server says: honey.met`, `quest honey-thief is
at gather, not return`. Walk it by hand in `dev` to see which step did not happen.

### Uploading

An upload sends one shard file to the API (`https://api.wildshard.io`) and names its channel. Do these in order,
before every upload:

1. **Hero.** A new version needs a new hero (J306). After your last change to the world, capture one
   (`wildshard hero . --base <url>`, "The hero" above). Done when `hero.json` and the three card images are rewritten.
2. **Check.** `wildshard check .` builds the shard file. It is a **draft** (`sdk: "0.2"`): check prints a
   `shardfile-draft` warning, and upload and the API refuse a draft. After a new hero, check also records the built
   world's `look` in `hero.json`, so commit after it, not before. Done at `check pass`.
3. **Commit.** Upload names the commit the bytes came from and refuses uncommitted changes to tracked files. The first
   time: `git init`, then commit (the `.gitignore` `new` wrote keeps the build output and `node_modules/` out).
   Every time: commit everything, the hero and `hero.json` included. Done when `git status` is clean.
4. **Prepare.** `wildshard prepare out/<slug>` records the draft in phone WebKit and turns it into the
   uploadable form (`sdk: "0.3"`). It serves engine's preparation client around the draft itself, fetched once from
   engine's release at the SDK's engine pin (about 310 MB, kept in `~/.cache/wildshard/dev-client`), so no engine
   checkout is needed. Then `wildshard build out/<slug>` writes the prepared shard file. Done when
   prepare prints `{"slug":…,"programs":…}` and build prints the shard file line.
5. **Account.** Set `WILDSHARD_API_URL=https://api.wildshard.io` (or pass `--server`). Upload needs only your
   **account key**, which says whose shard it is: the first upload of a slug makes it yours, and nobody else's key can
   upload to it. Make the account once with `wildshard account you@example.com`: it saves the key to
   `~/.config/wildshard/sharddev-key` (only you can read it) and the API never shows it again, so keep that file. An
   email that has an account already is refused (`account-exists`); a lost key needs an operator reset by the
   Wildshard team. In CI, set `WILDSHARD_API_KEY` instead: it wins over the file. `wildshard whoami` says which key
   upload will send and whose it is. `WILDSHARD_CREATOR_PRIVATE_KEY` is optional: when set, upload also signs the
   bytes, and the server verifies that signature. Never commit either key. Done when `wildshard whoami` prints
   `key wsk_…` and `account <your email>`.
6. **Upload,** with a version `X.Y.Z` higher than the last one uploaded (`0.0.1` the first time). Upload reads
   `version` from the repo's `package.json` (`new` writes `0.0.1`; raise it before each upload), or pass `--version`:

```sh
wildshard upload out/my-shard.shardfile --channel staging --version 0.0.1
```

Upload checks the shard file as the API will, checks the hero, signs, compresses and sends it, then prints the
version and what moved. Uploading the same bytes again sends nothing.

With async upload, the command waits and reports `checked`, `cooking`,
`staged`, then `live`. Nothing is placed before the checks pass. A refusal
prints the full report and exits non-zero; a stall or a 20-minute wait
also exits non-zero. To return after acceptance, add `--no-wait`; it prints
the upload id. Read that upload later with the same account key:

```sh
wildshard upload status <upload-id> --server https://api.wildshard.io
```

The status command needs no shard file, version or channel. An older API
without async status retains the immediate `committed:` behavior.

**Built-in shards upload from GitHub Actions.** A `project-wildshard/shard-*` repo carries repo-kit's
`.github/workflows/publish.yml`, which does steps 3, 4 and 6 on a hosted runner with the org's secrets, so no laptop
needs a key. Commit and push the hero first (steps 1 and 2), wait for `ci` on `main` to go green, then:

```sh
gh workflow run publish.yml -R project-wildshard/shard-dunes -f channel=staging
```

It refuses before uploading when `main`'s `ci` or newest Ring 2 run is red. `-f version=X.Y.Z` overrides the version
(default: one patch above the catalogue's), and `-f rehearse=true` on any branch builds and prepares without uploading.
The run summary prints `committed:`, the grid line and the engine pin command.

### Deleting a shard

`wildshard delete my-shard` deletes a shard you uploaded, with the same account key: only the key that first uploaded
a slug can delete it. It makes two calls to the API, with you in between:

1. **Start.** It prints what the delete touches: the shard's versions, the channels pointing at it, the grid cells
   placing it, and a plain line saying whether a signed release still plays it. A shard a live release plays can still be deleted: that release
   keeps its copy until its next release.
2. **Type the slug.** Type `my-shard` and press Enter. Anything else deletes nothing (`delete-not-confirmed`). You
   have 10 minutes; after that the confirmation lapses and you start again (`delete-expired`).
3. **Finalize.** The shard leaves the catalogue, every channel and the grid at once, and its grid cell is freed
   for the next new shard. Its downloads stop after the daily prune, once no signed release names it.

In a script, `wildshard delete my-shard --yes` skips the typing. A deleted slug stays yours: uploading a new version
of it with your key brings it back, on preview only. Done when the last line starts `deleted my-shard at`.

## 2. The shard source

A project made by `wildshard new` is a repo with one shard source at `src/`. Inside `src/`:

| Path | What it is | Ships in the shard file? |
|---|---|---|
| `shard.config.ts` | The build entry: exports `generate` (default) and `buildOptions`. Build runs it | No: its output does |
| `data/` | JSON rows: identity (`data/identity.json`: slug, name, author, revision, seed), card, layout, creatures, items, quests, text, audio, look, budgets (`data/budgets.json`) | As baked sections, never as code |
| `generators/` | TypeScript that runs at build time (any Node package, J319). In the Template, `scene.ts` is the world as a three.js scene module (its parts are what `wildshard watch` swaps) and `generate.ts` puts the gameplay rows over it | No: what they produce does |
| `sources/` | Programs that made a committed asset (the Template's Warden skin); build never runs them | No: the asset does |
| `behaviour/` | AssemblyScript (`.as`) scripts and `hooks.json`. Build compiles them to Wasm | The compiled Wasm |
| `assets/` | Source assets, named by their SHA-256 | The ones the shard uses, by hash |
| `static/` | Files the shard mounts, under the names it reads: a file named `/<path>` is `static/<path>` (`static/assets/<slug>/`, `static/programs/`) | The ones its `mounts.json` lists, under those names |
| `look/` | Recorded entry reads for the build | No |
| `data/card.json` | The card and discovery fields: name, `card` images, `shardfile` path | The card, as data |
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
| `.claude/skills/wildshard*/SKILL.md` | The `wildshard` skill (SA14): the loop's order for Claude Code, pointing into this guide; and its siblings (SA27): `wildshard-mockup-to-model` (a picture to a model), `wildshard-goldens` (refresh the hero and proof tape), `wildshard-upgrade` (move to a newer sdk). `wildshard update` rewrites them: never edit them | No |
| `.agents/skills/wildshard*` | Links to the four `.claude/skills/` folders, so Codex lists the same skills | No |
| `AGENTS.md`, `CLAUDE.md` | For agents: read this guide first; the skills are in `.claude/skills/`. `CLAUDE.md` is `@AGENTS.md`, so Claude Code reads the same file. Yours to change: `update` keeps your edits | No |
| `out/` | Build output: the built folder and `<slug>.shardfile`. Never edit; never commit | It is the shard file |

**The card is `src/data/card.json`.** It names the shard (slug, name, status, card art) and is its one home: `new`
writes it, build reads it, and hero capture writes the captured slots into it.

Blender files (`.blend`), mockups and other working files never ship: keep them in a folder of your own, such as
`blender/`, and export what the shard needs into `assets/`. A shard never ships runtime TypeScript: everything that
runs in the game is data, or Wasm compiled from `behaviour/`. `shard.config.ts` and `generators/` run only at build
time; lint refuses runtime code there (section 6).

**Behaviour scripts read and write by name.** A `behaviour/` script imports the sdk's prelude, `./wildshard`, which
build supplies: `shared(i)` and `player(i)` read state fields in their declared order, `eventCount()` and
`eventType(i)` read the call's events, and `setShared(id, value)`, `setPlayer`, `setField`, `emit`, `spawn` and
`moveTo` write its commands (four a call). Start `on_tick` with `begin()`, and re-export the ABI from it:
`export { abi_version, init, in_ptr, in_cap, out_ptr, out_cap, out_count } from './wildshard';`. The Template's
`behaviour/door.as` is the example. A script with its own addresses still builds.

**Repo layout (J317).** A repo with one shard keeps its shard source at `src/` (`src/shard.config.ts`,
`src/data/`, ...); a repo with several keeps `src/shards/<slug>/`. Commands take the repo (`.`) and find the shard
source at `src/`, or at the one `src/shards/<slug>/` a repo holds; in a repo with several, name the shard source
(`src/shards/<slug>`). The slug is `data/card.json`'s, whatever the repo folder is called. A `src/` source builds
into the repo's `out/`; a `src/shards/<slug>/` source into its own folder's. Either keeps the files it mounts in
its own `static/` (sdk 0.5.0: no repo `public/`). SA24 moves the existing
single-shard repos to `src/`.

**Blender makes models, not shards (J341).** A shard is TypeScript three.js scene source: `shard.config.ts`, its
`generators/` and `data/`. Blender makes the `.glb` models that code loads; export them into `assets/`. The old
hand-written template (`new --template blender`, a shard file folder held by hand) is retired, and `new` refuses it.
A repo started that way before still checks and uploads: `wildshard check .` packs and validates its `src/` folder as
it always did.

**Imported creature chains.** `importCreatureGlb` from `@wildshard/sdk/scene/creature-import` accepts
one skinned GLB and `{ skeleton: 'biped', map: 'mixamo' }` (or `'rigify'`). A custom map supplies
`root` and a `chains` object: each defining chain name maps to source bone names in chain order.
The presets use `Armature` / `root` as their body root; a root outside the skin is added as a joint
with remapped weight indices. Mixamo names accept the `mixamorig:` or `mixamorig` prefix.
The importer keeps mesh weights, clip targets and attachment parents, while emitting canonical names
and full ordered joint metadata through `creatureSkin`. Missing, duplicate or detached chains name
the failing chain. Inputs use translation-only, unit-scale inverse binds and at most 32 final joints;
bake bind rotations/scales in the source tool. Read source bytes through `ctx.cached` and return the
compiled GLB in generated output assets. Kit skeleton/body helpers are a separate build step.

**Creature hit markers.** For a creature's `platform.skin` look, parent an empty named `hit.<part>` under a skin
bone in Blender. Its translation becomes the bone-local offset. Export custom properties as extras: `radius`
(default 0.3), `shape` (`sphere` or `capsule`), `halfLength`, `axis` (`y` or `z`) and `multiplier` (head defaults to 2,
other parts to 1; 0 makes a shield). Keep marker scale positive and uniform; capsule axes align with the bone's Y
or Z axis. Build and the handwritten pack step copy these into `body.volumes`, with at most 16 resolved parts.
Explicit row volumes override the same named markers. Variants must resolve to the same volume rows; override a
part explicitly when their markers differ. The GLB bytes stay unchanged. The engine clamps each final scaled
radius to at least 0.3 metres, so a tiny authored radius remains hittable.

**What a shard may declare.** The runtime contract lists every section, `client/plan` kind, named file, script rule,
budget and limit a shard file may carry, and what validation refuses:
[shard-format `docs/RUNTIME-CONTRACT.md`](https://github.com/project-wildshard/shard-format/blob/main/docs/RUNTIME-CONTRACT.md).
Read with it [`SHARDFILE.md`](https://github.com/project-wildshard/shard-format/blob/main/docs/SHARDFILE.md) (the
fields), [`SCRIPT-ABI.md`](https://github.com/project-wildshard/shard-format/blob/main/docs/SCRIPT-ABI.md) (the Wasm
scripts) and [`PLATFORM-FILE-FAMILIES.md`](https://github.com/project-wildshard/shard-format/blob/main/docs/PLATFORM-FILE-FAMILIES.md)
(the named files). `wildshard schema list` prints the section roots from your installed copy.

## 2b. A scene shard

A shard can also be one three.js scene, written in TypeScript: `wildshard new my-shard` makes one (Mossgate Hollow,
under your slug; J434 made it the starter). It is the same shard format as section 2; only the source is shorter. It needs no
`data/card.json` and no `data/` rows: `defineShard` takes the slug and name, the scene builds the world, and build
writes the rest. `wildshard check .` builds it, `wildshard watch .` shows each saved edit in a running page, and
`wildshard synth` is not for it (synth takes the older scene form only).

**Mossgate's files: a file per region, a section per mechanic (MZ25).** The starter is a whole zone, and each file is
under 400 lines, so a region or a mechanic is one file to read and one to change:

| File | What it holds |
|---|---|
| `generators/layout.ts` | The cell map: the six regions round the yard, the twelve places, the entry roads and the paths |
| `generators/ground.ts`, `hollow.ts` | The ground over the 500 m cell, each region's relief and tint; the yard's `LAYOUT` and the pond's shape |
| `generators/world.ts` | The scene's order: the light, the ground and every yard part (`buildMossgate`) |
| `generators/kit.ts` | Shared materials and builders: blocks, moss caps, drapes, ivy, lanterns, halos, colliders, stencils |
| `generators/yard.ts`, `garden.ts` | The Hollow yard: walls, paths, braziers, hut, crate, signpost, moss gate, the Lamplighter; the pond, trees, boulders, ferns, grass, fireflies |
| `generators/meadow.ts`, `thicket.ts`, `bog.ts`, `quarry.ts`, `ridge.ts`, `downs.ts`, `ring.ts` | One region each: Mossling Meadow, Greyback's Thicket, the Bog, the Old Quarry, Lookout Ridge, the Barrow Downs and its ring |
| `generators/places.ts` | The twelve places as region triggers and fingerposts |
| `generators/cover.ts` | Each region's ground cover, one detail layer a region: flowers, ferns, reeds, pale grass, rubble, heather |
| `generators/play.ts` | What the player uses: braziers, gates, lever, chest, rack, lift, and the order every part is built in (`buildHollow`) |
| `generators/creatures.ts`, `fights.ts`, `behaviour/*.as` | Bodies and camps; brains, packs, encounters and the boss and elite decision scripts |
| `generators/quests.ts`, `gameplay.ts` | The main chain, the side quests, the talks and the achievements (`extend`) |
| `generators/finds.ts` | The lamp-glass set, the cairn's chest, the lore signs |

**Which files a scene shard keeps.** Only `src/shard.config.ts` and the modules it imports. `--template scene` writes
four: `shard.config.ts`, `identity.json` (slug, name, author, revision, seed), `generators/shard.ts` (`defineShard`)
and `generators/world.ts` (the scene), with `generators/sky.ts` and `generators/textures.ts` beside it. To turn a repo
`new` made from the reference world into a scene shard, replace `src/shard.config.ts` with one like the one below and
delete everything else under `src/`: `data/` (the card included), `behaviour/`, `assets/` and the reference's
`generators/` are the shard's and a scene shard reads none of them. Keep the repo files around `src/`
(`package.json`, `.oxlintrc.author.json`, this guide).

The smallest one, `src/shard.config.ts`:

```ts
import * as THREE from 'three';
import { defineShard } from '@wildshard/sdk/scene/shard';
import { solid } from '@wildshard/sdk/scene/author';

export default defineShard({ slug: 'meadow', name: 'Meadow' }, (world) => {
  // a low knoll, flat (height 0) from 120 m out, so every entry road meets the next cell at 0
  world.ground((x, z) => 6 * Math.max(0, 1 - Math.hypot(x, z) / 120) ** 2, { colourAt: () => [0.32, 0.5, 0.2] });
  const stone = new THREE.MeshStandardMaterial({ color: '#8a8378', roughness: 0.9 });
  const walls = solid(new THREE.Mesh(new THREE.BoxGeometry(6, 3, 6), stone));
  walls.position.set(0, 5.6, -20); // the knoll is 4.2 m high here; the walls are 3 m
  world.part('hut', (part) => { part.add(walls); });
  world.trigger('meadow.hut', walls, { radius: 8, flag: 'meadow.hut' });
  world.spawn(0, 7, 10, 0); // ground 5 m here; yaw 0 faces -z, towards the hut
});
```

**Coordinates.** The cell is 500 m square: x and z run from -250 to 250, with the cell's middle at (0, 0). North is
+z. `y` is height in metres. A yaw of 0 faces -z. Put the spawn at least 1 m above the ground under it.

**The entry roads.** Players walk in from the next cell by a road at the middle of each cell edge. Within 6 m of the
middle of each edge the ground must be exactly 0 m high, so the road meets the next cell; check refuses a shard
whose ground is not ("Terrain entry road must meet road height zero"). Two more rules cover the road's approach, and
check refuses those too: the first 15 m in from each edge, 8 m wide, must be exactly 0 m over every ground triangle it
touches ("baked entryway footprint must be flat at road height y=0"), and the engine walks each road 50 m in, so for
50 m the ground must stay within 0.15 m of 0, flat, dry and free of colliders ("Blocked edge entry north lane 0 at
34.40m"). Easiest: blend your ground to exactly 0 for the last 50 m before each edge's middle and a few metres to each
side, as `h = lerp(h, 0, smooth(186, 197, r) * (1 - smooth(9, 18, Math.min(Math.abs(x), Math.abs(z)))))` does with
`r = Math.hypot(x, z)`.

**What `world` takes.**

| Call | What it makes |
|---|---|
| `world.ground(heightAt, { colourAt, material, detail })` | The ground's height everywhere in the cell, and its colour |
| `world.part(name, build)` | A named piece of the world; `watch` swaps one part at a time. Wrap a mesh in `solid(...)` and players collide with it |
| `world.sky(colour)`, `world.post({...})` | The sky (a TSL colour) and the post-processing numbers |
| `world.spawn(x, y, z, yaw)` | Where a player enters |
| `world.trigger(id, object, { radius, flag })` | Entering `radius` metres of `object` sets quest flag `flag` |
| `world.interact(id, object, { label, radius, scene })` | A use prompt that runs a shard scene |
| `world.interact(id, object, { label, radius, sets })` | A use prompt that sets a state field, no script needed: `sets: { field, scope: 'shared' \| 'player', value }` or `{ field, scope, add, max }` (a count). A shared use's prompt goes once the field holds what it would write |
| `world.part(name, build, { panel, shownWhen: { field, equals } })` | A panel shown (and solid) only while a field a `sets` prompt writes holds `equals`: a shrine's flame once it is lit. A `player` field's panel is that player's alone (their socket): never solid, and shown on their page by an engine with SHARD-SOURCE SS-GF1a2 |
| `world.vehicle(kind, build, { speed, ... })`, `world.dock(id, object, { kind, per?, respawn? })` | A vehicle kind players get into, drive and leave, and where one stands (format `world/vehicles`); see *Vehicles* below. `world.part`'s old `vehicle` option is refused |
| `world.pickup(id, at, { label, radius, item: { id: 'tool.<name>', name, colour?, intensity?, fuelSeconds? }, flag? })` | A lantern on a stand: using its prompt puts the tool in the player's kit lit and full, and raises `flag`; a later use refills it. The sdk writes the tool, the take and the fields that show its light. Two pickups may hand over one tool (same options). Needs an engine with SHARD-SOURCE SS-GF1a1a |
| `world.detail(id, instancedMesh, { cell, radius })` | Grass and small clutter the engine scatters near the camera |
| `world.music({ day, night?, boss? })`, `world.ambience({ winds })` | The shard's score from the engine's own piano slots (`title`, `island`, `pine`; no audio bytes, J304), by day, by night and while a boss fights, and a synth wind bed; either ends the scene's default silence, so quest steps are heard (format `audio`) |
| `world.spawnAt(id, object, { species, variant, brain, strike, seed, scale, rank?, count?, when? })` | A creature spawn row (`creatures.spawns`) at `object`'s world position, facing its +z; a boss is a spawn its encounter names by `id` |
| `world.creature(id, group, { species, size, scale?, skeleton?, volumes?, lock?, hits?, clips?, loops, material, materials?, family?, sockets?, attackSpan?, strikes? })` | A whole creature from a `Group` of named bone nodes built outside `world.scene`: its skinned GLB rig (each mesh rides its nearest bone, `clips` kept; one skinned mesh, a primitive per material, at most 8 materials), its skin in the library, the species row `id` and look `<id>.look`, and `strikes`, the strike rows its abilities name; 64 bones at most, at most 32 `sockets` (default every bone). Place it with `world.spawnAt(…, { species: id, … })`. The build also writes its phone mesh (half the vertices within 1% of its radius; the shard file option `creaturePhone` tunes it, `false` skips it), which the phone tier draws from the same clips; `wildshard content` lists its bones and both triangle counts |

From `@wildshard/sdk/scene/author`: `solid` (collides), `paint` (a texture from a function), `Water` (a water
surface), and `animate` with `flicker`, `pulse`, `drift`, `rise`, `sway` and `uvScroll`.

**Vehicles.** A vehicle is a *kind* (`world.vehicle`) and the *docks* it stands at (`world.dock`), written as the
shard's `world/vehicles` section (MIRROR-SALT-ZONE MSZ1 to MSZ5; `src/shards/vehicles/` is the worked example).

```ts
import * as THREE from 'three';
import { solid, type ShardWorld } from '@wildshard/sdk/scene/author';

const red = new THREE.MeshStandardMaterial({ color: '#b5402a' });

/** Built about its own origin, its base at y 0, facing -z. */
function buggy(part: THREE.Group): void {
  const tub = solid(new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 3.4), red));
  tub.position.set(0, 0.75, 0);
  part.add(tub);
  const driver = new THREE.Object3D();
  driver.name = 'seat.driver';
  driver.position.set(-0.45, 0.9, 0.3);
  const passenger = new THREE.Object3D();
  passenger.name = 'seat.passenger';
  passenger.position.set(0.45, 0.9, 0.3);
  part.add(driver, passenger);
}

export function build(world: ShardWorld): void {
  world.vehicle('salt.buggy', buggy, { speed: 22, reverse: 6, accel: 9, grip: 0.8, labels: { drive: 'Drive the buggy' } });
  const yard = new THREE.Object3D();
  yard.position.set(-6, 0, 20);
  world.scene.add(yard);
  world.dock('yard.buggy', yard, { kind: 'salt.buggy' });
}
```

- **Seats.** Empties named `seat.driver` (exactly one) and `seat.passenger` (or `seat.passenger.2`, up to four seats in
  all) are where riders sit; `pose: 'stand'` stands them (a sail's deck). `leave.driver` and `leave.passenger` are where
  getting out sets them down; without one, a rider steps out 0.8 m past the side they sit on.
- **Hull.** The kind's `solid()` meshes, at most 16 boxes each at most 8 m from its centre to a face: they ride the
  vehicle and stop anyone on foot, never its riders. A kind's panel is written hidden: the engine poses it at each dock.
- **Handling, and what the numbers feel like.** `speed` is the top speed in m/s (a run is 6, the hoverboard 14, a buggy
  20 to 25, at most 60); `reverse` its top speed backwards (default the lesser of 6 and `speed`); `accel` how fast it
  gets there (default 6 m/s²: 0 to 22 m/s in under 4 s at 9) and `brake` how fast it stops (default twice `accel`);
  `turn` the radians a second at full stick (default 1.2: a full circle in about 5 s); `grip` from 0 (ice) to 1 (rails,
  default 0.9) and `drift` how long a slide lasts (0 to 1, default 0.3); `boost` the sprint multiplier (1 to 4, default
  1.5); `mass` in kg (default 500), which decides who gives way in a crash; `ground: false` keeps it at its dock's height
  (a boat on still water); `wind: { toward: [x, z], push }` pushes a sail up to `push` m/s along its heading.
- **Surface grip.** `world.vehicleSurface({ base, patches })` multiplies the kind's grip under the vehicle. A patch is a
  `{ shape: 'circle', at: [x, z], radius, grip }` or a `{ shape: 'road', line: [[x, z], ...], width, grip }`. Use cell-local
  metres and multipliers between 0 and 1. The last covering patch wins, so list a road after a flood to keep the road's grip.
- **Docks.** `world.dock(id, object, { kind })` stands one at `object`'s world position, facing its -z. `per: 'player'`
  (the default) gives each player their own, gone 60 s after they leave it; `per: 'shared'` parks one for everyone.
  `respawn` (default 60 s) is how soon it comes back. A dock stands on the ground, clear of solids, with every leave
  point on the ground and outside its hull, or the build (and `wildshard check`) refuses it.
- **Sounds and health.** `sounds: { loop, skid, impact, horn }` name `audio.cues` ids; `health` (1 to 100,000) lets
  crashes wear it down. `labels: { drive, ride, leave }` word its prompts.
- **Limits.** At most 8 kinds and 32 docks a shard. `wildshard content` counts kinds, seats and docks. Driving needs an
  engine that reads `world/vehicles` (MSZ6 and later); until its vehicle runtime (MSZ8) it runs each dock as a one-seat
  steer carry.

**Items and quests.** Every player starts with the Template's iron sword (`weapon.sword-iron`), so a scene shard
needs no item rows to fight. To add quests, items or any other section, pass `{ extend: (shard) => ({ ...shard,
quests: ... }) }` as `defineShard`'s third argument; `wildshard schema list` names every section and its shape. An NPC
with a quest and loot, every row and how they connect, is worked through below (*An NPC with a quest and loot*).

**A boss's decision script.** A boss encounter (added through `extend`) runs an AssemblyScript decision script: put the
source in `behaviour/<name>.as` beside `shard.config.ts`, pass its `sim/scripts` row as `defineShard`'s `decisions`
(`{ extend, decisions: [row] }`; the row names its `source`, its `binding.encounter` and the strikes and fields it
drives), and cap its length with `export const buildOptions = { asLineCeiling: 100 }` in `shard.config.ts`. The build
compiles it. The starter's Barrow Warden is the worked example: `generators/fights.ts` and `behaviour/warden.as`. A
script that moves its actor (burrow, relocate, surface, leap) declares those moves as `moves` (`actors/moves` rows) and
the spots they land on as `spots` (`world/targets` spots, `{ id, at: [x, y, z], yaw }`), beside `decisions` in the same
options; Brasscap's Dust Wyrm is the worked example.

**A creature, from rows to a kill.** A scene shard's creature is one `world.creature` call (its body, skin, species
row, look row and the strike rows its abilities name) and a `world.spawnAt` per creature. Jackal
Den has two jackals that bite; the whole `src/shard.config.ts` (`src/sharddev/guide/scene-creature.example.ts` in the
sdk, built by its tests):

```ts
// Jackal Den: a scene shard with a creature, from rows to a kill. `world.creature` turns a Group of named bones into
// the jackal's skinned body, its skin, its species and look rows, and the bite its ability names; `world.spawnAt`
// places two. Every player holds the starter sword, so the jackals can be fought and killed.
import * as THREE from 'three';
import { abilities, temperament } from '@wildshard/kit';
import { defineShard } from '@wildshard/sdk/scene/shard';

const bite = abilities.bite({ id: 'jackal.bite', damage: 9, range: 1.6 });
const { temperament: pursue, senses } = temperament.pursue({ aggro: 16, leash: 30 });

/** The jackal's body: a `body` bone carrying a `head` and a `tail` bone, a box on each (each mesh rides its bone). */
function jackalBody(): THREE.Group {
  const fur = new THREE.MeshStandardMaterial({ color: '#b08850' });
  const root = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group(), tail = new THREE.Group();
  body.name = 'body'; head.name = 'head'; tail.name = 'tail';
  body.position.set(0, 0.5, 0); head.position.set(0, 0.1, 0.5); tail.position.set(0, 0.05, -0.45);
  body.add(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.3, 0.9), fur), head, tail);
  head.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.3), fur));
  tail.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.35), fur));
  root.add(body);
  return root;
}

/** A one-second clip that dips the head by `angle` radians and back: idle, walk and the bite's lunge. */
function nod(name: string, angle: number): THREE.AnimationClip {
  const dip = [Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)];
  return new THREE.AnimationClip(name, 1, [new THREE.QuaternionKeyframeTrack('head.quaternion', [0, 0.5, 1], [0, 0, 0, 1, ...dip, 0, 0, 0, 1])]);
}

export default defineShard({ slug: 'jackal-den', name: 'Jackal Den' }, (world) => {
  world.ground(() => 0, { colourAt: () => [0.7, 0.6, 0.4] });
  world.spawn(0, 1, 10, 0);
  world.creature('jackal', jackalBody(), {
    species: {
      kind: 'jackal', label: 'Dune jackal', type: 'beast', aggressive: true, lockable: true,
      dims: { bodyY: 0.5, bodyHalfLen: 0.45, bodyRadius: 0.22, headRadius: 0.12, legLen: 0.42, feet: [], halfWidth: 0.18 },
      variants: [{ id: 'tawny', label: 'Tawny jackal', rarity: 'common', weight: 1, scale: [0.9, 1.1], hp: 40,
        mods: { speed: 1, chargeDist: 1, damageTaken: 1, chargeDamage: 0, relentless: false } }],
      temperament: pursue, senses, abilities: [bite.ability],
    },
    strikes: [bite.strike],
    size: 'small',
    clips: [nod('idle', 0.1), nod('walk', 0.3), nod('attack', 0.6)],
    loops: ['idle', 'walk'],
    material: { family: 'pbr', vertexColours: true },
  });
  // a spawn faces its marker's +z: these two face the player, 22 m north of them
  for (const [index, x] of [-4, 4].entries()) {
    const den = new THREE.Object3D();
    den.position.set(x, 0, -12);
    world.scene.add(den);
    world.spawnAt(`jackal-${index + 1}`, den, { species: 'jackal', variant: 'tawny', brain: null, strike: null, seed: index + 1, scale: 1 });
  }
});
```

- **The body** is a `Group` of named bone nodes (`body`, `head`, `tail`; every creature has a `body` and a `head`),
  built outside `world.scene`, each mesh on its bone. `clips` animate the bones by name: `idle`, `walk` and `attack`
  play from the creature's state; `loops` are the ones that repeat. A kit skeleton (`skeleton: 'quadruped'`) instead
  takes the kit's bones and default hit volumes.
- **The species row** is section 2c's, without `id` and `body`: `world.creature` writes those (its id, its size and
  the look `jackal.look`). `abilities` name strikes by id; pass those strike rows as `strikes` and they go in
  `rows.strikes` (two creatures may pass the same row). The kit's `abilities.bite` makes both halves.
- **The spawns** are `creatures.spawns` rows: `brain: null` and `strike: null` keep the species' own temperament and
  abilities; `variant` is one of its variants.
- **The kill.** Every player holds the starter sword. Prove the fight with a walk proof (section 1, *Walk proofs*),
  `proof/jackals.walk.mjs`:

```js
// Jackal Den: kill both jackals, then read the server's kill count.
export default async function jackals({ fight, state }) {
  await fight('jackal');               // the species kind: swings until no jackal is alive
  const { kills } = await state();
  if (kills < 2) throw new Error(`two jackals, but the server counts ${kills} kills`);
}
```

  Run `wildshard dev .`, then `wildshard prove . proof/jackals.walk.mjs --base <the URL dev printed>`. A quest that
  waits on the kill reads it the same way: a `kill` objective on species `jackal`, added through `extend`
  (`wildshard schema shardfile /quests`).

**An NPC with a quest and loot.** An NPC is a talk (`targets.talks`: where it stands, how near the player must be,
its prompt) that opens a dialogue tree (`quests.dialogue`). A quest (`quests.quests`), a trigger (`quests.triggers`),
the item catalogue (`items.catalogue`) and a loot table (`rows.loot`) go in through `extend`. They connect by name:
choices, triggers and quest steps read and set flags, and every flag is declared once in `quests.flags`. Wren's Hives
is the whole `src/shard.config.ts` (`src/sharddev/guide/npc-quest.example.ts` in the sdk, built by its tests):

```ts
// Wren's Hives: an NPC with a quest and loot, and how their rows connect. Everything joins on flag names: Wren's
// `accept` choice sets `wren.met`, which starts the quest; the badger's death trigger sets `wren.badger-dead`, which
// finishes its first step and opens her turn-in choice; that choice sets `wren.returned`, which finishes the quest. The
// quest pays coins, and each badger kill rolls a honeycomb off the shard's loot table (an item its catalogue names).
import * as THREE from 'three';
import { abilities, temperament } from '@wildshard/kit';
import type { Shardfile } from '@wildshard/format/shardSchema';
import { defineShard } from '@wildshard/sdk/scene/shard';

const WREN_AT = [-6, 0, 4] as const;
const bite = abilities.bite({ id: 'badger.bite', damage: 6, range: 1.4 });
const { temperament: pursue, senses } = temperament.pursue({ aggro: 12, leash: 24 });

// 1. Flags: every name a choice, trigger or quest reads or sets is declared once here.
const flags = ['wren.met', 'wren.badger-dead', 'wren.returned', 'wren.done'];

// 2. The NPC is a talk (`targets.talks`, below) that opens this dialogue tree. A choice shows while its `when` holds
//    and sets its `sets` flags; `next: null` ends the talk.
const wren = { id: 'wren', name: 'Wren the beekeeper', start: 'hello', nodes: [
  { id: 'hello', lines: ['A honey badger is in my hives. Drive it off and I will pay you.'], choices: [
    { id: 'accept', label: 'I will help.', next: 'waiting', when: { none: ['wren.met'] }, sets: ['wren.met'] }] },
  { id: 'waiting', lines: ['The badger digs by the hives, north of here.'], choices: [
    { id: 'turn-in', label: 'The badger is gone.', next: null, when: { all: ['wren.badger-dead'] }, sets: ['wren.returned'] }] },
] };

// 3. The quest starts when `startWhen` holds; each step is done when its flags are; `completeFlag` is raised at the
//    end, and `onComplete` pays the coins and files the fact a proof tape's `requiredFacts` names.
const quest = { id: 'honey-badger', title: 'The honey badger', track: true, completeFlag: 'wren.done', startWhen: { all: ['wren.met'] },
  steps: [
    { id: 'badger', objective: 'Drive the badger from the hives.', done: { all: ['wren.badger-dead'] } },
    { id: 'return', objective: 'Tell Wren the badger is gone.', done: { all: ['wren.returned'] } },
  ],
  onComplete: { fact: 'wren.paid', coins: 10 } };

// 4. A death trigger raises its flag when a creature carrying `tag` dies: every creature carries `creature.<kind>`.
const badgerDead: Shardfile['quests']['triggers'][number] = { id: 'badger-dead', kind: 'death', flag: 'wren.badger-dead', tag: 'creature.badger' };

// 5. Loot: a `trophies` table rolls items on each kill, matched by the creature's `kind`; a `coins` table would pay
//    coins the same way. `currency` names the shard's coin: what it is called, the pickup a kill bursts and the Bag
//    icon. The rest of the economy row is empty: no effects, goods, grants, finds or map marks.
const loot: Shardfile['rows']['loot'][number] = { id: 'wren.loot', gear: 'purse.coins', finds: null, marks: null, charted: false, chime: 'coin',
  economy: {
    currency: { id: 'coin', name: 'Coin', model: 'shared/doubloon', icon: 'coin' },
    tables: [{ id: 'badger.trophies', domain: 'trophies', table: { mode: 'weighted', rows: [{ item: 'honeycomb', weight: 1, count: 1, match: { kind: 'badger' } }] } }],
    effects: [], goods: [], grants: { player: [], worn: [], weapons: [] }, finds: { counters: [], sections: [] }, marks: [],
  } };

/** The badger: a `body` bone carrying a `head` bone, a box on each. */
function badgerBody(): THREE.Group {
  const fur = new THREE.MeshStandardMaterial({ color: '#4a4440' });
  const root = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group();
  body.name = 'body'; head.name = 'head';
  body.position.set(0, 0.3, 0); head.position.set(0, 0.05, 0.4);
  body.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.7), fur), head);
  head.add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.25), fur));
  root.add(body);
  return root;
}

/** A one-second clip that dips the head by `angle` radians and back. */
function nod(name: string, angle: number): THREE.AnimationClip {
  const dip = [Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)];
  return new THREE.AnimationClip(name, 1, [new THREE.QuaternionKeyframeTrack('head.quaternion', [0, 0.5, 1], [0, 0, 0, 1, ...dip, 0, 0, 0, 1])]);
}

export default defineShard({ slug: 'wrens-hives', name: "Wren's Hives" }, (world) => {
  world.ground(() => 0, { colourAt: () => [0.45, 0.6, 0.3] });
  world.spawn(0, 1, 10, 0);
  // Wren's body is an ordinary part; the talk below stands at her feet
  world.part('wren', (figure) => {
    const dress = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.2, 7), new THREE.MeshStandardMaterial({ color: '#d9962b' }));
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 1), new THREE.MeshStandardMaterial({ color: '#efe3c4' }));
    dress.position.y = 0.6; head.position.y = 1.45;
    figure.add(dress, head);
    figure.position.set(...WREN_AT);
  });
  world.creature('badger', badgerBody(), {
    species: {
      kind: 'badger', label: 'Honey badger', type: 'beast', aggressive: true, lockable: true,
      dims: { bodyY: 0.3, bodyHalfLen: 0.35, bodyRadius: 0.2, headRadius: 0.1, legLen: 0.2, feet: [], halfWidth: 0.2 },
      variants: [{ id: 'grey', label: 'Honey badger', rarity: 'common', weight: 1, scale: [1, 1], hp: 30,
        mods: { speed: 1, chargeDist: 1, damageTaken: 1, chargeDamage: 0, relentless: false } }],
      temperament: pursue, senses, abilities: [bite.ability],
    },
    strikes: [bite.strike],
    size: 'small',
    clips: [nod('idle', 0.1), nod('walk', 0.3), nod('attack', 0.6)],
    loops: ['idle', 'walk'],
    material: { family: 'pbr', vertexColours: true },
  });
  const hives = new THREE.Object3D();
  hives.position.set(0, 0, -14);
  world.scene.add(hives);
  world.spawnAt('badger-1', hives, { species: 'badger', variant: 'grey', brain: null, strike: null, seed: 1, scale: 1 });
}, {
  // 6. The sections `world` has no call for go in through `extend`: the quest rows, the talk, the item and the loot.
  extend: (shard) => ({
    ...shard,
    quests: { ...shard.quests, flags, quests: [quest], triggers: [badgerDead], dialogue: [wren] },
    targets: { ...shard.targets, talks: [{ id: 'wren', at: [...WREN_AT], radius: 3, label: 'Talk to Wren', dialogue: 'wren' }] },
    items: { ...shard.items, catalogue: [{ id: 'honeycomb', label: 'Honeycomb', icon: 'shell', travels: true }] },
    rows: { ...shard.rows, loot: [loot] },
  }),
});
```

- **Wren** is the talk `wren`, standing at her part's feet. The talk's `dialogue` names her tree; `figure` (optional)
  names a props model that draws her instead of the engine's stand-in. A tree's `start` is the node E opens on first;
  a node with no choice whose `when` holds just closes and is offered again later.
- **The flags join everything.** `accept` sets `wren.met`, the quest's `startWhen`; the death trigger sets
  `wren.badger-dead`, the first step's `done` and the turn-in's `when`; `turn-in` sets `wren.returned`, the last
  step's `done`. When every step is done the quest raises `wren.done` and pays `onComplete`.
- **The loot.** A kill rolls every `trophies` table row whose `match.kind` is the dead creature's `kind`, and pays each
  player who did real damage to it. The item (`honeycomb`) is a `items.catalogue` row, so the pack knows its name and icon.
- **Prove it** with a walk proof: `talk('wren')`, `choose('accept')`, `fight('badger')`, `talk('wren')`,
  `choose('turn-in')`, then `expectQuest('honey-badger', 'complete')`. A proof tape names the quest's fact in
  `requiredFacts: ['wren.paid']` and the loot in `requiredItems: { honeycomb: 1 }`.

## 2c. Creatures

A creature is three plain rows: a species row (`actors/species`), the strike rows its abilities use, and a look row
(its skin). The species row carries layers: `type` (a label for quests and the journal; it chooses no mechanics),
`body` (`skeleton`, `size`, `scale` and the `look` it draws with), `temperament` (its brain, reaction, leash, assist and
home), `senses`, `abilities` (strike references, in priority order) and `presentation`. Place it with a
`creatures.spawns` row (`world.spawnAt` in a scene shard). The kit (`@wildshard/kit`) has bodies, temperaments and
abilities to start from; `wildshard schema list` prints every field.

The same creature can be written three ways, and the shard file holds the same bytes from each:
`test/one-creature-three-authors.test.ts` (in the sdk) builds all three and compares them.

**SDK TypeScript**, with the kit's helpers:

```ts
// The dune jackal in TypeScript: the kit's quadruped body, pursue temperament and bite, plus its own rows.
import { abilities, quadruped, temperament } from '@wildshard/kit';

const bite = abilities.bite({ id: 'jackal.bite', damage: 9, range: 1.6 });
const { temperament: pursue, senses } = temperament.pursue({ aggro: 16, leash: 30 });

export const jackal = {
  species: [{
    id: 'jackal', kind: 'jackal', label: 'Dune jackal', type: 'beast', aggressive: true, lockable: true,
    dims: { bodyY: 0.5, bodyHalfLen: 0.45, bodyRadius: 0.22, headRadius: 0.12, legLen: 0.42, feet: [], halfWidth: 0.18 },
    variants: [{ id: 'tawny', label: 'Tawny jackal', rarity: 'common', weight: 1, scale: [0.9, 1.1], hp: 40,
      mods: { speed: 1, chargeDist: 1, damageTaken: 1, chargeDamage: 0, relentless: false } }],
    body: quadruped({ look: 'jackal.look' }),
    temperament: pursue, senses, abilities: [bite.ability],
  }],
  strikes: [bite.strike],
  looks: [{ id: 'jackal.look', species: 'jackal', recipe: 'platform.skin', material: null, parameters: {},
    animation: { recipe: 'platform.clips', parameters: {} } }],
};
```

**Hand-written JSON**, as `data/` rows:

```json
{
  "species": [
    {
      "id": "jackal",
      "kind": "jackal",
      "label": "Dune jackal",
      "type": "beast",
      "aggressive": true,
      "lockable": true,
      "dims": { "bodyY": 0.5, "bodyHalfLen": 0.45, "bodyRadius": 0.22, "headRadius": 0.12, "legLen": 0.42, "feet": [], "halfWidth": 0.18 },
      "variants": [
        {
          "id": "tawny", "label": "Tawny jackal", "rarity": "common", "weight": 1, "scale": [0.9, 1.1], "hp": 40,
          "mods": { "speed": 1, "chargeDist": 1, "damageTaken": 1, "chargeDamage": 0, "relentless": false }
        }
      ],
      "body": { "skeleton": "quadruped", "size": "medium", "scale": 1, "look": "jackal.look" },
      "temperament": {
        "brain": "pursue",
        "reaction": "aggressive",
        "leash": 30,
        "assist": 0,
        "home": { "speed": 2, "stop": 1.5 },
        "tuning": {
          "awareRadius": 12, "leashRadius": 25, "speed": 1, "returnSpeed": 2, "stopDistance": 1.5,
          "turnRate": 4, "thinkDivisor": 3, "attackCooldownTicks": 60, "wanderRadius": 4, "wanderEveryTicks": 420
        }
      },
      "senses": { "notice": 16 },
      "abilities": [{ "use": "jackal.bite", "range": 1.6, "cooldown": 1, "weight": 2 }]
    }
  ],
  "strikes": [
    {
      "id": "jackal.bite",
      "shape": { "kind": "point", "radius": 1.8 },
      "windup": 0.7, "active": 0.15, "recover": 0.8, "cooldown": 1, "range": 1.6, "damage": 9,
      "tags": ["creature.bite"], "weight": 2, "speed": 0
    }
  ],
  "looks": [
    {
      "id": "jackal.look", "species": "jackal", "recipe": "platform.skin", "material": null, "parameters": {},
      "animation": { "recipe": "platform.clips", "parameters": {} }
    }
  ]
}
```

**A Python script** (no SDK), printing the canonical JSON the shard file stores (sorted keys, no spaces):

```python
# The dune jackal in Python: plain dicts, printed as the shard file's canonical JSON.
import json

bite = {"id": "jackal.bite", "shape": {"kind": "point", "radius": 1.8}, "windup": 0.7, "active": 0.15,
        "recover": 0.8, "cooldown": 1, "range": 1.6, "damage": 9, "tags": ["creature.bite"], "weight": 2, "speed": 0}

jackal = {
    "id": "jackal", "kind": "jackal", "label": "Dune jackal", "type": "beast", "aggressive": True, "lockable": True,
    "dims": {"bodyY": 0.5, "bodyHalfLen": 0.45, "bodyRadius": 0.22, "headRadius": 0.12, "legLen": 0.42,
             "feet": [], "halfWidth": 0.18},
    "variants": [{"id": "tawny", "label": "Tawny jackal", "rarity": "common", "weight": 1, "scale": [0.9, 1.1],
                  "hp": 40, "mods": {"speed": 1, "chargeDist": 1, "damageTaken": 1, "chargeDamage": 0,
                                     "relentless": False}}],
    "body": {"skeleton": "quadruped", "size": "medium", "scale": 1, "look": "jackal.look"},
    "temperament": {
        "brain": "pursue", "reaction": "aggressive", "leash": 30, "assist": 0, "home": {"speed": 2, "stop": 1.5},
        "tuning": {"awareRadius": 12, "leashRadius": 25, "speed": 1, "returnSpeed": 2, "stopDistance": 1.5,
                   "turnRate": 4, "thinkDivisor": 3, "attackCooldownTicks": 60, "wanderRadius": 4,
                   "wanderEveryTicks": 420},
    },
    "senses": {"notice": 16},
    "abilities": [{"use": "jackal.bite", "range": 1.6, "cooldown": 1, "weight": 2}],
}

look = {"id": "jackal.look", "species": "jackal", "recipe": "platform.skin", "material": None, "parameters": {},
        "animation": {"recipe": "platform.clips", "parameters": {}}}

rows = {"species": [jackal], "strikes": [bite], "looks": [look]}
print(json.dumps(rows, sort_keys=True, separators=(",", ":"), ensure_ascii=False))
```

A shard that still keeps a species program (`actors/species-programs`) moves to these rows with
`speciesProgramToRows` from `@wildshard/sdk/species/toRows`: each species keeps its numbers, its declared brain
becomes a `creatures.brains` row its temperament names, and strike fields a plain row cannot hold are listed.

**A whole shard written this way:** [`project-wildshard/shard-stranger`](https://github.com/project-wildshard/shard-stranger)
is a hand-written shard file with no SDK at runtime: plain species, strike and look rows (Python writes two of them), the
kit's wolf and deer read as plain files, a skeleton horse to ride and a dragon boss. Its README shows the rows and how it
ships.

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

- **Every saved file in the shard source rebuilds the whole shard**, about 0.1 s after the last save, and the open page
  reloads itself when the new build is ready. Nothing is patched in place: data, generators, behaviour scripts,
  assets, `shard.config.ts` and `data/card.json` all take the same path.
- **A failed rebuild keeps the last good build** on the page and prints the refusal in the terminal and the browser
  console. Fix it and save again.
- **Not watched:** `node_modules/`, `.git/`, `dist/`, `out/`, `public/` and `.worktrees/`. After `pnpm install` or an sdk
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

**The grid.** The world is a grid of cells, one shard per cell, and players walk from cell to cell. It is 7×7 (x and z
from -3 to 3), and the inner 5×5 is full. Only the Wildshard team places a shard on it. `wildshard grid [--channel
staging|prod|preview]` prints which cells are taken and which are free, from the public
`GET /api/catalogue.json?channel=<channel>` (no key). An uploaded shard with no cell is recorded on its channels, but no
player can reach it there yet.

**What upload says about the grid (SA32).** After the `committed:` line, upload prints one grid line, then the
`/slug/<slug>` link on each channel it moved:

| Grid line | Means |
|---|---|
| `placed at (0,3) on preview, staging` | The shard's cell, and the channels whose grid has it |
| `grid full, not placed` | Every cell is taken; the upload still counts, and the Wildshard team is told |
| `not placed (--no-place)` | You passed `--no-place` on the shard's first upload |
| `grid left as it was (--no-place)` | You passed `--no-place` on a later upload: a cell the shard has stays, and is not added to a new channel |
| `not placed: the grid step failed; run the same upload again to retry` | The upload counts; the same `wildshard upload` again places it |
| `no new cell: grid placement is off on the API, or this is not the shard's first upload` | Today's answer: the API does not place yet (below); or the shard had an upload before and no cell |

`wildshard upload --no-place` uploads without taking a cell, for a proof upload you will delete. Only a shard's
first upload can take a cell, so a shard uploaded with `--no-place` never gets one from a later upload. A shard made
only to prove tooling (a `wildshard new` scaffold or a publish check) takes a `proof-<name>` slug: the API never
gives a `proof-*` slug a cell, whatever upload sends, so a proof cannot land on the player grid; delete it when its proof
is done (J453). The links point at the share page, which is not built yet (below), and each says `(page not built
yet)`.

**Not built yet:**

- **The 7×7 grid that fills itself (J314; SA29 to SA35).** A brand-new slug's first upload will get the nearest free
  cell in the outer ring, and that cell is the slug's for life, on every channel it reaches: a staging upload places
  it on preview and staging, and a later prod upload puts it at the same cell on production. The API side is built
  but switched off until the MMO server and the play page can show a new cell; upload already prints its answer.
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
[`docs/VALIDATION-CODES.md`](https://github.com/project-wildshard/shard-format/blob/main/docs/VALIDATION-CODES.md);
the rule is chosen by that code, and each heading below that one names lists its codes.

### Any command

#### three-version

`three` is a peer of the sdk, pinned exact (J317): every `wildshard` run first checks that the `three` the sdk would
import is the version it pins, and refuses naming both before anything else runs. Install that version:
`pnpm add three@<version> --save-exact`. `wildshard --version` prints the chain the sdk pins, `three` included.

#### usage

A verb got arguments or flags it does not take. `wildshard <verb> --help` prints what it takes.

#### migration-pending

The installed sdk has a migration this repo has not run: a breaking
release (0.5.0, 0.6.0, ...) changed how a shard repo is laid out or
written, and nothing has moved this one yet, for example because the sdk
was installed by hand (`pnpm add @wildshard/sdk@0.5.0`). `dev`, `watch`,
`build`, `check` and `upload` refuse before doing anything and name each
pending migration, its title and its own GUIDE.md heading.
`package.json` `"wildshard": { "migrated": "<v>" }` records the sdk a
repo was last migrated to; a repo with no stamp is asked only whether it
is still in an old layout. Run `pnpm exec wildshard migrate`, do each
manual step it prints, then `wildshard check .`. An agent reads
`node_modules/@wildshard/sdk/skills/wildshard-upgrade/SKILL.md` (the
installed sdk's copy) and follows it. `wildshard status` prints the
installed sdk, the stamp and what is pending; `wildshard status --brief`
prints one line when something is, and nothing otherwise.

### New

#### new-target

`new` needs a folder that does not exist yet and a kebab-case slug (`my-shard`, not `My Shard`). It never writes into
an existing folder.

#### new-template

`--template` names `scene` (Mossgate Hollow as one three.js scene module, the default: `src/generators/world.ts` builds
the whole world, and `wildshard watch .` draws each save in a running page). Any other name refuses before `new` writes
anything. `--template sdk` is retired (J434: the legacy Template is gone) and `--template blender` too (J341): a shard is
TypeScript three.js scene source, and Blender makes the `.glb` models it loads (section 2). Leave the flag out or pass
`--template scene`.

#### new-refused

`new` could not copy the reference world shipped with the sdk. Reinstall the sdk.

### Update

#### update-target

`update` works on a shard repo: a folder whose `package.json` lists `@wildshard/sdk`, as `new` writes it, or
`@wildshard/sharddev`. Run it in that folder, or name it: `wildshard update my-shard`.

#### update-pins-no-git

`wildshard upgrade` (and its alias `update --pins`) edits `package.json`, `pnpm-lock.yaml` and, through its
codemods, your shard source, so it runs only in a git repo whose `package.json` is committed: `git diff` afterwards is
how you see what it changed. It refused before it changed anything. Put the shard repo in git and commit it (`git
init`, `git add .`, `git commit`), then run `wildshard upgrade` again.

#### update-pins-dirty

The shard repo has uncommitted or untracked changes (the refusal names the first few). `upgrade` refuses them so its
edits never mix with yours. It refused before it changed anything. Commit or stash your changes (`git stash -u`), then
run `wildshard upgrade` again. Ignored files, such as `node_modules/` and build output, do not count.

#### update-pins

`wildshard upgrade` (or `update --pins`) stopped. The line above says why. If it stopped before its codemods were
done, it has already put `package.json` and `pnpm-lock.yaml` back and installed the old sdk again (it says `back on
@wildshard/sdk <old>`), so after the fix run `wildshard upgrade` again; `git diff` shows any edit a codemod made
before it stopped.

- `npm has no @wildshard/sdk@<version>`, `npm gave no version` or `pnpm view ... failed`: name a version npm lists
  (`pnpm view @wildshard/sdk versions`), or check your network.
- `moves forward only`: the repo is already on a newer sdk than the one you named. To go back, edit the pins in
  `package.json` by hand and run `pnpm install`.
- `names <manager> as its package manager`: `upgrade` installs with pnpm; set `packageManager` to the
  `pnpm@...` that `new` writes, or move the pins by hand as the `wildshard-upgrade` skill says.
- `git not found`: `upgrade` reads `git status` before it starts; install git.
- `cannot tell which sdk ... is on`: pin `@wildshard/sdk` to a version, not `link:` or `file:`.
- `pins @wildshard/sdk <a> but has <b> installed`: run `pnpm install` and `wildshard check .` on the pins you have,
  then `upgrade` again.
- `pnpm install failed`, `pnpm installed ...` or `pins three ...`: the install did not give the versions the release
  names. Read pnpm's output above it.
- `codemod <version>.mjs failed`: the release's codemod could not change your shard source. Report the message with
  the sdk versions; stay on the old pins until a fixed release.
- `its wildshard update failed`: the pins moved; run `pnpm exec wildshard update`, then `wildshard check .`.
- `check failed`: the pins moved and the install worked, but the shard source does not pass on the new sdk. Fix each
  refusal check printed above it, then run `wildshard check .` again.

#### migrate-no-git

`wildshard migrate` runs the installed sdk's migrations on your shard source, so it runs only in a git repo whose
`package.json` is committed: `git diff` afterwards is how you see what it changed. It refused before it changed
anything. Put the shard repo in git and commit it (`git init`, `git add .`, `git commit`), then run `wildshard
migrate` again.

#### migrate-dirty

The shard repo has uncommitted or untracked changes (the refusal names the first few). `migrate` refuses them so its
edits never mix with yours. It refused before it changed anything. Commit or stash your changes (`git stash -u`), then
run `wildshard migrate` again. Ignored files, such as `node_modules/` and build output, do not count. A repo already
migrated to the installed sdk, with nothing pending, is never refused: a second `migrate` says `nothing to migrate`.

#### migrate

`wildshard migrate` stopped. The line above says why.

- `migration <version>.mjs failed`: that migration could not change your shard source. Nothing after it ran and the
  stamp is unchanged; `git diff` shows what it changed before it stopped. Put those edits back with git and report
  the message with the sdk version, or fix the cause it names and run `migrate` again.
- `has no @wildshard/sdk installed`: `migrate` reads the migrations of the sdk in the repo's own `node_modules`. Run
  `pnpm install`, then `migrate` again.
- `is not a shard repo`: run it in the repo `wildshard new` made, or name it: `wildshard migrate my-shard`.

#### update-refused

`update` could not copy this guide or a skill from the installed sdk. Reinstall the sdk (`pnpm install`).

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

#### spawn-aware-radius

`wildshard check`, `wildshard validate` and `wildshard dev` warn when a creature's `awareRadius` covers the player
spawn. The warning names its spawn id, brain, horizontal distance and radius (height does not protect an arrival).
Move the creature or player spawn farther apart, or reduce the brain's `awareRadius`. An intentional arrival encounter
can keep the warning: it does not fail validation or the check verdict. `check --json` retains it in `warnings`.

#### creature-bones

`wildshard check` refuses a creature whose rig has more than 64 bones (every skin variant counts). The phone poses and
skins each bone every frame. Merge twist and helper bones in the modelling tool, or split the body into two creatures.
The report card prints each creature's bones, hit volumes and triangles beside the shard's budget tier.

#### creature-volumes

A creature has at most 16 hit volumes: its skeleton's default volumes plus its own `body.volumes`, counted by part.
Keep one volume per part a hit should tell apart (head, body, a shield); merge the rest.

#### creature-triangles

Each size class has a triangle mark per creature: tiny 1,500, small 3,000, medium 6,000, large 12,000, giant 24,000.
Over its class's mark `check` warns and the upload still takes it; the creature still counts inside the shard's total
and its budget tier. Give it a phone LOD with fewer triangles, or a larger size class if the body really is larger.

#### creature-textures

Each size class has a decoded-bytes mark per creature, mostly its textures: tiny 1 MB, small 2 MB, medium 4 MB, large
8 MB, giant 16 MB. Over it `check` warns. Use a smaller atlas or fewer maps.

#### triangle-budget

The report card prints the shard's static triangles: every GLB's, each geometry once (instances share it). A phone at
Low holds about 600 k before geometry costs more than its share of memory; over that `check` warns and the upload still
takes it. Give the heaviest models a phone LOD or a simplified mesh, and reuse models rather than baking unique ones.

#### vertex-layout

WebKit draws through ANGLE's Metal back end, which reads a vertex channel in place only when its stride is a multiple
of 4 bytes. A tightly packed 3-byte channel (an Int8 normal, a Uint8 colour) or a 6-byte one (three Int16 or Uint16)
is copied into a second buffer, so the phone holds it twice. `check` prints each such channel on the report card. The
three layouts the build already wrote (an Int8 normal, a Uint8 colour, a Uint16 colour, 3 wide and packed) report; any
other copied layout refuses. Write it aligned: `staticGlb` with `meshoptReady` pads it.

A packed static vertex (MEMORY-STRUCTURE STR16) writes every static channel aligned and small: Int8 normals and
tangents, Uint8 colour, Uint16 UVs, a 4-byte stride for every channel; positions keep their storage, and a colour or
UV outside 0 to 1 stays float. It is a build option, off by default: call `setStaticVertexPacking(true)` from
`@wildshard/sdk/bake/packedVertex` at the top of your generator, and `staticGlb` and `compactPhoneGlb` write it.
Delete the call to go back. The engine reads both layouts.

#### validate-refused

Shard-format's checks refused the built shard. The message names the check; RUNTIME-CONTRACT §8 lists what is refused.
If a fresh, unedited build still fails, report it with the message.

### Prove

#### proof-tape-invalid

`proof.json` does not have the proof tape's shape. Fix it where the message says; the shape, with an example, is in
"Proof tapes" (section 1) and `wildshard prove --help`.

#### proof-failed

The tape (or the walk proof) played, but a step it expected did not happen. Fix the data, or the tape or walk step.
A walk proof's refusal names what the page showed instead ("Walk proofs", section 1).

### Budgets

Each of these is the report card naming a budget over its limit (section 3). The message gives the measured value and
the limit.

#### budget-unmeasured

A cost could not be measured: too few headless ticks for scripts, or native gameplay that needs a browser run. Codes
`perf-native-view-unmeasured`, `perf-native-resident-unmeasured`, `perf-script-sample-invalid`,
`perf-script-samples-missing`.

#### budget-download

Too many bytes to download, before play (critical) or in all (library). Shrink or drop assets, or load them later.
Codes `perf-library-download-budget`, `perf-critical-download-budget`, `perf-library-download`,
`perf-critical-download`, `perf-tile-download`, `perf-far-download`.

#### budget-draws

Too many draw calls in a view. Merge meshes that share a material, or show fewer objects from that view. Codes
`perf-tile-draws`, `perf-far-draws`.

#### budget-triangles

Too many triangles in a view. Use lower-detail meshes or fewer props there. Codes `perf-tile-triangles`,
`perf-far-triangles`.

#### budget-memory

A memory total is over its line. Smaller or fewer textures and meshes. Memory reports only, for now. Codes
`perf-memory-target`, `perf-playing-memory`, `perf-loading-memory`.

#### budget-script-cpu

Behaviour scripts take too long per tick. Spread work over ticks, or run it on events. Code `perf-script-cpu`.

#### budget-script-fuel

Behaviour scripts run too many instructions per tick. Shorten the hottest loops. Code `perf-script-fuel`.

#### budget-report-only

A warning, not a refusal: a cap the report checks but does not enforce yet. These are the provisional caps (each tile's
download bytes), the resident-memory targets marked `tradeable`, and the memory gates marked `report-only`; their
limits are first guesses that wait on measurements from real phones, so check and upload pass over them. The untouched
reference world itself sits over several (its biggest tiles' downloads and resident memory), so a new repo checks with
about six of these warnings. Bring a number under its cap when you can; nothing else is needed.

#### check-execution

The simulation or entry walk failed. Fix the route or gameplay named in the full report, then run `wildshard check`
again. An entry route must remain traversable; this failure is separate from the performance budgets.

#### check-infrastructure

The check could not run with the available runtime dependency or resource. Restore what the report names and retry;
keep the shard and its budgets unchanged while diagnosing the host failure.

#### budget-over

A budget not named above is over its limit. The message names it; `wildshard check . --json` lists each.

#### budget-refused

Build or validate refused the whole report card. Run `wildshard check .`: its report step names each budget over.
Codes `declared-costs`, `performance-targets` (shard-format checking the costs the shard file declares).

### The shard file and the hero

#### hero-stale

The shard's content changed after its hero was captured, or the card names images `hero.json` has no stamp for. The
hero must show the current world: capture it again (`wildshard hero . --base <url>`). Only if the images already show
the current world, `wildshard hero . --stamp-existing`. A curated hero (`"curated": true` in `hero.json`, "The hero")
keeps its art: the build re-stamps it when only the content moved, and after you swap its images you re-stamp it with
`wildshard hero . --stamp-existing`.

#### hero-not-in-product

The shard file does not carry the captured hero: it was built before the capture. Run `wildshard check .`, then
prepare again ("Uploading", steps 3 and 4).

#### hero-unchanged

Upload only: this new version's hero is the same as the previous version's (J306: a new version needs a new hero).
Capture a new hero, build, prepare and upload again.

#### hero-missing

Upload only (and api-server's commit, as a 422): the shard file has no captured hero. `[hero-missing]`: no card in its
discovery, manifest or presentation; `[hero-generated]`: the card is still the generated `data:` placeholder `wildshard
new` gives. No zone reaches zone select without a hero (Jake, 2026-11-17). Run `wildshard dev .`, then `wildshard hero .
--base <url>` with the URL it printed, look at the three images, then build, prepare and upload again ("The hero").

#### hero-size

Upload only (and api-server's commit, as a 422): a card image is not in the shard file or is not a PNG, JPEG or WebP
(`[hero-image]`), or is the wrong size (`[hero-size]`). The hero is thumb 640x360, portrait 804x1626 and landscape
1600x900, the sizes `wildshard hero` writes. Capture it again rather than resizing by hand.

#### audio-refused

The audio rules found a red problem: a recording that will not play, runs too long, or a shard over 10 MB of its own
audio. Fix each red finding, or add a dated waiver in `audio-waiver.json`. Shard-format `docs/audio.md` explains each.
Code `audio-refused`. Build prints every finding with one of the rules below under it; only upload refuses a red one.

#### audio-unreadable

Red. The recording does not read as AAC-LC at 48 kHz, mono or stereo. Export it again as AAC-LC at 48 kHz in an
`.m4a` file. Code `audio-unreadable`.

#### audio-container

Red. The recording's bytes are FLAC, AIFF, Ogg, MP3, WebM, CAF or no container the game knows; it still counts toward
the audio budget. Export it again as AAC-LC at 48 kHz in an `.m4a` file, not as WAV: a WAV file is `audio-wav`, amber.
With ffmpeg on your PATH, `build` re-encodes a `.wav`, `.flac`, `.aif` or `.aiff` file under `/assets/music/` or
`/assets/sfx/` to that form itself, so you see this rule for MP3, Ogg, WebM or CAF, for a file outside those folders or
named otherwise, or when ffmpeg is missing. Code `audio-container`.

#### audio-encoding

Amber. The recording plays, but it is PCM WAV, AAC at a sample rate other than 48 kHz, or AAC outside the strict
playback index. Encode it again with ffmpeg as AAC-LC at 48 kHz in an `.m4a` file, or let `build` do it (it needs
ffmpeg on your PATH). Codes `audio-wav`, `audio-sample-rate`, `audio-strict-index`.

#### audio-duration

Red. The recording runs longer than the maximum the message gives. Cut it, or split it in two. Code `audio-duration`.

#### audio-bitrate

Amber. The recording's bitrate is over the cap for its role (music or sound effect) and channels. Encode it lower.
Code `audio-bitrate`.

#### audio-budget

The shard's own audio is over the amber line (amber), over the red line (red), or over the red line with a dated
waiver that holds (amber). Cut, shorten or re-encode recordings, or add a waiver in `audio-waiver.json`. Codes
`audio-budget-amber`, `audio-budget-red`, `audio-budget-waived`.

#### audio-waiver

Amber. `audio-waiver.json` names another shard, has expired, or covers fewer bytes than the shard holds, so it does
not hold; the budget finding after it says what that leaves. Code `audio-waiver-invalid`.

#### shardfile-draft

A draft (`sdk: "0.2"`) gets a warning from `build` and `check`. Format validation refuses missing, stale or
invalid preparation with code `preparation-invalid`. Prepare the built folder again, then rebuild the shard file
("Uploading").

#### shardfile-link

The built folder holds a symbolic link; a shard file holds only real files. Replace the link, then check and prepare
again ("Uploading", steps 3 and 4).

#### shardfile-folder-missing

There is no built folder to write a shard file from. Run `wildshard check .` (or `wildshard build .`) first.

#### shardfile-invalid

The shard file breaks a format check: it is not a tarball shard-format can read. Upload the shard file `prepare` and
`build <folder>` wrote, unedited. Code `archive-invalid`.

#### shardfile-index

`shard.json` is missing, too large, not canonical JSON, or does not fit the index schema. Build again so it is written
for you; a hand-written shard file's `shard.json` must parse and fit. Code `index-invalid`.

#### shardfile-files

The files in the folder differ from the ones `shard.json` lists: one is missing, changed or a link, one is not listed,
a pack lacks a member, or the sections differ from the source hash. Something edited the built folder: build again.
Codes `file-mismatch`, `unlisted-file`, `source-hash`, `pack-invalid`.

#### shardfile-section

A section, or the whole shard file the sections make, does not fit its schema. The message gives the path;
`wildshard schema shardfile <pointer>` prints the expected shape. Codes `section-invalid`, `shard-schema`.

#### shardfile-assets

An asset's bytes do not match what the shard file declares (its kind, extension, schema, size or costs), or fail
the asset checks, or a mount or runtime file is wrong. Export the named asset again and build. Codes `blob-invalid`,
`server-file-invalid`, `ktx2-costs`, `asset-admission`, `cook-invalid`, `runtime-files`.

#### shardfile-scripts

A behaviour script runs on a side (client or server) its declaration does not allow, or the script rows are
invalid. Fix the declaration or move the script, then build again. Codes `script-side`, `script-admission`.

#### shardfile-targets

The world targets name an item or quest the shard does not declare. Declare it, or take it out. Code `world-targets`.

#### shardfile-stream

Upload's streaming check refused: a file, pack or the placed assets are over the streaming cap, or the stored file
changed while it was read. Shrink what the message names; if it changed mid-read, upload again. Codes `stream-cap`,
`stream-miss`, `stream-changed`.

#### shardfile-refused

Writing or checking the shard file failed for another reason. Check and prepare again ("Uploading", steps 3 and 4).

### Upload

Upload checks all of these before a byte is sent.

#### upload-shardfile-missing

The path is not a shard file. Pass the one build wrote: `out/<slug>.shardfile`.

#### upload-channel

No `--channel`, or one that is not `staging` or `prod` (section 5).

#### upload-credentials

`WILDSHARD_API_URL` (or `--server`) is not set ("Uploading", step 5).

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
Bytes the API already holds as another version are not refused: upload says so and carries on with the upload
that holds them, so a republish of unchanged bytes still waits for that upload's verdict.

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

#### delete-refused

The API refused for another reason, or `--server` is not https (the key goes only to https or localhost). The
message says which.

### Lint

`check` lints the shard source with the sdk's rules. Each wildshard lint rule keeps a shard to data and build-time
code; its printed fix says what to change. In a shard repo it runs the repo's own `.oxlintrc.author.json` from the repo
root, as the repo's `pnpm lint` does (with its `lint/ratchet.json`). `wildshard new` writes one (the sdk's own rules, its plugins
under `node_modules/@wildshard/sdk/lint/`; oxlint comes with the sdk), so a new repo lints from its first check; a repo
without one skips lint and says so.

#### pin-not-sdk

Your SDK chooses the shard format and the engine: a shard repo lists `@wildshard/format` at exactly the version the
SDK pins, and never lists `@wildshard/engine` (the SDK brings the engine it runs; SHARD-COMPAT SI8). `wildshard update --pins` moves them with the SDK in
one command. A new format or engine release changes nothing in your repo until you update the SDK.

#### lint-not-run

The linter did not run: the repo's oxlint, or the one that ships with the sdk. Reinstall (`pnpm install`).

#### lint-refused

A lint finding with no rule of its own. Fix what it names at the file and line shown.

#### lint-rules

A lint rule that is not Wildshard's own (oxlint's built-in rules). Its own help line is printed as the fix.

#### lint-generator-imports

An import the rule denies. In `generators/` any npm package, valibot, shard-format and `node:*` are fine (J319); the
rule denies engine, sdk paths outside its exports, another shard's source and a second copy of `three`. In `data/` and
`shard.config.ts` only `three`, valibot, shard-format, the sdk and Node built-ins are allowed.

#### lint-no-hand-graph

A hand-written graph: a `*.graph.json` or `*.post.json` import, or an object with `version`, `kind` and `nodes`. Write
the graph in TSL with `graph()` from `@wildshard/sdk/materials` (`new GraphMaterial(graph({ model, surface, lighting
}))`); the sdk compiles it to the same graph IR (SHARD-SOURCE AP39).

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

## 7. Upgrading and migrations

**Versions.** All six packages share one version. On 0.x, a patch
(`0.4.x`) never breaks a shard repo. Every break bumps the minor
(`0.5.0`, `0.6.0`, ...) and ships, in the same release, a **migration**:
a script that moves your repo to the new layout or API, plus a
`migrate-<version>` heading below saying what changed and what to check
after. What a script cannot change safely it prints as a manual step,
naming the file and what to do.

**Move to a newer sdk** with one command, whatever sdk the repo is on
now:

```sh
pnpm dlx @wildshard/cli upgrade            # npm's latest
pnpm dlx @wildshard/cli upgrade 0.5.0      # one release
```

Once installed, `pnpm exec wildshard upgrade [version]` does the same;
`wildshard update --pins[=<version>]` is its old name and still works.
`upgrade` refuses to start unless `git status` is clean
(`update-pins-dirty`). In order, it:

1. moves every pin `package.json` lists to what the release names: the
   sdk and the cli to the release, `@wildshard/format`, `three` and
   `@types/three` to the exact specs it pins, each `pnpm.overrides`
   entry for one of those with it, and `engines.node`. The sdk keeps the
   name and form the repo lists it with (`@wildshard/sdk` or
   `@wildshard/sharddev`; an exact version, an `npm:` alias, or a GitHub
   pin, moved to the release's tag);
2. runs `pnpm install`, and refuses if pnpm did not install that sdk
   (and `three`);
3. runs `wildshard migrate` (below);
4. runs `wildshard check .`.

If step 2 or 3 fails, it puts `package.json` and `pnpm-lock.yaml` back
and installs the old sdk again. Done when its last line reads
`on @wildshard/sdk <version>, check pass`. Commit everything it changed
together. A refusal is `update-pins` (section 6).

**`wildshard migrate [dir]`** brings the repo up to the sdk *installed*
in its `node_modules`, however it got there (`upgrade`, a hand
`pnpm add @wildshard/sdk@0.5.0`, a lockfile bump). It refuses a dirty
tree, then:

1. rewrites this guide and the four skills from the installed sdk (as
   `wildshard update` does), so an agent reads the new instructions
   first;
2. runs each pending migration, oldest first, and prints what it moved;
3. writes the stamp;
4. prints **Manual steps**: each edit no script can make safely. Do each
   one, then run `wildshard check .`.

It is safe to run again: a migration that has run reports nothing. A
refusal is `migrate-dirty`, `migrate-no-git` or `migrate` (section 6).

**The stamp.** `package.json` `"wildshard": { "migrated": "<version>" }`
is the sdk the source was last migrated to, not its pin. Only `new` and
`migrate` write it. A migration is pending when it is newer than the
stamp and no newer than the installed sdk, or when its own check finds
the repo still in the old layout (a repo with no stamp relies on that
check alone). `wildshard status` prints the installed sdk, the stamp and
each pending migration; `wildshard status --brief` prints one line when
one is pending and nothing otherwise. `new` and `update` register
`status --brief` as a SessionStart hook for Claude Code and Codex
(`.claude/settings.json` and `.codex/hooks.json`, or
`.agents/hooks.local.json` in a repo whose hooks come from
`pnpm agents:sync`), so an agent knows at the start of a session.

**The refusal.** While a migration is pending, `dev`, `watch`, `build`,
`check` and `upload` stop before doing anything and print the block
`migration-pending` (section 6) describes. Run
`pnpm exec wildshard migrate`.

**`wildshard update [dir]`** rewrites this guide and the four
`wildshard` skills in `.claude/skills/` from the installed sdk, adds the
SessionStart hook, and prints each file it wrote. It touches nothing
else: your shard source, `package.json`, README and every other file
stay as they are. It adds the `.agents/skills/` links, `AGENTS.md` and
`CLAUDE.md` only if one is missing, and leaves an `AGENTS.md` or
`CLAUDE.md` you changed (`left AGENTS.md: you changed it`). Keep your
own notes for agents in `AGENTS.md`, never in this guide or a skill:
`update` rewrites those.

In a repo on repo-kit's agent-sync (it has `.agents/hooks.json`),
`update` writes the skills as real folders in `.agents/skills/`, never
touches `.claude/skills/` or `.claude/settings.json`, and puts the hook
in `.agents/hooks.local.json`; run `pnpm agents:sync` after it to link
the skills for Claude Code. `update --guide docs/GUIDE.md` keeps this
guide there instead of at the root and records the path in
`package.json` (`"wildshard": { "guide": "docs/GUIDE.md" }`), so later
`update`, `upgrade` and `migrate` runs write it there too.

### Migrations

#### migrate-0-5-0

Shard assets move from `public/` into `src/static/`. A file the shard
mounts as `/<path>` now lives at `<source>/static/<path>`
(`src/static/...`, or `src/shards/<slug>/static/...` in a multi-shard
repo). Nothing is renamed: every name the shard mounts stays the same,
so its files come out byte-identical. The migration:

- moves `<source>/assets/public/` to `<source>/static/assets/<slug>/`
  (the slug `publish-public.mjs` copied it to);
- moves each committed file `public/<path>` to `<source>/static/<path>`
  (`public/programs/<slug>.json` to `src/static/programs/`); git sees
  renames, so history follows;
- deletes what git ignores under `public/` (the copies
  `publish-public.mjs` made, `map/top.webp`, `public/shardfiles/`),
  then `public/` itself;
- deletes `scripts/publish-public.mjs` and its `build:shards` prefix,
  the `--ignore-pattern 'public/**'` lint flags, the `public/` lines in
  `.gitignore` (it adds `out/`) and `public/` in `ci.yml`'s watched
  paths; a `.gitattributes` row for `public/` names `src/static/`;
- rewrites a map input (`data/map.json` `inputs`) that named a moved
  file, so the map's input hash changes (the map image does not); an
  input naming a path that was never in the repo stays as written.

It refuses, changing nothing, when a copy differs from its source (copy
your edit into `<source>/assets/public/`, or delete the copy), when
`public/` holds files git neither tracks nor ignores, and when a repo
with several shard sources has committed `public/` files (move each
into its source's `static/` by hand). Its manual steps name each line
outside `src/` that still names `public/assets`, `public/programs`,
`public/shardfiles`, `assets/public` or `publish-public`: a script, a
test fixture or a workflow comment to point at `src/static/` or `out/`.
Check after: `public/` is gone, and `wildshard check .` passes with the
same shard file hash as before.

## 8. Primitives

A **primitive** is engine code your shard switches on with data: no host list, no engine change. The server reads your
shard file's sections and works out which primitives to run (`derivePrimitives` in `@wildshard/format/primitives`).
Each primitive's version is its section's version, the `@N` in its row of `shard.json`; a change to a primitive is
additive, and a removal is announced a release ahead.

Some primitives have no section yet: they are opened as they are, switched on by naming their host in
`server/native-assembly.json`, until their plan row (meta repo `docs/plans/ONE-FORMAT-PLAN.md`, named below) gives
them one. Every page says which.

### `collision`

Solid ground and walls for players and creatures, plus static collision pieces. **Switched on:** always. **Replaces:**
`collision`, `collision.pieces`. **Used by:** every shard. **Row:** OF41.

### `plumbing`

The small services every shard leans on: commands, decisions, strings, the content catalogue, audio cues and scenes,
the player-enter hook, bag finds, adventure state and the creature frame hook. `debug.expose` is one of them and is
refused on prod (OF18c). **Switched on:** always. **Used by:** every shard. **Row:** OF18.

### `population`

Who lives in a cell, when and how many: rosters, conditional spawn rows (quest stage, time of day, waves, a respawn
timer, a rank, a player-scaled count), shelter in bad weather, and shared kill credit. **Switched on:** any `creatures.spawns` row in
`actors/creatures`. **Used by:** Pine Hollow, Driftwood Isle, Nalati, Dunes, Sky Reach. **Row:** OF29.

### `elites`

Ranked creatures (veteran, elite, champion, legendary) with their own hp, damage, size and loot. **Switched on:** a
`creatures.spawns` row with a `rank` in `actors/creatures`, or an `elite` encounter in `combat/encounters`. **Used by:** Pine Hollow, Nalati. **Row:** OF33.

### `boss`

One fight: an hp bar, phases, adds, a reward and a saved record; it starts placed, spawned or resident. **Switched
on:** a `boss` encounter in `combat/encounters`, or a `runtime.spawns.bosses` row in `actors/spawns`. **Used by:**
Pine Hollow, Dunes, Sky Reach, Brasscap. **Row:** OF34.

### `boss.arena`

A boss's bounds, a closed room or open ground; leaving them resets the fight. **Switched on:** an encounter with
`arena.bounds` in `combat/encounters`. **Used by:** Nalati. **Row:** OF34.

### `riding`

Ride any creature that has a `mount` row: the rider sits at its seat socket (default `seat`) and moves at its gaits,
slowest first; a flyer (`fly: true`, with the species' `flight` row) takes off and lands. Taming joins it. **Switched
on:** any species with a `mount` row in `actors/species`. **Used by:** Nalati; the stranger shard's skeleton horse.
**Row:** CC40.

**SDK TypeScript** (`src/sharddev/guide/riding.example.ts` in the sdk, type-checked with it):

```ts
// A rideable dune camel: the kit's quadruped body and passive temperament, and a mount row with its four gaits.
import { quadruped, temperament } from '@wildshard/kit';
import type { ShardRowsInput } from '@wildshard/format/rows';

const { temperament: calm, senses } = temperament.passive();

export const camel: Pick<ShardRowsInput, 'species' | 'looks'> = {
  species: [{
    id: 'camel', kind: 'camel', label: 'Dune camel', type: 'beast', aggressive: false, lockable: true,
    dims: { bodyY: 1.4, bodyHalfLen: 0.9, bodyRadius: 0.5, headRadius: 0.2, legLen: 1.1, feet: [], halfWidth: 0.45 },
    variants: [{ id: 'sand', label: 'Sand camel', rarity: 'common', weight: 1, scale: [0.95, 1.05], hp: 120,
      mods: { speed: 1, chargeDist: 1, damageTaken: 1, chargeDamage: 0, relentless: false } }],
    body: quadruped({ look: 'camel.look' }),
    temperament: calm, senses,
    mount: { gaits: { walk: 1.8, trot: 4.5, canter: 8.5, gallop: 13 } },
  }],
  looks: [{ id: 'camel.look', species: 'camel', recipe: 'platform.skin', material: null, parameters: {},
    animation: { recipe: 'platform.clips', parameters: {} } }],
};
```

**Hand-written JSON**, as `data/` rows (the same rows; `guide-primitives.test.ts` parses them):

```json
{
  "species": [
    {
      "id": "camel", "kind": "camel", "label": "Dune camel", "type": "beast", "aggressive": false, "lockable": true,
      "dims": { "bodyY": 1.4, "bodyHalfLen": 0.9, "bodyRadius": 0.5, "headRadius": 0.2, "legLen": 1.1, "feet": [], "halfWidth": 0.45 },
      "variants": [
        {
          "id": "sand", "label": "Sand camel", "rarity": "common", "weight": 1, "scale": [0.95, 1.05], "hp": 120,
          "mods": { "speed": 1, "chargeDist": 1, "damageTaken": 1, "chargeDamage": 0, "relentless": false }
        }
      ],
      "body": { "skeleton": "quadruped", "size": "medium", "scale": 1, "look": "camel.look" },
      "temperament": {
        "brain": "hunt", "reaction": "passive", "leash": 50, "assist": 8, "home": { "speed": 3.2, "stop": 1.5 },
        "tuning": {
          "hp": 60, "sightRange": 30, "sightRangeGraze": 14, "sightCone": 0.9599310885968813, "hearStill": 3,
          "hearCrouch": 6, "hearWalk": 12, "hearSprint": 24, "noticeRate": 0.3, "forgetRate": 0.3, "alertAt": 0.45,
          "boltAt": 1, "freezeMin": 4, "freezeMax": 7, "relaxAfter": 3.5, "panicDist": 6, "runSpeed": 6,
          "trotSpeed": 3.2, "fleeMinTime": 1.5, "fleeUntil": 35, "fleeUntilMax": 50, "fleeMaxTime": 8, "lookBack": 2.5,
          "waryTime": 10, "waryBoost": 1.2, "herdAlertRadius": 8, "herdBoltDelayMin": 0.4, "herdBoltDelayMax": 1.2,
          "impactSpook": 4, "impactAlert": 10
        }
      },
      "senses": {
        "notice": 30, "sight": { "range": 30, "cone": 0.9599310885968813, "graze": 14 },
        "hearing": { "still": 3, "crouch": 6, "walk": 12, "sprint": 24 }
      },
      "mount": { "gaits": { "walk": 1.8, "trot": 4.5, "canter": 8.5, "gallop": 13 } }
    }
  ],
  "looks": [
    {
      "id": "camel.look", "species": "camel", "recipe": "platform.skin", "material": null, "parameters": {},
      "animation": { "recipe": "platform.clips", "parameters": {} }
    }
  ]
}
```

### `patrol`

A group walks a route, engages what it meets and returns. **Switched on:** any `creatures.patrols` row in `actors/creatures`.
**Used by:** Nalati. **Row:** OF37.

### `held.melee`

Swung weapons from `held/*` rows. **Switched on:** a `weapon` item row with no `ranged` in `combat/items`. **Used
by:** Driftwood Isle, Nine Dragon, Dunes, Sky Reach, Nalati. **Row:** OF38.

### `held.ranged`

Bows and bolts from `held/*` rows: ammunition, loadout and aim. **Switched on:** an item row with `ranged` in
`combat/items`. **Used by:** Pine Hollow, Nalati. **Row:** OF38.

### `sky`

The day cycle and its sky. **Switched on:** any `rows.days` row in `world/days`. **Used by:** Driftwood Isle, Pine
Hollow, Nalati. **Row:** OF41.

### `weather`

Weather states and their transitions: overcast, rain, wet, wind and fog. **Switched on:** any `rows.weather` row in
`world/weather`. **Used by:** Pine Hollow, Nalati, Dunes. **Row:** OF41.

### `water.sea`

An open sea with waves. **Switched on:** a `sea` water row in `world/water`. **Used by:** Driftwood Isle. **Row:** OF40.

### `water.field`

Ponds and wet ground across a field. **Switched on:** a water field in `world/field`. **Used by:** Nalati. **Row:** OF40.

### `quest`

A quest's native hosts (chapters, kill steps, body scripts and the composition), in install order. **Switched on:** a
`hosts` row in `server/quest`. **Used by:** none yet; Driftwood and Pine move to it (FP16b, FP16c).
**Row:** FP16.

### `grapple`

A grappling hook between hook points. **Switched on:** a `modes.grapple` row in `state/modes`. **Used by:** Nine Dragon.
**Row:** OF41.

### `portal`

Ride a portal from one place to another. **Switched on:** a `portalLink` entryway in `world/edge`. **Used by:** Nine Dragon.
**Row:** OF41.
