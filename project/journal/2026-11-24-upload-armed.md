# Upload judges the memory lines by the catalogue's armed list

> Written by: Claude (opus-pr6). Meta FORMAT-PRUNE FP27c, sharddev half.

`sharddev upload` now reads the API catalogue's `armed` word for every shard
(live since FP27) and passes the armed slugs to the format's validation, as the
API's own admission does (FP27b). Before, upload passed nothing, so the format
judged by its own `memory-armed.json` `zones`, which FP27c removes from the
format. The catalogue is asked only after the tar reads and never for a draft,
so a broken or unprepared file still refuses before any request; when the
catalogue can't be read the format's own list decides, and the hero check
reports the error as before. Test: `checked-armed.test.ts`.
