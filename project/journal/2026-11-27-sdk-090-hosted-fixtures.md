# Keep the packed author and legacy GLB proofs

The packed-install walkthrough now writes and packs the sample build
inside the authored project, where the CLI can verify its version.
The CI21 byte comparison still exercises the deprecated GLB writer
while authors migrate their generated textures to images.
