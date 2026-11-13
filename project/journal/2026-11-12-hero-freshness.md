# Hero freshness at the cut (opus-herocap)

- Jake, 17:14 Cancún: "you have to update the hero images for the
  templates." No pipeline step captured a hero; Template rev 3's was
  shot by hand (opus-hero), so the next content change would ship it
  stale again.
- Capturing inside `wildshard pack` needs a real GPU and an engine build
  serving the exact candidate; neither pack nor CI has them. So the cut
  refuses instead: `src/shards/<name>/hero.json` stamps the content hash
  and the card file hashes, and pack refuses a stale, unstamped or
  hand-swapped hero, or a product built before the capture.
- `wildshard hero <shard> --base <url>` is the one-command capture the
  refusal names: headless Chromium (Metal), SHARD SELECT, spawn view or
  a declared `camera`. Run once on Template against a local engine build
  (804x1626, 1600x900, 640x360); the approved art is kept and stamped.
