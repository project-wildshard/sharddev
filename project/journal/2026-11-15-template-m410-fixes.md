# TEMPLATES-CLEANROOM M4.10: the review's three SHOULDs (opus-ap16)

- `scripts/bake/template-skins.mjs` wrote `data/skins.json` from the two
  fixture species only, so re-running it dropped the Barrow Warden (a
  `template-warden.mjs` entry). It now keeps every entry it does not make.
- The open-core gem (field 111) and its sparks sat at 4.6 m, inside the
  golem's head. `warden.ts` exports `WARDEN_CROWN` (its moss cap's top,
  1.76 m at scale 1, 5.27 m at the spawn's 3); the gem's centre is 6.2 m,
  over the crown by its half height and a gap, and the sparks follow. A
  panel is fixed, so over the crown it reads whichever way the Warden turns.
- The sunk pond slabs looked like stepping stones with no collider. Each
  now stands (top 0.05 m over the water); B's raised bridge is a step
  over them (0.25 m, under the 0.35 m autostep).
