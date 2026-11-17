"""Export a CC0 kit model (Kenney / Quaternius / KayKit / Poly Pizza) as a Driftwood asset: one mesh, faceted, every
face's colour snapped to the Driftwood palette, metres, pivot at the base, vertex colours only (no textures).

  blender -b -P scripts/img2mesh/cc0_export.py -- --in ~/models/cc0/kenney/pirate-kit/Models/GLB\ format/crate.glb \
      --name cc0-crate --out ~/ml/img2mesh/out/driftwood-cc0 --size 0.9 [--fit height|length] [--keep-hue]

Face colour = the material's base colour factor x its base-colour texture at the face centre (Kenney's colormap atlas),
then snapped to the nearest PALETTE colour in CIELAB (the colours the procedural Driftwood models use: `src/shards/driftwood-isle/world/Palms.ts`, Pier.ts and Boulders.ts,
plus `src/client/engine/world/lowpolyKit.ts`), so a kit asset sits in the same world as the hero props.
"""
import argparse
import json
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

PALETTE = {
    # wood (Pier.ts, Palms.ts trunk)
    "plank": "#9a7a56", "plankLight": "#b08d64", "plankDark": "#7c6244", "post": "#6f5638", "postTop": "#8a6d48",
    "trunk": "#8a6a48", "ring": "#6d5238", "woodDeep": "#4a3826",
    # rope / straw / sail / bleached driftwood
    "rope": "#d8c48a", "ropeDark": "#b59e6a", "straw": "#e0b860", "sail": "#efe6d2", "bleach": "#d9cdb8", "bleachDark": "#b8a88e",
    # foliage (lowpolyKit.ts PAL, Palms.ts)
    "leaf": "#4f8f34", "leafB": "#63a63c", "leafDark": "#3c7430", "leafLight": "#7fbf4a", "frond": "#4f9a3a", "frondLight": "#72b94c",
    "nut": "#6b5a2e", "nutGreen": "#7f9a3a",
    # rock (Boulders.ts)
    "rock": "#7a7e84", "rockLight": "#9da1a7", "rockDark": "#565a60", "moss": "#6f8f3a",
    # sand, accents
    "sand": "#e8cf9a", "sandDark": "#c9a970", "hibiscus": "#e2372c", "coral": "#f0543a", "gold": "#ffd24a", "flag": "#2f5bd0",
    "iron": "#5a5d63", "white": "#f4f0ea", "black": "#2a2622", "teal": "#3fb6b0",
}

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--in", dest="src", required=True)
ap.add_argument("--name", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--size", type=float, required=True)
ap.add_argument("--fit", choices=["height", "length"], default="height")
ap.add_argument("--family", default="", help="snap only onto these palette entries (rock | bleach | wood | a,b,c keys)")
ap.add_argument("--keep-hue", action="store_true", help="snap lightness only: keep the kit colour, pull it toward the palette")
a = ap.parse_args(argv)


def srgb_to_lab(c):
    c = np.asarray(c, dtype=np.float64)
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = lin @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


FAMILIES = {
    "rock": ["rock", "rockLight", "rockDark"],
    "bleach": ["bleach", "bleachDark", "sail", "ropeDark"],
    "wood": ["plank", "plankLight", "plankDark", "post", "postTop", "trunk", "ring", "woodDeep"],
}
KEYS = [k for f in a.family.split(",") if f for k in FAMILIES.get(f, [f])] or list(PALETTE)
PAL = np.array([[int(PALETTE[k][i:i + 2], 16) / 255 for i in (1, 3, 5)] for k in KEYS])
PAL_LAB = srgb_to_lab(PAL)

bpy.ops.wm.read_factory_settings(use_empty=True)
src = os.path.expanduser(a.src)
if src.endswith((".glb", ".gltf")):
    bpy.ops.import_scene.gltf(filepath=src)
elif src.endswith(".fbx"):
    bpy.ops.import_scene.fbx(filepath=src)
else:
    bpy.ops.wm.obj_import(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
for o in bpy.context.scene.objects:
    o.select_set(o.type == "MESH")
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.convert(target="MESH")  # bake any modifiers
if len(meshes) > 1:
    bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active
bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def mat_colour_fn(m):
    """-> f(uv) giving the sRGB base colour of material m (factor x texture)."""
    if m is None or not m.node_tree:
        return lambda uv: np.array([0.7, 0.7, 0.7])
    bsdf = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        return lambda uv: np.array([0.7, 0.7, 0.7])
    inp = bsdf.inputs["Base Color"]
    fac = np.array(inp.default_value[:3])
    fac = np.where(fac <= 0.0031308, fac * 12.92, 1.055 * np.power(np.maximum(fac, 0), 1 / 2.4) - 0.055)
    node = inp.links[0].from_node if inp.links else None
    while node is not None and node.type != "TEX_IMAGE":  # through a multiply / vertex colour mix
        nxt = [l.from_node for i in node.inputs for l in i.links]
        node = nxt[0] if nxt else None
    if node is None or node.image is None:
        return lambda uv: fac
    im = node.image
    w, h = im.size
    px = np.empty(w * h * 4, dtype=np.float32)
    im.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)[..., :3]
    if im.colorspace_settings.name != "sRGB":
        px = np.where(px <= 0.0031308, px * 12.92, 1.055 * np.power(np.maximum(px, 0), 1 / 2.4) - 0.055)
    if inp.links and inp.links[0].from_node.type == "TEX_IMAGE":
        fac = np.ones(3)  # a linked texture replaces the factor in Blender's import
    return lambda uv: fac * px[int(np.clip(uv[1] % 1, 0, 0.9999) * h), int(np.clip(uv[0] % 1, 0, 0.9999) * w)]


fns = [mat_colour_fn(s.material) for s in ob.material_slots] or [mat_colour_fn(None)]
bm = bmesh.new()
bm.from_mesh(ob.data)
bmesh.ops.triangulate(bm, faces=bm.faces[:])
uvl = bm.loops.layers.uv.active
cols = []
for f in bm.faces:
    uv = np.mean([l[uvl].uv[:] for l in f.loops], 0) if uvl else np.zeros(2)
    cols.append(fns[min(f.material_index, len(fns) - 1)](uv))
cols = np.clip(np.array(cols), 0, 1)
lab = srgb_to_lab(cols)
if a.family:  # a family snap goes by lightness rank, so a light kit rock still spans light..dark rock
    lab = lab.copy()
    lo, hi = np.percentile(lab[:, 0], 5), np.percentile(lab[:, 0], 95)
    plo, phi = PAL_LAB[:, 0].min(), PAL_LAB[:, 0].max()
    t = (lab[:, 0] - lo) / (hi - lo) if hi - lo > 8 else 0.5 + (lab[:, 0] - lo) / 16  # one-tone kit: centre it
    lab[:, 0] = plo + np.clip(t, 0, 1) * (phi - plo)
    lab[:, 1:] *= 0.3
if a.keep_hue:  # halfway to the nearest palette colour
    idx = ((lab[:, None, :] - PAL_LAB[None]) ** 2).sum(2).argmin(1)
    snapped = 0.5 * cols + 0.5 * PAL[idx]
else:
    idx = ((lab[:, None, :] - PAL_LAB[None]) ** 2).sum(2).argmin(1)
    snapped = PAL[idx]
bm.to_mesh(ob.data)
bm.free()
me = ob.data
for uv in list(me.uv_layers):
    me.uv_layers.remove(uv)
for p in me.polygons:
    p.use_smooth = False
attr = me.color_attributes.new("Color", "FLOAT_COLOR", "CORNER")
for p, c in zip(me.polygons, snapped):
    for li in p.loop_indices:
        attr.data[li].color_srgb = (float(c[0]), float(c[1]), float(c[2]), 1.0)
me.color_attributes.active_color = attr

d = ob.dimensions
ref = d.z if a.fit == "height" else max(d.x, d.y)
s = a.size / max(ref, 1e-6)
ob.scale = (s, s, s)
bpy.ops.object.transform_apply(scale=True)
co = np.array([v.co[:] for v in me.vertices])
zmin = co[:, 2].min()
pivot = np.array([(co[:, 0].min() + co[:, 0].max()) / 2, (co[:, 1].min() + co[:, 1].max()) / 2, zmin])
for v in me.vertices:
    v.co = Vector(np.array(v.co[:]) - pivot)

mat = bpy.data.materials.new("driftwood-cc0")
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes["Principled BSDF"]
vc = nt.nodes.new("ShaderNodeVertexColor")
vc.layer_name = "Color"
nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.9
me.materials.clear()
me.materials.append(mat)
ob.name = a.name
folder = os.path.join(os.path.expanduser(a.out), a.name)
os.makedirs(folder, exist_ok=True)
bpy.ops.object.select_all(action="DESELECT")
ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(folder, a.name + ".glb"), export_format="GLB", use_selection=True,
                          export_yup=True, export_vertex_color="ACTIVE", export_all_vertex_colors=False,
                          export_image_format="NONE")
used = sorted({KEYS[i] for i in np.unique(idx)})
info = {"name": a.name, "source": src.replace(os.path.expanduser("~"), "~"), "licence": "CC0 1.0 (see scripts/img2mesh/CC0.md)",
        "tris": len(me.polygons), "size_m": [round(v, 2) for v in ob.dimensions], "palette": used,
        "vertex_colour": "COLOR_0 rgb = Driftwood palette albedo, a = 1"}
json.dump(info, open(os.path.join(folder, a.name + ".json"), "w"), indent=1)
print("CC0_EXPORT " + json.dumps({k: info[k] for k in ("name", "tris", "size_m")}))
