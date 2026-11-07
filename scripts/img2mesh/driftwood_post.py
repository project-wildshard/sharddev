"""Clean an image-to-3D mesh into a game prop: Driftwood's low-poly, faceted, vertex-coloured hero props (the default),
or, with --keep-texture, a photoreal PBR prop (Pine Hollow, PINE-HOLLOW-REMASTER PH-0.3). Metres, pivot at the base.

  blender -b -P scripts/img2mesh/driftwood_post.py -- --in ~/ml/img2mesh/out/driftwood/palm-a.glb \
      --name palm-a --out public/assets/models/driftwood-hero --tris 1800 --fit height --size 9

What it does (headless, deterministic):
 1. imports the generated glb (TRELLIS.2: ~40 k faces + a baked 1024² base-colour texture), joins it, drops floating
    crumbs (< --min-part of the largest loose part);
 2. --split: a sheet of several objects (the boulder set, the driftwood set, beach clutter) becomes one asset per
    cluster of touching parts, named <name>-1..n left to right (or --names a,b,c);
 3. collapse-decimates each asset to --tris triangles, flat shaded (the faceted look);
 4. colours every low-poly FACE with the mean of the generated texture under it (4 samples through a BVH onto the
    high mesh), then grades it (--sat, --val) and snaps it to --quant k-means colours: one flat colour per facet;
 5. bakes Cycles ambient occlusion into the vertex colour ALPHA (the convention of scripts/blender/ and
    src/shards/driftwood-isle/world/BlenderIsland.ts: RGB = albedo, A = AO);
 6. scales so the largest asset's --fit (height | length) is --size metres (a set keeps its relative sizes), puts the
    pivot at the centre of the lowest 3 % of the mesh (a leaning palm pivots on its trunk foot) at z = 0;
 7. exports <out>/<asset>/<asset>.glb (no textures, COLOR_0 only) + <asset>.json (tris, size, colours).
Then scripts/img2mesh/build_props.py (build_driftwood.sh) meshopt-compresses the glbs with gltf-transform.

--keep-texture (PBR, a photoreal shard): no facet flattening. Steps 4-5 become: smooth shading (sharp past
--smooth-angle), the generated texture baked UNGRADED onto the low mesh's own UVs (--atlas, default 1024) plus a
tangent-space normal map from the high mesh (--normal-map N², default the atlas size; 0 = none); no vertex colour, no AO
bake. Step 7 exports <asset>.glb with that PBR material (WebP base colour + normal, --roughness), no .tex.glb.

--geo <mesh.obj> (HI3D-REFINE, E494): a Hi3D-refined mesh from scripts/img2mesh/hi3d_refine.py, already in the --in
GLB's frame. Its geometry is decimated in place of the generated mesh's and is the normal map's high mesh; the colour
(facets, atlas) still comes from the generated texture of --in.
"""
import argparse
import json
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--in", dest="src", required=True)
ap.add_argument("--geo", default="", help="a Hi3D-refined mesh in --in's frame: its geometry, --in's colour")
ap.add_argument("--name", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--tris", default="1500", help="triangle budget per asset; a comma list gives one per --split asset")
ap.add_argument("--fit", choices=["height", "length"], default="height")
ap.add_argument("--size", type=float, required=True, help="metres of --fit on the largest asset")
ap.add_argument("--split", action="store_true")
ap.add_argument("--names", default="")
ap.add_argument("--min-part", type=float, default=0.01)
ap.add_argument("--seed", type=float, default=0.08, help="--split: a loose part this share of the largest is its own asset")
ap.add_argument("--quant", type=int, default=10)
ap.add_argument("--sat", type=float, default=1.15)
ap.add_argument("--val", type=float, default=1.05)
ap.add_argument("--ao", type=float, default=0.12, help="AO distance as a fraction of the asset size; 0 = no bake")
ap.add_argument("--up", default="", help="rotate before fitting: x90 / x-90 / y90 ... (if the generation lies down)")
ap.add_argument("--yaw", type=float, default=0.0, help="degrees about z applied before export")
ap.add_argument("--remesh", type=float, default=0.0, help="voxel-remesh first (voxel = this x size) for solid props")
ap.add_argument("--simplifier", choices=["fqmr", "blender"], default="fqmr",
                help="fqmr = fast-simplification (quadric, ignores the generator's open borders); blender = collapse")
ap.add_argument("--planar", type=float, default=0.0, help="degrees: planar-dissolve what the collapse left over budget")
ap.add_argument("--solidify", type=float, default=0.0, help="thicken open shells by this x size before --remesh")
ap.add_argument("--atlas", type=int, default=0, help="also bake the generated texture to an N² WebP atlas (<name>.tex.glb)")
ap.add_argument("--keep-texture", action="store_true",
                help="PBR mode (photoreal shards): keep the texture, no facet colours / grade / quant, smooth shading")
ap.add_argument("--normal-map", type=int, default=-1, help="--keep-texture: N² normal map baked from the high mesh (default the atlas size, 0 = none)")
ap.add_argument("--roughness", type=float, default=0.9, help="--keep-texture: the material's roughness")
ap.add_argument("--metal-off", action="store_true",
                help="bake colour as if the generation had no metallic map (a TRELLIS creature's fur reads black)")
ap.add_argument("--recalc-normals", action="store_true",
                help="after decimating, turn every face outward (a generation's patches of inside-out faces show as holes under back-face culling)")
ap.add_argument("--smooth-angle", type=float, default=40.0, help="--keep-texture: edges sharper than this (degrees) stay hard")
a = ap.parse_args(argv)
if a.keep_texture:
    a.atlas = a.atlas or 1024
    a.normal_map = a.atlas if a.normal_map < 0 else a.normal_map

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.expanduser(a.src))
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
bpy.ops.object.select_all(action="DESELECT")
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
hi = bpy.context.view_layer.objects.active
bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
if a.up:
    ax, deg = a.up[0].upper(), float(a.up[1:])
    hi.rotation_mode = "XYZ"  # the glTF importer leaves objects in QUATERNION mode: euler edits would be ignored
    hi.rotation_euler["XYZ".index(ax)] = math.radians(deg)
    bpy.ops.object.transform_apply(rotation=True)
