# @wildshard/sdk changelog

Every release has a section here before it is tagged: one to five
bullets in plain language, for shard authors and Jake, never commit
subjects. Notes for work that has landed but not shipped wait under
"Unreleased" at the top. To release, rename that heading by hand to
the next version and date, commit and push it, then run repo-kit's
`release.sh` (it does not read or edit this file).

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
