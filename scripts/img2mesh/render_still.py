"""Render one model (glb / gltf / obj) as a 3/4 turntable still, the same light for every prop.

  blender -b -P scripts/img2mesh/render_still.py -- <model>[,<model>…] <out.png> [--size 512] [--yaw 35] [--flat]

Several comma-separated models are laid out left to right in a row (a set: boulders, driftwood, shells).

Eevee, sun from the front-left + a soft sky fill, orthographic-ish framing (long lens) on a light-grey backdrop.
--flat forces flat shading on every mesh (to preview the faceted look of a raw generation).
"""
import math
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
src, out = argv[0], argv[1]
size = int(argv[argv.index("--size") + 1]) if "--size" in argv else 512
yaw = float(argv[argv.index("--yaw") + 1]) if "--yaw" in argv else 35.0
flat = "--flat" in argv

bpy.ops.wm.read_factory_settings(use_empty=True)
x = 0.0
for one in src.split(","):
    before = set(bpy.context.scene.objects)
    if one.endswith(".obj"):
        bpy.ops.wm.obj_import(filepath=one)
    else:
        bpy.ops.import_scene.gltf(filepath=one)
    new = [o for o in bpy.context.scene.objects if o not in before]
    roots = [o for o in new if o.parent is None]
    bpy.context.view_layer.update()
    xs = [(o.matrix_world @ Vector(c)).x for o in new if o.type == "MESH" for c in o.bound_box]
    lo_x, hi_x = min(xs), max(xs)
    for r in roots:
        r.location.x += x - lo_x
    x += (hi_x - lo_x) * 1.15

bpy.context.view_layer.update()
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
if flat:
    for o in meshes:
        for p in o.data.polygons:
            p.use_smooth = False
lo = Vector((1e9, 1e9, 1e9))
hi = Vector((-1e9, -1e9, -1e9))
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        lo = Vector(map(min, lo, w))
        hi = Vector(map(max, hi, w))
center = (lo + hi) / 2
radius = max((hi - lo).length / 2, 1e-3)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in {e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items} else "BLENDER_EEVEE"
scene.render.resolution_x = scene.render.resolution_y = size
scene.render.film_transparent = False
scene.view_settings.view_transform = "Standard"

world = bpy.data.worlds.new("w")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.78, 0.82, 0.86, 1)
bg.inputs[1].default_value = 0.9

sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 3.2
sun.data.angle = math.radians(3)
sun.rotation_euler = (math.radians(50), 0, math.radians(yaw - 60))
scene.collection.objects.link(sun)

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
cam.data.lens = 85
scene.collection.objects.link(cam)
scene.camera = cam
el = math.radians(18)
az = math.radians(yaw)
dist = radius / math.tan(cam.data.angle / 2) * 0.95
cam.location = center + Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * dist
cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
cam.data.clip_end = dist * 4

scene.render.filepath = out
bpy.ops.render.render(write_still=True)
