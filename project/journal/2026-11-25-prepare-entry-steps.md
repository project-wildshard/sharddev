# Prepare names where its entry time goes (FAST-RELEASE FR-A18)

- opus-cook: Nalati's phone WebKit entry takes 210 to 260 s on ubuntu-24.04 runners against 40 to 48 s on macos-15, and no
  prepare log said where. `waitForEntry` now merges every loading row it sees (the card shows only the running phase's
  rows, each with `data-key` and `data-ms`) and the recorder prints `entered in N s at pixel density D; slowest steps: …`;
  a refusal names the slowest steps too. `WILDSHARD_PREPARATION_DENSITY` overrides the iPhone 16 Pro's 3 for a trial.
- MacBook trial on a copy of Nalati's built product: density 3 and 1 both entered in 9 s (Application modules 7.6 s) and
  wrote byte-identical cook.json and program mounts (113 programs, 205 shaders).
- Then the recorder's phone context draws at pixel density 1 by default (`preparationDensity` in preparation-seed.mjs):
  the phone renderer draws at min(density, 2), so a quarter of the pixels a Linux runner draws in software. MacBook: the
  default run wrote a cook.json byte-identical to the density-3 one. Linux proof: Nalati rehearsals on ubuntu-24.04.
