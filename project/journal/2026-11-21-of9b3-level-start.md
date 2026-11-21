# 2026-11-21 OF9b3b: the build lifts the page start out of ui/level

> Written by: Claude (opus-of-m8-host)

- `buildProject` applies format 0.66.0 `liftLevelStart` after `liftLevelLook`: spawn goes to `world/spawn`, loadout to
  `items.loadout.level`, audio to `audio.level`; weapon and the map image leave `ui/level`.
- Discovery keeps the authored start (spawn, loadout, weapon, audio, minimap with its image) until OF9b5: a pinned engine
  (0.1.59) still needs `minimap.image` in discovery.
- Waits on an engine release that pins format 0.66 or later: with engine 0.1.59 (format 0.63) the SDK's format types and
  the engine's no longer match, so typecheck fails until the engine pin moves. Typecheck and tests pass against the
  engine worktree linked (J475). Format main has a fix after 0.66.0 (`33a3ce4`, roster hunt tags project to JSON
  Schema) that the SDK's schema export needs: pin the format release that carries it.
- The engine bump also brings engine's portable math body (`sinInto`/`cosInto`), copied here; GUIDE `water.field`
  names its `world/field` section (format 0.65).

## The engine pin moves to 0.1.65 on npm next (opus-of-close)

The page-start readers (engine `ca91fc62b0`) ship in engine 0.1.65, on npm `next` as `0.1.65-next.9c91846e` until prod
(J475: no lane waits on `latest`). The SDK and dev pin it exactly; format stays 0.66.0 because the engine package carries
its own 0.66.0 copy and a second format copy breaks branded types. A `-next.<sha8>` pin names no GitHub release, so
`wildshardStagingClients` maps it to the staging build's immutable release, `server-staging-9c91846e65…`, which carries
the preparation client.
