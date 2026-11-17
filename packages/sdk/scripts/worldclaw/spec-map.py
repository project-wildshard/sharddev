#!/usr/bin/env python3
"""T6's helper (E406), the plan map: a shard's spec.json drawn as a plan (places as discs with
their role and height, routes as typed legs, gates), for shards whose overhead capture shows roofs, not floors (a vertical
city). Usage: python3 scripts/worldclaw/spec-map.py <spec.json> <out.png> [<design.md>]
Coordinates: x east, z south (north up); the frame fits the places and routes with a margin of one place radius."""
import json
import math
import re
import sys

from PIL import Image, ImageDraw, ImageFont

ROLE_COLOR = {'spawn': (242, 166, 64), 'hub': (143, 227, 255), 'landmark': (255, 214, 102), 'vista': (185, 140, 255),
              'traversal': (95, 224, 160), 'boss': (255, 107, 107), 'secret': (200, 200, 200)}
LEG_COLOR = {'walk': (232, 241, 245), 'stair': (95, 224, 160), 'grapple': (255, 107, 107), 'sled': (90, 225, 200),
             'rope': (242, 166, 64), 'climb': (255, 214, 102)}


def font(size):
    for f in ('/System/Library/Fonts/Menlo.ttc', '/System/Library/Fonts/Supplemental/Arial.ttf'):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main():
    spec = json.load(open(sys.argv[1]))
    out = sys.argv[2]
    names = {}
    if len(sys.argv) > 3:
        m = re.search(r'```json worldclaw\n([\s\S]*?)\n```', open(sys.argv[3]).read())
        if m:
            names = {p['id']: p['name'] for p in json.loads(m.group(1))['places']}
    pts = [(p['x'], p['z']) for p in spec['places']]
    for r in spec['routes']:
        for leg in r['legs']:
            pts += [tuple(q) for q in leg['pts']]
    pad = max([p['r'] for p in spec['places']] + [10])
    x0, x1 = min(p[0] for p in pts) - pad, max(p[0] for p in pts) + pad
    z0, z1 = min(p[1] for p in pts) - pad, max(p[1] for p in pts) + pad
    W = 1600
    scale = W / max(x1 - x0, z1 - z0)
    H = int((z1 - z0) * scale) + 160
    img = Image.new('RGB', (W, H), (8, 18, 27))
    d = ImageDraw.Draw(img)
    P = lambda x, z: ((x - x0) * scale, (z - z0) * scale + 80)
    # a 10 m grid
    step = 10
    for gx in range(int(math.floor(x0 / step)) * step, int(x1) + step, step):
        d.line([P(gx, z0), P(gx, z1)], fill=(18, 32, 44), width=1)
    for gz in range(int(math.floor(z0 / step)) * step, int(z1) + step, step):
        d.line([P(x0, gz), P(x1, gz)], fill=(18, 32, 44), width=1)
    for p in spec['places']:
        cx, cy = P(p['x'], p['z'])
        r = p['r'] * scale
        col = ROLE_COLOR.get(p['role'], (143, 227, 255))
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=col, width=3)
    for r in spec['routes']:
        for leg in r['legs']:
            d.line([P(*q) for q in leg['pts']], fill=LEG_COLOR.get(leg['mode'], (232, 241, 245)), width=5)
    f, fs = font(26), font(19)
    stacked = {}
    for p in spec['places']:
        cx, cy = P(p['x'], p['z'])
        # places at one spot (a vertical city's levels) stack their labels instead of overprinting
        key = (round(cx / 40), round(cy / 40))
        dy = stacked.get(key, 0) * 56
        stacked[key] = stacked.get(key, 0) + 1
        col = ROLE_COLOR.get(p['role'], (143, 227, 255))
        d.ellipse([cx - 7, cy - 7, cx + 7, cy + 7], fill=col)
        label = names.get(p['id'], p['id'])
        y = f"  +{p['y']:g} m" if 'y' in p else ''
        d.text((cx + 12, cy - 14 + dy), label.upper(), fill=(232, 241, 245), font=f)
        d.text((cx + 12, cy + 14 + dy), f"{p['role']}{y}", fill=col, font=fs)
    d.text((24, 22), f"{spec['slug'].upper()} · PLAN FROM spec.json (x east, z south, north up)", fill=(143, 227, 255), font=f)
    # the scale bar: 20 m
    bx, by = 24, H - 40
    d.line([(bx, by), (bx + 20 * scale, by)], fill=(232, 241, 245), width=4)
    d.text((bx + 20 * scale + 10, by - 14), '20 m', fill=(232, 241, 245), font=fs)
    lx = W - 520
    for i, (mode, col) in enumerate(LEG_COLOR.items()):
        if any(leg['mode'] == mode for r in spec['routes'] for leg in r['legs']):
            d.line([(lx, by - i * 26), (lx + 40, by - i * 26)], fill=col, width=5)
            d.text((lx + 50, by - i * 26 - 12), mode, fill=col, font=fs)
    img.save(out)
    print(out, img.size)


if __name__ == '__main__':
    main()
