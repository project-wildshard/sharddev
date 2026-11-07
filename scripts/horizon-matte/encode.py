#!/usr/bin/env python3
"""encode.py [--shard <slug> | --config <json>] <keyed_rgba.png> <out-base> — a keyed strip → the game's WebP textures.

A PBR shard (Pine Hollow) draws its painted horizon in the linear HDR scene, before the post chain's AgX tone map, so the
painting (display-referred: it was painted over the game's own tone-mapped frames) is sent back through AgX's inverse
(three's AgXToneMapping, exposure 1: outset⁻¹, the sigmoid's inverse, exp2, inset⁻¹, Rec.2020 → sRGB) to the scene-linear
values that tone-map back to it. Those are stored sRGB-encoded divided by `encode.scale` (the shader multiplies it back),
so 8 bits keep the dark forest. Writes <out-base>.webp (the strip's size) and <out-base>-phone.webp (half), lossy with
alpha at `encode.quality`. `encode.tonemap: "none"` stores the painting as is (a shard without a tone map).
"""
import argparse
import subprocess
import tempfile
import os
import numpy as np
from PIL import Image

import config

ap = config.add_args(argparse.ArgumentParser(description='encode a keyed horizon strip for the game'))
ap.add_argument('src')
ap.add_argument('out')
a = ap.parse_args()
cfg = config.load(a)
E = cfg.get('encode', {})
SCALE = float(E.get('scale', 1.0))
Q = int(E.get('quality', 86))

# three.js AgXToneMapping (tonemapping_pars_fragment); GLSL mat3(c0, c1, c2) is column-major
def colmat(*cols):
    return np.array(cols, dtype=np.float64).T
SRGB_TO_2020 = colmat((0.6274, 0.0691, 0.0164), (0.3293, 0.9195, 0.0880), (0.0433, 0.0113, 0.8956))
R2020_TO_SRGB = colmat((1.6605, -0.1246, -0.0182), (-0.5876, 1.1329, -0.1006), (-0.0728, -0.0083, 1.1187))
INSET = colmat((0.856627153315983, 0.137318972929847, 0.11189821299995), (0.0951212405381588, 0.761241990602591, 0.0767994186031903), (0.0482516061458583, 0.101439036467562, 0.811302368396859))
OUTSET = colmat((1.1271005818144368, -0.1413297634984383, -0.14132976349843826), (-0.11060664309660323, 1.157823702216272, -0.11060664309660294), (-0.016493938717834573, -0.016493938717834257, 1.2519364065950405))
MIN_EV, MAX_EV = -12.47393, 4.026069


def sigmoid(x):
    x2 = x * x; x4 = x2 * x2
    return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232


def agx(c):
    c = c @ SRGB_TO_2020.T @ INSET.T
    c = np.clip((np.log2(np.maximum(c, 1e-10)) - MIN_EV) / (MAX_EV - MIN_EV), 0, 1)
    c = sigmoid(c) @ OUTSET.T
    c = np.power(np.maximum(c, 0), 2.2) @ R2020_TO_SRGB.T
    return np.clip(c, 0, 1)


XS = np.linspace(0, 1, 8193); YS = np.maximum.accumulate(sigmoid(XS))


def agx_inverse(d):
    c = d @ np.linalg.inv(R2020_TO_SRGB).T
    c = np.power(np.maximum(c, 0), 1 / 2.2) @ np.linalg.inv(OUTSET).T
    c = np.interp(c, YS, XS)
    c = np.exp2(c * (MAX_EV - MIN_EV) + MIN_EV)
    return np.maximum(c @ np.linalg.inv(INSET).T @ np.linalg.inv(SRGB_TO_2020).T, 0)


def srgb_decode(v):
    return np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)


def srgb_encode(v):
    v = np.clip(v, 0, 1)
    return np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(v, 1 / 2.4) - 0.055)


im = np.asarray(Image.open(a.src).convert('RGBA'), dtype=np.float64) / 255
rgb, alpha = im[..., :3], im[..., 3:]
if E.get('tonemap', 'none') == 'agx':
    lin = agx_inverse(srgb_decode(rgb))
    back = srgb_encode(agx(lin))
    err = np.abs(back - rgb)[alpha[..., 0] > 0.5]
    print(f'AgX round trip on the land: mean {err.mean() * 255:.2f} / p99 {np.percentile(err, 99) * 255:.2f} (8-bit steps); '
          f'land linear max {lin[alpha[..., 0] > 0.5].max():.2f} / p99.9 {np.percentile(lin[alpha[..., 0] > 0.5], 99.9):.2f}, land clipped over scale {SCALE}: {(lin > SCALE).any(-1)[alpha[..., 0] > 0.5].mean() * 100:.2f} %')
    rgb = srgb_encode(lin / SCALE)
out = np.dstack([rgb, alpha])
img = Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA')
H, W = img.height, img.width
for suffix, size in (('', (W, H)), ('-phone', (W // 2, H // 2))):
    dst = f'{a.out}{suffix}.webp'
    im2 = img if size == (W, H) else img.resize(size, Image.LANCZOS)
    with tempfile.TemporaryDirectory() as td:
        png = os.path.join(td, 'x.png'); im2.save(png)
        # cwebp keeps the alpha plane's edges exact (-exact: no RGB bleed under transparent texels is dropped)
        subprocess.run(['cwebp', '-quiet', '-q', str(Q), '-alpha_q', '100', '-exact', '-m', '6', png, '-o', dst], check=True)
    print('wrote', dst, os.path.getsize(dst) // 1024, 'KB')
