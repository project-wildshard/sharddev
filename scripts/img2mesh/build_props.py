#!/usr/bin/env python3
"""build_props.py <props.json> <out dir> [ref ...] — image-to-3D generations → game props, for any shard (PH-0.3).

  python3 scripts/img2mesh/build_props.py src/shards/driftwood-isle/art/hero-props.json public/assets/models/driftwood-hero
  python3 scripts/img2mesh/build_props.py <pine-hollow props>.json public/assets/models/<dir> lantern   # just these refs

The prop list JSON: {"gen": dir of <ref>.glb generations, "stage": staging dir, "args": [driftwood_post.py args for
every prop, e.g. "--keep-texture" for a photoreal shard], "props": [{"ref", "args": "driftwood_post.py args"}]}
(env GEN / STAGE / BLENDER override). Step 1 runs scripts/img2mesh/driftwood_post.py (Blender, headless) per prop into
the staging folder; step 2 meshopt-compresses every staged asset (only the named refs' when refs are given) into
<out dir>/<asset>/ with gltf-transform (EXT_meshopt_compression + quantization: the loader needs setMeshoptDecoder),
plus its <asset>.json. build_driftwood.sh is this with Driftwood's list; its outputs are byte-for-byte as before.

Hi3D (HI3D-REFINE, E494): a list key "refine": {"dir", "res"} (or env REFINE / REFINE_RES) passes driftwood_post.py
--geo <dir>/<ref>.hi3d<res>.obj, made by scripts/img2mesh/hi3d_refine.py; a prop with "refine": false keeps its own
geometry. A prop whose refined mesh is missing is skipped, never built unrefined.
"""
import glob
import json
import os
import re
import shlex
import shutil
import subprocess
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
POST = os.path.join(REPO, 'scripts', 'img2mesh', 'driftwood_post.py')

if len(sys.argv) < 3:
    sys.exit(__doc__)
spec = json.load(open(sys.argv[1]))
DEST = os.path.abspath(sys.argv[2])
refs = sys.argv[3:]
GEN = os.environ.get('GEN') or os.path.expanduser(spec['gen'])
STAGE = os.environ.get('STAGE') or os.path.expanduser(spec['stage'])
BLENDER = os.environ.get('BLENDER') or '/opt/homebrew/bin/blender'
common = [str(x) for x in spec.get('args', [])]
REFINE = os.environ.get('REFINE') or os.path.expanduser(spec.get('refine', {}).get('dir', ''))
REFINE_RES = os.environ.get('REFINE_RES') or str(spec.get('refine', {}).get('res', 1024))
os.makedirs(STAGE, exist_ok=True)
os.makedirs(DEST, exist_ok=True)

SHOW = re.compile(r'^DRIFTWOOD_POST|Error|Traceback')
for prop in spec['props']:
    ref = prop['ref']
    if refs and ref not in refs:
        continue
    src = os.path.join(GEN, ref + '.glb')
    if not os.path.isfile(src):
        print(f'skip {ref}: no {src}')
        continue
    geo = []
    if REFINE and prop.get('refine', True) is not False:
        obj = os.path.join(REFINE, f'{ref}.hi3d{REFINE_RES}.obj')
        if not os.path.isfile(obj):
            print(f'skip {ref}: no {obj} (run hi3d_refine.py)')
            continue
        geo = ['--geo', obj]
    run = subprocess.run([BLENDER, '-b', '-P', POST, '--', '--in', src, '--out', STAGE, *common, *geo, *shlex.split(prop['args'])],
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors='replace', check=False)
    for line in run.stdout.splitlines():
        if SHOW.search(line):
            print(line)

# meshopt every staged asset of this run into the out dir
for d in sorted(glob.glob(os.path.join(STAGE, '*', ''))):
    a = os.path.basename(os.path.normpath(d))
    meta = os.path.join(d, a + '.json')
    if not os.path.isfile(meta):
        continue
    info = json.load(open(meta))
    if refs and re.sub(r'\.glb$', '', info.get('source', '')) not in refs:
        continue
    os.makedirs(os.path.join(DEST, a), exist_ok=True)
    for g in sorted(glob.glob(os.path.join(d, '*.glb'))):
        subprocess.run(['npx', '--prefix', REPO, 'gltf-transform', 'meshopt', g, os.path.join(DEST, a, os.path.basename(g)),
                        '--level', 'medium'], stdout=subprocess.DEVNULL, check=True)
    shutil.copyfile(meta, os.path.join(DEST, a, a + '.json'))
    sizes = ' '.join(f'./{os.path.basename(g)} {os.path.getsize(g)} B' for g in sorted(glob.glob(os.path.join(DEST, a, '*.glb'))))
    print(f"{a:<22} {info.get('tris', ''):>6} tris  {sizes}")
