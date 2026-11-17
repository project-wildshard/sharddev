# Mossgate Hollow v3: the sunset sky and the brazier pads

> Written by: Claude (opus-mossgate), 2026-11-11 ~19:45 Cancún

Jake approved board v3 for Template 1 ("mossgate hollow v3 gg"). This is
the first half of meta TEMPLATE-E2E-PLAN row MH-1.

- `data/look.json`: one sunset key (violet zenith, warm horizon, warm fog
  and sun) and `dayOverride: 0.735`, about 17:38 with the sun ~5.6° up.
  Jake: "The sky cant be boring gray like this."
- `generators/world.ts`: moss roof, stone walls, a wood door, and braziers
  A, B and C on 3 m pads at `layout.BRAZIERS`, with stone colliders. They
  are unlit; MH-2 lights them through a shared field and a panel.
- Built, validated and simulation-proved (240 ticks). Codex review: LGTM.

## Proved in an engine preview (follow-up, ~19:00 Cancún)

The first attempt failed for two reasons, both mine. `wildshard build
src/shards/_template` writes to `src/shards/_template/public/shardfiles/
template`, not `out/_template` (that folder is from 2026-11-08), so the
first pin held the old product. And a plain static server sends
`.pack.br` without `Content-Encoding`, which the client reads as "Spawn
part member differs". The recipe that works:

1. `wildshard build`, then `wildshard pack <that public folder>`.
2. Copy the tar to `~/.cache/wildshard/pins/<sha>.tar`, point
   `test/pins/shardfiles.json`'s `template` row at it in an engine plan
   worktree, `node scripts/pins.ts install`, then `gen.mjs --inputs-only`
   and `build-app.mjs` (about 30 s).
3. Serve with engine's `scripts/preview-server.mjs`, open
   `?chunk=_template&mute=1&skipintro=1&nolock=1&sw=0` headless.

What the look needed: the dev-map look colours every measure box, so the
moss and stone come from `materials.pbr.measure` (floor, structure,
trim), not mesh colours. Fog doesn't tint the sky; a deep violet zenith
and an orange horizon do. `day.azimuth: -145` sets the sun ahead of
spawn. The hut label is "Mossgate hut". Shots are in meta's
`template-e2e-v3/progress/t1-01-*.jpg`.
