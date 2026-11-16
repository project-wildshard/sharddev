# CI21 fixed material parity capture

> Written by: Codex

> **State:** verified, 2026-11-15.

The unchanged watch/build gate failed twice at the pond (mean 3.864 and
3.891 against 3.499 + 0.25), while another full check on the same source
passed. These cameras compare static material back ends; elapsed loading
and rendering time should not choose their ripple/flicker samples or
render scale.

Keep the real pages, geometry, materials and the planted half-colour roof.
In the existing late-camera hook, set the actual water uTime uniform and
sample each actual lamp group's update at 5 s. Watch captures its update
callback; the built look calls the update property after late, so wrap
that property once and also perform the direct late sample. Refuse a shot
if either control is missing. No light or water object is hidden.

The public capture clock deliberately holds shader time and the tier's
render scale, and pauses scheduled systems for this static fixture. The
clock is reset after camera placement; this is not a gameplay-clock test.
The sky's other private accumulators are not claimed as pinned. Baseline,
mean/share thresholds and the independent roof plant remain unchanged.

J206 rejected the first clock-only attempt: private water/lamp accumulators
still advanced. The follow-up also found the built lamp update after late;
the requested property wrap is now in place. The corrected real run passes
all four cameras (pond 3.085/255, 3.91%); the roof plant is red (hut-front
3.629, door-lamp 6.464), while pond stays exactly 3.085 before/after plant.
Earlier explicit-phase run also passed. Full SDK suite: 273 files, 1,373
cases and one existing skip; normal push still owns its complete gate.
