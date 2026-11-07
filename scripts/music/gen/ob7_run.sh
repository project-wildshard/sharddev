#!/usr/bin/env bash
# One model, one plot, one finite shared-lock batch. Honour any booked
# official window; no global eviction and no automatic retry.
set -euo pipefail
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
model=${1:?model required: score, moss, medium, clap or vocals}
plot=${2:?plot required}
case "$plot" in
  lantern-bayou|frostline-peaks|ember-forge|mosslight-ruins|coral-drift|night-market|jungle-ziggurat|patchwork-fairground|saltwind-lighthouse|fossil-badlands|sky-harbor|starfall-observatory|thin-ice|alien-plain|clockwork-canyon|desert-ruin|sky-race|showcase-template) ;;
  *) echo "Unknown OB7 plot: $plot" >&2; exit 2 ;;
esac
shift 2
if [ -e "$repo/.git/quiet" ]; then
  echo 'Official Simulator quiet window is open; no model loaded' >&2
  exit 75
fi
raw="$repo/tmp/ob7-audio/raw"
mkdir -p "$raw"
log="$repo/tmp/ob7-audio/$plot-$model.log"
export HF_HUB_OFFLINE=1 MODEL_RUN_SECONDS=1800
runner="$HOME/projects/localai/bin/img2mesh/run-locked.sh"
case "$model" in
  score)
    cd "$HOME/ml/music/minimax-music3"
    "$runner" "$log" .venv/bin/python "$repo/scripts/music/gen/ob7_generate.py" score "$plot" --out "$raw" "$@"
    ;;
  moss)
    cd "$HOME/ml/music/sfx/MOSS-TTS/moss_soundeffect_v2"
    "$runner" "$log" env TORCHDYNAMO_DISABLE=1 PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.5 PYTORCH_MPS_LOW_WATERMARK_RATIO=0.4 \
      .venv/bin/python "$repo/scripts/music/gen/ob7_generate.py" moss "$plot" --out "$raw" "$@"
    ;;
  medium)
    cd "$HOME/ml/music/sfx/stable-audio-3"
    "$runner" "$log" .venv/bin/python "$repo/scripts/music/gen/ob7_generate.py" medium "$plot" --out "$raw" "$@"
    ;;
  clap|vocals)
    cd "$repo"
    "$runner" "$log" "$HOME/ml/music/analysis/.venv/bin/python" scripts/music/gen/ob7_build.py "$model" "$raw" --plot "$plot" "$@"
    ;;
  *) echo "Unknown OB7 model: $model" >&2; exit 2 ;;
esac
echo "OB7 $plot $model finished; $log"
