"""A/B(/C) board for the Hi3D refine experiment (HI3D-REFINE H5): one prop's arms side by side, iPhone portrait.

  python3 scripts/img2mesh/ab_board.py <renders dir> <out.jpg> "<title>" --arm A "today" <dir> --arm B "Hi3D" <dir> \
      [--arm C "Hi3D + repaint" <dir>] name=refpath [name=refpath …]

Each <dir> is a build_props.py output dir (<name>/<name>.glb + <name>.json), every arm built with the same
driftwood_post.py arguments: A as today, B with REFINE=<hi3d dir>, C with GEN=<hi3d_paint.py dir> as well. Per prop,
three rows: the reference, then every arm at yaw 35°; every arm at yaw 215° (the far side, where Hi3D invents detail);
a 3× close-up of the 215° view's centre. The first column under the reference lists each arm's triangles and bytes.
Every render is scripts/img2mesh/render_still.py of the final game GLB (same light, same camera), cached in
<renders dir>. Each cell is labelled on the image itself.
"""
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
BLENDER = os.environ.get("BLENDER") or "/opt/homebrew/bin/blender"
W = 1170  # iPhone portrait width
GAP = 12
LABEL = 52
BG, INK, DIM, PANEL = (14, 26, 36), (235, 242, 244), (150, 175, 186), (200, 208, 214)


def render(glb, png, yaw, size):
    if not os.path.exists(png):
        subprocess.run([BLENDER, "-b", "-P", os.path.join(HERE, "render_still.py"), "--", glb, png, "--size",
                        str(size), "--yaw", str(yaw)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return Image.open(png)


def fit(img, cell):
    img = img.convert("RGB")
    img.thumbnail((cell, cell))
    out = Image.new("RGB", (cell, cell), PANEL)
    out.paste(img, ((cell - img.width) // 2, (cell - img.height) // 2))
    return out


def stats(d, name):
    glb = os.path.join(d, name, name + ".glb")
    meta = json.load(open(os.path.join(d, name, name + ".json")))
    return f"{meta.get('tris', '?')} tris · {os.path.getsize(glb) / 1024:.0f} KB"


def main():
    rdir, out, title = sys.argv[1:4]
    rest, arms, pairs = sys.argv[4:], [], []
    while rest:
        if rest[0] == "--arm":
            arms.append(tuple(rest[1:4]))
            rest = rest[4:]
        else:
            pairs.append(rest.pop(0).split("=", 1))
    cell = (W - (len(arms) + 2) * GAP) // (len(arms) + 1)
    os.makedirs(rdir, exist_ok=True)
    font = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 22)
    small = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 17)
    head = 70
    block = 3 * (cell + LABEL + GAP)
    sheet = Image.new("RGB", (W, head + len(pairs) * (block + 16) + GAP), BG)
    d = ImageDraw.Draw(sheet)
    d.text((GAP, 12), title, fill=INK, font=font)
    d.text((GAP, 42), " · ".join(f"{t} = {what}" for t, what, _ in arms) + " · same tris budget", fill=DIM, font=small)
    y = head
    for name, ref in pairs:
        for row, (yaw, view) in enumerate(((35, "yaw 35°"), (215, "yaw 215°"), (None, "close-up ×3"))):
            x = GAP
            if row == 0:
                sheet.paste(fit(Image.open(ref), cell), (x, y))
                d.text((x + 8, y + 6), "ref", fill=(20, 20, 20), font=font)
                d.text((x, y + cell + 6), name, fill=INK, font=small)
                d.text((x, y + cell + 28), "reference", fill=DIM, font=small)
            elif row == 1:
                for i, (tag, _, arm) in enumerate(arms):
                    d.text((x, y + 8 + i * 48), tag, fill=INK, font=font)
                    d.text((x, y + 34 + i * 48), stats(arm, name), fill=DIM, font=small)
            x += cell + GAP
            for tag, what, arm in arms:
                glb = os.path.join(arm, name, name + ".glb")
                if yaw is None:
                    big = render(glb, os.path.join(rdir, f"{name}.{tag}.close.png"), 215, 3 * cell)
                    c = big.width // 3
                    img = big.crop((c, c, 2 * c, 2 * c))
                else:
                    img = render(glb, os.path.join(rdir, f"{name}.{tag}.{yaw}.png"), yaw, cell)
                sheet.paste(fit(img, cell), (x, y))
                d.text((x + 8, y + 6), tag, fill=(20, 20, 20), font=font)
                d.text((x, y + cell + 6), f"{tag} · {what}", fill=INK, font=small)
                d.text((x, y + cell + 28), view, fill=DIM, font=small)
                x += cell + GAP
            y += cell + LABEL + GAP
        y += 16
    sheet.save(out, quality=82, optimize=True)
    print(out, sheet.size)


if __name__ == "__main__":
    main()
