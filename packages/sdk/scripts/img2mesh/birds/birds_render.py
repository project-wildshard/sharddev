"""Pine Hollow birds (round 16): renders of birds.glb, one PNG per mesh and view.

  blender -b -P scripts/img2mesh/birds/birds_render.py -- <birds.glb> <birds.json> <out dir> [--seg] [--size 512]

Default: Eevee, textured (the atlas), a sun + sky fill, views side (beak → right), top (beak ↑) and 3/4.
--seg: Workbench, every vertex coloured by the sidecar's rules (wing |x| > bodyHalfWidth on fly = green, head past the
neck plane = red, tail past the tail-root plane = blue, body = grey) + the neck (yellow), shoulders (cyan) as dots:
a check that the measured pivots cut the mesh where the game will bend it.
"""
import math
import os
import sys

import bpy
import json
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
src, side_path, out = argv[0], argv[1], argv[2]
seg = "--seg" in argv
size = int(argv[argv.index("--size") + 1]) if "--size" in argv else 512
os.makedirs(out, exist_ok=True)
SC = json.load(open(side_path))["meshes"]


def b(v):  # glTF → Blender
    return Vector((v[0], -v[2], v[1]))


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
objs = {o.name: o for o in bpy.context.scene.objects if o.type == "MESH"}
sc = bpy.context.scene
sc.render.resolution_x = sc.render.resolution_y = size
sc.view_settings.view_transform = "Standard"
sc.world = bpy.data.worlds.new("w")
if seg:
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "VERTEX"
    sc.world.color = (0.85, 0.85, 0.85)
else:
    eng = {e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}
    sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in eng else "BLENDER_EEVEE"
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

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
cam.data.type = "ORTHO"
sc.collection.objects.link(cam)
sc.camera = cam
dots = []
cams = {}


def dot(p, col):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.012, location=p, segments=10, ring_count=6)
    o = bpy.context.active_object
    ca = o.data.color_attributes.new("c", "FLOAT_COLOR", "POINT")
    for d in ca.data:
        d.color = col
    dots.append(o)
    return o


for name, ob in objs.items():
    m = SC[name]
    for o in objs.values():
        o.hide_render = o is not ob
    for o in dots:
        bpy.data.objects.remove(o)
    dots.clear()
    if seg:
        me = ob.data
        ca = me.color_attributes.get("seg") or me.color_attributes.new("seg", "FLOAT_COLOR", "POINT")
        me.color_attributes.active_color = ca
        neck, ha = b(m["neck"]), b(m["headAxis"])
        tr, ta = b(m["tailRoot"]), b(m["tailAxis"])
        fly = name.endswith("_fly")
        for v, d in zip(me.vertices, ca.data):
            p = v.co
            if fly and abs(p.x) > m["bodyHalfWidth"]:
                c = (0.1, 0.7, 0.2, 1)
            elif (p - neck).dot(ha) > 0:
                c = (0.85, 0.1, 0.1, 1)
            elif (p - tr).dot(ta) > 0:
                c = (0.1, 0.25, 0.9, 1)
            else:
                c = (0.55, 0.55, 0.55, 1)
            d.color = c
        dot(neck, (1, 0.9, 0, 1))
        dot(b(m["shoulderL"]), (0, 1, 1, 1))
        dot(b(m["shoulderR"]), (0, 1, 1, 1))
    lo = Vector([min((ob.matrix_world @ Vector(c))[i] for c in ob.bound_box) for i in range(3)])
    hi = Vector([max((ob.matrix_world @ Vector(c))[i] for c in ob.bound_box) for i in range(3)])
    c = (lo + hi) / 2
    r = max(hi - lo) * 0.58
    cam.data.ortho_scale = 2 * r
    views = {
        "side": (Vector((-4 * r, 0, 0)), (math.pi / 2, 0, -math.pi / 2)),
        "top": (Vector((0, 0, 4 * r)), (0, 0, math.pi)),
        "q34": (Vector((-2.4 * r, -2.4 * r, 2.2 * r)), None),
    }
    if "--front" in argv:
        views["front"] = (Vector((0, -4 * r, 0)), (math.pi / 2, 0, 0))
    cams[name] = {"c_gltf": [c.x, c.z, -c.y], "halfWidth": r}
    for vn, (off, eu) in views.items():
        cam.location = c + off
        if eu is None:
            d = (c - cam.location).normalized()
            cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        else:
            cam.rotation_euler = eu
        sc.render.filepath = os.path.join(out, f"{name}.{vn}.png")
        bpy.ops.render.render(write_still=True)
json.dump(cams, open(os.path.join(out, "cams.json"), "w"), indent=1)
print("rendered", list(objs))
