"""E304: a face close-up of one or more models (glb), for tuning a face remaster and the inventory sheet.

  blender -b -P scripts/img2mesh/face_views.py -- <a.glb>[,<b.glb>…] <out.png> [--top 0.2] [--size 384] [--yaws 0,35]
      [--flat] [--full]

Per model: an ortho view of the top --top of its height (the head), one tile per yaw (0 = its front, glTF +Z), and with
--full a whole-body tile first. Eevee, a sun from the front-left + a soft sky, grey backdrop; the textures as shipped.
--flat: flat shading (the toon shards' faceted look). Tiles left to right, models top to bottom.
"""
import math
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
srcs, out = argv[0].split(","), argv[1]
opt = lambda k, d: argv[argv.index(k) + 1] if k in argv else d
top = float(opt("--top", "0.2"))
size = int(opt("--size", "384"))
yaws = [float(y) for y in opt("--yaws", "0,35").split(",")]
flat = "--flat" in argv
full = "--full" in argv

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE"
sc.render.resolution_x = sc.render.resolution_y = size
sc.render.film_transparent = False
sc.view_settings.view_transform = "Standard"
world = bpy.data.worlds.new("w"); sc.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.58, 0.62, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.9
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sun.data.energy = 3.2
sun.rotation_euler = (math.radians(50), 0, math.radians(-30)); sc.collection.objects.link(sun)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); cam.data.type = "ORTHO"; sc.collection.objects.link(cam); sc.camera = cam

tiles = []
for si, src in enumerate(srcs):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=src)
    new = [o for o in bpy.context.scene.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    H = hi.z - lo.z
    for o in meshes:
        if flat:
            for p in o.data.polygons:
                p.use_smooth = False
        for ms in o.material_slots:
            if ms.material:
                ms.material.use_backface_culling = False
    views = ([("full", 0.0)] if full else []) + [("head", y) for y in yaws]
    row = []
    for kind, yaw in views:
        if kind == "full":
            cz = lo.z + H / 2; scale = H * 1.08
        else:
            cz = hi.z - top * H / 2; scale = top * H * 1.05
        cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
        r = 10.0
        a = math.radians(yaw)
        cam.data.ortho_scale = scale
        # glTF +Z (the front) is Blender -Y
        cam.location = (cx + r * math.sin(a), cy - r * math.cos(a), cz)
        cam.rotation_euler = (math.pi / 2, 0, a)
        for o in bpy.context.scene.objects:
            if o.type == "MESH":
                o.hide_render = o not in meshes
        path = f"{out}.tile{si}_{len(row)}.png"
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        row.append(path)
    tiles.append(row)
    for o in new:
        o.hide_render = True

# compose
import numpy as np
cols = max(len(r) for r in tiles)
canvas = np.ones((len(tiles) * size, cols * size, 4), np.float32)
for ri, row in enumerate(tiles):
    for ci, p in enumerate(row):
        im = bpy.data.images.load(p)
        px = np.array(im.pixels[:], np.float32).reshape(size, size, 4)[::-1]
        canvas[ri * size:(ri + 1) * size, ci * size:(ci + 1) * size] = px
        bpy.data.images.remove(im)
        import os; os.remove(p)
img = bpy.data.images.new("sheet", cols * size, len(tiles) * size, alpha=True)
img.pixels.foreach_set(canvas[::-1].ravel())
img.filepath_raw = out; img.file_format = "PNG"; img.save()
print(f"[views] {out}: {len(tiles)} x {cols}")
