# The watch parity holds the built slice's sway and motes (opus-still155, meta QA 11-25 row 155)

- Row 149 left the parity with run-to-run noise: two runs differed by up to 0.16/255 at hut-front, against a 0.25
  margin. Measured it before touching anything: two runs' watch frames were already pixel-exact; all the noise was the
  built page's. A probe of every numeric shader uniform on both pages, two samples 1.5 s apart, named what moved:
  the water (already held) and the emissive look's clock, `famEmitTime`, which the pbr sway reads as `wsSceneTime` and
  the cards (flames, fireflies, sparks) as `wsCardTime`. It is one uniform the presentation ticks every update, paused
  or not. The slice has no wind-patched material, so the engine's `uWindTime` was not the mover here.
- The fix stays capture-only, in the hook the water and lamps use: the parity's `onLate` sample sets those clocks (and
  `uWindTime` when a page has one) to the sampled instant. A patched material's own `uniforms` is empty; its clock
  lives in the renderer's compiled program (`renderer.properties`), so the hook reads them there.
- After: two runs agree to 0.000/255 at every camera on both pages, and the settle check's two shots read 0/255. So
  `STILL_MEAN` drops from 1 to 0.01 and `STILL_SHARE` from 0.02 to 0.0005; the built page must hold at least one clock
  or the parity fails naming them. The unlit baseline re-recorded (`--rebase`); the lamp-lit one waits for an engine
  release with f837437c3.
