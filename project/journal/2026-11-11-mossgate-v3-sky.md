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

Not proved yet: an in-engine screenshot. An engine worktree build with
this product pinned fails at load with "Spawn part member differs": the
client's spawn parts still hold the old Template members. MH-1 stays
open until a preview boots it.
