# Audio advice says m4a; Unreleased changelog notes

- Lane opus-sdguide. GUIDE.md's `audio-container` heading (23d8da1) and
  its refusal fix told authors to export as WAV. Under shard-format
  v0.4.8 WAV is `audio-wav`, amber, and shard-format `docs/audio.md`
  (73930ea, AU8) targets AAC-LC 48 kHz in `.m4a`. The three format
  headings and their fixes in `refusals.ts` now say that, and say
  `build` re-encodes `.wav`/`.flac`/`.aif(f)` itself with ffmpeg on
  PATH (AU7, 0074c66). The `wildshard` skills carry no audio advice.
- CHANGELOG.md gets an "Unreleased" section: `update --pins` (SA18) and
  the exports SA12 and SA26 removed. Nothing parses the changelog here
  (no pre-push or CI check; repo-kit `release.sh` never reads it), so
  the header now says the releaser renames the heading by hand.
