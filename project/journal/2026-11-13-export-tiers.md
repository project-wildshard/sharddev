# Export tiers (SHARD-AUTHORING SA5)

- Every `@wildshard/sdk` export (164, package.json `exports`) is in one
  tier in `lint/export-tiers.json`: contract 28, rows 35, scripts 17,
  bake kit 78, internal 6. Groups follow meta's API-SURFACE.md reading
  (its Maths entries, `noise` and `random`, went to the bake kit; its
  `sourceReader` "Other" to internal).
- `test/export-tiers.test.ts` fails on an unclassed export, a row for no
  export or an unknown tier, and on a stale `docs/api/EXPORT-TIERS.md`.
- The engine's gen-api doesn't cover sharddev's own surface (it reads
  `src/sharddev/package.json`, which the lift folded into the root
  package.json), so `scripts/export-tiers.mjs` renders the tier page.
- `scripts/*` is internal: repo tooling, not an author promise.
- Review MUST: `immutable` moved to contract (the template's generators import it); a test now fails when a `src/shards` file imports an internal export. The tier page ships in the npm package (`files`).
