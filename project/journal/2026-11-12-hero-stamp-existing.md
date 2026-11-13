# Hero stamp-existing

> Written by: Claude (opus-herostamp), 2026-11-12

The hero check (80f7659) reaches each shard repo when it bumps its
sharddev pin. Those repos carry curated heroes with no `hero.json`, so
their next cut would be refused, and the only fix offered was a fresh
capture from the declared camera or the spawn view: a plain shot over
good art.

`wildshard hero <shard> --stamp-existing` stamps the files already there
as current, with no browser. It keeps a declared `camera`, refuses a
generated card or a missing file, and its help says loudly that it is
only right when the images show the current content. The unstamped
refusal names it as the second option; the stale refusal does not,
since there the content has moved past the picture.

Review (one `claude -p`) found the stale hole: the first cut stamped a
shard whose stamp named other content, so the stale refusal could be
waved through. It now refuses that, leaves a current stamp alone, refuses
a `hero.json` that does not parse (it may hold a camera), and loads
Playwright and the engine only for a real capture.
