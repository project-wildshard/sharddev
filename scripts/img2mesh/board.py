"""Compose the Driftwood hero-prop comparison board: per prop, concept-art crop | the image-to-3D reference |
the new hero asset (Blender still) | the current in-game procedural model (Model Explorer capture).

  python scripts/img2mesh/board.py <hero-stills dir> <live-captures dir> art/driftwood-isle/round-8-assets/board.jpg

<hero-stills dir>/hero-<row>.png come from render_still.py; <live-captures dir>/live-<catalog id>.png are 1280x900
screenshots of `?explore=model&model=<id>` (the HUD is cropped away here).
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ART = os.path.join(REPO, "art")
HERO, LIVE, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
SPAWN = "driftwood-fp-spawn.png"
LEFT = "driftwood-isle/round-4-remaster/mockup-2-fp-left.jpg"
WRECK = "driftwood-fp-poi-2-wreck-cove.png"
SHRINE = "driftwood-fp-poi-3-shrine.png"
LIVE_BOX = (250, 150, 1030, 740)  # the turntable, without the Model Explorer's HUD

# row: label, concept (file, box), reference, hero still, live capture (or None), note
ROWS = [
    ("PALMS  a · b · c · frond", (SPAWN, (360, 160, 730, 440)), "ref-palm-a.jpg", "palms", "palm",
     "palm-a 1991 · palm-b 1968 · palm-c 1583 · frond-b 410 tris"),
    ("BOULDERS  ×5", (LEFT, (740, 850, 1024, 1050)), "ref-boulders.jpg", "boulders", "boulder",
     "220–600 tris each, 1.7 m max"),
    ("DRIFTWOOD  ×4", (LEFT, (40, 950, 430, 1100)), "ref-driftwood.jpg", "driftwood", None,
     "380–520 tris each · in game: Props.ts logs (not in the catalog)"),
    ("PIER PILING + ROPE", (SPAWN, (190, 700, 330, 1000)), "ref-piling.jpg", "piling", "pier",
     "700 tris, 2.6 m · in game: the pier (its pilings)"),
    ("SAILBOAT", (SPAWN, (0, 120, 250, 1020)), "ref-sailboat.jpg", "sailboat", "boat", "2505 tris, 6.5 m"),
    ("THATCHED HUT", (SPAWN, (230, 270, 490, 470)), "ref-hut.jpg", "hut", "hut", "2992 tris, 5.6 m"),
    ("SHIPWRECK  LOD0 · LOD1", (WRECK, (350, 200, 900, 730)), "ref-wreck.jpg", "wreck", "wreck",
     "2989 + 1420 tris, 14 m (remeshed plank shells)"),
    ("RING SHRINE", (SHRINE, (280, 80, 660, 700)), "ref-shrine.jpg", "shrine", "shrine",
     "2173 tris, 5.5 m · shown: .tex.glb (512² atlas keeps the rune)"),
    ("SHELLS + STARFISH", (LEFT, (140, 1060, 350, 1250)), "ref-clutter.jpg", "clutter", None,
     "139–238 tris each · in game: ground-cover scatter"),
    ("COCONUTS", (SPAWN, (560, 190, 700, 320)), "ref-coco.jpg", "coco", None, "cluster 360 · nut 159 · half 178 tris"),
]
COLS = ["CONCEPT ART", "REFERENCE (codex image_gen)", "NEW: TRELLIS.2 → BLENDER", "CURRENT: IN-GAME PROCEDURAL"]
C = 360          # cell
LW = 250         # label column
HEAD = 96
W = LW + 4 * C
H = HEAD + len(ROWS) * C
BG, FG, MUTED, LINE, ACCENT = (13, 27, 38), (230, 238, 244), (140, 170, 190), (40, 70, 90), (143, 227, 255)


def font(size):
    for f in ("/System/Library/Fonts/SFNSMono.ttf", "/System/Library/Fonts/Menlo.ttc", "/Library/Fonts/Arial.ttf"):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def fit(im, box_w, box_h, bg):
    im = im.convert("RGB")
    im.thumbnail((box_w, box_h), Image.LANCZOS)
    c = Image.new("RGB", (box_w, box_h), bg)
    c.paste(im, ((box_w - im.width) // 2, (box_h - im.height) // 2))
    return c


board = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(board)
d.text((16, 14), "DRIFTWOOD ISLE · HERO PROPS · ROUND 8", font=font(26), fill=ACCENT)
d.text((16, 50), "concept crop · clean reference · new asset (Eevee, same sun, flat-shaded, vertex colour + AO) · "
       "current procedural model (Model Explorer, live build)", font=font(14), fill=MUTED)
for i, t in enumerate(COLS):
    d.text((LW + i * C + 10, HEAD - 24), t, font=font(13), fill=ACCENT)
for r, (label, (cfile, cbox), ref, hero, live, note) in enumerate(ROWS):
    y = HEAD + r * C
    d.line([(0, y), (W, y)], fill=LINE, width=1)
    d.text((14, y + 14), label, font=font(16), fill=FG)
    words, line, ly = note.split(" "), "", y + 46
    for w in words:  # wrap the note into the label column
        if len(line) + len(w) > 26:
            d.text((14, ly), line, font=font(12), fill=MUTED)
            ly += 17
            line = ""
        line += w + " "
    d.text((14, ly), line, font=font(12), fill=MUTED)
    cells = [
        Image.open(os.path.join(ART, cfile)).crop(cbox),
        Image.open(os.path.join(ART, "driftwood-isle/round-8-assets", ref)),
        Image.open(os.path.join(HERO, f"hero-{hero}.png")),
        Image.open(os.path.join(LIVE, f"live-{live}.png")).crop(LIVE_BOX) if live else None,
    ]
    for i, im in enumerate(cells):
        x = LW + i * C
        if im is None:
            d.rectangle([x + 6, y + 6, x + C - 6, y + C - 6], outline=LINE)
            d.text((x + 24, y + C // 2 - 8), "not in the Model Explorer", font=font(13), fill=MUTED)
            continue
        board.paste(fit(im, C - 12, C - 12, (220, 225, 230) if i == 2 else (255, 255, 255)), (x + 6, y + 6))
board.save(OUT, quality=80, optimize=True, progressive=True)
print(OUT, board.size, os.path.getsize(OUT) // 1024, "KB")
