# sharddev off the old census (buddy-engine, HOST-RULER HR10)

- Engine HR9 (in npm 0.1.19, which sharddev pins since f858476) deleted
  the old shard census: `shard-platform.mjs`, `shard-platform-sections`,
  `shard-components`, `shard-component-spans`, `check-closed-components`.
- Only `scripts/shard-platform-cli.mjs` and `scripts/shard-output-report.mjs`
  (with its `.d.mts`) imported them, and nothing ran either: no package
  script, no import, no doc. Deleted, with the reason here: the census
  they reported is gone, and `host-ruler.mjs` is its replacement.
- The rest the row named keeps working on 0.1.19: `shard-milestones.mjs`
  and `section-inventory.ts` read `shard-platform-format.mjs` and
  `shard-platform-output.mjs`, which the engine keeps as export aliases;
  `gen-host-catalogue.mjs` and `entry-reads/crawl.ts` import files still
  exported. Typecheck green.