geo = None
if a.geo:  # the OBJ importer's Y-up → Z-up matches the glTF importer's, so --geo lands on hi
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.wm.obj_import(filepath=os.path.expanduser(a.geo), forward_axis="NEGATIVE_Z", up_axis="Y")
    geo = bpy.context.selected_objects[0]
    bpy.context.view_layer.objects.active = geo
    if a.up:
        geo.rotation_mode = "XYZ"
        geo.rotation_euler["XYZ".index(ax)] = math.radians(deg)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    geo.select_set(False)

# --- the generated texture as a numpy array (sRGB-encoded values, as stored) ---
def base_image(obj):
    for slot in obj.material_slots:
        m = slot.material
        if not m or not m.use_nodes:
            continue
        for n in m.node_tree.nodes:
            if n.type == "BSDF_PRINCIPLED":
                link = n.inputs["Base Color"].links
                if link and link[0].from_node.type == "TEX_IMAGE":
                    return link[0].from_node.image
        for n in m.node_tree.nodes:
            if n.type == "TEX_IMAGE":
                return n.image
    return None

img = base_image(hi)
if img is None:
    sys.exit("no base colour texture on the input")
W, H = img.size
px = np.empty(W * H * 4, dtype=np.float32)
img.pixels.foreach_get(px)
px = px.reshape(H, W, 4)
if img.colorspace_settings.name != "sRGB":  # pixels come back linear for a non-sRGB image: encode
    px[..., :3] = np.where(px[..., :3] <= 0.0031308, px[..., :3] * 12.92, 1.055 * np.power(px[..., :3], 1 / 2.4) - 0.055)

