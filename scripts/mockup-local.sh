#!/usr/bin/env bash
# mockup-local.sh — one mockup with LOCAL Qwen-Image-2.1 + the Viggle turbo LoRA (6 steps, ~20-35 s on the M5 Max),
# the fast alternative to codex image_gen (AGENTS.md "Mockups"). Edits the reference frame(s) the way codex does.
#
#   scripts/mockup-local.sh --ref <frame.jpg> [--ref <style.png> ...] --prompt-file <p.txt> --out <out.png>
#                           [--mask <mask.png>] [--size WxH] [--seed N] [--steps40]
#
#   --ref        condition image(s); the FIRST is the frame being edited (a live capture, like the codex flow)
#   --mask       white = the only area that may change; the output is composited back over the untouched frame
#                outside it (pixel-identical world). Use it for localised edits: move a button, add a chip / panel.
#   --size       output aspect (default: the first ref's); rendered at ~1 MP
#   --steps40    the full 40-step model instead of turbo (~4x slower, same look)
#
# Runs under the machine-wide model lock (~/projects/localai/.model.lock), so it may queue behind music / SFX / 3D
# jobs from other agents. The shared run-locked launcher caps lock and memory admission at five minutes.
# Setup + traps: ~/projects/localai/docs/image-models.md. Weights: ~/projects/weights/manual/Qwen/.
set -euo pipefail
IG="$HOME/ml/imagegen"
refs=(); prompt=""; out=""; mask=""; size=""; seed=42; turbo="--turbo"
while [ $# -gt 0 ]; do
  case "$1" in
    --ref) refs+=("$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"); shift 2 ;;
    --prompt-file) prompt="$2"; shift 2 ;;
    --out) out="$2"; shift 2 ;;
    --mask) mask="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"; shift 2 ;;
    --size) size="$2"; shift 2 ;;
    --seed) seed="$2"; shift 2 ;;
    --steps40) turbo=""; shift ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "mockup-local: unknown arg $1" >&2; exit 2 ;;
  esac
done
[ ${#refs[@]} -gt 0 ] && [ -n "$prompt" ] && [ -n "$out" ] || { sed -n '2,17p' "$0"; exit 2; }
if [ -z "$size" ]; then size="$(sips -g pixelWidth -g pixelHeight "${refs[0]}" | awk '/pixelWidth/{w=$2} /pixelHeight/{h=$2} END{print w "x" h}')"; fi
run="$IG/runs/$(date +%Y%m%d-%H%M%S)-$$"; mkdir -p "$run"
jq -n --rawfile p "$prompt" --arg w "${size%x*}" --arg h "${size#*x}" --args \
  '[{id: "mockup", prompt: $p, inputs: $ARGS.positional, size: [($w|tonumber), ($h|tonumber)]}]' "${refs[@]}" \
  | jq . > "$run/jobs.json"
args=(--jobs "$run/jobs.json" --repo / --out "$run" --res 1024 --seed "$seed" --vae-fp32 --kv auto)
[ -n "$turbo" ] && args+=(--turbo)
if [ -n "$mask" ]; then cp "$mask" "$run/mockup.mask.png"; args+=(--masks "$run"); fi
"$IG/run-locked.sh" "$run/log.txt" "$IG/.venv/bin/python" "$IG/gen_qwen21.py" "${args[@]}"
[ -f "$run/mockup.png" ] || { echo "mockup-local: no image — see $run/log.txt" >&2; exit 1; }
if jq -e '.black' "$run/mockup.json" >/dev/null; then echo "mockup-local: BLACK frame (NaN) — see $run/log.txt" >&2; exit 1; fi
mkdir -p "$(dirname "$out")"; cp "$run/mockup.png" "$out"
echo "mockup-local: $out ($(jq -r '"\(.size[0])x\(.size[1]), \(.seconds) s"' "$run/mockup.json"); run dir $run)"
