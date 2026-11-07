"""save_blend.py — build.sh --save-blend: save the scene a builder left behind as an inspection .blend (M10, E315).

build.sh runs it as a second -P after the target's script and points WILDSHARD_SAVE_BLEND at the target's cache
(~/.cache/wildshard-blender/<target>/<name>.blend). The file is for a person or an agent to open and look at; it is
never a source and never committed (.gitignore and .githooks/pre-commit refuse *.blend).
"""
import os

import bpy

path = os.environ.get('WILDSHARD_SAVE_BLEND', '')
if path:
    if not path.endswith('.blend'):
        raise SystemExit(f'save_blend: {path} is not a .blend path')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=path, check_existing=False, compress=True)
    print(f'[build] saved the inspection file {path}')
