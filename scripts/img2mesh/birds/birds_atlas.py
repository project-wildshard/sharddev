#!/usr/bin/env python3
"""Pine Hollow birds (round 16), step 2: the six 1024² bakes → one colour-matched base-colour atlas.

  python3 scripts/img2mesh/birds/birds_atlas.py --post <post dir> --refs <cutout dir> --out <dir> [--grade scripts/img2mesh/birds/birds.json]

Layout (4×2 tiles of 512², row 0 at the TOP of the image): raven_perch, raven_fly, owl_perch, owl_fly /
wood_perch, wood_fly, white, neutral grey. Per tile: the islands (from <mesh>.json uvTris) keep the bake, the gutters are
push-pull filled (no dark mip bleed), then the island pixels are matched in CIELAB to the reference's foreground (the
cutout's alpha): the mean fully (or grade.lMean), the spread clamped (grade.k), optional value clamps (grade.lMin/lMax),
then grade.eyes: an iris + pupil painted where a cylinder meets the front-most surface (<mesh>.pos.npy, the position bake).
Writes atlas.png (2048×1024), atlas.phone.png (1024×512) and tiles/<mesh>.png.
"""
import argparse
import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ORDER = ["raven_perch", "raven_fly", "owl_perch", "owl_fly", "wood_perch", "wood_fly"]
REF = {"raven_perch": "ref-raven-perch", "raven_fly": "ref-raven-fly", "owl_perch": "ref-owl-perch",
       "owl_fly": "ref-owl-fly", "wood_perch": "ref-woodpecker-perch", "wood_fly": "ref-woodpecker-fly"}
TILE = 512


def srgb2lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin2srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
WP = np.array([0.95047, 1.0, 1.08883])


def rgb2lab(rgb):
    xyz = srgb2lin(rgb) @ M.T / WP
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def lab2rgb(lab):
    fy = (lab[..., 0] + 16) / 116
    fx, fz = fy + lab[..., 1] / 500, fy - lab[..., 2] / 200
    f = np.stack([fx, fy, fz], -1)
    xyz = np.where(f ** 3 > 0.008856, f ** 3, (f - 16 / 116) / 7.787) * WP
    return lin2srgb(xyz @ np.linalg.inv(M).T)


def pushpull(img, mask):
    """fill every pixel outside `mask` from the nearest island colour (a mask-weighted pyramid)"""
    levels = [(img * mask[..., None], mask.astype(np.float64))]
    while levels[-1][1].shape[0] > 1:
        c, w = levels[-1]
        h2, w2 = c.shape[0] // 2, c.shape[1] // 2
        c = c[:h2 * 2, :w2 * 2].reshape(h2, 2, w2, 2, 3).sum((1, 3))
        w = w[:h2 * 2, :w2 * 2].reshape(h2, 2, w2, 2).sum((1, 3))
        levels.append((c, w))
    fill = levels[-1][0] / np.maximum(levels[-1][1], 1e-9)[..., None]
    for c, w in reversed(levels[:-1]):
        up = np.repeat(np.repeat(fill, 2, 0), 2, 1)[:c.shape[0], :c.shape[1]]
        own = c / np.maximum(w, 1e-9)[..., None]
        fill = np.where((w > 0)[..., None], own, up)
    return np.where(mask[..., None], img, fill)


