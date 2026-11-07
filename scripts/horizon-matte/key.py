#!/usr/bin/env python3
"""key.py [--shard <slug> | --config <json>] <strip.png> <out_rgba.png> [--night] [--alpha-from other_rgba.png]

Pulls the painted far distance off the painted sky: a per-row, slowly varying sky model S(x, y) estimated from the
strip's own sky pixels, alpha = how far a pixel is from it, colour un-mixed (F = S + (P - S) / a). Below the horizon
row the painted feet are kept for `key.feet` deg then faded out by -`key.fadeTo` deg (Driftwood: 0.6 / 1.6 — the game's
sea covers it). The strip's elevation range and the feet come from src/shards/<shard>/art/horizon-matte.json.
"""
import argparse
import numpy as np
from PIL import Image
from scipy.ndimage import uniform_filter1d, gaussian_filter

import config

ap = config.add_args(argparse.ArgumentParser(description='key a stitched horizon strip to RGBA'))
ap.add_argument('src')
ap.add_argument('out')
ap.add_argument('--night', action='store_true', help='the night strip: a darker sky classifier')
ap.add_argument('--alpha-from', default=None, help='take alpha from this keyed RGBA (the night strip reuses the day alpha)')
ARGS = ap.parse_args()
CFG = config.load(ARGS)
EL_MIN, EL_MAX = CFG['strip']['elMin'], CFG['strip']['elMax']
FEET, FADE_TO = CFG['key']['feet'], CFG['key']['fadeTo']
src, out = ARGS.src, ARGS.out
night = ARGS.night
P = np.asarray(Image.open(src).convert('RGB'), dtype=np.float32) / 255
H, W, _ = P.shape
el = EL_MAX - (EL_MAX - EL_MIN) * (np.arange(H) + 0.5) / H

mx = P.max(-1); mn = P.min(-1)
sat = (mx - mn) / np.maximum(mx, 1e-4)
r, g, b = P[..., 0], P[..., 1], P[..., 2]
if night:
    skyish = (b > r + 0.03) & (b >= g) & (mx < 0.55)
else:
    skyish = (b > r + 0.12) & (b >= g) & (sat > 0.22)
SKYLINE = CFG['key'].get('mode') == 'skyline'
if SKYLINE:
    # photoreal land under a plain sky (Pine Hollow): the sky is whatever is smooth and connected to the strip's top — a flood
    # from the top row through low-texture pixels, stopped by the skyline's edge and by the horizon (below it all is land).
    # Colour classifiers fail here: the pale haze band on the horizon is neither blue nor saturated, and hazy far ridges are.
    from scipy.ndimage import label, binary_opening
    elg0 = el[:, None] * np.ones((1, W))
    Pb = gaussian_filter(P, sigma=(1.0, 1.0, 0), mode=['nearest', 'wrap', 'nearest'])
    tex = (np.abs(np.diff(Pb, axis=0, prepend=Pb[:1])) + np.abs(np.diff(Pb, axis=1, prepend=Pb[:, -1:]))).sum(-1)
    tex = gaussian_filter(tex, 0.8, mode=['nearest', 'wrap'])
    top_sky = tex[elg0 > EL_MAX - 3]
    THR = CFG['key'].get('texture', max(0.012, float(np.percentile(top_sky, 99.5)) * 2.5))
    smooth = (tex < THR) & (elg0 > CFG['key'].get('horizon', -0.3))
    lab, _ = label(smooth)
    ids = np.unique(lab[0][lab[0] > 0])
    skyish = binary_opening(np.isin(lab, ids), structure=np.ones((3, 3)))
    print(f'skyline key: texture threshold {THR:.4f}, sky {skyish.mean() * 100:.1f} % of the strip')

# sky model: windowed mean of sky-classified pixels along each row (wrapping), then filled / smoothed vertically
WIN = 301
S = np.zeros_like(P); cnt = np.zeros((H, W), np.float32)
m = skyish.astype(np.float32)
pad = WIN // 2
def wrapfilt(a):
    ap = np.concatenate([a[:, -pad:], a, a[:, :pad]], 1)
    return uniform_filter1d(ap, WIN, axis=1)[:, pad:pad + W]
cnt = wrapfilt(m)
for c in range(3):
    S[..., c] = wrapfilt(P[..., c] * m) / np.maximum(cnt, 1e-4)
# rows / places with too few sky samples: carry the value down from above
ok = cnt > 0.08
for y in range(1, H):
    bad = ~ok[y]
    S[y, bad] = S[y - 1, bad]
    ok[y, bad] = ok[y - 1, bad]
S = gaussian_filter(S, sigma=(3, 12, 0), mode=['nearest', 'wrap', 'nearest'])