# --- high mesh: triangulated, with per-triangle UVs, in a BVH ---
bm_hi = bmesh.new()
bm_hi.from_mesh(hi.data)
bmesh.ops.triangulate(bm_hi, faces=bm_hi.faces[:])
uv_layer = bm_hi.loops.layers.uv.active
bm_hi.faces.ensure_lookup_table()
tri_uv = np.array([[l[uv_layer].uv[:] for l in f.loops] for f in bm_hi.faces], dtype=np.float32)
tri_co = np.array([[l.vert.co[:] for l in f.loops] for f in bm_hi.faces], dtype=np.float32)
bvh = BVHTree.FromBMesh(bm_hi)


def sample(points):
    """sRGB colour of the generated texture at the surface nearest to each point."""
    out = []
    for p in points:
        loc, _n, idx, _d = bvh.find_nearest(Vector(p))
        if idx is None:
            out.append((0.5, 0.5, 0.5))
            continue
        A, B, C = tri_co[idx]
        v0, v1, v2 = B - A, C - A, np.array(loc) - A
        d00, d01, d11 = v0 @ v0, v0 @ v1, v1 @ v1
        d20, d21 = v2 @ v0, v2 @ v1
        den = d00 * d11 - d01 * d01 or 1e-12
        v = (d11 * d20 - d01 * d21) / den
        w = (d00 * d21 - d01 * d20) / den
        u = 1 - v - w
        uv = u * tri_uv[idx][0] + v * tri_uv[idx][1] + w * tri_uv[idx][2]
        x = int(np.clip(uv[0] % 1.0, 0, 0.9999) * W)
        y = int(np.clip(uv[1] % 1.0, 0, 0.9999) * H)
        out.append(tuple(px[y, x, :3]))
    return np.array(out)


# --- split into loose parts, drop crumbs, cluster touching parts into assets ---
bpy.ops.object.select_all(action="DESELECT")
src = geo or hi
src.select_set(True)
bpy.context.view_layer.objects.active = src
bpy.ops.object.duplicate()
work = bpy.context.view_layer.objects.active
# the baked glb is split along its UV seams: weld it first, or the seams read as loose parts and decimation stalls
bm_w = bmesh.new()
bm_w.from_mesh(work.data)
diag = max(work.dimensions)
bmesh.ops.remove_doubles(bm_w, verts=bm_w.verts[:], dist=1e-4 * diag)
bm_w.to_mesh(work.data)
bm_w.free()
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="LOOSE")
bpy.ops.object.mode_set(mode="OBJECT")
parts = [o for o in bpy.context.selected_objects]
sizes = {o.name: len(o.data.polygons) for o in parts}
big = max(sizes.values())
for o in list(parts):
    if sizes[o.name] < a.min_part * big:
        bpy.data.objects.remove(o, do_unlink=True)
        parts.remove(o)


def bbox(o):
    cs = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return Vector((min(c.x for c in cs), min(c.y for c in cs), min(c.z for c in cs))), \
        Vector((max(c.x for c in cs), max(c.y for c in cs), max(c.z for c in cs)))


if a.split:
    # seeds = the big loose parts; a small part joins the seed it (nearly) touches, else it is its own asset
    from mathutils.kdtree import KDTree
    span = max(max(bbox(o)[1][k] for o in parts) - min(bbox(o)[0][k] for o in parts) for k in range(3))
    big = max(len(o.data.polygons) for o in parts)
    seeds = [o for o in parts if len(o.data.polygons) >= a.seed * big]
    groups = {o.name: [o] for o in seeds}
    trees = {}
    for o in seeds:
        vs = [o.matrix_world @ v.co for v in o.data.vertices]
        t = KDTree(len(vs))
        for i, v in enumerate(vs):
            t.insert(v, i)
        t.balance()
        trees[o.name] = t
    for o in parts:
        if o in seeds:
            continue
        vs = [o.matrix_world @ v.co for v in o.data.vertices][::7] or [Vector()]
        best, bd = None, 1e9
        for nm, t in trees.items():
            d = min(t.find(v)[2] for v in vs)
            if d < bd:
                best, bd = nm, d
        if best is not None and bd < 0.03 * span:
            groups[best].append(o)
        else:
            groups[o.name] = [o]
    groups = sorted(groups.values(), key=lambda g: min(bbox(o)[0].x for o in g))
else:
    groups = [parts]

