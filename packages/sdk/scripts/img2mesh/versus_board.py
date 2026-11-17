"""TRELLIS.2 vs Hunyuan3D-2 side by side: per prop, the reference image | TRELLIS.2 render | Hunyuan3D-2 render.

  python scripts/img2mesh/versus_board.py <trellis_dir> <hunyuan_dir> <renders_dir> <out.jpg> name=refpath [name=refpath …]

Both generations are rendered with scripts/img2mesh/render_still.py (same Eevee light, same 3/4 camera) into
<renders_dir>/<name>.trellis.png and <name>.hunyuan.png (skipped when they already exist). Triangle counts and
generation seconds come from each output's .json sidecar when present, else from the glb itself (tris only).
"""
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
BLENDER = "/opt/homebrew/bin/blender"
CELL = 440
LABEL = 64


def find(d, name):
    for cand in (f"{name}.glb", f"ref-{name}.glb"):
        p = os.path.join(d, cand)
        if os.path.exists(p):
            return p
    return None


def sidecar(glb):
    j = glb[:-4] + ".json"
    if not os.path.exists(j):
        return {}
    try:
        with open(j) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def stat_line(meta):
    tris = meta.get("tris") or meta.get("faces") or meta.get("triangles")
    secs = meta.get("seconds") or meta.get("gen_s") or meta.get("time_s") or meta.get("elapsed")
    if secs is None and isinstance(meta.get("shape_s"), (int, float)):  # Hunyuan3D-2's hy3d_batch sidecar: shape + paint
        secs = meta["shape_s"] + (meta.get("paint_s") or 0)
    if isinstance(secs, dict):
        secs = sum(v for v in secs.values() if isinstance(v, (int, float)))
    bits = []
    if tris:
        bits.append(f"{int(tris):,} tris")
    if isinstance(secs, (int, float)):
        bits.append(f"{secs:.0f} s")
    return " · ".join(bits)


def render(glb, png):
    if os.path.exists(png):
        return
    subprocess.run([BLENDER, "-b", "-P", os.path.join(HERE, "render_still.py"), "--", glb, png, "--size", str(CELL)],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def fit(img, w, h, bg):
    img = img.convert("RGB")
    img.thumbnail((w, h))
    out = Image.new("RGB", (w, h), bg)
    out.paste(img, ((w - img.width) // 2, (h - img.height) // 2))
    return out


def main():
    tdir, hdir, rdir, out = sys.argv[1:5]
    pairs = [a.split("=", 1) for a in sys.argv[5:]]
    os.makedirs(rdir, exist_ok=True)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 20)
        small = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 16)
    except OSError:
        font = small = ImageFont.load_default()
    bg, ink, dim = (14, 26, 36), (235, 242, 244), (150, 175, 186)
    head = 56
    rows = []
    for name, ref in pairs:
        t, h = find(tdir, name), find(hdir, name)
        cells = [(fit(Image.open(ref), CELL, CELL, (200, 208, 214)), f"{name} · reference", "")]
        for label, glb in (("TRELLIS.2", t), ("Hunyuan3D-2", h)):
            if glb is None:
                cells.append((Image.new("RGB", (CELL, CELL), (60, 30, 30)), f"{label}", "missing"))
                continue
            png = os.path.join(rdir, f"{name}.{label.split('.')[0].lower().replace('3d-2', '')}.png")
            render(glb, png)
            cells.append((fit(Image.open(png), CELL, CELL, (200, 208, 214)), label, stat_line(sidecar(glb))))
        rows.append(cells)
    W = CELL * 3 + 4 * 12
    H = head + len(rows) * (CELL + LABEL + 12) + 12
    sheet = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(sheet)
    d.text((12, 16), "TRELLIS.2 vs Hunyuan3D-2 · same reference, same light · raw textured generations", fill=ink, font=font)
    y = head
    for cells in rows:
        x = 12
        for img, title, stats in cells:
            sheet.paste(img, (x, y))
            d.text((x, y + CELL + 8), title, fill=ink, font=font)
            if stats:
                d.text((x, y + CELL + 34), stats, fill=dim, font=small)
            x += CELL + 12
        y += CELL + LABEL + 12
    sheet.save(out, quality=82, optimize=True)
    print(out, sheet.size)


if __name__ == "__main__":
    main()
