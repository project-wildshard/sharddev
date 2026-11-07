#!/usr/bin/env python3
"""stitch.py [--shard <slug> | --config <json>] <pattern-with-{d}> <out.png> [--seams seams.npy] [--save-seams seams.npy]

Projects the shard's perspective segments (its capture: headings t, dir = (cos t, 0, sin t), pitch 0, vfov, frame size;
Driftwood: six 1536x1024 at t = 0,60..300, vfov 72) into one cylindrical strip W x H (u = azimuth, rows linear in
elevation EL_MAX..EL_MIN), joins neighbours along a min-cost vertical seam inside their overlap and feathers it.
Seamless at the 0/360 wrap by construction (the wrap is the middle of segment 0). Parameters:
src/shards/<shard>/art/horizon-matte.json (capture, strip, stitch).
"""
import argparse
import numpy as np
from PIL import Image

import config

ap = config.add_args(argparse.ArgumentParser(description='stitch a shard\'s horizon segments into one strip'))
ap.add_argument('pattern', help='segment paths with {d} = the heading in degrees')
ap.add_argument('out')
ap.add_argument('--seams', default=None, help='reuse these seams (the night strip on the day seams)')
ap.add_argument('--save-seams', default=None)
ARGS = ap.parse_args()
CFG = config.load(ARGS)
W, H = CFG['strip']['width'], CFG['strip']['height']
EL_MIN, EL_MAX = CFG['strip']['elMin'], CFG['strip']['elMax']
HEADS = CFG['capture']['headings']
VFOV = CFG['capture']['vfov']
IW, IH = CFG['capture']['width'], CFG['capture']['height']
TV = np.tan(np.radians(VFOV / 2)); TH = TV * IW / IH
FEATHER = CFG['stitch']['feather']  # px each side
FEATHER_SKY = CFG['stitch']['featherSky']  # px each side in the open sky
SEAM_WIN = CFG['stitch']['seamWindow']  # deg each side of a boundary
HALF = 360 / len(HEADS) / 2  # each segment owns +-HALF deg around its heading


def bilinear(img, x, y):
    h, w, c = img.shape
    x = np.clip(x, 0, w - 1.001); y = np.clip(y, 0, h - 1.001)
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int)
    fx = (x - x0)[..., None]; fy = (y - y0)[..., None]
    a = img[y0, x0]; b = img[y0, x0 + 1]; c_ = img[y0 + 1, x0]; d = img[y0 + 1, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c_ * (1 - fx) + d * fx) * fy


def project(img, head_deg):
    th = (np.arange(W) + 0.5) / W * 2 * np.pi
    ph = np.radians(EL_MAX - (EL_MAX - EL_MIN) * (np.arange(H) + 0.5) / H)
    TH_, PH = np.meshgrid(th, ph)
    rel = TH_ - np.radians(head_deg)
    xc = np.cos(PH) * np.sin(rel); zc = np.cos(PH) * np.cos(rel); yc = np.sin(PH)
    ok = zc > 0.05
    zs = np.where(ok, zc, 1)
    px = IW / 2 + (xc / zs) / TH * IW / 2 - 0.5
    py = IH / 2 - (yc / zs) / TV * IH / 2 - 0.5
    ok &= (px >= 0) & (px <= IW - 1) & (py >= 0) & (py <= IH - 1)
    out = bilinear(img, px, py)
    return out, ok


def seam_path(cost):
    """min-cost top-to-bottom path through cost[h, w], steps of -1/0/+1 per row"""
    h, w = cost.shape
    acc = cost.copy(); back = np.zeros((h, w), int)
    for r in range(1, h):
        prev = acc[r - 1]
        cand = np.stack([np.r_[np.inf, prev[:-1]], prev, np.r_[prev[1:], np.inf]])
        k = np.argmin(cand, axis=0)
        acc[r] += cand[k, np.arange(w)]
        back[r] = k - 1
    path = np.zeros(h, int); path[-1] = int(np.argmin(acc[-1]))
    for r in range(h - 1, 0, -1):
        path[r - 1] = path[r] + back[r, path[r]]
    return path


def main():
    pat, out = ARGS.pattern, ARGS.out
    load_seams, save_seams = ARGS.seams, ARGS.save_seams
    layers, masks = [], []
    for d in HEADS:
        img = np.asarray(Image.open(pat.format(d=d)).convert('RGB').resize((IW, IH), Image.LANCZOS), dtype=np.float32) / 255
        l, m = project(img, d)
        layers.append(l); masks.append(m)
    # ownership: segment k owns [t_k - HALF, t_k + HALF]; each boundary b_k at t_k + HALF is replaced by a seam in a
    # +-SEAM_WIN deg window (Driftwood: 30, 11)
    xs = np.arange(W)
    own = np.zeros((H, W), int)
    colt = (xs + 0.5) / W * 360
    for k, d in enumerate(HEADS):
        rel = (colt - d + 180) % 360 - 180
        own[:, np.abs(rel) <= HALF] = k
    seams = np.load(load_seams) if load_seams else np.zeros((len(HEADS), H), int)
    win = int(SEAM_WIN / 360 * W)
    for k, d in enumerate(HEADS):
        k2 = (k + 1) % len(HEADS)
        bx = int(round((d + HALF) / 360 * W))
        cols = (np.arange(bx - win, bx + win)) % W
        if not load_seams:
            A = layers[k][:, cols]; B = layers[k2][:, cols]
            cost = np.abs(A - B).sum(-1)
            cost += 0.02  # prefer straight-ish
            ok = masks[k][:, cols] & masks[k2][:, cols]
            cost[~ok] = 1e3
            seams[k] = seam_path(cost)
        path = seams[k]
        for r in range(H):
            c = path[r]
            own[r, cols[:c]] = k
            own[r, cols[c:]] = k2
    if save_seams: np.save(save_seams, seams)
    # feathered blend: per-layer weight = box-blurred ownership indicator (horizontal, wraps)
    res = np.zeros((H, W, 3), np.float32); wsum = np.zeros((H, W, 1), np.float32)
    # feather per row: wide in the open sky high up (hides the segments' sky-tone steps), narrow where the content is
    el = EL_MAX - (EL_MAX - EL_MIN) * (np.arange(H) + 0.5) / H
    SKY_FROM = CFG['stitch'].get('featherSkyFrom', 7)  # deg where the wide sky feather starts (over the tallest content; Driftwood 7)
    rad = np.round(FEATHER + (FEATHER_SKY - FEATHER) * np.clip((el - SKY_FROM) / 6, 0, 1)).astype(int)
    PADN = 160
    for k in range(len(HEADS)):
        ind = (own == k).astype(np.float32)
        pad = np.concatenate([ind[:, -PADN:], ind, ind[:, :PADN]], 1)
        cs = np.cumsum(np.pad(pad, ((0, 0), (1, 0))), axis=1)
        wgt = np.zeros((H, W), np.float32)
        for r in range(H):
            f = rad[r]; i0 = np.arange(W) + PADN - f; i1 = np.arange(W) + PADN + f + 1
            wgt[r] = (cs[r, i1] - cs[r, i0]) / (2 * f + 1)
        wgt *= masks[k]
        res += layers[k] * wgt[..., None]; wsum += wgt[..., None]
    res /= np.maximum(wsum, 1e-6)
    Image.fromarray((np.clip(res, 0, 1) * 255 + 0.5).astype(np.uint8)).save(out)
    print('wrote', out)


if __name__ == '__main__':
    main()
