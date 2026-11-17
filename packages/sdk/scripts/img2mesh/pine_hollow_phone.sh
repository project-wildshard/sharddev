#!/usr/bin/env bash
# pine_hollow_phone.sh [dir] — after build_props.py: move each <ref>-phone/<ref>-phone.glb (the LOD0 mesh at 512²) to
# <ref>/<ref>.phone.glb, the phone tier's copy (src/client/engine/boot/bytes.ts tierUrl swaps it in for the phone), and drop the folder.
set -euo pipefail
D=${1:-public/assets/models/pine-hollow-hero}
for p in "$D"/*-phone; do
  [ -d "$p" ] || continue
  ref=$(basename "$p" -phone)
  mkdir -p "$D/$ref"
  mv "$p/$ref-phone.glb" "$D/$ref/$ref.phone.glb"
  rm -rf "$p"
  echo "$ref.phone.glb $(stat -f %z "$D/$ref/$ref.phone.glb") B"
done
