# SS8: build-time side refusals, format 0786a04 (opus-tplhero)

- Engine took shardfile `0786a04` in SS12 (`1e99d663`), so sharddev's
  commit gate went red on the link graph: engine's `view` return rows
  no longer typechecked against our format `0916c10`.
- Pins move together to engine main `867f3b96` and its format
  `0786a04` (SD-4: one format identity for repo-kit's local-sdk-pin).
- SS8's draft lands with them: `wildshard build` prints each SS2/SS7
  side refusal as one plain line (kind or script, declared side, the
  missing half) before upload.
