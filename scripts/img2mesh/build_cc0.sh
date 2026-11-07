#!/bin/bash
# The CC0 complement: kit models from ~/models/cc0 (scripts/img2mesh/CC0.md) recoloured to the Driftwood palette and
# meshopt-compressed into public/assets/models/driftwood-cc0/<name>/<name>.glb (+ .json with source + licence).
#   bash scripts/img2mesh/build_cc0.sh [name ...]
set -euo pipefail
REPO=$(cd "$(dirname "$0")/../.." && pwd)
CC0=${CC0:-$HOME/models/cc0}
STAGE=${STAGE:-$HOME/ml/img2mesh/out/driftwood-cc0}
DEST=$REPO/public/assets/models/driftwood-cc0
BLENDER=${BLENDER:-/opt/homebrew/bin/blender}
mkdir -p "$STAGE" "$DEST"

# name | source (relative to ~/models/cc0) | fit | metres | palette family (optional)
LIST=$(cat <<'EOF'
cc0-palm-tall|quaternius/pirate-kit/glTF/Environment_PalmTree_1.gltf|height|8
cc0-palm-bent|quaternius/pirate-kit/glTF/Environment_PalmTree_3.gltf|height|7
cc0-palm-young|poly-pizza/palm/Quaternius-Palm-Tree_A6cKJYFsIb.glb|height|5
cc0-rock-a|quaternius/pirate-kit/glTF/Environment_Rock_2.gltf|height|1.4|rock
cc0-rock-formation|poly-pizza/rock/Kenney-Rock-Formation_pRY9BCFbmQ.glb|height|3|rock
cc0-rock-large|poly-pizza/rock/Quaternius-Rock-Large_54jZKTAt5p.glb|height|2.4|rock
cc0-rocks-small|poly-pizza/rock/Quaternius-Rocks_gYhoEOKItJ.glb|length|1.6|rock
cc0-rowboat|kenney/pirate-kit/Models/GLB format/boat-row-small.glb|length|3.6
cc0-sailboat|poly-pizza/boat/Quaternius-Sail-Boat_BgSZXwmm7k.glb|length|6
cc0-shipwreck|kenney/pirate-kit/Models/GLB format/ship-wreck.glb|length|12
cc0-dock|quaternius/pirate-kit/glTF/Environment_Dock.gltf|length|6
cc0-dock-broken|quaternius/pirate-kit/glTF/Environment_Dock_Broken.gltf|length|6
cc0-hut|poly-pizza/hut/Quaternius-Hut_4MJWbyd6vw.glb|height|4.5
cc0-barrel|quaternius/pirate-kit/glTF/Prop_Barrel.gltf|height|1
cc0-crate|kenney/pirate-kit/Models/GLB format/crate.glb|height|0.8
cc0-chest-gold|quaternius/pirate-kit/glTF/Prop_Chest_Gold.gltf|length|0.9
cc0-coconut-half|poly-pizza/beach/Kenney-Coconut-Half_ufT2tXnLFc.glb|length|0.22
cc0-mussel|poly-pizza/beach/Kenney-Mussel-Open_eWHAc3Pq8z.glb|length|0.12
cc0-log|poly-pizza/driftwood/Quaternius-Wood-Log_L4E32Wee6C.glb|length|2.2|bleach
cc0-deadtree|poly-pizza/driftwood/Kay-Lousberg-Dead-tree_k80NkrvY2f.glb|height|3|bleach
cc0-arch|poly-pizza/ruin/Quaternius-Arch-Round_B9QABewqLv.glb|height|4
cc0-monolith|kenney/nature-kit/Models/GLTF format/stone_tallA.glb|height|3|rock
cc0-whale-bones|quaternius/pirate-kit/glTF/Environment_LargeBones.gltf|length|6|bleach
EOF
)

want() { [ $# -le 1 ] && return 0; for w in "${@:2}"; do [ "$w" = "$1" ] && return 0; done; return 1; }
while IFS='|' read -r name src fit size family; do
  [ -z "$name" ] && continue
  want "$name" ${1+"$@"} || continue
  [ -f "$CC0/$src" ] || { echo "skip $name: no $CC0/$src"; continue; }
  "$BLENDER" -b -P "$REPO/scripts/img2mesh/cc0_export.py" -- --in "$CC0/$src" --name "$name" --out "$STAGE" \
    --fit "$fit" --size "$size" --family "${family:-}" 2>&1 | grep -E '^CC0_EXPORT|Error|Traceback' || true
  [ -f "$STAGE/$name/$name.glb" ] || continue
  mkdir -p "$DEST/$name"
  npx --prefix "$REPO" gltf-transform meshopt "$STAGE/$name/$name.glb" "$DEST/$name/$name.glb" --level medium > /dev/null
  cp "$STAGE/$name/$name.json" "$DEST/$name/$name.json"
done <<< "$LIST"
