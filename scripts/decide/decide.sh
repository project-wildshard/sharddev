#!/usr/bin/env bash
# decide.sh — run scripts/decide/decide.py in its venv under the machine-wide model lock (E394).
#
#   scripts/decide/decide.sh run   <set> [--image a.jpg …] [--state TEXT | --state-file F]
#   scripts/decide/decide.sh batch <set> --images <list.txt | dir | items.jsonl> [--out results.jsonl]
#   scripts/decide/decide.sh qa    [--set capture-status] <image | dir> …     # capture QA, see below
#
# run / batch print one JSON line per item. qa writes <frame>.qa.json next to each frame and prints one line per frame
# ("FLAG …" / "ok …"). Exit codes: 0 = done (qa: nothing flagged), 3 = qa flagged a frame, 75 = skipped because the model
# lock or memory stayed busy past DECIDE_LOCK_WAIT seconds (unset = wait like ~/ml/imagegen/run-locked.sh, forever),
# anything else = failed (the log path is printed).
#
# The model is Clef-flash 4-bit (MLX, ~7 GB with images): ~/projects/weights/manual/mlx-community/clef-flash-4bit. The
# venv is ~/ml/decide/.venv (mlx-vlm 0.7.4, the version clef_mlx.py was tested with). Setup, speed and traps:
# ~/projects/localai/docs/decision-models.md. Put many items in one call: the lock may queue it behind music / SFX / 3D.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
py="$HOME/ml/decide/.venv/bin/python"
[ -x "$py" ] || { echo "decide: no venv at ~/ml/decide/.venv (see ~/projects/localai/docs/decision-models.md)" >&2; exit 2; }
runs="$HOME/.cache/wildshard-decide/runs"; mkdir -p "$runs"
id="$(date +%Y%m%d-%H%M%S)-$$"
LOG="$runs/$id.log"
# the command's stdout and stderr go to the log (as run-locked.sh does), so the answers come back through DECIDE_OUT
export DECIDE_OUT="$runs/$id.out"
export LOG MEM="$HOME/projects/localai/bin/mem-gb.sh" LIMIT_GB="${LIMIT_GB:-70}" DEADLINE=""
lockf_args=(-k)
if [ -n "${DECIDE_LOCK_WAIT:-}" ]; then
  lockf_args+=(-t "$DECIDE_LOCK_WAIT"); DEADLINE=$(( $(date +%s) + DECIDE_LOCK_WAIT ))
fi
# The same lock and memory rule as ~/ml/imagegen/run-locked.sh (one model at a time, anonymous memory < 70 GB, no
# evict.sh), plus the optional deadline: a capture script holding a browser slot must not wait out a 30 min 3D batch.
lockf "${lockf_args[@]}" "$HOME/projects/localai/.model.lock" bash -c '
  echo "=== $(date +%H:%M:%S) lock taken (decide): $*" >> "$LOG"
  while :; do
    read -r anon wired free < <(bash "$MEM")
    awk -v a="$anon" -v l="$LIMIT_GB" "BEGIN{exit !(a<l)}" && break
    if [ -n "$DEADLINE" ] && [ "$(date +%s)" -ge "$DEADLINE" ]; then echo "anon ${anon}G >= ${LIMIT_GB}G past the deadline" >> "$LOG"; exit 75; fi
    echo "$(date +%H:%M:%S) anon ${anon}G >= ${LIMIT_GB}G, waiting" >> "$LOG"; sleep 10
  done
  echo "$(date +%H:%M:%S) mem before (anon wired free GB): $(bash "$MEM")" >> "$LOG"
  /usr/bin/time -l "$@" >> "$LOG" 2>&1; rc=$?
  echo "=== $(date +%H:%M:%S) rc=$rc, lock released (no evict)" >> "$LOG"
  exit $rc
' _ "$py" "$here/decide.py" "$@"
rc=$?
case $rc in
  0|3) [ -f "$DECIDE_OUT" ] && cat "$DECIDE_OUT"; exit $rc ;;
  75) echo "decide: skipped, the model lock or memory stayed busy for ${DECIDE_LOCK_WAIT:-?} s" >&2; exit 75 ;;
  *) echo "decide: failed (rc $rc), see $LOG" >&2; exit $rc ;;
esac