ap = argparse.ArgumentParser()
ap.add_argument("--post", required=True)
ap.add_argument("--refs", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--grade", default="")
a = ap.parse_args()
os.makedirs(os.path.join(a.out, "tiles"), exist_ok=True)
G = json.load(open(a.grade)).get("_grade", {}) if a.grade else {}

atlas = np.zeros((2 * TILE, 4 * TILE, 3))
atlas[TILE:, 2 * TILE:3 * TILE] = 1.0      # tile 6: pure white
atlas[TILE:, 3 * TILE:] = 0.5              # tile 7: neutral grey
report = {}
for i, name in enumerate(ORDER):
    bake = np.asarray(Image.open(os.path.join(a.post, name + ".png")).convert("RGB"), dtype=np.float64) / 255
    S = bake.shape[0]
    meta = json.load(open(os.path.join(a.post, name + ".json")))
    mk = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(mk)
    for tri in meta["uvTris"]:
        d.polygon([(u * S, (1 - v) * S) for u, v in tri], fill=255)
    mask_big = np.asarray(mk.filter(ImageFilter.MaxFilter(3))) > 127      # 1 px grow: the bake's own edge texels
    core = np.asarray(mk.filter(ImageFilter.MinFilter(5))) > 127          # stats away from island edges
    lab = rgb2lab(bake)
    ref = np.asarray(Image.open(os.path.join(a.refs, REF[name] + ".png")).convert("RGBA"), dtype=np.float64) / 255
    fg = ref[..., 3] > 0.9
    rl = rgb2lab(ref[..., :3][fg])
    tl = lab[core]
    g = G.get(name, {})
    k = g.get("k", [0.8, 1.25])
    out = lab.copy()
    stats = {}
    for ch in range(3):
        mt, st = tl[:, ch].mean(), tl[:, ch].std() + 1e-6
        mr, sr = rl[:, ch].mean(), rl[:, ch].std()
        if ch == 0 and "lMean" in g:   # a hand target for the mean lightness (the raven: the photo's sheen lifts its mean)
            mr = g["lMean"]
        kk = float(np.clip(sr / st, k[0], k[1]))
        mean_w = g.get("meanW", 1.0)
        out[..., ch] = (lab[..., ch] - mt) * kk + mt + (mr - mt) * mean_w
        stats["Lab"[ch]] = {"tile": [round(mt, 1), round(st, 1)], "ref": [round(mr, 1), round(sr, 1)], "k": round(kk, 2)}
    if "lMin" in g or "lMax" in g:
        out[..., 0] = np.clip(out[..., 0], g.get("lMin", 0), g.get("lMax", 100))
    rgb = np.clip(lab2rgb(out), 0, 1)
    for eye in g.get("eyes", []):
        # paint an iris + pupil where a cylinder along `dir` through `at` (glTF) meets the front-most surface
        posp = os.path.join(a.post, name + ".pos.npy")
        Pm = np.load(posp).astype(np.float64)
        Pg = np.stack([Pm[..., 0], Pm[..., 2], -Pm[..., 1]], -1)      # Blender → glTF
        e, dv = np.array(eye["at"], dtype=np.float64), np.array(eye["dir"], dtype=np.float64)
        dv /= np.linalg.norm(dv)
        D = Pg - e
        along = D @ dv
        perp = np.linalg.norm(D - along[..., None] * dv, axis=-1)
        r = eye["r"]
        cand = (perp < r * 1.3) & mask_big
        if not cand.any():
            print("eye missed", name, eye["at"]); continue
        front = cand & (along > along[cand].max() - eye.get("depth", 0.02))
        iris = np.array([int(eye.get("iris", "#e3b320")[i:i + 2], 16) for i in (1, 3, 5)]) / 255
        t = np.clip(perp / r, 0, 1.3)
        col = iris * (1.0 - 0.35 * np.clip((t - 0.7) / 0.3, 0, 1))[..., None]          # a darker rim
        col = np.where((t < eye.get("pupil", 0.5))[..., None], 0.03, col)
        edge = np.clip((1.3 - t) / 0.3, 0, 1)[..., None]                                  # feather into the face
        sel = front[..., None]
        rgb = np.where(sel, rgb * (1 - edge) + col * edge, rgb)
        print(f"eye painted {name} {int(front.sum())} texels")
    rgb = pushpull(rgb, mask_big)
    tile = Image.fromarray((rgb * 255 + 0.5).astype(np.uint8)).resize((TILE, TILE), Image.LANCZOS)
    tile.save(os.path.join(a.out, "tiles", name + ".png"))
    col, row = i % 4, i // 4
    atlas[row * TILE:(row + 1) * TILE, col * TILE:(col + 1) * TILE] = np.asarray(tile, dtype=np.float64) / 255
    v = (rgb[core] * 255).max(-1)
    stats["value_p10_p50_p90"] = [int(np.percentile(v, p)) for p in (10, 50, 90)]
    report[name] = stats
    print(name, json.dumps(stats), flush=True)
A = Image.fromarray((atlas * 255 + 0.5).astype(np.uint8))
A.save(os.path.join(a.out, "atlas.png"))
A.resize((2 * TILE, TILE), Image.LANCZOS).save(os.path.join(a.out, "atlas.phone.png"))
json.dump(report, open(os.path.join(a.out, "atlas-report.json"), "w"), indent=1)
print("atlas", A.size)
