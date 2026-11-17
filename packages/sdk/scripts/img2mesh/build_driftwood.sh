#!/bin/bash
# Driftwood hero props: TRELLIS.2 generations (~/ml/img2mesh/out/driftwood/<ref>.glb) -> faceted game assets in
# public/assets/models/driftwood-hero/<asset>/<asset>.glb (+ .tex.glb with a WebP atlas where listed) + <asset>.json.
#   bash scripts/img2mesh/build_driftwood.sh            # every prop
#   bash scripts/img2mesh/build_driftwood.sh hut wreck  # just these refs
# The prop list (every size, budget and option) is src/shards/driftwood-isle/art/hero-props.json; the build is the
# shard-agnostic scripts/img2mesh/build_props.py (PH-0.3): step 1 (driftwood_post.py, Blender) writes to a staging
# folder, step 2 meshopt-compresses the glbs into the repo with gltf-transform. Env GEN / STAGE / BLENDER override.
set -euo pipefail
REPO=$(cd "$(dirname "$0")/../.." && pwd)
exec python3 "$REPO/scripts/img2mesh/build_props.py" "$REPO/src/shards/driftwood-isle/art/hero-props.json" \
  "$REPO/public/assets/models/driftwood-hero" "$@"
