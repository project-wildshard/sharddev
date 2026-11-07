"""The E285 rig gate for one rigged training dummy: pose extremes, measured and rendered.

  blender -b -P scripts/practice/dummy_rig_gate.py -- <rigged.glb> <out dir> [--size 360]

Poses (the img2-character rig-gate sweep, as the dummy's procedural motion uses it): Spine pitch / lean +-25 deg,
Chest pitch / lean +-20 deg, Head pitch / turn +-35 deg, and each arm joint (UpperArm, ForeArm, Hand, one at a time, the rest of the chain following)
+-60 deg forward / back and out / in. For every pose it measures the skinned mesh against the rest mesh:
  - edge stretch: posed / rest length of every edge (a tear shows as a long thin edge): max, p99.9 and min;
  - collapse: the smallest posed / rest area of a triangle (candy-wrapping / pinching).
The numbers are measurements for the reader of the sheet, not pass bars (E388: the old > 2x and < 20 % flags had no source).
Writes <out dir>/gate.json and one PNG per pose (front three-quarter view), which scripts/practice/gate_sheet.py
lays out as a labelled sheet.
"""
import json
import math
import os
import sys

import bpy
from mathutils import Euler, Vector

argv = sys.argv[sys.argv.index("--") + 1:]
src, out = argv[0], argv[1]
size = int(argv[argv.index("--size") + 1]) if "--size" in argv else 360
os.makedirs(out, exist_ok=True)

if src.endswith(".blend"):
    bpy.ops.wm.open_mainfile(filepath=src)  # the rig as built: bone axes exactly as rig_dummy.py rolled them
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
scene = bpy.context.scene
arm = next(o for o in scene.objects if o.type == "ARMATURE")
mesh = next(o for o in scene.objects if o.type == "MESH")

POSES = [("rest", {})]
for bone, deg in (("Spine", 25), ("Chest", 20)):
    for sgn in (1, -1):
        POSES.append((f"{bone} pitch {sgn * deg:+d}", {bone: ("X", sgn * deg)}))
        POSES.append((f"{bone} lean {sgn * deg:+d}", {bone: ("Z", sgn * deg)}))
for sgn in (1, -1):
    POSES.append((f"Head pitch {sgn * 35:+d}", {"Head": ("X", sgn * 35)}))
    POSES.append((f"Head turn {sgn * 35:+d}", {"Head": ("Y", sgn * 35)}))
for side in ("Left", "Right"):
    for bone, short in ((f"{side}UpperArm", "upper arm"), (f"{side}ForeArm", "forearm"), (f"{side}Hand", "hand")):
        for axis, label in (("X", "swing"), ("Z", "raise")):
            for sgn in (1, -1):
                POSES.append((f"{side} {short} {label} {sgn * 60:+d}", {bone: (axis, sgn * 60)}))


def evaluated():
    dg = bpy.context.evaluated_depsgraph_get()
    ev = mesh.evaluated_get(dg)
    m = ev.to_mesh()
    pts = [mesh.matrix_world @ v.co for v in m.vertices]
    tris = [tuple(t.vertices) for t in m.loop_triangles] if m.loop_triangles else None
    if tris is None:
        m.calc_loop_triangles()
        tris = [tuple(t.vertices) for t in m.loop_triangles]
    ev.to_mesh_clear()
    return pts, tris


def reset():
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = Euler((0, 0, 0))
        pb.location = (0, 0, 0)
    bpy.context.view_layer.update()


reset()
rest, tris = evaluated()
edges = set()
for a, b, c in tris:
    for u, v in ((a, b), (b, c), (c, a)):
        edges.add((min(u, v), max(u, v)))
edges = list(edges)
rest_len = [(rest[u] - rest[v]).length for u, v in edges]


def area(p, t):
    a, b, c = t
    return (p[b] - p[a]).cross(p[c] - p[a]).length / 2


rest_area = [area(rest, t) for t in tris]

# camera + light
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = size
scene.render.resolution_y = int(size * 1.3)
world = bpy.data.worlds.new("w")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.09, 0.11, 0.14, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 1.4
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 3.0
sun.rotation_euler = Euler((math.radians(55), 0, math.radians(-20)))
scene.collection.objects.link(sun)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
cam.data.type = "ORTHO"
cam.data.ortho_scale = 3.3
scene.collection.objects.link(cam)
scene.camera = cam
target = Vector((0, 0, 1.4))
a = math.radians(30)
d = Vector((math.sin(a), -math.cos(a), 0.12)) * 8
cam.location = target + d
cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()

results = []
for i, (name, rots) in enumerate(POSES):
    reset()
    for bname, (axis, deg) in rots.items():
        pb = arm.pose.bones[bname]
        e = [0.0, 0.0, 0.0]
        e["XYZ".index(axis)] = math.radians(deg)
        pb.rotation_euler = Euler(e)
    bpy.context.view_layer.update()
    pts, _ = evaluated()
    ratios = sorted((pts[u] - pts[v]).length / max(rl, 1e-7) for (u, v), rl in zip(edges, rest_len))
    n = len(ratios)
    area_min = min(area(pts, t) / ra for t, ra in zip(tris, rest_area) if ra > 1e-8)
    row = {
        "pose": name,
        "stretch_max": round(ratios[-1], 3),
        "stretch_p999": round(ratios[int(n * 0.999)], 3),
        "shrink_min": round(ratios[0], 3),
        "area_min": round(area_min, 3),
        "tris": len(tris),
    }
    results.append(row)
    scene.render.filepath = os.path.join(out, f"{i:02d}.png")
    bpy.ops.render.render(write_still=True)
    print("GATE", json.dumps(row), flush=True)

json.dump({"source": src, "poses": results}, open(os.path.join(out, "gate.json"), "w"), indent=1)
