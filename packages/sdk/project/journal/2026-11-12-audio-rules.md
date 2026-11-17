# 2026-11-12 audio rules in pack and upload (AUDIO AU5)

- meta AUDIO-PLAN AU5 (J299, budget J303): format v0.4.3 owns the audio
  rules; sharddev pins it (`82bfee4`) and runs them.
- `wildshard pack` prints the report after `valid:`: the totals, then one
  AMBER line per finding, a red marked "api-server refuses this at
  upload". It still packs. Pine Hollow's built product today prints
  `audio AMBER: pine-hollow 38 recordings, 14.66 MB (AMBER over 6.00 MB,
  red over 10.00 MB)` and packs 345 MB.
- `wildshard upload` refuses a red before it sends a byte, as api-server
  will.
- The waiver: `src/shards/<folder>/audio-waiver.json` in the shard
  source, `{version: 1, waivers: [{shard, until, maxBytes, reason}]}`,
  one row per output slug. `readCookInput` picks this slug's row and
  `writeOutputProduct` writes it to `admission.audioWaiver`. Pine's own
  waiver is AU10's to add, in its own repo.
