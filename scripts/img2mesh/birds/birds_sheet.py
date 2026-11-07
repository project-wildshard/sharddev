#!/usr/bin/env python3
"""Pine Hollow birds (round 16), step 4: the contact sheet — each reference beside its mesh (textured side / top / 3/4 +
the pivot check).

  python3 scripts/img2mesh/birds/birds_sheet.py <refs dir> <render dir> <seg dir> <out.jpg>
"""
import sys

from PIL import Image, ImageDraw, ImageFont

refs, rend, seg, out = sys.argv[1:5]
ROWS = [("raven_perch", "raven-perch"), ("raven_fly", "raven-fly"), ("owl_perch", "owl-perch"),
        ("owl_fly", "owl-fly"), ("wood_perch", "woodpecker-perch"), ("wood_fly", "woodpecker-fly")]
T, HDR = 240, 22
cols = ["reference", "side", "top", "3/4", "pivots (side)", "pivots (top)"]
W = T * len(cols)
sheet = Image.new("RGB", (W, HDR + len(ROWS) * (T + HDR)), (236, 236, 236))
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 15)
except OSError:
    font = ImageFont.load_default()
for j, c in enumerate(cols):
    d.text((j * T + 6, 3), c, fill=(40, 40, 40), font=font)
for i, (mesh, ref) in enumerate(ROWS):
    y = HDR + i * (T + HDR)
    d.text((6, y + 3), f"{mesh}  (ref-{ref}.jpg)", fill=(150, 20, 20), font=font)
    ims = [Image.open(f"{refs}/ref-{ref}.jpg")] + [Image.open(f"{rend}/{mesh}.{v}.png") for v in ("side", "top", "q34")] \
        + [Image.open(f"{seg}/{mesh}.{v}.png") for v in ("side", "top")]
    for j, im in enumerate(ims):
        sheet.paste(im.convert("RGB").resize((T, T), Image.LANCZOS), (j * T, y + HDR))
sheet.save(out, quality=82, optimize=True)
print(out, sheet.size)
