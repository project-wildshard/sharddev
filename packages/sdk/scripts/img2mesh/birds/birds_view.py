"""Diagnostic ortho views of a generated bird (textured, Workbench): side (beak → right), top (beak ↑), front.

  blender -b -P scripts/img2mesh/birds/birds_view.py -- <in.glb> <out.png> [--rot rx,ry,rz] [--size 384]

--rot is the Blender-space Euler XYZ (degrees) applied after import, the same value birds.json's "rot" takes. The views
assume the target frame (Blender: beak −Y, up +Z, right wing +X = glTF/three: beak +Z, up +Y, right wing +X).
"""
import math
import sys

import bpy
from mathutils import Euler, Vector

argv = sys.argv[sys.argv.index("--") + 1:]
src, out = argv[0], argv[1]
rot = [float(v) for v in argv[argv.index("--rot") + 1].split(",")] if "--rot" in argv else [0, 0, 0]
size = int(argv[argv.index("--size") + 1]) if "--size" in argv else 384

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
R = Euler([math.radians(v) for v in rot], "XYZ").to_matrix().to_4x4()
for o in bpy.context.scene.objects:
    if o.parent is None:
        o.matrix_world = R @ o.matrix_world
bpy.context.view_layer.update()
pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
lo = Vector([min(p[i] for p in pts) for i in range(3)])
hi = Vector([max(p[i] for p in pts) for i in range(3)])
c = (lo + hi) / 2
r = max((hi - lo)) * 0.6

sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"
sc.display.shading.light = "FLAT"
sc.display.shading.color_type = "TEXTURE"
sc.render.resolution_x = sc.render.resolution_y = size
sc.view_settings.view_transform = "Standard"
sc.world = bpy.data.worlds.new("w")
sc.world.color = (0.8, 0.8, 0.8)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
cam.data.type = "ORTHO"
cam.data.ortho_scale = 2 * r
sc.collection.objects.link(cam)
sc.camera = cam
views = {  # name: (camera offset, euler)
    "side": (Vector((-3 * r, 0, 0)), (math.pi / 2, 0, -math.pi / 2)),   # from −X (left): −Y (beak) → image right
    "top": (Vector((0, 0, 3 * r)), (0, 0, math.pi)),                     # from +Z: beak (−Y) → image up
    "front": (Vector((0, -3 * r, 0)), (math.pi / 2, 0, 0)),              # from the beak side, looking back
    "under": (Vector((0, 0, -3 * r)), (math.pi, 0, 0)),
}
import os
tmp = []
for name, (off, eu) in views.items():
    cam.location = c + off
    cam.rotation_euler = eu
    sc.render.filepath = out + f".{name}.png"
    bpy.ops.render.render(write_still=True)
    tmp.append(sc.render.filepath)
print("dims (blender x,y,z):", tuple(round(v, 4) for v in (hi - lo)), "views:", tmp)
