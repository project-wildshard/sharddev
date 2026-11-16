# A scene shard's hero

> Written by: Claude (opus-ss16l), 2026-11-16. Meta NEW-SHARD-E2E F28, SHARD-SOURCE SS-NE28.

`wildshard hero` on a scene shard (a `shard.config.ts`, no `manifest.json`) died with a raw stack,
`src: no manifest.json`. A scene shard's discovery is generated at build (`authorManifest`), so the hero had
nowhere to land and no card to read.

- The capture writes `card/<slot>.jpg` in the shard folder and stamps `hero.json` as any shard does. On a `dev`
  page it needs no name (the page serves this shard alone); against another served build it reads the built
  product's name and refuses `[hero-no-name]` when there is none.
- `authorManifest(shard, captured)` puts each captured slot on the generated card; uncaptured slots keep the
  generated art. The build packs the files as image blobs like any card.
- The cut's hero check (`assertHeroCurrent`) now checks a scene shard's folder: fresh, stale, unstamped or
  generated, as for a manifest shard.
- Every refusal prints one line starting `[hero-<rule>]`, exit 1, never a stack.

Proof: `wildshard hero` on a copy of `authoring-slice` against `wildshard dev` wrote the three files and stamped
`hero.json`; `hero.test.ts` and `author-discovery.test.ts` cover the stamp, the cut and the card.
