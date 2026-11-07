"""E343: a generated head-and-shoulders bust → the head alone, for a code-built figure whose head is its own mesh (Driftwood's
Wendell and Drowned Sailor, Nine Dragon's brushed figures): the same neck rule as face_remaster.py --graft-v2 — the cut at
the bust's own neck (the narrowest section of its back half between chin and shoulders), dipping --tilt degrees under the
jaw in front, straight (bisect), floating crumbs dropped — then exported with its paint for scripts/img2mesh/driftwood_post.py
(the faceted, per-facet-colour toon post).

  blender -b -P scripts/img2mesh/head_cut.py -- --in bust.glb --out head.glb [--neck-range 0.45 0.8] [--tilt 30]
Output: <out> (the head, metres as generated, +Y up in glTF, its neck ring on y = its lowest point).
"""
import argparse, math, sys
import bpy, bmesh
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
ap = argparse.ArgumentParser()
ap.add_argument("--in", dest="inp", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--neck-range", type=float, nargs=2, default=[0.45, 0.8])
ap.add_argument("--neck", type=float, default=None, help="the neck as a fraction of the bust's height from the top (no search)")
ap.add_argument("--tilt", type=float, default=30.0)
a = ap.parse_args(argv)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=a.inp)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
for o in bpy.context.scene.objects:
    o.select_set(o in meshes)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active
ob.data.transform(ob.matrix_world); ob.parent = None; ob.matrix_world.identity()
for ms in ob.material_slots:
    m = ms.material
    if m and m.node_tree:
        for n in m.node_tree.nodes:
            if n.type == "BSDF_PRINCIPLED":
                for l in list(n.inputs["Metallic"].links):
                    m.node_tree.links.remove(l)
                n.inputs["Metallic"].default_value = 0.0
bm = bmesh.new(); bm.from_mesh(ob.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5 * max(ob.dimensions))
bm.to_mesh(ob.data); bm.free()

co = np.empty(len(ob.data.vertices) * 3); ob.data.vertices.foreach_get("co", co); B = co.reshape(-1, 3)
bt, bb = B[:, 2].max(), B[:, 2].min(); h = bt - bb
tp = B[B[:, 2] > bt - 0.3 * h]; cx, cy = tp[:, 0].mean(), tp[:, 1].mean()
if a.neck is None:
    best, bf = 1e9, 0.6
    for f in np.arange(a.neck_range[0], a.neck_range[1] + 1e-6, 0.0125):
        z = bt - f * h
        band = B[np.abs(B[:, 2] - z) < 0.006 * h]
        back = band[band[:, 1] > cy - 0.02 * h]
        if len(back) < 8:
            continue
        w = np.percentile(np.abs(back[:, 0] - cx), 95)
        if w < best:
            best, bf = w, f
else:
    bf = a.neck
zc = bt - bf * h
print(f"[head] neck at {bf:.3f} of the bust's height from the top")
tk = math.tan(math.radians(a.tilt))


def shear(sign):
    c = np.empty(len(ob.data.vertices) * 3); ob.data.vertices.foreach_get("co", c); c = c.reshape(-1, 3)
    c[:, 2] += sign * np.maximum(0.0, cy - c[:, 1]) * tk        # the front (−Y in Blender) dips under the jaw
    ob.data.vertices.foreach_set("co", c.ravel()); ob.data.update()


shear(1)
bm = bmesh.new(); bm.from_mesh(ob.data)
bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-6, plane_co=(0, 0, zc), plane_no=(0, 0, 1), clear_inner=True)
bm.to_mesh(ob.data); bm.free()
shear(-1)
# floating crumbs (< 2 % of the largest piece)
bm = bmesh.new(); bm.from_mesh(ob.data)
seen, isl = set(), []
for f in bm.faces:
    if f in seen:
        continue
    st, cur = [f], []
    seen.add(f)
    while st:
        g = st.pop(); cur.append(g)
        for e in g.edges:
            for k in e.link_faces:
                if k not in seen:
                    seen.add(k); st.append(k)
    isl.append((sum(x.calc_area() for x in cur), cur))
big = max(i[0] for i in isl)
bmesh.ops.delete(bm, geom=[f for ar, c in isl if ar < 0.02 * big for f in c], context="FACES")
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
bm.to_mesh(ob.data); bm.free()
c2 = np.empty(len(ob.data.vertices) * 3); ob.data.vertices.foreach_get("co", c2); c2 = c2.reshape(-1, 3)
top, bot = c2[:, 2].max(), c2[:, 2].min()
print(f"[head] neckFromTop {(top - zc) / max(top - bot, 1e-9):.4f} (the neck's height below the top, fraction of the head's height)")
bpy.ops.export_scene.gltf(filepath=a.out, export_format="GLB", use_selection=False, export_yup=True, export_apply=True)
print(f"[head] {a.out}: {len(ob.data.polygons)} faces")
