"""Lay out dummy_rig_gate.py's pose renders as one labelled JPEG sheet.

  python3 scripts/practice/gate_sheet.py <gate dir> <out.jpg> [--cols 7] [--title "..."]
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

d, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[sys.argv.index("--cols") + 1]) if "--cols" in sys.argv else 7
title = sys.argv[sys.argv.index("--title") + 1] if "--title" in sys.argv else ""
g = json.load(open(os.path.join(d, "gate.json")))
tiles = [Image.open(os.path.join(d, f"{i:02d}.png")).convert("RGB") for i in range(len(g["poses"]))]
w, h = tiles[0].size
rows = (len(tiles) + cols - 1) // cols
head = 44 if title else 0
sheet = Image.new("RGB", (w * cols, h * rows + head), (13, 27, 38))
draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 15)
    big = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 24)
except OSError:
    font = big = ImageFont.load_default()
if title:
    draw.text((12, 8), title, fill=(143, 227, 255), font=big)
for i, (t, row) in enumerate(zip(tiles, g["poses"])):
    x, y = (i % cols) * w, (i // cols) * h + head
    sheet.paste(t, (x, y))
    draw.rectangle([x, y, x + w - 1, y + 40], fill=(13, 27, 38))
    draw.text((x + 6, y + 3), row["pose"].upper(), fill=(143, 227, 255), font=font)
    draw.text((x + 6, y + 21), f"stretch {row['stretch_max']}x  min area {row['area_min']}", fill=(180, 220, 180), font=font)
    draw.rectangle([x, y, x + w - 1, y + h - 1], outline=(143, 227, 255))
sheet.save(out, quality=86)
print(out, sheet.size)
