# @wildshard/sdk changelog

Every release has a section here before it is tagged: one to five
bullets in plain language, for shard authors and Jake, never commit
subjects. Add the next version's section at the top, commit and push
it, then release with repo-kit's `release.sh`.

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
