#!/usr/bin/env bash
# build_faces.sh — NALATI-FINISH B5 / E302: the camp people's face variants → public/assets/nalati/models/people/faces-<v>/
#
#   scripts/img2mesh/build_faces.sh <sharp|hunyuan|trellis|painted|paint> [person …]
#   (paint, E339 D: the Hunyuan3D-2 bust as its own multi-view paint made it, no portrait projected)
#
# Per person (scripts/img2mesh/faces.json): the SHIPPED body (people/<person>.gen.glb, colour-matched, decoded by
# scripts/nalati-faces-decode.mjs) → Blender face_remaster.py (head-first re-UV + re-bake; hunyuan / trellis graft the
# generated bust from ~/ml/img2mesh/out/e302-faces/{hy,t512}/<person>.glb; painted paints the readable face) →
# gltf-transform: <person>.gen.glb (1024² WebP) + <person>.gen.phone.glb (512² WebP), meshopt — the sizes of today's files.
# CPU / Blender only (no model load, no lock). The busts come from the locked batch ~/ml/img2mesh/out/e302-faces/job.sh
# (codex front portraits art/nalati-grasslands/round-12-faces/portrait-*.jpg → cutout → TRELLIS.2 512 / Hunyuan3D-2 full).
set -euo pipefail
V=${1:?usage: build_faces.sh <sharp|hunyuan|trellis|painted> [person …]}; shift
REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
W=$HOME/ml/img2mesh/out/e302-faces
GT=$REPO/node_modules/.bin/gltf-transform
OUT=$REPO/public/assets/nalati/models/people/faces-$V
PEOPLE=("$@"); [ ${#PEOPLE[@]} -gt 0 ] || PEOPLE=(elder herder-dauren herder-erlan child cook)
mkdir -p "$W/body" "$W/final/$V" "$OUT"
for n in "${PEOPLE[@]}"; do
  [ -f "$W/body/$n.glb" ] || node "$REPO/scripts/nalati-faces-decode.mjs" "$REPO/public/assets/nalati/models/people/$n.gen.glb" "$W/body/$n.glb"
  mapfile -t A < <(python3 - "$REPO/scripts/img2mesh/faces.json" "$n" "$V" "$W" <<'PY'
import json, sys
cfg, n, v, w = json.load(open(sys.argv[1]))["people"][sys.argv[2]], sys.argv[2], sys.argv[3], sys.argv[4]
out = ["--neck", str(cfg["neck"])]
if v == "painted":
    out += ["--paint", json.dumps(cfg["paint"]), "--smooth-face", str(cfg.get("smooth_face", 0.85))]
elif v in ("hunyuan", "trellis", "paint"):   # paint (E339 D): the Hunyuan bust with its own paint, no portrait
    g = dict(cfg.get("graft", {}), **cfg.get("graft_" + v, {}))
    out += ["--graft", f"{w}/{'t512' if v == 'trellis' else 'hy'}/{n}.glb", "--bust-neck", str(g.get("neck", 0.5)),
            "--bust-clip", str(g.get("clip", 0.03)), "--bust-grow", str(g.get("grow", 1.0)), "--bust-dz", str(g.get("dz", 0.0)),
            "--bust-dy", str(g.get("dy", 0.0)), "--head-tris", str(g.get("tris", 4000))]
    out += ["--smooth-face", str(g.get("smooth_face", 0.8))]
    if v == "trellis":
        out += ["--no-weld"]
    else:   # E339 graft fix: the bust cut at its own neck (dipping under the jaw), the ring blended, fragments dropped
        out += ["--graft-v2"] + ([] if g.get("neck_auto") is False else ["--bust-neck-auto", "0.45", "0.8"])
    if "beard" in g:
        out += ["--bust-beard", str(g["beard"][0]), str(g["beard"][1])]
    if g.get("project", True) and v != "paint":
        out += ["--bust-image", f"{w}/cut/{n}.png"]
print("\n".join(out))
PY
)
  raw=$W/final/$V/$n.raw.glb
  /opt/homebrew/bin/blender -b -P "$REPO/scripts/img2mesh/face_remaster.py" -- --body "$W/body/$n.glb" --out "$raw" \
    --front "$W/final/$V/$n.front.png" "${A[@]}" 2>&1 | grep -E '^\[face\]|Error|Traceback' || true
  [ -f "$raw" ] || { echo "face_remaster failed for $n ($V)"; exit 1; }
  "$GT" optimize "$raw" "$OUT/$n.gen.glb" --compress meshopt --texture-compress webp --texture-size 1024 --simplify false --instance false > /dev/null
  "$GT" optimize "$raw" "$OUT/$n.gen.phone.glb" --compress meshopt --texture-compress webp --texture-size 512 --simplify false --instance false > /dev/null
  echo "[faces] $V/$n: $(stat -f %z "$OUT/$n.gen.glb") B desktop, $(stat -f %z "$OUT/$n.gen.phone.glb") B phone"
done
