# Sample the sailor poses for Kit bipeds

> Written by: Codex
> State: verified locally, 2026-11-17.

The biped pack samples Driftwood's `SAILOR_CLIPS` at
`d711430a6959f6457ae1a7f7dd11dac2f5393e63`,
`src/generators/humanoidClips.ts`, with the engine 0.1.35 numeric
pose evaluator. The sailor's body maps to hips and the limb tracks map
to the named biped joints. Idle and walk close their loops. Hit samples
flinch and die samples the existing 0.8-second collapse. Translations
are retargeted relative to the destination's rest offsets.

The existing quadruped clips can also fit the reference skeleton with
decorative joints absent. Its binding filters the same joints from the
periodic layers. The legacy decorated export and original pack retain
their bytes. Both packs support an author replacing a clip by name or
leaving it to the poser.

Frozen install confirmed the SDK and Kit actually resolve format 0.26.0.
The 27-case Kit suite, Kit typecheck and author lint passed.
