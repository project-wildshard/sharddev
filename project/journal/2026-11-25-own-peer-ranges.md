# Own peer ranges admit the next minor

> Written by: Claude (opus, session 015pj4Rx), 2026-11-25

The first release/v0.5.0 (4d9f88b1, cut from ef7a7342) failed its
packed-install: kit's peer on `@wildshard/sdk` was `^0.3.2 || ^0.4.0`,
and pnpm refuses an unmet peer. Main never saw it: packed-install there
packs the 0.4.x version, which the range admits. Every minor would have
hit it, because `release:stamp` writes versions only (and must, or the
release cannot reuse main's ci run).

- kit's peer is `>=0.3.2 <1.0.0`. The sdk pins kit exactly and all six
  ship at one version (D5), so a caret per minor only adds a way to
  break; a mismatched pair needs someone to install kit by hand.
- `scripts/own-peers.mjs`: `release-workspace.mjs pack` refuses an own
  peer range that the packed version does not satisfy.
  `test/tooling/own-peers.test.mjs` (in `pnpm check`) also requires the
  next minor to fit, so the next cut cannot meet this again.
- The `sdk-breaking-release` skill names it, and the `--notes` rule.

The first branch was never tagged or published. It is deleted, and
v0.5.0 is prepared again from a green main that has this.
