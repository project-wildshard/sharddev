#!/usr/bin/env bash
# build.sh — the one runner for every model a Blender script builds (M10, E315; docs/design/blender-practice.md §4).
# The scripts are the source, the GLB they export is committed, a .blend never is.
#
#   bash scripts/blender/build.sh <target>... [flags] [-- <script args>]
#   bash scripts/blender/build.sh --list                 the targets in scripts/blender/targets.json
#   bash scripts/blender/build.sh --check <target>...    rebuild into the cache and compare with the committed GLBs
#   bash scripts/blender/build.sh --check --all          every target (one Blender run at a time, under the model lock)
#
# Flags: --check · --all · --save-blend (also save the scene as ~/.cache/wildshard-blender/<target>/<name>.blend, to open
# and inspect) · --no-copy (build into the cache, write nothing into the repo) · --no-lock. Any other --flag, and
# everything after `--`, is passed to the target's Blender script (e.g. --quick, --only=trees, --lod=hi).
#
# Per target (targets.json): the `pre` commands (the game's data → the cache, downloads) → Blender, headless:
#   blender -b --factory-startup -noaudio --python-exit-code 1 -P <script> -- <args>
# (an exception fails the run) under `lockf -k ~/projects/localai/.model.lock` when `lock` is true (Cycles work,
# AGENTS.md ▸ Local models) → every `build` file must exist → `meshopt` pairs (gltf-transform meshopt --level medium into
# the repo) → `copy` pairs → the `post` script. --check stops before the repo: it meshopts each rebuilt GLB into the check
# folder and compares it with the committed one (lib/glb-digest.mjs: structure, counts, materials, bounds; bytes may
# differ). A `manual` target is not built here; --check runs its `check` command instead.
#
# Environment for pre / post / args: REPO, CACHE (~/.cache/wildshard-blender/<target>), BUILD (CACHE/build, or
# CACHE/check under --check), SHARED (~/.cache/wildshard-blender: downloads shared between targets), BLENDER.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
REPO=$PWD
MANIFEST=scripts/blender/targets.json
BLENDER="${BLENDER:-$(jq -r '.blender.path' "$MANIFEST")}"
command -v "$BLENDER" >/dev/null || BLENDER=$(command -v blender || true)
LOCK="${HOME}/$(jq -r '.lock' "$MANIFEST" | sed 's#^~/##')"
SHARED="${BLENDER_CACHE:-$HOME/$(jq -r '.cache' "$MANIFEST" | sed 's#^~/##')}"
GT="$REPO/node_modules/.bin/gltf-transform"

CHECK=0 ALL=0 SAVE=0 COPY=1 USELOCK=1 LIST=0
TARGETS=() PASS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --check) CHECK=1 ;;
    --all) ALL=1 ;;
    --save-blend) SAVE=1 ;;
    --no-copy) COPY=0 ;;
    --no-lock) USELOCK=0 ;;
    --list) LIST=1 ;;
    --) shift; PASS+=("$@"); break ;;
    --*) PASS+=("$1") ;;
    *) TARGETS+=("$1") ;;
  esac
  shift
done

if [ "$LIST" = 1 ]; then
  jq -r '.targets | to_entries[] | "\(.key)\t\(if .value.manual then "manual" elif .value.script then .value.script else "export only" end)\t\(.value.about)"' "$MANIFEST" \
    | awk -F'\t' '{ printf "%-32s %-58s %s\n", $1, $2, substr($3, 1, 90) }'
  exit 0
