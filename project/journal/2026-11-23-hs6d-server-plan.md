# HS6d: the SDK writes `server/plan`

> Written by: Claude (opus-compat-w6), 2026-11-23

SHARD-COMPAT HS6: the engine's server reads feature rows through one seam, which
now prefers the server's own `server/plan` section (format HS6b) and falls back
to the page's `client/plan`. `emitPlatformSections` writes `server/plan` beside
`client/plan`, byte for byte, but only once the pinned format names the section,
so against format 0.66.0 a build's bytes are unchanged. The first SDK release
that pins a format with `server/plan` adds a section to every shard it builds,
so its source hash moves: that rides the roll (Track F) with its re-pins.
