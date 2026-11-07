"""Pine Hollow birds (round 16), step 3: the six low meshes → one GLB sharing one material (the atlas), + the sidecar.

  blender -b -P scripts/img2mesh/birds/birds_pack.py -- --post <post dir> --atlas <atlas dir> --out public/assets/pine-hollow/life

Each mesh's 0..1 UVs go into its 512² tile of the 2048×1024 atlas (4×2, row 0 at the image top: raven_perch, raven_fly,
owl_perch, owl_fly / wood_perch, wood_fly, white, grey). Exports birds.glb (atlas.png as WebP q85) and birds.phone.glb
(atlas.phone.png, 1024×512), POSITION/NORMAL/TEXCOORD_0 only, and birds.json (per-mesh tris + the measured pivots).
Then birds_phone_b.py re-lays the phone file's atlas at 1024² (E322 F-M5), and scripts/bake-ktx2.mjs bakes its twin.
"""
import argparse
import json
import os
import re
import sys

import bpy
from mathutils import Matrix

argv = sys.argv[sys.argv.index("--") + 1:]
ap = argparse.ArgumentParser()
ap.add_argument("--post", required=True)
ap.add_argument("--atlas", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--quality", type=int, default=85)
ap.add_argument("--phone-quality", type=int, default=80)
ap.add_argument("--roughness", type=float, default=0.8)
a = ap.parse_args(argv)
ORDER = ["raven_perch", "raven_fly", "owl_perch", "owl_fly", "wood_perch", "wood_fly"]

bpy.ops.wm.read_factory_settings(use_empty=True)
img = bpy.data.images.load(os.path.join(a.atlas, "atlas.png"))
img.name = "birds_atlas"
mat = bpy.data.materials.new("birds")
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes.get("Principled BSDF")
tex = nt.nodes.new("ShaderNodeTexImage")
tex.image = img
tex.interpolation = "Linear"
nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
bsdf.inputs["Metallic"].default_value = 0.0
bsdf.inputs["Roughness"].default_value = a.roughness
mat.use_backface_culling = False   # glTF doubleSided: the material is DoubleSide in the game

side = {}
for i, name in enumerate(ORDER):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(a.post, name + ".low.glb"))
    new = [o for o in bpy.data.objects if o not in before]
    ob = next(o for o in new if o.type == "MESH")
    for o in new:
        if o is not ob:
            bpy.data.objects.remove(o)
    mw = ob.matrix_world.copy()
    ob.parent = None
    ob.data.transform(mw)
    ob.matrix_world = Matrix.Identity(4)
    ob.name = name
    ob.data.name = name
    col, row = i % 4, i // 4
    uv = ob.data.uv_layers.active
    for l in uv.data:
        u, v = l.uv
        l.uv = ((col + u) / 4.0, (1 - row) * 0.5 + v * 0.5)
    while len(ob.data.uv_layers) > 1:
        ob.data.uv_layers.remove(ob.data.uv_layers[1] if ob.data.uv_layers[0] == uv else ob.data.uv_layers[0])
    for ca in list(ob.data.color_attributes):
        ob.data.color_attributes.remove(ca)
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    m = json.load(open(os.path.join(a.post, name + ".json")))
    m.pop("uvTris", None)
    m.pop("src", None)
    m["tris"] = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    m["tile"] = [col, row]
    side[name] = m
for im in list(bpy.data.images):
    if im is not img:
        bpy.data.images.remove(im)
for mt in list(bpy.data.materials):
    if mt is not mat:
        bpy.data.materials.remove(mt)

os.makedirs(a.out, exist_ok=True)
common = dict(export_format="GLB", export_yup=True, export_apply=True, export_texcoords=True, export_normals=True,
              export_tangents=False, export_materials="EXPORT", export_image_format="WEBP", export_skins=False,
              export_morph=False, export_animations=False, export_vertex_color="NONE", export_extras=False)
bpy.ops.export_scene.gltf(filepath=os.path.join(a.out, "birds.glb"), export_image_quality=a.quality, **common)
img.filepath = os.path.join(a.atlas, "atlas.phone.png")
img.reload()
bpy.ops.export_scene.gltf(filepath=os.path.join(a.out, "birds.phone.glb"), export_image_quality=a.phone_quality, **common)

doc = {
    "_": "Pine Hollow birds (art/pine-hollow/round-16-birds). glTF/three frame, metres: beak +Z, up +Y, right wing +X, "
         "body centre at the origin. shoulderL/R: the wing root (fly: where the wing leaves the body; perch: the folded "
         "wing's root on the upper flank); bodyHalfWidth: |x| past which a vertex is wing (fly); neck: the head-turn "
         "pivot; head = dot(p − neck, headAxis) > 0 (fly: headAxis = +Z, i.e. z > headZ; a perched bird sits upright, so "
         "use the plane — headZ / headY are only its axis-aligned fallbacks); tail = dot(p − tailRoot, tailAxis) > 0 "
         "(tailZ the fallback); feetY: the lowest y; beakTip / tailTip: the extreme points; span / length: the mesh's x / z "
         "extent; tile: [col,row] of its 512² atlas tile (row 0 = top).",
    "atlas": {"desktop": [2048, 1024], "phone": [1024, 512], "grid": [4, 2]},
    "meshes": side,
}
txt = json.dumps(doc, indent=1)
txt = re.sub(r"\[\s*(-?[\d.e-]+),\s*(-?[\d.e-]+)(?:,\s*(-?[\d.e-]+))?\s*\]",
             lambda mm: "[" + ", ".join(g for g in mm.groups() if g is not None) + "]", txt)
open(os.path.join(a.out, "birds.json"), "w").write(txt + "\n")
print(json.dumps(doc, indent=1))
