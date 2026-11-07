"""E322 F-M5: side / front / 3-4 renders of birds_fix_preview.mjs's GLBs (owl_fly, wood_perch), the woodpecker against its
bark (the plane glTF z = 0.05: the perch's world frame puts the trunk there).

  blender -b -P scripts/img2mesh/birds/birds_fix_render.py -- <birds-X.glb> <out prefix> [--size 480]
"""
import math
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
src, out = argv[0], argv[1]
size = int(argv[argv.index("--size") + 1]) if "--size" in argv else 480

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
objs = {o.name: o for o in bpy.context.scene.objects if o.type == "MESH"}
sc = bpy.context.scene
sc.render.resolution_x = sc.render.resolution_y = size
sc.view_settings.view_transform = "Standard"
eng = {e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}
sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in eng else "BLENDER_EEVEE"
sc.world = bpy.data.worlds.new("w")
sc.world.use_nodes = True
bg = sc.world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.78, 0.8, 0.83, 1)
bg.inputs[1].default_value = 0.9
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 3.2
sun.rotation_euler = (math.radians(40), math.radians(10), math.radians(-35))
sc.collection.objects.link(sun)
for m in bpy.data.materials:
    m.use_backface_culling = False
# the bark: a brown vertical plane at glTF z = 0.05 (Blender y = -0.05), facing the bird
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -0.05 - 0.03, 0))
bark = bpy.context.active_object
bark.scale = (0.8, 0.06, 0.8)
bm = bpy.data.materials.new("bark")
bm.diffuse_color = (0.25, 0.17, 0.11, 1)
bm.use_nodes = True
bm.node_tree.nodes["Principled BSDF"].inputs[0].default_value = (0.25, 0.17, 0.11, 1)
bark.data.materials.append(bm)

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
cam.data.type = "ORTHO"
sc.collection.objects.link(cam)
sc.camera = cam

for name in ("owl_fly", "wood_perch"):
    ob = objs[name]
    for o in objs.values():
        o.hide_render = o is not ob
    bark.hide_render = name != "wood_perch"
    lo = Vector([min((ob.matrix_world @ Vector(c))[i] for c in ob.bound_box) for i in range(3)])
    hi = Vector([max((ob.matrix_world @ Vector(c))[i] for c in ob.bound_box) for i in range(3)])
    c = (lo + hi) / 2
    r = max(hi - lo) * 0.62
    if name == "owl_fly":
        r = 0.42  # the body, not the span
    cam.data.ortho_scale = 2 * r
    views = {
        "side": (Vector((-4 * r, 0, 0)), (math.pi / 2, 0, -math.pi / 2)),
        "front": (Vector((0, -4 * r, 0)), (math.pi / 2, 0, 0)) if name == "owl_fly" else (Vector((0, 4 * r, 0)), (math.pi / 2, 0, math.pi)),
        "q34": (Vector((-2.4 * r, 2.4 * r if name == "wood_perch" else -2.4 * r, 1.2 * r)), None),
    }
    for vn, (off, eu) in views.items():
        cam.location = c + off
        if eu is None:
            d = (c - cam.location).normalized()
            cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        else:
            cam.rotation_euler = eu
        sc.render.filepath = f"{out}{name}.{vn}.png"
        bpy.ops.render.render(write_still=True)
