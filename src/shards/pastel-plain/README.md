# Pastel Plain (`pastel-plain`)

SF59's first G169 fixture shard (SHARD-PLATFORM, E435): the real-GPU proof of the material-graph and post-stack path.
Developer only, placed on the grid's north-west plot (−1, +1). A copy of [`_template`](../_template/README.md) per
[SHARDS.md](../../../docs/SHARDS.md): the same playable level (the hut and its door, the blob, the elite and the boss,
the whip, the lantern, the jump course and the 500 m cell fill), with every `template.*` id renamed to `pastel.*`.

The look (`data/look.json`) is the pastel alien plain admitted by `test/shardfile-g169-looks.test.ts`:

- **`ground`**: the terrain's material, an engine-owned painterly preset reference in lilac
  (`{ family: 'graph', preset, version: 1 }`).
- **`rock`**: every prop's material, an authored lit material graph (`data/rock.graph.json`: a pink-to-peach height
  gradient, a half-Lambert pastel ramp with a cool shadow tint, a mint rim, a sky / ground ambient and a lift grade).
- **`look.post`**: one authored pass, the lilac wash with a soft vignette.

All three are this shard's default look: every shard draws its graphs (G669 DR12), standalone and in the grid (its
regional world and its baked tiles).

The Template binds terrain and props to `pbr`; Pastel keeps its own source
producers. `generators/terrain.ts` binds terrain to `ground` and
`generators/props.ts` binds props to `rock`. The executable `shard.config.ts`
program composes them, compiles the original door/item/idle AssemblyScript and
paints the map in-process. `generators/product.ts` accepts those actual rows and
compiled module identities. It preserves every original declaration and budget.

`ctx.cached` retains immutable world bytes and the original RGBA map lattice
outside the source tree. The SDK packs its lossless WebP directly into the
product; the root adapter supplies the current world-input key. The authored
palette lives in `data/map.json`. No Pastel catalogue jobs, generated metadata
or `.wildshard/product` report remain. Native fixtures call the same source
producers; current complete-product admission stays strict.
