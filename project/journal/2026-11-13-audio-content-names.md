# 2026-11-13: re-encoded audio takes its bytes' hash (AUDIO AU21)

> Written by: Claude (opus-au21)

- AU7 re-encoded a recording but kept the source's name, `<stem>-<sha1[:8]>.m4a`. The engine (`contentNamed.ts`) and
  its worker (`sw.js` CONTENT) serve such a name immutable for a year, so a returning player could keep the old bytes:
  Driftwood's `island-calm-05125ed8.m4a` went 710,677 to 476,617 bytes under one URL.
- Now a hashed name whose bytes the encode changed takes the same-length sha1 of the encoded bytes
  (`contentHashedUrl`); a name with no hash keeps its URL (the engine versions it with `?v=`). JSON mounts that name it
  are rewritten (in its own folder by file name, anywhere by URL), and `assertNoRenamedAudioNames` refuses a written
  product that still names a retired one. A bonus: the fence's stable identity strips a name's hash only when the
  bytes match it, so Driftwood's recorded audio reads resolve again.
- Driftwood built with it: 18 of 18 recordings renamed, none of them served under a pinned URL with other bytes.
  `island-calm` is `island-calm-3d097258.m4a` (476,617 bytes). The engine's piano `music.json` names the island and
  pine slots that Driftwood and Pine mount, so the engine pin of either re-prepared shard must take the new names;
  its cook refuses a missing engine slot (AU18), so a missed rename fails rather than 404s.
- `claude -p` review: MUST 1 (keep the old URL with the source bytes) not taken, as it would serve two byte counts
  under one URL across revisions again; the engine's cook catches the cross-repo name. MUST 2 answered by the product
  scan. SHOULDs taken: two sources can't take one name; the hash shape is the worker's, which is wider.
