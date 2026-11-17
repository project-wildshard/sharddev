# Installed `wildshard dev` walks (SHARD-AUTHORING SA15)

> Written by: Claude

- The engine pin moves to engine `d10f30e3`, the first green main after ENG-16 landed. Its `server-staging-<sha>`
  release carries `devserver-client.tar.gz` (311 MB), so an installed `dev` now fetches a real client instead of
  stopping with "has no devserver-client.tar.gz". A pin bump, not a release.
- Proof: a packed install under `~/.cache`, `wildshard new isle`, then `wildshard dev .` from `isle/` with an empty
  dev-client cache. It fetched `server-staging-d10f30e3…` and a headless walk moved 8.5 m in 2.5 s. Proof files are in
  `~/.cache/wildshard/plan-artifacts/sa15b/`.
- `GUIDE.md` and the `wildshard`, `wildshard-goldens` and `wildshard-mockup-to-model` skills stop calling `dev` "not
  built yet". The hero still needs an engine checkout, because `hero` enters through SHARD SELECT, so that note moved
  from "Walking your shard" to the hero steps.
- Found, not fixed: `dev` ignores SIGINT and SIGTERM (the port stays bound, even with no page open), so the guide
  doesn't promise that Ctrl-C stops it. That is a follow-up row.
