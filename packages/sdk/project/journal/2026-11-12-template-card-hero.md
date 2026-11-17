# Template card hero (opus-hero)

- Jake, 17:14 Cancún, on the title carousel: "you have to update the
  hero images for the templates." Template rev 2 (`169ae525`) shows
  the grey placeholder SVG on Shard select because `_template`'s card
  was never anything else: no step ever captured one.
- The card is now Mossgate's own in-engine hero, in `card/`
  (thumb 640x360, portrait 804x1626, landscape 1600x900), shot headless
  on the real GPU (Metal) from engine's served build of rev 2. A
  `wildshard build` packs them as image blobs; discovery names them.
- A new reference project no longer inherits that art: `newProject`
  skips `card/` and gives it the generated author card.
- It reaches players only with a Template rev 3 upload and an engine
  re-pin (meta QA-FEEDBACK 2026-11-12 row 29).
