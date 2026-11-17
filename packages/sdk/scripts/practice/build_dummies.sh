#!/usr/bin/env bash
# Rebuild the three practice training dummies (E285): reference -> TRELLIS.2 -> closed bake -> clean + rig -> pack.
#
#   bash scripts/practice/build_dummies.sh            # bake + rig + pack from the saved decodes (no model load)
#   GEN=1 bash scripts/practice/build_dummies.sh      # also re-run TRELLIS.2 (under the machine-wide model lock)
#
# The references are art/hud-explorer/round-7-dummy-rebuild/ref-*.jpg (codex image_gen edits of the round-3 refs:
# closed solid fists, bound straw, arms off the body; E289 re-rolled the steel one with a closed great helm). TRELLIS.2 picks each figure's facing per generation, so
# FRONT records where each decode faces; check it with a render if you regenerate. Outputs:
# public/assets/practice/dummies/{wood-wood,straw-cloth,wood-steel}.glb. Rig gate: scripts/practice/dummy_rig_gate.py.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
REFS="$REPO/art/hud-explorer/round-7-dummy-rebuild"
OUT="${DUMMY_OUT:-$HOME/ml/img2mesh/out/dummy-e285}"
WORK="${DUMMY_WORK:-$OUT/work}"
TPY="$HOME/ml/img2mesh/trellis-mac/.venv/bin/python"
mkdir -p "$OUT" "$WORK"

# variant  ref stem  TRELLIS front  shipped name
FIGURES=(
  "straw-cloth ref-straw-cloth -y straw-cloth"
  "wood ref-wood-wood -y wood-wood"
  "wood-steel ref-wood-steel -y wood-steel"
)

if [ "${GEN:-0}" = 1 ]; then
  imgs=()
  for f in "${FIGURES[@]}"; do set -- $f; imgs+=("$REFS/$2.jpg"); done
  "$HOME/ml/imagegen/run-locked.sh" "$HOME/ml/img2mesh/logs/dummy-e285.log" \
    "$TPY" "$HOME/projects/localai/bin/img2mesh/trellis_batch.py" --out "$OUT" \
    --pipeline 1024_cascade --faces 60000 --tex 2048 --seed 42 "${imgs[@]}"
fi

for f in "${FIGURES[@]}"; do
  set -- $f
  variant=$1 stem=$2 front=$3 name=$4
  "$TPY" "$REPO/scripts/practice/bake_dummy.py" "$OUT/$stem.npz" "$WORK/$name.baked.glb" --faces 90000 --tex 2048 --band 2
  blender -b -P "$REPO/scripts/practice/rig_dummy.py" -- "$WORK/$name.baked.glb" "$WORK/$name.rigged.glb" \
    --variant "$variant" --front "$front" --report "$WORK/$name.rig.json" | grep -E "^REPORT|Error" || true
  node "$REPO/scripts/practice/pack_dummy.mjs" "$WORK/$name.rigged.glb" "$REPO/public/assets/practice/dummies/$name.glb"
  node "$REPO/scripts/practice/repair_dummy_weights.mjs" "$REPO/public/assets/practice/dummies/$name.glb" "$REPO/public/assets/practice/dummies/$name.glb"
done
ls -la "$REPO/public/assets/practice/dummies/"
