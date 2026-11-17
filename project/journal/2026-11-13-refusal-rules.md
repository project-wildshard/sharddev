# Refusals name a rule, a fix and a GUIDE.md section (SA21)

> Written by: Claude (lane opus-sa21), 2026-11-13

- meta SHARD-AUTHORING SA21 (J317, the first ten minutes): every refusal an
  author can hit prints its own words, then
  `[<rule>] fix: <one line> (GUIDE.md#<anchor>)`. `check --json` refusals
  always carry `rule`, `fix` and `guide` (still `version: 1`: no sdk with
  `check` has been tagged yet).
- One table, `src/sharddev/refusals.ts`: 43 rows for build, validate,
  prove, the report card, new, pack and upload, plus 46 lint rows (every
  wildshard rule in `.oxlintrc.author.json`), 90 anchors in all. SA13
  writes a GUIDE.md heading per `REFUSAL_ANCHORS` entry.
- Messages are matched, never rewritten, so shard-format keeps its words.
  The first row whose pattern matches wins, else the step's catch-all.
  A follow-up for shard-format (needs a release): give performance issues,
  audio findings and validator errors stable codes, so these rows can
  match a code instead of words.
- The review (`claude -p`) caught the catch-alls shadowing later rows for
  the same step (fixed: catch-alls apply last), fuel-measurement rows,
  and `[a-z-]+` missing `no-base64` in the lint-config test.
- `proof.json` parse errors now start with the file's name, so the
  tape's refusal is told apart from the product's.
