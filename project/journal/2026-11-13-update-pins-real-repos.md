# `update --pins` on the real shard repos (SHARD-AUTHORING SA18 follow-up)

> Written by: Claude

- Its first real use (shard-nalati to 0.2.5, lane opus-nalati025) failed on four gaps; lane opus-pinsreal fixed them,
  red-first, in `src/sharddev/updatePins.ts`:
  1. The org's shard repos list the sdk as `@wildshard/sharddev` (their source imports that name; NP8 keeps it as
     `npm:@wildshard/sdk@<v>`). `SDK_NAMES` takes both names, and `assertShardRepo` (so plain `update`) does too. The
     move keeps the repo's name.
  2. GitHub pins (`github:<owner>/<repo>#<ref>`). The current sdk is the release whose `v<version>` tag is at that
     commit (`git ls-remote --tags`), else what is installed. Chosen without Jake (asleep): a commit pin moves to the
     commit the target's `v<version>` tag names, a tag pin to the new tag, so the repo's pin style is unchanged; it
     logs `kept as a GitHub commit pin: the v<version> tag's commit`. An untagged release refuses with the alias to use.
  3. `pnpm.overrides` entries for a moved package (any key form: `name`, `parent>name`, `name@<range>`) move with it.
  4. The `wildshard cache counters` line is printed only with `WILDSHARD_CACHE_REPORT=1`; the build pool sets it for
     the children whose report it reads. Nothing gated it before.
- Found in the real run: sdk 0.2.5's own `update` refuses a `@wildshard/sharddev` repo (gap 1 is in 0.2.5 too), so
  for a sharddev-named repo moving to 0.2.5 or older, this CLI writes that sdk's GUIDE.md and skills itself.
- GUIDE.md section 7 and the `wildshard-upgrade` skill now lead with
  `pnpm --package=@wildshard/sdk@latest dlx wildshard update --pins`: 0.2.4 refuses the flag and cannot be changed.
- Real run on a clone of shard-driftwood (0.2.4 by a GitHub pin, format 0.4.8) to 0.2.5: sdk pin to `#ab4bbda`
  (v0.2.5), format to `#v0.4.9` in dependencies and overrides, lock file to match, codemod 0.2.5 (no-op), GUIDE.md and
  the four skills added. Its check then failed on a build refusal (`Far proxy exceeds content caps`) that 0.2.4 gives on
  the unmoved clone too, so the move did not cause it.
- A `claude -p` review found no MUST. Its SHOULDs taken: the 0.2.5 fallback's failure names the dlx `update`, not
  the installed one; `git ls-remote` runs with `GIT_TERMINAL_PROMPT=0`; an sdk override in a form it cannot move is
  left and said. NITs taken: an override key whose range holds `>` (`three@>=0.180`), skill wording. Not taken: the
  `owner/repo#sha` and `git+https` pin forms (no shard repo uses them; they refuse with "cannot tell").
