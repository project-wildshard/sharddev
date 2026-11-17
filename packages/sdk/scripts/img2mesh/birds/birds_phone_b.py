"""E322 F-M5 (Jake picked B): the phone's birds with a sharper atlas — `birds.phone.glb`, rewritten in place.

birds_pack.py's birds.phone.glb carries the desktop atlas halved (2048×1024 → 1024×512, WebP q80, 34 KB): every bird tile is
256², and the raven — the bird you see closest, two to four of them on every kill — reads soft. Tiles 6 and 7 of the
4×2 grid are filler no mesh samples. B lays the same tiles out on a 1024² atlas:

    +-------------+-------------+
    | raven_perch | raven_fly   |   512² each: the desktop's own texels (no downsample)
    +-------------+------+------+
    | owl_perch   |owl_fl|wood_p|   owl_perch 512² (the desktop's texels); the rest 256² (Lanczos from the desktop tiles,
    |             +------+------+   a light unsharp mask), as sharp as the phone's today or sharper
    |             |wood_f| grey |
    +-------------+------+------+

and rewrites each mesh's TEXCOORD_0 into its new rect (the geometry, the pivots, birds.json: unchanged). WebP q92: a
high-quality source for the KTX2 twin scripts/bake-ktx2.mjs bakes (re-run it after this).

  python3 scripts/img2mesh/birds/birds_phone_b.py public/assets/pine-hollow/life/birds.glb public/assets/pine-hollow/life/birds.phone.glb public/assets/pine-hollow/life/birds.phone.glb
"""
import io
import json
import struct
import sys

import numpy as np
from PIL import Image, ImageFilter

desk_path, phone_path, out_path = sys.argv[1:4]


def read(p):
    b = open(p, "rb").read()
    n = struct.unpack("<I", b[12:16])[0]
    j = json.loads(b[20:20 + n])
    bl = struct.unpack("<I", b[20 + n:24 + n])[0]
    return j, bytearray(b[28 + n:28 + n + bl])


def view_bytes(j, bn, v):
    bv = j["bufferViews"][v]
    o = bv.get("byteOffset", 0)
    return bytes(bn[o:o + bv["byteLength"]])


dj, dbin = read(desk_path)
desk = Image.open(io.BytesIO(view_bytes(dj, dbin, dj["images"][0]["bufferView"]))).convert("RGB")
DW, DH = desk.size  # 2048 × 1024: 4 × 2 tiles of 512²
T = DW // 4
# the old grid (col, row) of each mesh (birds.json `tile`), and its new rect on the 1024² atlas (x, y, size) in pixels
OLD = {"raven_perch": (0, 0), "raven_fly": (1, 0), "owl_perch": (2, 0), "owl_fly": (3, 0), "wood_perch": (0, 1), "wood_fly": (1, 1)}
NEW = {"raven_perch": (0, 0, 512), "raven_fly": (512, 0, 512), "owl_perch": (0, 512, 512),
       "owl_fly": (512, 512, 256), "wood_perch": (768, 512, 256), "wood_fly": (512, 768, 256)}
N = 1024
atlas = Image.new("RGB", (N, N), (128, 128, 128))
for name, (c, r) in OLD.items():
    tile = desk.crop((c * T, r * T, (c + 1) * T, (r + 1) * T))
    x, y, s = NEW[name]
    if s != T:
        tile = tile.resize((s, s), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=0.8, percent=45, threshold=1))
    atlas.paste(tile, (x, y))
buf = io.BytesIO()
atlas.save(buf, "WEBP", quality=92, method=6)
img = buf.getvalue()

pj, pbin = read(phone_path)
# the new UVs, per mesh: (u, v) in the old tile → the same place in the new rect (glTF uv: v = 0 at the top)
swap = {}
for node in pj["nodes"]:
    if "mesh" not in node:
        continue
    name = node["name"]
    prim = pj["meshes"][node["mesh"]]["primitives"][0]
    a = pj["accessors"][prim["attributes"]["TEXCOORD_0"]]
    assert a["componentType"] == 5126 and a["type"] == "VEC2" and a.get("byteOffset", 0) == 0
    bv = pj["bufferViews"][a["bufferView"]]
    assert bv.get("byteStride", 8) == 8
    o = bv.get("byteOffset", 0)
    uv = np.frombuffer(bytes(pbin[o:o + a["count"] * 8]), np.float32).reshape(-1, 2).copy()
    c, r = OLD[name]
    x, y, s = NEW[name]
    lu, lv = uv[:, 0] * 4 - c, uv[:, 1] * 2 - r  # 0..1 in the old tile
    assert lu.min() > -1e-3 and lu.max() < 1 + 1e-3 and lv.min() > -1e-3 and lv.max() < 1 + 1e-3, name
    uv[:, 0] = (x + lu * s) / N
    uv[:, 1] = (y + lv * s) / N
    a["min"] = uv.min(0).tolist()
    a["max"] = uv.max(0).tolist()
    swap[a["bufferView"]] = uv.astype(np.float32).tobytes()
swap[pj["images"][0]["bufferView"]] = img
pj["images"][0]["name"] = "atlas.phone.b"

# rebuild buffer 0: every bufferView in order, 4-byte aligned
parts, at = [], 0
for i, bv in enumerate(pj["bufferViews"]):
    data = swap.get(i, view_bytes(pj, pbin, i))
    pad = (4 - at % 4) % 4
    if pad:
        parts.append(b"\0" * pad)
        at += pad
    bv["byteOffset"] = at
    bv["byteLength"] = len(data)
    parts.append(data)
    at += len(data)
pad = (4 - at % 4) % 4
parts.append(b"\0" * pad)
at += pad
pj["buffers"][0]["byteLength"] = at
bn = b"".join(parts)
jb = json.dumps(pj, separators=(",", ":")).encode()
jb += b" " * ((4 - len(jb) % 4) % 4)
out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(jb) + 8 + len(bn)) + struct.pack("<II", len(jb), 0x4E4F534A) + jb + struct.pack("<II", len(bn), 0x004E4942) + bn
open(out_path, "wb").write(out)
print(out_path, len(out), "bytes; atlas", len(img), "bytes")
