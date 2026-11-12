# Mossgate: ship the fitted colour LUT (opus-slot)

- Jake picked "ship the LUT" (meta J279, 2026-11-12 ~11:30 Cancún).
  LF1-10's `ship.patch` as fitted: the 33³ LUT `f2db0599…` in
  `assets/`, `data/look.json` `grade.lut`, and the file, the library
  root and its budget share (`LF110_LUT`, +143,748 B compressed) in
  `generators/product.ts`.
- In game it took the sky's ΔE00 from 26.3 to 6.1, the moss floor's from
  5.3 to 2.1 and the stone's from 6.8 to 3.7 over 54 frames. Greys pick
  up a lavender cast. Refit after the structural look rows land.
- `pnpm build:shards` passes with 0 tile debt. Uploaded as Template
  0.2.1 in today's slot.
