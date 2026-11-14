# Watch, complete (SHARD-SOURCE stage 5, opus-ss5)

- AP17: look edits go live in ~70-110 ms. Most of the old 632 ms was bundling three and the sdk per revision (170 ms;
  now shared from the watch process, 20 ms) and painting textures (200 ms; now kept by painter text and checked by a
  repaint once edits pause). Surprise: on this Mac native fs.watch delivers no events at all (FSEvents used up), so the
  250 ms poll was the real detector; it now polls every 40 to 250 ms. Second surprise: a page reload under watch landed
  on the client's service-worker cache (no page script, old shell); watch now serves a self-removing worker. A look set
  live matches the same look booted from a new shell to 0.03 of 255 per channel.
- AP18: a ground edit no longer rebuilds the shell. Watch sends the whole 257² lattice (heights and colours, the bake's
  `groundLattice`, as one terrain tile's wire bytes) at `ground/<hash>`; the page script hands it to engine's hook v3
  `setGround`, which swaps the page and in-page server colliders, the height fields and only the drawn tiles whose
  samples changed, and lifts the player onto new ground. A hill raised under the player at the hut camera: median
  116.5 ms from file write to first frame (91 to 174, 10 edits, 0 reloads), still standing on it 1 s later in 10 of 10.
- AP20: `parity.mjs` shoots the slice's four cameras through both back ends (`wildshard watch`, the hook drawing parts
  live, and `wildshard dev`, the full build) with the camera off the player (a player's body stands where colliders put
  it, which differed by camera). The back ends still differ where the shardfile back end lowers on purpose (a glowing
  material is the emissive family without its base colour, AP10 transparency, AP11 billboards, AP28 lamps: the pond
  lantern, lily pads and the lamp spill), so the guard is a ratchet over `parity-baseline.json` (hut-front 1.66/255,
  door-lamp 4.08, hut-back 0.09, pond 3.06; two clean runs differ by under 0.002). `pnpm check` runs `--check` (45 s):
  clean green, the live roof colour halved red. An engine pin without hook v3 skips it with a line. Watch also runs the
  full build in a child process once edits rest 5 s and shows its budget table in a page panel (the slice: 37 MB, two
  L0 tiles over their caps).
