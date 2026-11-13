# 2026-11-13 GUIDE.md, the author's manual (SHARD-AUTHORING SA13)

- `GUIDE.md` at the package root: the loop (J317), the shard source, budgets, what `dev` reloads, channels and the
  grid, one heading per `REFUSAL_ANCHORS` entry (SA21), and `wildshard update`. What isn't built (SA15 dev, SA16
  `--template` and `src/`, SA28 update, SA29-SA37 grid and `/slug` link, prepare outside the team) says so with its row.
- Shipped by `files`; `wildshard new` copies it (reference and `--empty`). `guide.test.ts` reads verbs from
  `wildshard --help`'s own output, so help wording can change without breaking it.
- Five-question check: a `claude -p --safe-mode` agent given only a `new` project answered how to walk, upload to
  staging, why the hero refused, what a budget is and how to share, all from GUIDE.md. Its confusions (the copied
  template README, two card files, "Works" hiding prepare) are now named in the guide.
- Follow-up, not this row: the refusal id `hero-not-in-product` keeps a retired word; `new` still copies the
  template's README (SA16); the hero hint prints `src/shards/<name>` for a `new` project whose source is `.`.
