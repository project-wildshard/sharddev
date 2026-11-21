# The build re-stamps a curated hero itself (build-max 2026-11-20 A6)

> Written by: Claude (opus-publish-gates)

Five publishes were refused on 11-20 (Pine 3, Driftwood 2) because a curated
hero's stamp records the content hash, and every content change needed a hand
`wildshard hero src --stamp-existing` that changed no art. A curated hero is
hand-picked art that does not go stale with the world, so the cut now re-stamps
`hero.json` itself when the art bytes are the stamped ones and only the
content hash moved, and reports the line so the author commits it.

Still refused: a curated hero whose art changed (re-stamp by hand after
looking), an unstamped one, any captured (non-curated) hero over new content,
and upload's HG2 gate (missing, generated or wrong-size hero) is untouched.
