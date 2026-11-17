#!/usr/bin/env bash
# e304_faces.sh — E304: the face remaster for the models outside Nalati's camp (Pine Hollow's hamlet, the Drowned Captain):
#
#   scripts/img2mesh/e304_faces.sh <hunyuan|hunyuanref|paint|sharp> <name …>   (paint: the codex bust, no projection)
#
# Per name (scripts/img2mesh/faces-e304.json): the shipped body (desktop + phone, decoded by nalati-faces-decode.mjs) →
# Blender face_remaster.py (head-first re-UV + re-bake; hunyuan grafts the Hunyuan3D-2 bust ~/ml/img2mesh/out/e304-faces/
# hy/<bust>.glb made from the codex portrait, the portrait projected on its face; sharp only re-UVs; a PBR model also
# re-bakes its normal map) → gltf-transform: <dir>/faces-<variant>/<name>.glb (1024² WebP) + <name>.phone.glb (the
# phone body, a lighter head, 512² WebP), meshopt. CPU / Blender only (no model load, no lock). The busts come from the
# locked batch ~/ml/img2mesh/out/e304-faces/job.sh (portrait → BiRefNet cutout → Hunyuan3D-2 full).
set -euo pipefail
V=${1:?usage: e304_faces.sh <hunyuan|sharp> <name …>}; shift
REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
W=$HOME/ml/img2mesh/out/e304-faces
GT=$REPO/node_modules/.bin/gltf-transform
mkdir -p "$W/body" "$W/final/$V"
for n in "$@"; do
  mapfile -t CFG < <(python3 - "$REPO/scripts/img2mesh/faces-e304.json" "$n" <<'PY'
import json, sys
c = json.load(open(sys.argv[1]))["models"][sys.argv[2]]
print(c["body"]); print(c["phone"]); print(c["dir"]); print("1" if c.get("pbr") else "0"); print(c.get("bust", sys.argv[2]))
print(json.dumps(c))
PY
)
  body=${CFG[0]} phone=${CFG[1]} dir=${CFG[2]} pbr=${CFG[3]} bust=${CFG[4]} json=${CFG[5]}
  [ "$V" = hunyuanref ] && bust=$n      # C: the bust from the model's own reference crop, not the codex portrait
  out=$REPO/$dir/faces-$V; mkdir -p "$out"
  for tier in desktop phone; do
    src=$body; suf=""; tris=4000; tex=1024
    if [ $tier = phone ]; then src=$phone; suf=".phone"; tris=2400; tex=1024; fi
    [ -f "$W/body/$n$suf.glb" ] || node "$REPO/scripts/nalati-faces-decode.mjs" "$REPO/$src" "$W/body/$n$suf.glb" > /dev/null
    mapfile -t A < <(python3 - "$json" "$V" "$W" "$bust" "$tris" "$pbr" <<'PY'
import json, sys
c, v, w, bust, tris, pbr = json.loads(sys.argv[1]), sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5], sys.argv[6] == "1"
out = ["--neck", str(c["neck"])]
if pbr:
    out += ["--normal-map"]
if v.startswith("hunyuan") or v == "paint":
    g = c.get("graft", {})
    out += ["--graft", f"{w}/hy/{bust}.glb", "--bust-image", f"{w}/cut/{bust}.png", "--bust-neck", str(g.get("neck", 0.6)),
            "--bust-clip", str(g.get("clip", 0.015)), "--bust-grow", str(g.get("grow", 1.0)), "--bust-dz", str(g.get("dz", 0.0)),
            "--bust-dy", str(g.get("dy", 0.0)), "--head-tris", tris, "--smooth-face", str(g.get("smooth_face", 0.0 if pbr else 0.8))]
    if v == "paint":   # E339 D: Hunyuan3D-2's own all-round paint, no portrait projected
        i = out.index("--bust-image"); del out[i:i + 2]
    if g.get("v2", True):    # E339 graft fix: the bust cut at its own neck, the ring blended, fragments dropped
        out += ["--graft-v2", "--bust-neck-auto", "0.45", "0.8", "--bust-fit", g.get("fit", "height")]
    if "beard" in g:
        out += ["--bust-beard", str(g["beard"][0]), str(g["beard"][1])]
    if "ptop" in g:
        out += ["--project-top", str(g["ptop"])]
    if "body_collar" in g:
        out += ["--body-collar", str(g["body_collar"][0]), str(g["body_collar"][1])]
    if "collar" in g:
        out += ["--bust-collar", str(g["collar"][0]), str(g["collar"][1])]
print("\n".join(out))
PY
)
    raw=$W/final/$V/$n$suf.raw.glb
    /opt/homebrew/bin/blender -b -P "$REPO/scripts/img2mesh/face_remaster.py" -- --body "$W/body/$n$suf.glb" --out "$raw" --tex $tex \
      --front "$W/final/$V/$n$suf.front.png" "${A[@]}" 2>&1 | grep -E '^\[face\]|Error|Traceback' || true
    [ -f "$raw" ] || { echo "face_remaster failed for $n$suf ($V)"; exit 1; }
    size=1024; [ $tier = phone ] && size=512
    "$GT" optimize "$raw" "$out/$n$suf.glb" --compress meshopt --texture-compress webp --texture-size $size --simplify false --instance false > /dev/null
    echo "[faces] $V/$n$suf: $(stat -f %z "$out/$n$suf.glb") B (was $(stat -f %z "$REPO/$src") B)"
  done
done