d = np.sqrt(((P - S) ** 2).sum(-1))
lo, hi = (0.035, 0.14) if not night else (0.03, 0.12)
t = np.clip((d - lo) / (hi - lo), 0, 1)
A = t * t * (3 - 2 * t)
A = gaussian_filter(A, 0.6)
# fill enclosed holes (hazy blue-grey rock faces read as sky): low-alpha pockets not connected to the open sky above
from scipy.ndimage import binary_fill_holes, binary_closing
solid = binary_closing(A > 0.45, structure=np.ones((5, 5)), iterations=1)
solid[int(H * (EL_MAX - 0) / (EL_MAX - EL_MIN)):, :] = True           # the sea / ground closes every pocket from below
wrapw = 64
tiled = np.concatenate([solid[:, -wrapw:], solid, solid[:, :wrapw]], 1)
filled = binary_fill_holes(tiled)[:, wrapw:wrapw + W]
A = np.maximum(A, gaussian_filter(filled.astype(np.float32), 0.8) * filled)
# below the horizon: keep the painted feet FEET deg, then fade the painted sea out
elg = el[:, None] * np.ones((1, W))
below = np.clip((elg + FADE_TO) / (FADE_TO - FEET), 0, 1)   # 1 at -FEET deg, 0 at -FADE_TO (Driftwood 0.6 / 1.6)
A = np.where(elg < 0, np.where(elg > -FEET, 1.0, below), A)
# very top: nothing
A *= np.clip((EL_MAX - 0.3 - elg) / 2.0, 0, 1)

if SKYLINE:
    # land = everything not flooded as sky, softened ~1 px; inside the sky, a difference key keeps what the flood leaked
    # into (a pale far ridge with no edge) as partial alpha over the live sky
    # the flood stops a few px short of the true skyline (the texture measure is blurred), so the land's top rim and the sky
    # just over it take the difference key; sky farther than ~0.8° from land is clear (the feathered sky-tone steps of the
    # stitch are no land)
    from scipy.ndimage import distance_transform_edt
    land = ~skyish
    rim = land & (distance_transform_edt(land) <= 4)
    near = skyish & (distance_transform_edt(skyish) <= 13)
    # the sky there is the colour right above the column's skyline (the pale haze band on the horizon), not the row mean
    yb = np.clip(H - 1 - np.argmax(skyish[::-1], axis=0), 3, H - 1)   # each column's lowest sky row
    Sc = np.stack([P[np.clip(yb - k, 0, H - 1), np.arange(W)] for k in range(4)]).mean(0)
    Sc = gaussian_filter(Sc, sigma=(4, 0), mode=['wrap', 'nearest'])
    S = np.where((rim | near)[..., None], Sc[None], S)
    dS = np.sqrt(((P - S) ** 2).sum(-1))
    tS = np.clip((dS - lo) / (hi - lo), 0, 1)
    aD = tS * tS * (3 - 2 * tS)
    # a distance key calls a half-sky edge pixel solid: where the pixel above is not solid land yet, project the pixel on
    # the line sky -> the land 2 px below it instead (the edge's true coverage)
    P2 = np.concatenate([P[2:], P[-2:]], 0)
    L2 = P2 - S
    aP = np.clip(((P - S) * L2).sum(-1) / np.maximum((L2 ** 2).sum(-1), 1e-4), 0, 1)
    aboveLand = np.concatenate([aD[:1], aD[:-1]], 0) > 0.95
    aD = np.where(aboveLand, aD, np.minimum(aD, aP))
    A = np.where(rim | near, aD, land.astype(np.float32))
    A = gaussian_filter(A, 0.5, mode=['nearest', 'wrap'])
    A = np.where(elg < CFG['key'].get('horizon', -0.3), 1.0, A)
    A *= np.clip((EL_MAX - 0.3 - elg) / 2.0, 0, 1)
if ARGS.alpha_from:
    other = np.asarray(Image.open(ARGS.alpha_from), dtype=np.float32) / 255
    A = other[..., 3]

a = np.maximum(A, 0.5 if SKYLINE else 1e-3)[..., None]   # photoreal edges: un-mix gently (a pale rim amplified to white otherwise)
F = np.clip(S + (P - S) / a, 0, 1)
F = np.where(A[..., None] > 0.02, F, S)   # fully transparent texels keep the sky colour (no dark halos in the mips)
F = np.where(elg[..., None] < 0, P, F)
rgba = np.dstack([F, A])
Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), 'RGBA').save(out)
Image.fromarray((A * 255).astype(np.uint8)).save(out.replace('.png', '-alpha.png'))
# preview: over a checker of two sky colours
bg1 = np.array([0.36, 0.62, 0.95]); bg2 = np.array([0.95, 0.55, 0.35])
chk = ((np.arange(W)[None, :] // 512) % 2).astype(np.float32)[..., None]
bg = bg1 * (1 - chk) + bg2 * chk
comp = F * A[..., None] + bg * (1 - A[..., None])
Image.fromarray((comp * 255).astype(np.uint8)).save(out.replace('.png', '-comp.jpg'), quality=88)
print('wrote', out, 'mean alpha above horizon', float(A[elg > 0].mean()))
