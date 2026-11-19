# 2026-11-18: `new` starts from Mossgate Hollow (J434)

Meta TEMPLATE-E2E TR-2. Jake (J434): the legacy Template and Template 2 go;
Mossgate and Brasscap are the templates. Brasscap is a whole repo
(shard-brasscap), Mossgate Hollow is ten files in `src/shards/mossgate`, so
`new` starts from Mossgate: `scene` is the default and the only template.

- `--template sdk` (the `_template` copy) refuses like `--template blender`,
  before anything is written; the `new-template` refusal names both.
- Mossgate gains a starter quest so the starter keeps TC-NE5's proof tape:
  `generators/quests.ts` (`hut.visit`, 5 coins) and a `world.trigger` at a
  node a step out from the hut door. `starter-proof.json` walks there from
  spawn: the fact files at tick 160, the cell restores at 250; cut at tick
  120 the tape fails `native fact missing: hut.visit`.
- The scene copy no longer carries Mossgate's `card/` and `hero.json`: a new
  repo wears the generated card until its author captures one.
- `shardFolderName` reads a scene starter's `identity.json` slug, so a repo
  whose folder differs from its slug is named by the slug.
- Proved: `wildshard new` then `wildshard check .` on the starter (packages
  linked from this checkout): lint pass, prove pass (300 ticks, 1 fact),
  check pass in 19.1 s.

Left for TR-11: `_template`'s 80 files, the `blender` repo shape and GUIDE
section 2, which still describes the Template's `data/` layout.
