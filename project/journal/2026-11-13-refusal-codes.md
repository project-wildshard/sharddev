# Refusals by shard-format's codes (SA41 follow-up)

- Pinned shard-format v0.4.8 (`629b944`), the first release whose
  refusals carry SA41's 53 stable codes (`./issue-codes`).
- `refusals.ts` rows gained `codes`: a coded refusal takes the row that
  lists its code, from any step; words are now only the fallback for
  refusals with no code (sharddev's own, shard-format's warning lines).
  The budget rows and `audio-refused` lost their word patterns: every
  report-card issue and the audio refusal now come with a code.
- 14 new rows for codes no rule fitted: `shardfile-index`, `-files`,
  `-section`, `-assets`, `-scripts`, `-targets`, `-stream`, and
  `audio-unreadable`, `-container`, `-encoding`, `-duration`,
  `-bitrate`, `-budget`, `-waiver`. Grouped by what the author does about
  it, not one row per code; GUIDE.md lists each heading's codes.
  118 rules and anchors now (was 104).
- `refusalCode` walks `cause`, since `cli.ts` and the shard file step
  wrap shard-format's errors. Node's `ENOENT` is not a table code, so it
  still goes by words.
- Build now prints each audio finding with its rule line under it.
- `validate` of a folder whose `shard.json` is `{}` now says
  `shardfile-index` (its code, `index-invalid`) instead of the
  catch-all `validate-refused`.
- A test fails when shard-format adds a code no row names
  (mutation-checked by dropping `audio-container`'s mapping). The
  glossary test exempts the code `cook-invalid`, as it does the id
  `hero-not-in-product`.
