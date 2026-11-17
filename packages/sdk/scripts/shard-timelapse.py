#!/usr/bin/env python3
"""shard-timelapse.py — the time-lapses of a shard being built (E387), from scripts/shard-progress.mjs captures.

  python3 scripts/shard-timelapse.py <slug> [--secs=0.9]

Reads every progress/<slug>/<YYYYMMDD-HHMM>-<sha8>/ (oldest first) and writes, in progress/<slug>/:
  timelapse-heroes.mp4  the four hero views (h1..h4) as a 2x2 grid per capture, captioned date · sha · label
  timelapse-<shot>.mp4  one per shot id (first frame, each hero, the aerials)
  clips.mp4             every capture's orbit clip, one after another, captioned
All 540 px wide portrait H.264 (Claude iOS plays them inline; ~1 Mb/s, the memory note on SendUserFile sizes).
A frame the capture's QA still flagged after its re-take (meta.json `qa`, E394: a loading screen, title card, menu or
blank frame) is left out.
"""
import glob, json, os, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
args = [a for a in sys.argv[1:] if not a.startswith('--')]
if not args:
    sys.exit('usage: shard-timelapse.py <slug> [--secs=0.9]')
SLUG = args[0]
SECS = float(next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--secs=')), '0.9'))
BASE = os.path.join(ROOT, 'progress', SLUG)
caps = sorted(d for d in glob.glob(os.path.join(BASE, '*-*')) if os.path.isdir(d) and os.path.exists(os.path.join(d, 'meta.json')))
if not caps:
    sys.exit(f'no captures in progress/{SLUG}/ (run scripts/shard-progress.mjs first)')
metas = [json.load(open(os.path.join(d, 'meta.json'))) for d in caps]
FONT = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
font, small = ImageFont.truetype(FONT, 26), ImageFont.truetype(FONT, 20)
W, H = 540, 1168  # 390x844 portrait at 540 wide (even)

def flagged(m, s):
    """capture QA (E394): shard-progress.mjs could not get this shot to show the 3D world, even after a re-take"""
    return bool(((m.get('qa') or {}).get('shots') or {}).get(s, {}).get('flagged'))

def caption(m, extra=''):
    w = m['when']
    return f"{w[0:4]}-{w[4:6]}-{w[6:8]} {w[9:11]}:{w[11:13]} · {m['sha'][:8]}" + (f" · {m['label']}" if m.get('label') else '') + (f' · {extra}' if extra else '')

def frame(img, m, i, n, title):
    out = Image.new('RGB', (W, H), '#05070c')
    im = img.copy(); im.thumbnail((W, H - 70))
    out.paste(im, ((W - im.width) // 2, 0))
    d = ImageDraw.Draw(out)
    d.text((14, H - 62), title, font=font, fill='white')
    d.text((14, H - 30), caption(m), font=small, fill=(170, 200, 225))
    d.text((W - 14, H - 30), f'{i + 1}/{n}', font=small, fill=(170, 200, 225), anchor='ra')
    return out

def encode(frames, out, secs=SECS):
    with tempfile.TemporaryDirectory() as t:
        lst = os.path.join(t, 'list.txt')
        with open(lst, 'w') as f:
            for k, fr in enumerate(frames):
                p = os.path.join(t, f'{k:04d}.png'); fr.save(p)
                f.write(f"file '{p}'\nduration {secs if k < len(frames) - 1 else 2.5}\n")
            f.write(f"file '{p}'\n")
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-vf', 'fps=30,format=yuv420p',
                        '-c:v', 'libx264', '-b:v', '900k', '-maxrate', '1200k', '-bufsize', '2400k', '-movflags', '+faststart', out], check=True)
    print('wrote', os.path.relpath(out, ROOT), f'({len(frames)} frames)')

shot_ids = []
for m in metas:
    for s in m['shots']:
        if s not in shot_ids: shot_ids.append(s)
heroes = [s for s in shot_ids if s[:2] in ('h1', 'h2', 'h3', 'h4')][:4]

# the 2x2 hero grid
grid = []
for i, (d, m) in enumerate(zip(caps, metas)):
    g = Image.new('RGB', (W, H - 70), '#05070c'); cw, ch = W // 2, (H - 70) // 2
    for k, s in enumerate(heroes):
        p = os.path.join(d, f'{s}.jpg')
        if os.path.exists(p) and not flagged(m, s):
            im = Image.open(p).convert('RGB'); im.thumbnail((cw, ch)); g.paste(im, ((k % 2) * cw + (cw - im.width) // 2, (k // 2) * ch))
    grid.append(frame(g, m, i, len(caps), f'{SLUG} · the four hero views'))
encode(grid, os.path.join(BASE, 'timelapse-heroes.mp4'))
# one per shot
for s in shot_ids:
    frames = [frame(Image.open(os.path.join(d, f'{s}.jpg')).convert('RGB'), m, i, len(caps), f'{SLUG} · {s}')
              for i, (d, m) in enumerate(zip(caps, metas)) if os.path.exists(os.path.join(d, f'{s}.jpg')) and not flagged(m, s)]
    if frames: encode(frames, os.path.join(BASE, f'timelapse-{s}.mp4'))
# the clips, captioned, one after another
clips = [(d, m) for d, m in zip(caps, metas) if os.path.exists(os.path.join(d, 'clip.mp4'))]
if clips:
    with tempfile.TemporaryDirectory() as t:
        parts = []
        for k, (d, m) in enumerate(clips):
            p = os.path.join(t, f'{k:03d}.mp4')
            # the caption is a PIL overlay (this ffmpeg has no drawtext)
            cap = Image.new('RGBA', (540, 44), (0, 0, 0, 140))
            ImageDraw.Draw(cap).text((12, 11), caption(m), font=small, fill='white')
            cp = os.path.join(t, f'{k:03d}.png'); cap.save(cp)
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', os.path.join(d, 'clip.mp4'), '-i', cp, '-filter_complex',
                            '[0]scale=540:-2[v];[v][1]overlay=0:main_h-overlay_h,format=yuv420p',
                            '-an', '-c:v', 'libx264', '-b:v', '900k', '-r', '30', p], check=True)
            parts.append(p)
        lst = os.path.join(t, 'clips.txt')
        with open(lst, 'w') as f: f.write(''.join(f"file '{p}'\n" for p in parts))
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', '-movflags', '+faststart',
                        os.path.join(BASE, 'clips.mp4')], check=True)
        print('wrote', os.path.relpath(os.path.join(BASE, 'clips.mp4'), ROOT), f'({len(parts)} clips)')
