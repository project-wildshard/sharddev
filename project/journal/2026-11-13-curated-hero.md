# Curated heroes keep their art

2026-11-13, buddy-repos.

opus-heroes put hand-picked SHARD SELECT cards back on Driftwood
(`489a434`), Pine Hollow (`e49d5d0`) and Nalati (`2d80f7b`) with
`wildshard hero . --stamp-existing`. The next content change makes each
one stale. At that point the only way out the tools offered was a
capture from the spawn view, which would overwrite the curated art with
a plain shot.

## What changed

- `hero.json` can say `"curated": true`. `writeHeroStamp` carries the
  flag through every re-stamp, and `heroState` reports it, including
  for a hero that has no content hash yet.
- `--stamp-existing` no longer refuses a curated hero whose stamp was
  for other content ("only a capture fixes it"). It re-stamps the art
  that is on disk.
- The cut's refusal for a curated hero (stale or unstamped) points at
  `--stamp-existing`, not at a capture.
- `scripts/capture-hero.mjs` refuses straight away on a curated hero.
  Removing the flag allows a capture again.
- `hero.json` is outside the content hash, so adding the flag does not
  make a hero stale.

## Review

One `claude -p` pass found two message bugs, both fixed:

- A curated `hero.json` with no hash was sent to a capture, which now
  refuses. `heroState` now reads `curated` before the `unstamped`
  return.
- The "older than its content" wording was wrong when only the images
  changed.

To keep `stamp.ts` under the 300-line cap, its skip lists are now
written as split strings.

## Still true

J306's hero-unchanged check still applies to uploads, so a new version
still needs a new picture: swap the art, then `--stamp-existing`.