fi
if [ "$ALL" = 1 ]; then TARGETS=(); while IFS= read -r t; do TARGETS+=("$t"); done < <(jq -r '.targets | keys[]' "$MANIFEST"); fi
[ ${#TARGETS[@]} -gt 0 ] || { sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }

want="$(jq -r '.blender.version' "$MANIFEST")"
have="$("$BLENDER" --version 2>/dev/null | head -1 | awk '{print $2}')"
[ "$have" = "$want" ] || echo "build.sh: WARNING Blender $have, targets.json pins $want. Adopt a new version with a --check of every target." >&2

# $REPO / $CACHE / $BUILD / $SHARED / $BLENDER in a manifest string
expand() {
  local s=$1
  s=${s//\$REPO/$REPO}; s=${s//\$CACHE/$CACHE}; s=${s//\$BUILD/$BUILD}; s=${s//\$SHARED/$SHARED}; s=${s//\$BLENDER/$BLENDER}
  printf '%s' "$s"
}
field() { jq -r --arg t "$T" ".targets[\$t]$1" "$MANIFEST"; }
fields() { jq -r --arg t "$T" ".targets[\$t]$1 // [] | .[]" "$MANIFEST"; }
pairs() { jq -r --arg t "$T" ".targets[\$t].$1 // [] | .[] | \"\(.[0])\t\(.[1])\"" "$MANIFEST"; }

FAILED=()
for T in "${TARGETS[@]}"; do
  [ "$(jq --arg t "$T" '.targets | has($t)' "$MANIFEST")" = true ] || { echo "build.sh: no target \"$T\" (bash $0 --list)" >&2; exit 2; }
  CACHE="$SHARED/$T"
  BUILD="$CACHE/$([ "$CHECK" = 1 ] && echo check || echo build)"
  export REPO CACHE BUILD SHARED BLENDER
  echo "── $T $([ "$CHECK" = 1 ] && echo '(check)')"

  manual=$(field '.manual // empty')
  if [ -n "$manual" ]; then
    chk=$(field '.check // empty')
    if [ "$CHECK" = 1 ] && [ -n "$chk" ]; then
      bash -c "$(expand "$chk")" || FAILED+=("$T")
    else
      echo "build.sh: $T is built by hand: $manual"
      [ "$CHECK" = 1 ] || FAILED+=("$T")
    fi
    continue
  fi

  # a fresh check folder every time (only ever under the cache)
  if [ "$CHECK" = 1 ]; then case "$BUILD" in "$SHARED"/*/check) rm -rf -- "$BUILD" ;; esac; fi
  mkdir -p "$CACHE" "$BUILD"
  prefail=0
  while IFS= read -r c; do
    [ -n "$c" ] || continue
    bash -c "$(expand "$c")" || { echo "build.sh: $T: pre step failed: $c" >&2; prefail=1; break; }
  done < <(fields '.pre')
  [ "$prefail" = 0 ] || { FAILED+=("$T"); continue; }

  script=$(field '.script // empty')
  if [ -z "$script" ]; then echo "build.sh: $T has no Blender step (export only): $CACHE"; continue; fi
  args=()
  while IFS= read -r a; do args+=("$(expand "$a")"); done < <(fields '.args')
  cmd=("$BLENDER" -b --factory-startup -noaudio --python-exit-code 1 -P "$script")
  if [ "$SAVE" = 1 ]; then
    cmd+=(-P scripts/blender/lib/save_blend.py)
    export WILDSHARD_SAVE_BLEND="$CACHE/$(basename "$T").blend"
  fi
  cmd+=(-- ${args[@]+"${args[@]}"} ${PASS[@]+"${PASS[@]}"})
  LOG="$CACHE/$(basename "$BUILD").log"
  locked=$(jq -r --arg t "$T" '.targets[$t] | if has("lock") then .lock else true end' "$MANIFEST")
  if [ "$locked" = true ] && [ "$USELOCK" = 1 ]; then cmd=(lockf -k -t 300 "$LOCK" "${cmd[@]}"); fi
  t0=$(date +%s)
  rc=0
  PYTHONDONTWRITEBYTECODE=1 "${cmd[@]}" >"$LOG" 2>&1 || rc=$?
  if [ "$rc" = 75 ]; then echo "build.sh: model lock timed out after 300s: $LOCK" >&2; lsof "$LOCK" >&2 || true; fi
  grep -E '^\[|Error|Traceback|  File "|Exception' "$LOG" | tail -25 || true
  echo "build.sh: $T: Blender exit $rc after $(( $(date +%s) - t0 )) s (log: $LOG)"
  [ "$rc" = 0 ] || { FAILED+=("$T"); continue; }
  missing=0
  while IFS= read -r f; do
    [ -s "$BUILD/$f" ] || { echo "build.sh: $T produced no $f" >&2; missing=1; }
  done < <(fields '.build')
  [ "$missing" = 0 ] || { FAILED+=("$T"); continue; }

  if [ "$CHECK" = 1 ]; then
    mkdir -p "$BUILD/meshopt"
    ok=1
    while IFS=$'\t' read -r from to; do
      [ -n "$from" ] || continue
      out="$BUILD/meshopt/$(basename "$to")"
      "$GT" meshopt "$BUILD/$from" "$out" --level medium >/dev/null
      echo "  $to"
      node scripts/blender/lib/glb-digest.mjs "$out" "$to" --json "$out.check.json" | sed 's/^/  /' || ok=0
    done < <(pairs meshopt)
    while IFS=$'\t' read -r from to; do
      [ -n "$from" ] || continue
      if cmp -s "$BUILD/$from" "$to"; then echo "  $to: same bytes"; else echo "  $to: differs (a sidecar: info only)"; fi
    done < <(pairs copy)
    [ "$ok" = 1 ] || FAILED+=("$T")
    continue
  fi
  [ "$COPY" = 1 ] || { echo "build.sh: --no-copy: $T built into $BUILD"; continue; }
  while IFS=$'\t' read -r from to; do
    [ -n "$from" ] || continue
    mkdir -p "$(dirname "$to")"
    "$GT" meshopt "$BUILD/$from" "$to" --level medium >/dev/null
  done < <(pairs meshopt)
  while IFS=$'\t' read -r from to; do
    [ -n "$from" ] || continue
    mkdir -p "$(dirname "$to")"
    cp "$BUILD/$from" "$to"
  done < <(pairs copy)
  post=$(field '.post // empty')
  [ -z "$post" ] || bash "$post"
  while IFS= read -r f; do ls -la "$f"; done < <(fields '.outputs')
done

if [ ${#FAILED[@]} -gt 0 ]; then
  echo "build.sh: FAILED: ${FAILED[*]}" >&2
  exit 1
fi
echo "build.sh: $([ "$CHECK" = 1 ] && echo 'checked' || echo 'built') ${TARGETS[*]}"
