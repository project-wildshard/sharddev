# 2026-11-16: the Template's Barrow Warden dies to the sword (TC-SHIP)

> Written by: Claude (opus-brassgun14)

On staging v0.1.30 the Template probe swung the sword 325 times at the
Barrow Warden from 1.8 m off its spawn and landed 2, so the quest chain
stopped at the Lamplighter's report. `test/ci/template-warden.test.mjs`
loads the built Template into the engine's cell sim with its sections: the
boss decision runs (intro, fight, the phase beat, the second phase), the
guard opens to melee between strikes (18 of 37 swings land) and the Warden
dies and files `template.warden`. So the content is sound; the probe aimed
0.9 m over the feet of a scale-3 body whose hit volume starts about 1.5 m up.
CI runs it after `build:shards`; `WS_TEMPLATE_OUT` points it at another build.
