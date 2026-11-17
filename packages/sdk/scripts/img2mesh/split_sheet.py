"""Split a reference sheet of separate objects on white into one square image per object (for image-to-3D: one
object per generation gets the whole voxel grid, a sheet of six shares it and packs them into a pile).

  python scripts/img2mesh/split_sheet.py art/driftwood-isle/round-8-assets/ref-clutter.jpg OUTDIR [--min 0.004]

Writes OUTDIR/<stem>-<n>.png (RGBA: the white background keyed out, 12 % margin), numbered left to right, top to
bottom, and prints each crop's box. Needs numpy, pillow, scipy.
"""
import argparse
import os

import numpy as np
from PIL import Image
from scipy import ndimage

ap = argparse.ArgumentParser()
ap.add_argument("sheet")
ap.add_argument("out")
ap.add_argument("--min", type=float, default=0.004, help="drop blobs smaller than this share of the image")
ap.add_argument("--thresh", type=int, default=238, help="a pixel is background when all channels are above this")
a = ap.parse_args()

im = np.array(Image.open(a.sheet).convert("RGB"))
fg = ~(im > a.thresh).all(-1)
fg = ndimage.binary_closing(fg, iterations=3)
fg = ndimage.binary_fill_holes(fg)
lab, n = ndimage.label(fg)
boxes = ndimage.find_objects(lab)
H, W = fg.shape
items = []
for i, sl in enumerate(boxes):
    area = (lab[sl] == i + 1).sum()
    if area < a.min * H * W:
        continue
    items.append((sl[0].start, sl[1].start, sl[0].stop, sl[1].stop, i + 1))
items.sort(key=lambda b: (round(b[0] / (H / 3)), b[1]))
os.makedirs(a.out, exist_ok=True)
stem = os.path.splitext(os.path.basename(a.sheet))[0].removeprefix("ref-")
for k, (y0, x0, y1, x1, li) in enumerate(items, 1):
    mask = lab[y0:y1, x0:x1] == li
    rgba = np.dstack([im[y0:y1, x0:x1], (mask * 255).astype(np.uint8)])
    h, w = mask.shape
    side = int(max(h, w) * 1.24)
    canvas = np.zeros((side, side, 4), dtype=np.uint8)
    oy, ox = (side - h) // 2, (side - w) // 2
    canvas[oy:oy + h, ox:ox + w] = rgba
    Image.fromarray(canvas).resize((768, 768), Image.LANCZOS).save(os.path.join(a.out, f"{stem}-{k}.png"))
    print(f"{stem}-{k}: box x{x0}-{x1} y{y0}-{y1}")
