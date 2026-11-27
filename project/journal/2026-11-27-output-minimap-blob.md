# An output's discovery names its generated map blob (SF9)

The joint SDK 0.9.0 candidate refused all 18 open plots: "Missing shardfile
asset /assets/open-plot-<idea>/map/top.webp". Their discovery comes from the
composed output manifest, which packs no images. `outputManifest` forced
that public URL, which only the retired public publish ever wrote. A
one-product shard such as Dunes names its generated map as an image blob,
because its level manifest's images are packed.

`outputManifest` no longer forces a minimap, so an output keeps the one it
or its folder declares. The build names the generated map's blob in a
composed discovery (`withGeneratedMinimap`), just as a packed level manifest
does, so the plots need no copy of their map in `static/`.
