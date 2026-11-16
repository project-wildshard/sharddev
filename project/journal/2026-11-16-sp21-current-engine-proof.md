# Qualify the rebased async consumer

> Written by: Codex
> State: locally qualified, 2026-11-16; released pins and hosted proof remain open.

SDK 0.3.6 added species fields that the previous immutable engine
candidate did not contain. Rebuilt the package from exact engine
be6ac52c6383ad6df8617a2e86c03161c33bf0f0, which contains the landed
async protocol. The packed artifact hash is
2eb758eac3c2d0f5ed04befe99ad648bbcf20c15c6e1715cc9f3ca0292d2c17c.
This is a local candidate, not a released dependency.

Full SDK types and lint pass. All seven actual API/PGlite, sandboxed
cook, parent transport, game receiver and packed CLI controls pass
in 50.27 seconds against API d0264bf9. Both placement choices reach
live after a lost acknowledgement heals; genuine entry refusal,
late verdict, replay and stalled CLI outcomes remain covered.

Failed composition assertions now include the trusted worker's
state/detail, so a child startup failure is visible at the original
status boundary. No limit, expected state or sandbox grant changed.
Local packed dependencies point directly to their immutable store
packages; source links through the live checkout are not qualified.

Final landing still needs an actual engine release with the new
host/checkShardfile export, followed by the released frozen graph
and normal hosted checks. Production async remains disabled.