names = [n for n in a.names.split(",") if n] or \
    ([f"{a.name}-{i + 1}" for i in range(len(groups))] if a.split else [a.name])
assets = []
for g, nm in zip(groups, names):
    bpy.ops.object.select_all(action="DESELECT")
    for o in g:
        o.select_set(True)
    bpy.context.view_layer.objects.active = g[0]
    if len(g) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = nm
    assets.append(ob)

def bake_atlas(ob):
    """Cycles selected-to-active DIFFUSE colour bake from the generated mesh onto ob's own smart-project UVs."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 4
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    ob.data.uv_layers.new(name="UVMap")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004)
    bpy.ops.object.mode_set(mode="OBJECT")
    im = bpy.data.images.new(ob.name + "-albedo", a.atlas, a.atlas)
    mat = bpy.data.materials.new(ob.name + "-tex")
    mat.use_nodes = True
    tn = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tn.image = im
    mat.node_tree.nodes.active = tn
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    hi.hide_render = False
    hi.select_set(True)
    for slot in hi.material_slots:  # Hunyuan3D-2 GLBs omit metallicFactor (glTF default 1): a DIFFUSE bake reads black
        if slot.material and slot.material.use_nodes:
            for n in slot.material.node_tree.nodes:
                if n.type == "BSDF_PRINCIPLED" and a.metal_off:
                    for link in list(n.inputs["Metallic"].links):
                        slot.material.node_tree.links.remove(link)
                if n.type == "BSDF_PRINCIPLED" and not n.inputs["Metallic"].links:
                    n.inputs["Metallic"].default_value = 0.0
    size = max(ob.dimensions)
    bk = scene.render.bake
    bk.use_selected_to_active = True
    bk.cage_extrusion = 0.01 * size
    bk.max_ray_distance = 0.05 * size
    bk.margin = 4
    bk.target = "IMAGE_TEXTURES"
    bk.use_pass_direct = bk.use_pass_indirect = False
    bk.use_pass_color = True
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"})
    if a.keep_texture and a.normal_map > 0:   # PBR: the high mesh's detail as a tangent-space normal map
        imn = bpy.data.images.new(ob.name + "-normal", a.normal_map, a.normal_map)
        imn.colorspace_settings.name = "Non-Color"
        nn = mat.node_tree.nodes.new("ShaderNodeTexImage")
        nn.image = imn
        mat.node_tree.nodes.active = nn
        bk.normal_space = "TANGENT"
        if geo:  # --geo: the refined mesh's detail, not the generated one's
            hi.select_set(False)
            geo.select_set(True)
        bpy.ops.object.bake(type="NORMAL")
        if geo:
            geo.select_set(False)
            hi.select_set(True)
        ob["normal"] = imn.name
    bk.use_selected_to_active = False
    hi.select_set(False)
    ob["atlas"] = im.name
    if a.keep_texture:
        return   # PBR: the texture as generated, no grade
    # the same grade as the facet colours
    n = a.atlas * a.atlas
    pix = np.empty(n * 4, dtype=np.float32)
    im.pixels.foreach_get(pix)
    pix = pix.reshape(n, 4)
    c = pix[:, :3]
    mx, mn = c.max(1), c.min(1)
    s_ = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    c = mx[:, None] + (c - mx[:, None]) * (np.clip(s_ * a.sat, 0, 1) / np.maximum(s_, 1e-6))[:, None]
    pix[:, :3] = np.clip(c * a.val, 0, 1)
    im.pixels.foreach_set(pix.ravel())
    im.update()


# --- one scale for the whole set: the largest asset's fit dimension = --size ---
def dims(o):
    lo, hi_ = bbox(o)
    d = hi_ - lo
    return d, (d.z if a.fit == "height" else max(d.x, d.y))

scale = a.size / max(dims(o)[1] for o in assets)
report = []
out_root = os.path.abspath(os.path.expanduser(a.out))
budgets = [int(t) for t in a.tris.split(",")]
for ai, ob in enumerate(assets):
    budget = budgets[min(ai, len(budgets) - 1)]
    # decimate to the triangle budget, flat shaded
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    tris_now = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    ob.data.validate()
    if a.solidify > 0:  # open thin shells (the wreck's planks): give them thickness so a voxel remesh keeps them
        so = ob.modifiers.new("solid", "SOLIDIFY")
        so.thickness = a.solidify * max(ob.dimensions)
        so.offset = 0.0
        bpy.ops.object.modifier_apply(modifier=so.name)
    if a.remesh > 0:  # solid props: a voxel remesh drops the generator's inner shells and slivers before decimating
        rm = ob.modifiers.new("remesh", "REMESH")
        rm.mode = "VOXEL"
        rm.voxel_size = a.remesh * max(ob.dimensions)
        rm.adaptivity = 0.0
        bpy.ops.object.modifier_apply(modifier=rm.name)
    tri0 = ob.modifiers.new("tri0", "TRIANGULATE")
    bpy.ops.object.modifier_apply(modifier=tri0.name)
    if a.simplifier == "fqmr" and len(ob.data.polygons) > budget:
        # TRELLIS-mac meshes keep their holes (no cumesh hole filling): Blender's collapse will not cross the open
        # borders and stalls at 3-5x the budget; a quadric simplifier without border locking gets there cleanly.
        site = os.path.expanduser(os.environ.get("BLENDER_SITE", "~/ml/img2mesh/blender-site"))
        if site not in sys.path:
            sys.path.append(site)
        import fast_simplification
        me0 = ob.data
        v = np.array([vv.co[:] for vv in me0.vertices], dtype=np.float32)
        f = np.array([pp.vertices[:] for pp in me0.polygons], dtype=np.int64)
        sv, sf = fast_simplification.simplify(v, f, target_reduction=1.0 - budget / len(f))
        me0.clear_geometry()
        me0.from_pydata(sv.tolist(), [], sf.tolist())
        me0.update()
    for _ in range(12):  # blender: one big collapse stalls on generated meshes; step down x0.3 per pass
        tris_now = sum(len(p.vertices) - 2 for p in ob.data.polygons)
        if tris_now <= budget * 1.02:
            break
        mod = ob.modifiers.new("dec", "DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.ratio = max(budget / tris_now, 0.3)
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if a.planar > 0 and len(ob.data.polygons) > budget * 1.1:  # still over: merge near-coplanar facets (keeps thin parts)
        pl = ob.modifiers.new("planar", "DECIMATE")
        pl.decimate_type = "DISSOLVE"
        pl.angle_limit = math.radians(a.planar)
        bpy.ops.object.modifier_apply(modifier=pl.name)
        t2 = ob.modifiers.new("tri2", "TRIANGULATE")
        bpy.ops.object.modifier_apply(modifier=t2.name)
    print("DEC", ob.name, "->", len(ob.data.polygons), flush=True)
    tri = ob.modifiers.new("tri", "TRIANGULATE")
    bpy.ops.object.modifier_apply(modifier=tri.name)
    if a.recalc_normals:
        bm_n = bmesh.new()
        bm_n.from_mesh(ob.data)
        bmesh.ops.recalc_face_normals(bm_n, faces=bm_n.faces[:])
        bm_n.to_mesh(ob.data)
        bm_n.free()
    for p in ob.data.polygons:
        p.use_smooth = False
    me = ob.data
    if a.keep_texture:   # PBR: smooth, hard only past --smooth-angle
        me.shade_smooth()
        me.set_sharp_from_angle(angle=math.radians(a.smooth_angle))
    for uv in list(me.uv_layers):
        me.uv_layers.remove(uv)
    if a.atlas:
        bake_atlas(ob)

    if a.keep_texture:
        palette = []   # PBR: the baked texture carries the colour
    else:
        # one colour per facet: mean of 4 texture samples under the face
        co = np.array([v.co[:] for v in me.vertices], dtype=np.float32)
        cols = []
        for p in me.polygons:
            vs = co[list(p.vertices)]
            c = vs.mean(0)
            pts = [c] + [0.6 * c + 0.4 * v for v in vs]
            cols.append(sample(pts).mean(0))
        cols = np.clip(np.array(cols), 0, 1)

        # grade in HSV: a touch more saturation / value, like the painted concept
        mx, mn = cols.max(1), cols.min(1)
        s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
        grey = mx[:, None]
        cols = grey + (cols - grey) * (np.clip(s * a.sat, 0, 1) / np.maximum(s, 1e-6))[:, None]
        cols = np.clip(cols * a.val, 0, 1)

        # snap to k flat colours (k-means, area-weighted): the hand-painted facet palette
        if a.quant > 0 and len(cols) > a.quant:
            area = np.array([p.area for p in me.polygons]) + 1e-9
            rng = np.random.default_rng(1)
            cent = cols[rng.choice(len(cols), a.quant, replace=False, p=area / area.sum())]
            for _ in range(20):
                lab = ((cols[:, None, :] - cent[None]) ** 2).sum(2).argmin(1)
                for k in range(a.quant):
                    m = lab == k
                    if m.any():
                        cent[k] = (cols[m] * area[m, None]).sum(0) / area[m].sum()
            cols = cent[lab]
            palette = sorted({"#%02x%02x%02x" % tuple(int(round(v * 255)) for v in c) for c in cent[np.unique(lab)]})
        else:
            palette = []

        attr = me.color_attributes.new("Color", "FLOAT_COLOR", "CORNER")
        for p, c in zip(me.polygons, cols):
            for li in p.loop_indices:
                attr.data[li].color_srgb = (float(c[0]), float(c[1]), float(c[2]), 1.0)

    # scale + pivot: metres, the base of the prop at the origin
    ob.scale = (scale, scale, scale)
    bpy.ops.object.transform_apply(scale=True)
    co = np.array([v.co[:] for v in me.vertices], dtype=np.float32)
    zmin, zmax = co[:, 2].min(), co[:, 2].max()
    foot = co[co[:, 2] <= zmin + 0.03 * (zmax - zmin)]
    pivot = np.array([foot[:, 0].mean(), foot[:, 1].mean(), zmin])
    for v in me.vertices:
        v.co = Vector(np.array(v.co[:]) - pivot)
    ob.location = (0, 0, 0)
    if a.yaw:
        ob.rotation_mode = "XYZ"
        ob.rotation_euler[2] = math.radians(a.yaw)
        bpy.ops.object.transform_apply(rotation=True)
    report.append((ob, palette))

# --- AO into the vertex colour alpha (Cycles, per asset, alone in the scene; not in PBR mode: no vertex colour) ---
if a.ao > 0 and not a.keep_texture:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 64
    if scene.world is None:
        scene.world = bpy.data.worlds.new("w")
    mat = bpy.data.materials.new("bake")
    mat.use_nodes = True
    for ob, _ in report:
        others = [o for o in scene.objects if o is not ob]
        for o in others:
            o.hide_render = True
        ob.data.materials.clear()
        ob.data.materials.append(mat)
        d = max(ob.dimensions)
        scene.world.light_settings.distance = max(0.05, a.ao * d)
        ao = ob.data.color_attributes.new("AO", "FLOAT_COLOR", "CORNER")
        ob.data.color_attributes.active_color = ao
        bpy.ops.object.select_all(action="DESELECT")
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        scene.render.bake.target = "VERTEX_COLORS"
        bpy.ops.object.bake(type="AO")
        col = ob.data.color_attributes["Color"]
        for i in range(len(col.data)):
            r, g, b, _ = col.data[i].color
            aov = ao.data[i].color[0]
            col.data[i].color = (r, g, b, 0.35 + 0.65 * aov)
        ob.data.color_attributes.remove(ao)
        ob.data.color_attributes.active_color = ob.data.color_attributes["Color"]
        for o in others:
            o.hide_render = False

# --- export: one glb per asset, a plain material that reads the vertex colour ---
out_mat = bpy.data.materials.new("driftwood-hero")
out_mat.use_nodes = True
nt = out_mat.node_tree
bsdf = nt.nodes["Principled BSDF"]
vc = nt.nodes.new("ShaderNodeVertexColor")
vc.layer_name = "Color"
nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.9
summary = []
for ob, palette in report:
    d = ob.dimensions
    folder = os.path.join(out_root, ob.name)
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, ob.name + ".glb")
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    if a.keep_texture:   # PBR: base colour + normal atlases, constant roughness, no COLOR_0
        pm = bpy.data.materials.new(ob.name + "-pbr")
        pm.use_nodes = True
        pt = pm.node_tree
        pb = pt.nodes["Principled BSDF"]
        tn = pt.nodes.new("ShaderNodeTexImage")
        tn.image = bpy.data.images[ob["atlas"]]
        pt.links.new(tn.outputs["Color"], pb.inputs["Base Color"])
        if "normal" in ob:
            nt_ = pt.nodes.new("ShaderNodeTexImage")
            nt_.image = bpy.data.images[ob["normal"]]
            nm = pt.nodes.new("ShaderNodeNormalMap")
            pt.links.new(nt_.outputs["Color"], nm.inputs["Color"])
            pt.links.new(nm.outputs["Normal"], pb.inputs["Normal"])
        pb.inputs["Roughness"].default_value = a.roughness
        pb.inputs["Metallic"].default_value = 0.0
        ob.data.materials.clear()
        ob.data.materials.append(pm)
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=True,
                                  export_vertex_color="NONE", export_normals=True, export_tangents="normal" in ob,
                                  export_image_format="WEBP", export_image_quality=85)
        info = {"name": ob.name, "source": os.path.basename(a.src), "tris": len(ob.data.polygons),
                "size_m": [round(d.x, 2), round(d.y, 2), round(d.z, 2)], "pivot": "base centre, z=0 (Blender z-up; glTF y-up)",
                "material": f"PBR: {a.atlas}² WebP base colour (ungraded)"
                            + (f" + {a.normal_map}² tangent-space normal map" if "normal" in ob else "")
                            + f", roughness {a.roughness}, smooth shading (hard past {a.smooth_angle}°), no COLOR_0",
                "palette": palette}
        json.dump(info, open(os.path.join(folder, ob.name + ".json"), "w"), indent=1)
        summary.append(info)
        continue
    ob.data.materials.clear()
    ob.data.materials.append(out_mat)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=True,
                              export_vertex_color="ACTIVE", export_all_vertex_colors=False, export_normals=True,
                              export_image_format="NONE")
    info = {"name": ob.name, "source": os.path.basename(a.src), "tris": len(ob.data.polygons),
            "size_m": [round(d.x, 2), round(d.y, 2), round(d.z, 2)], "pivot": "base centre, z=0 (Blender z-up; glTF y-up)",
            "vertex_colour": "COLOR_0 rgb = albedo (sRGB-graded, stored linear), a = Cycles AO (0.35..1)",
            "palette": palette}
    if a.atlas and "atlas" in ob:
        tm = bpy.data.materials.new(ob.name + "-tex-out")
        tm.use_nodes = True
        tb = tm.node_tree.nodes["Principled BSDF"]
        tn = tm.node_tree.nodes.new("ShaderNodeTexImage")
        tn.image = bpy.data.images[ob["atlas"]]
        tm.node_tree.links.new(tn.outputs["Color"], tb.inputs["Base Color"])
        tb.inputs["Roughness"].default_value = 0.9
        ob.data.materials.clear()
        ob.data.materials.append(tm)
        bpy.ops.export_scene.gltf(filepath=os.path.join(folder, ob.name + ".tex.glb"), export_format="GLB",
                                  use_selection=True, export_yup=True, export_vertex_color="NONE",
                                  export_normals=True, export_image_format="WEBP", export_image_quality=85)
        info["atlas"] = f"{ob.name}.tex.glb: {a.atlas}² WebP base colour on smart-project UVs, no COLOR_0"
    json.dump(info, open(os.path.join(folder, ob.name + ".json"), "w"), indent=1)
    summary.append(info)
print("DRIFTWOOD_POST " + json.dumps([{k: s[k] for k in ("name", "tris", "size_m")} for s in summary]))
