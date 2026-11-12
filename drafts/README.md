# drafts/: the drafts website

The second website (WORLDCLAW-TOOLS J16, J57): only the shards that are still **drafts**, before they are a world in
the game. It lives here, beside the game's `src/`, and shares nothing with the game's bundle (J15): the game site never
loads a byte of it. **Live:** https://wildshard-drafts.vercel.app (a home-screen app, "Wildshard Drafts").

Everything on it is **read-only** (J17, J24): Jake looks, compares, plays and walks; he answers in chat.

It is an **offline home-screen app** (E391, J66): `src/sw.js` (stamped by `vite.config.ts` with the build's files)
precaches the site and every draft's data, and keeps the pictures of every draft opened (the draft's home counts them).
The **reload pill** (`src/update.ts`, as the game's) is on the title, top right; it lights up when a new deploy waits, and
a tap takes it. A deploy is a new worker: it waits for that tap, never reloading on its own.

| What | Where |
|---|---|
| The site (TypeScript, no framework) | `src/`: `main.ts` (routes), `pages.ts` (title, STAGES, a stage page, prototypes), `explore.ts` (Draft Explore's five tabs), `viewer.ts` (the swipe), `map.ts`, `maplab*.ts` + `walk.ts` (Map Lab), `styles.css` (`wd-` classes) |
| The data contract | `src/atlas.ts` (types shared by the site, the tools and the tests) |
| A draft's sources (hand-kept by the run) | `shards/<slug>/draft.json` (where its art and design are, what each round's pictures are, Jake's answers per stage, the run header), `shards/<slug>/content.json` (places, quest steps, lanes, side content, mechanics, camera checks, sets), `shards/<slug>/images.json` (generated: the Blob copies) |
| Generated, committed, shipped | `public/data/index.json` (the title's public cards), `public/data/<slug>/atlas.json`, Map Lab's `terrain.f32` / `labels.u8` |
| The tools | `tools/atlas.ts` (generate / publish / check), `tools/images.ts` (the phone copies on Blob), `tools/deploy.sh` |
| Tests | `test/` (in `pnpm test`; `pnpm drafts:test` runs them with the typecheck and `atlas.ts --check`) |
| Build, local preview | `pnpm drafts:build` (to `tmp/dist-drafts/`, `version.json` names HEAD), `pnpm drafts:dev` (localhost:5190; `/media/*` serves the pictures from `~/.cache/wildshard/drafts-blob-export/` or `$DRAFTS_MEDIA_DIR`) |
| Originals | where the run made them (DRAFTS D5): Thin Ice's are in the singleplayer checkout. The tools take `--sources <dir>`; without it the committed `atlas.json` and `images.json` stand in, so `--check` and the tests run anywhere |

## The run's loop (W13: what `worldclaw-interactive` / `-auto` do at every step)

1. **Make the step's images** into `art/<slug>/round-<n>-<label>/` with a `README.md` (`# P<n> · <title>`, a note line,
   `- **Made with:** …`, `- **Verdict:** …`, the file list), as every round already does (the art rule).
2. **Describe them** in `shards/<slug>/draft.json`:
   - `rounds["round-<n>-<label>"]`: its stage, default kind and status (`picked` · `current` · `rejected` ·
     `superseded` · `input`);
   - `files`: rules (`match` a regex on the file name; `title`, `kind`, `status`, `sub`, `placeNum`, `step`, `view`,
     `angle`, `model`, `cam`; `{1}` is a capture group, `{1U}` upper-cased, `{1A}` an angle like `NE`, `{place}` the
     place's name, `{stepTitle}` the step's). Later rules override earlier ones. A `view` id ties one view's pictures
     together across rounds: that is the lineage on its stage page;
   - `stages["P<n>"]`: Jake's answers **verbatim** from chat, notes, and the `pick` (an item id `round/file`);
   - `run`: the stage now, what it waits on, what is next.
3. **Publish:** `node drafts/tools/atlas.ts <slug> --sources <checkout> --publish`. New pictures get their phone copy and thumbnail on Blob
   (once each, content-hashed: a re-run uploads nothing new); `atlas.json` and `index.json` are regenerated. It exits 1
   and names the problem when a round has no README, a pick is not an item, or a picture has no copy.
4. **Commit** the sources and the generated data (pathspec), push with `scripts/push-main.sh`.
5. **At a step boundary, deploy:** `bash drafts/tools/deploy.sh` (it ships HEAD; run it with `run_in_background`). It
   checks `https://wildshard-drafts.vercel.app/version.json` reports HEAD's sha.
6. **Republish the draft's artifact page** (J25, J62): `node drafts/tools/artifact.ts <slug> <a scratchpad dir>`
   writes `index.html` and `img/*.webp` (the artifact frame loads no outside images, so the pictures ship as the
   page's files); publish `<dir>/index.html` with the Artifact tool, `root` = the dir, every `img/` file in `files`,
   to the draft's existing page (Thin Ice: https://claude.ai/artifact/1v5EE7bt75m3dGFAkVh7P1).

The game's COMING SOON card (W9) comes from the same index: `atlas.ts --engine <engine checkout>` writes engine's
`src/client/game/draftTitles.ts`, which ships with engine's next deploy. Commit it there.

The Blob token is read from `BLOB_READ_WRITE_TOKEN` or `~/.config/wildshard-drafts/blob.env` (not in git). A new
machine: `vercel blob list-stores --scope raynos-projects`, then `vercel env pull` from a folder linked to
`wildshard-drafts`.

## A new draft

Copy `shards/thin-ice/` as a pattern: a `draft.json` (name, one spoiler-free line, the key art once P3 / P4 make one),
a `content.json` (empty lists are fine), then step 3. The title shows it at once. Spoilers (maps, the journey, quest
steps, the boss, secret places) never reach the public cards: `index.json` carries the name, the line, the stage and
the key art only, and the tests hold that.

## Map Lab

A draft's `terrain` block in `draft.json` points at a height field and region labels (`res`² cells, row 0 = north) in
`public/data/<slug>/`, the scene's roads and the spec's place radii. Thin Ice's are the approved map's blockout from the
dry run (tag `worldclaw-archive`). Its numbers are the dry run's `terrain_vis.py` maths ported to `src/maplab-math.ts`
and tested against numpy's output; T3–T5's code replaces them when it lands (WT6, J61).
