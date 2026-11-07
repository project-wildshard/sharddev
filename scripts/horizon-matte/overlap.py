#!/usr/bin/env python3
"""overlap.py [--shard <slug> | --config <json>] <capture-pattern> <painted-pattern> <heading> <out.jpg> --from <h> [--from <h2>] [--keep 0.35]

The chained edit (PINE-HOLLOW-REMASTER PH-L5): independent codex edits of neighbouring headings paint different land in their
overlap, so the stitch has nothing to agree on (a mountain range cut off by a vertical seam). Instead each segment after the
first is painted as a CONTINUATION: its reference is the capture at <heading> with the neighbouring painted segment(s)
reprojected into the side(s) they overlap — only the outer `--keep` fraction of the frame width on that side, so codex
keeps that strip and paints the rest to continue it. Order for six headings: the hero first, then its two neighbours, then
theirs, and the last segment closes the ring with both sides given.

<capture-pattern> / <painted-pattern>: paths with {d} = the heading. The camera model is the shard config's capture
(dir = (cos t, 0, sin t), level pitch, vfov, frame size): screen right = increasing t.
"""
import argparse
import numpy as np
from PIL import Image

import config

ap = config.add_args(argparse.ArgumentParser(description='a chained-edit reference: the capture + the painted neighbours'))
ap.add_argument('capture')
ap.add_argument('painted')
ap.add_argument('heading', type=float)
ap.add_argument('out')
ap.add_argument('--from', dest='src', type=float, action='append', required=True, help='a painted neighbour heading (repeatable)')
ap.add_argument('--keep', type=float, default=0.35, help='the frame-width fraction given on each neighbour side')
ap.add_argument('--feather', type=int, default=24, help='px the given strip fades into the capture over')
ap.add_argument('--onto', default=None, help='paste back: restore the neighbours\' strips onto this finished edit (codex drifts inside the strip it was told to keep), not onto the capture')
a = ap.parse_args()
cfg = config.load(a)
IW, IH, VFOV = cfg['capture']['width'], cfg['capture']['height'], cfg['capture']['vfov']
TV = np.tan(np.radians(VFOV / 2)); TH = TV * IW / IH


def load(p):
    return np.asarray(Image.open(p).convert('RGB').resize((IW, IH), Image.LANCZOS), dtype=np.float32) / 255


def dirs(head):
    """world directions of every pixel of a frame at heading head (deg)"""
    x = ((np.arange(IW) + 0.5) / IW * 2 - 1) * TH
    y = (1 - (np.arange(IH) + 0.5) / IH * 2) * TV
    X, Y = np.meshgrid(x, y)
    t = np.radians(head)
    f = np.array([np.cos(t), 0, np.sin(t)]); r = np.array([-np.sin(t), 0, np.cos(t)]); u = np.array([0, 1.0, 0])
    d = f[None, None] + X[..., None] * r[None, None] + Y[..., None] * u[None, None]
    return d


def sample(img, head, d):
    t = np.radians(head)
    f = np.array([np.cos(t), 0, np.sin(t)]); r = np.array([-np.sin(t), 0, np.cos(t)])
    zc = d @ f; xc = d @ r; yc = d[..., 1]
    ok = zc > 0.05
    zs = np.where(ok, zc, 1)
    px = (xc / zs / TH + 1) / 2 * IW - 0.5
    py = (1 - yc / zs / TV) / 2 * IH - 0.5
    ok &= (px >= 0) & (px <= IW - 1)   # rows past the neighbour's top / bottom edge clamp to it (sky above, far below the strip's range)
    py = np.clip(py, 0, IH - 1)
    x0 = np.clip(np.floor(px).astype(int), 0, IW - 2); y0 = np.clip(np.floor(py).astype(int), 0, IH - 2)
    fx = np.clip(px - x0, 0, 1)[..., None]; fy = np.clip(py - y0, 0, 1)[..., None]
    v = (img[y0, x0] * (1 - fx) + img[y0, x0 + 1] * fx) * (1 - fy) + (img[y0 + 1, x0] * (1 - fx) + img[y0 + 1, x0 + 1] * fx) * fy
    return v, ok


base = load(a.onto if a.onto else a.capture.format(d=int(a.heading)))
d = dirs(a.heading)
out = base.copy()
cols = np.arange(IW)
for s in a.src:
    rel = (s - a.heading + 180) % 360 - 180
    img = load(a.painted.format(d=int(s)))
    v, ok = sample(img, s, d)
    # the side the neighbour sits on: right for rel > 0 (screen right = increasing t)
    edge = IW * (1 - a.keep) if rel > 0 else IW * a.keep
    w = np.clip((cols - edge) / a.feather + 0.5, 0, 1) if rel > 0 else np.clip((edge - cols) / a.feather + 0.5, 0, 1)
    w = w[None, :] * ok
    out = out * (1 - w[..., None]) + v * w[..., None]
Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)).save(a.out, quality=92)
print('wrote', a.out, 'from', a.src)
