# Ink & Cel Valley (`ink-cel-valley`)

SF59's second G169 fixture shard (SHARD-PLATFORM, E435): the second real-GPU proof of the material-graph and post-stack
path. Developer only, placed on the grid's south-east plot (+1, −1). A copy of [`_template`](../_template/README.md) per
[SHARDS.md](../../../docs/SHARDS.md): the same playable loop (the hut and its door quest, the blob, the elite and the
boss, the whip, the lantern, the jump course and the 500 m cell fill), with every `template.*` id renamed to `ink.*`,
and its yard turned into a north-south valley: two ridges rise east and west of the trail (`generators/terrain.ts`), so
the fights happen on the valley floor with the inked ridge lines behind them.

The look (`data/look.ts`) is the ink / cel valley admitted by `test/shardfile-g169-looks.test.ts`
(`art/grid/round-19-art-styles/C-ink-cel-valley-inside.jpg`):

- **`ground`**: the terrain's material, an engine-owned toon preset reference in sage green
  (`{ family: 'graph', preset, version: 1 }`).
- **`rock`**: every prop's material, an authored cel graph (`data/rock.graph.json`, from `scripts/tsl-spike/stress.js`
  `inkGraph`: flat paper, three hard sun bands over a flat ink-wash shade, a silhouette line, a light posterise and the
  outline stage's inverted hull). It departs from the spike in three places, which together drew every prop black: the
  shade is a flat `wash × paper × shade` tone, not the irradiance ambient (at ~0.02 it fell under the posterise's first
  step and the dark grade flooded every shadow-side face with ink); the sun lights flat paper, not the stock albedo (the
  props' grey-box vertex colours, 0x888888, cut it 4×); and the UV face border is gone (these props carry SF56's packed
  measure UVs, `measureUv`, every coordinate above 64, which read as all border), so the edge post inks the creases.
- **`look.post`**: one authored pass, the (2b) edge post (`data/edge.post.json`, `inkPostGraph`): depth and normal-crease
  edges inked over the tone-mapped colour, faded with distance. It reads colour, depth and the normal pre-pass; the
  stack's static cost includes the pre-pass (budget v1: 1,000 per pixel at 2×, summed with the heaviest neighbour).

All three are this shard's default look: every shard draws its graphs (G669 DR12), standalone and in the grid (its
regional world and its baked tiles).

The template binds terrain and props to one `pbr` material, so this shard keeps its own copy of the generators:
`generators/terrain.ts` bakes the valley field bound to `ground` (`inkField`, shared with the props bake),
`generators/props.ts` (the template's props bake source) binds the props section to `rock`, and `generators/bake.ts`
returns both (`inkWorld`). The build bakes them, paints the map from them and assembles the declaration in one cached
step (`generators/generate.ts`, GR9); nothing is written to the source tree.
