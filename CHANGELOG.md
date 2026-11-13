# @wildshard/sdk changelog

Every release has a section here before it is tagged: one to five
bullets in plain language, for shard authors and Jake, never commit
subjects. Notes for work that has landed but not shipped wait under
"Unreleased" at the top. To release, rename that heading by hand to
the next version and date, commit and push it, then run repo-kit's
`release.sh` (it does not read or edit this file).

## Unreleased

- New: `wildshard update --pins` moves your shard repo to a newer sdk
  in one step. It moves the versions of the sdk, engine, format and
  three.js in `package.json`, installs them, applies the new sdk's
  fixes to your code, then runs `update` and `check`. If the install
  or a code fix fails, `package.json` and the lock file go back as
  they were (`git diff` shows any fix already made to your code). If
  `update` or `check` fails after that, you stay on the new versions:
  fix what it reports, then run `wildshard check .`.
- `wildshard update --pins` now refuses to start unless your shard
  repo is in git with every change committed (`update-pins-dirty`,
  `update-pins-no-git`), so `git diff` afterwards shows only what the
  upgrade changed. Commit or stash your work first.
- Removed from the sdk, because no shard used them: `phasedBossFight`
  (`@wildshard/sdk/phasedBoss`), `speciesBrains`
  (`@wildshard/sdk/speciesBrains`), `ClipCtx`, `playClips` and
  `clipAnimate` (`@wildshard/sdk/species/clips`), `appendGeometry`
  (`@wildshard/sdk/kit/bakedGeometry`), and the types `PhasedBossPorts`,
  `PhasedBossFight`, `PhasedBossBody`, `PhasedBossState`,
  `RoamingBossFight` and `SpeciesBrains`. The boss, species, brain
  and clip row types you write data with are all still there. If
  your shard imported one of the removed names, it no longer builds.
- GUIDE.md and the refusal messages now say to export audio as AAC
  at 48 kHz in an `.m4a` file. The old advice offered WAV, which the
  audio check marks amber.
- Fix: the `generator-imports` lint now accepts an exported sdk path
  with a Vite query such as `?raw`; nalati's per-file override can be
  dropped after upgrading.
- Fix: the `generator-imports` lint now refuses an import path with a
  percent-escape such as `%2e%2e` or `%2f`, a backslash, a tab or a
  newline, which could reach another shard's files unnoticed. Write
  the path plainly.

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
