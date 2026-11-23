# SDK row for the carried round (wave 3, SI6)

> Written by: Claude (opus-compat-w12), 2026-11-23

Nalati's kokpar fixture (`test/fixtures/nalati-kokpar-native.ts`) imports the engine's
`game/quest/carriedRound` straight from `@wildshard/engine`. The SDK now re-exports it at
`@wildshard/sdk/internal/engine/game/quest/carriedRound` (internal tier, the same shape as
`effects`), so the wave 3 roll can drop Nalati's direct engine dependency. It rides the SDK
after 0.4.28 (0.4.28 was cut from 43a32ce8).
