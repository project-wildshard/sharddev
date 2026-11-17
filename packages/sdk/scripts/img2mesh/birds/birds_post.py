"""Pine Hollow birds (round 16), step 1 per mesh: a generated bird → an oriented, sized, decimated low mesh with its own
0..1 UVs and a 1024² base colour baked from the generation (un-graded), plus the measurements the game animates by.

  blender -b -P scripts/img2mesh/birds/birds_post.py -- --config scripts/img2mesh/birds/birds.json --out <dir> [--only raven_fly,…]

birds.json: { "<mesh>": { "src": glb, "rot": [rx,ry,rz] (Blender Euler XYZ°, after import), "pose": "perch"|"fly",
  "fit": "length"|"span", "size": metres, "tris": budget, "flatten": bool (fly: wings to one horizontal plane),
  "level": bool (fly: wing plane → horizontal), "span": m (fly: stretch the wings), "inflate": k (fly: thicken the body),
  "remesh": voxel m (decimate a remeshed copy), "neck"/"headAxis"/"tailRoot"/"tailAxis" (glTF, hand-read pivots),
  "minPart": share } }. Also writes <mesh>.pos.npy (the position bake, for birds_atlas.py's eye paint).
Blender frame while working: beak −Y, up +Z, right wing +X (= glTF / three: beak +Z, up +Y, right wing +X).
Writes <out>/<mesh>.low.glb (low mesh, tile-local UVs, baked image), <out>/<mesh>.png (1024² bake), <out>/<mesh>.json
(measurements in glTF/three coordinates, metres; the pack step re-measures after the atlas remap but keeps these).
"""
import argparse
import json
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--config", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--only", default="")
ap.add_argument("--bake", type=int, default=1024)
a = ap.parse_args(argv)
os.makedirs(a.out, exist_ok=True)
CFG = json.load(open(a.config))
only = [s for s in a.only.split(",") if s]


def g2(v):
    """Blender (x, y, z) → glTF/three (x, z, −y)"""
    return [round(float(v[0]), 4), round(float(v[2]), 4), round(float(-v[1]), 4)]


def verts_np(o):
    n = len(o.data.vertices)
    arr = np.empty(n * 3, dtype=np.float64)
    o.data.vertices.foreach_get("co", arr)
    return arr.reshape(n, 3)


def set_verts(o, P):
    o.data.vertices.foreach_set("co", P.astype(np.float64).ravel())
    o.data.update()


def drop_crumbs(o, share):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.verts.ensure_lookup_table()
    seen, parts = set(), []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack, comp = [v], []
        seen.add(v.index)
        while stack:
            x = stack.pop()
            comp.append(x)
            for e in x.link_edges:
                y = e.other_vert(x)
                if y.index not in seen:
                    seen.add(y.index)
                    stack.append(y)
        parts.append(comp)
    parts.sort(key=len, reverse=True)
    kill = [v for p in parts[1:] if len(p) < share * len(parts[0]) for v in p]
    if kill:
        bmesh.ops.delete(bm, geom=kill, context="VERTS")
    bm.to_mesh(o.data)
    bm.free()
    return len(parts), len(kill)


def tri_count(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def body_half_width(P, span):
    """fly: the |x| where the vertical thickness drops off the body into the wing"""
    ax = np.abs(P[:, 0])
    edges = np.linspace(0, ax.max(), 61)
    th = []
    for i in range(60):
        m = (ax >= edges[i]) & (ax < edges[i + 1])
        th.append(np.percentile(P[m, 2], 97) - np.percentile(P[m, 2], 3) if m.sum() > 8 else 0.0)
    th = np.array(th)
    t0 = th[:3].max()
    for i in range(2, 60):
        if th[i] < 0.42 * t0:
            return float(edges[i]), th
    return float(span * 0.1), th


def flatten_wings(P, hw):
    """move every vertex outboard of the body by −(its wing's median height at that |x| − the root's): no droop, no dihedral"""
    Q = P.copy()
    for side in (-1, 1):
        m = (P[:, 0] * side) > hw * 0.9
        if m.sum() < 20:
            continue
        x = np.abs(P[m, 0])
        edges = np.linspace(hw * 0.9, x.max() + 1e-6, 41)
        mids, med = [], []
        for i in range(40):
            k = (x >= edges[i]) & (x < edges[i + 1])
            if k.sum() >= 4:
                mids.append((edges[i] + edges[i + 1]) / 2)
                med.append(np.median(P[m, 2][k]))
        mids, med = np.array(mids), np.array(med)
        # a running median smooths the feather-tip noise
        sm = np.array([np.median(med[max(0, i - 2):i + 3]) for i in range(len(med))])
        base = sm[0]
        off = np.interp(x, mids, sm) - base
        ramp = np.clip((x - hw) / (hw * 0.35 + 1e-6), 0, 1)
        Q[np.where(m)[0], 2] = P[m, 2] - off * ramp
    return Q


def slabs(P, a, n=50, rmax=1e9):
    """sections of P perpendicular to the unit axis `a` (in the YZ plane): s centres, thickness (in-plane ⊥), width (x), ⊥ centre"""
    a = np.asarray(a, dtype=np.float64)
    b = np.cross(a, [1.0, 0, 0])   # the in-plane perpendicular
    s, q = P @ a, P @ b
    keep = np.abs(q) < rmax        # a cylinder about the axis: the legs / tail do not project into the head's sections
    P, s, q = P[keep], s[keep], q[keep]
    edges = np.linspace(0, s.max(), n + 1)
    S, H, W, C = [], [], [], []
    for i in range(n):
        k = (s >= edges[i]) & (s < edges[i + 1])
        S.append((edges[i] + edges[i + 1]) / 2)
        if k.sum() >= 6:
            H.append(np.percentile(q[k], 97) - np.percentile(q[k], 3))
            W.append(np.percentile(P[k, 0], 97) - np.percentile(P[k, 0], 3))
            C.append((np.percentile(q[k], 97) + np.percentile(q[k], 3)) / 2)
        else:
            H.append(0.0); W.append(0.0); C.append(0.0)
    return np.array(S), np.array(H), np.array(W), np.array(C), b


def unit(v):
    v = np.array([0.0, v[1], v[2]])
    return v / (np.linalg.norm(v) + 1e-12)


def measure(P, pose, hw, ov=None):
    """the game's pivots, from the high mesh (already centred on the body). Returns a dict in glTF coordinates."""
    lo, hi = P.min(0), P.max(0)
    body = P if pose == "perch" else P[np.abs(P[:, 0]) < hw]
    beak = body[np.argmin(body[:, 1])]
    tailtip = body[np.argmax(np.linalg.norm(body - beak, axis=1))]
    ah = np.array([0.0, -1.0, 0.0]) if pose == "fly" else unit(beak)
    at = np.array([0.0, 1.0, 0.0]) if pose == "fly" else unit(tailtip)
    # head / neck: walking in from the beak tip, the first local maximum of the section (the head), then the minimum behind it
    Lb = float(np.linalg.norm(tailtip - beak))
    S, H, W, C, b = slabs(body, ah, rmax=0.2 * Lb if pose == "perch" else 1e9)
    A = np.convolve(H * W, np.ones(3) / 3, mode="same")
    n = len(S)
    idx = list(range(n - 1, -1, -1))      # from the tip inwards
    head_i = neck_i = None
    for j in range(2, n - 2):
        i = idx[j]
        if A[i] >= A[i + 1] and A[i] >= A[i - 1] and A[i] > 0.15 * A.max():
            head_i = i
            break
    if head_i is not None:
        for i in range(head_i - 1, max(1, int(n * 0.2)), -1):
            if A[i] <= A[i - 1] and A[i] <= A[i + 1]:
                neck_i = i
                break
    if os.environ.get("BIRDS_DEBUG"):
        print("S", np.round(S, 3).tolist(), "\nA", np.round(A * 1e4, 1).tolist(), "\nH", np.round(H, 3).tolist(), "head", head_i, "neck", neck_i, flush=True)
    if head_i is None:
        head_i = int(n * 0.8)
    if neck_i is None or A[neck_i] > 0.9 * A[head_i]:
        # no clear constriction (the owl's head sits in its shoulders): behind the head's widest section by half its size
        ns = S[head_i] - 0.5 * H[head_i]
        how = "head-max − 0.5·head size"
    else:
        ns = S[neck_i]
        how = "section minimum"
    j = int(np.clip(np.searchsorted(S, ns), 0, n - 1))
    neck = ah * ns + b * C[j]
    if ov and "neck" in ov:   # the hand-read pivot (glTF) → Blender
        neck = np.array([ov["neck"][0], -ov["neck"][2], ov["neck"][1]], dtype=np.float64)
    # the tail root: in from the tail tip, the first section at least half the body's thickness
    St, Ht, Wt, Ct, bt = slabs(body, at, rmax=0.2 * Lb if pose == "perch" else 1e9)
    hmax = Ht.max()
    ti = next((i for i in range(len(St) - 1, -1, -1) if Ht[i] > 0.5 * hmax), 0)
    troot = at * St[ti] + bt * Ct[ti]
    # shoulders
    if pose == "fly":
        sh = []
        for sgn in (-1, 1):
            k = (np.abs(P[:, 0] - sgn * hw) < max(hw * 0.12, 0.004))
            zl, zt = np.percentile(P[k, 1], 3), np.percentile(P[k, 1], 97)   # Blender −Y = forward: zl is the leading edge
            sh.append([sgn * hw, float(zl + 0.25 * (zt - zl)), float(np.median(P[k, 2]))])
    else:
        # folded: the wing root on the upper flank, halfway from the body centre to the neck
        p = neck * 0.5
        k = np.linalg.norm(P[:, 1:] - p[1:], axis=1) < 0.06 * (hi[2] - lo[2])
        xm = float(np.percentile(np.abs(P[k, 0]), 95)) if k.sum() > 8 else 0.05
        sh = [[-xm * 0.8, p[1], p[2]], [xm * 0.8, p[1], p[2]]]
        hw = xm
    G = np.array([[v[0], v[2], -v[1]] for v in (lo, hi)])
    return {
        "bbox": {"min": [round(float(v), 4) for v in G.min(0)], "max": [round(float(v), 4) for v in G.max(0)]},
        "shoulderL": g2(sh[0]), "shoulderR": g2(sh[1]),
        "bodyHalfWidth": round(float(hw), 4),
        "neck": g2(neck), "headZ": g2(neck)[2], "headY": g2(neck)[1], "headAxis": g2(ah),
        "feetY": round(float(lo[2]), 4),
        "tailRoot": g2(troot), "tailZ": g2(troot)[2], "tailAxis": g2(at),
        "beakTip": g2(beak), "tailTip": g2(tailtip),
        "neckHow": how,
    }


def mark_chart_seams(o, min_share):
    """few, large UV charts: faces grouped by their dominant axis (±X ±Y ±Z), connected, the small groups merged into
    the neighbour they share the most border with; the chart borders become the seams"""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.faces.ensure_lookup_table()
    D = np.array([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], dtype=np.float64)
    N = np.array([f.normal[:] for f in bm.faces])
    lab = np.argmax(N @ D.T, 1)
    nf = len(bm.faces)
    nb = [[e.link_faces[1].index if e.link_faces[0].index == f.index else e.link_faces[0].index
           for e in f.edges if len(e.link_faces) == 2] for f in bm.faces]

    def comps():
        cid = -np.ones(nf, dtype=int); k = 0
        for i in range(nf):
            if cid[i] >= 0:
                continue
            st = [i]; cid[i] = k
            while st:
                x = st.pop()
                for y in nb[x]:
                    if cid[y] < 0 and lab[y] == lab[x]:
                        cid[y] = k; st.append(y)
            k += 1
        return cid, k
    for _ in range(30):
        cid, k = comps()
        size = np.bincount(cid, minlength=k)
        small = [q for q in np.argsort(size) if size[q] < min_share * nf]
        if not small:
            break
        changed = False
        for q in small:
            faces = np.where(cid == q)[0]
            border = {}
            for x in faces:
                for y in nb[x]:
                    if cid[y] != q:
                        border[cid[y]] = border.get(cid[y], 0) + 1
            if border:
                tgt = max(border, key=border.get)
                lab[faces] = lab[np.where(cid == tgt)[0][0]]
                cid[faces] = tgt
                changed = True
        if not changed:
            break
    cid, k = comps()
    for e in bm.edges:
        lf = e.link_faces
        e.seam = bool(len(lf) != 2 or cid[lf[0].index] != cid[lf[1].index])
    bm.to_mesh(o.data)
    bm.free()
    return k


def bake_position(lo_o, name, size):
    """the low mesh's object-space position per texel (Blender frame) → <name>.pos.npy (H, W, 3) float16, image rows top-down"""
    img = bpy.data.images.new(name + "_pos", size, size, alpha=False, float_buffer=True)
    img.colorspace_settings.name = "Non-Color"
    mat = bpy.data.materials.new(name + "_pos")
    mat.use_nodes = True
    nt = mat.node_tree
    for nd in list(nt.nodes):
        nt.nodes.remove(nd)
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    em = nt.nodes.new("ShaderNodeEmission")
    outn = nt.nodes.new("ShaderNodeOutputMaterial")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.links.new(geo.outputs["Position"], em.inputs["Color"])
    nt.links.new(em.outputs["Emission"], outn.inputs["Surface"])
    nt.nodes.active = tex
    keep = list(lo_o.data.materials)
    lo_o.data.materials.clear()
    lo_o.data.materials.append(mat)
    bpy.ops.object.select_all(action="DESELECT")
    lo_o.select_set(True)
    bpy.context.view_layer.objects.active = lo_o
    bpy.ops.object.bake(type="EMIT", use_selected_to_active=False, margin=4, margin_type="EXTEND")
    px = np.empty(size * size * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    np.save(os.path.join(a.out, name + ".pos.npy"), px.reshape(size, size, 4)[::-1, :, :3].astype(np.float16))
    lo_o.data.materials.clear()
    for m_ in keep:
        lo_o.data.materials.append(m_)


def bake(hi_o, lo_o, name, size):
    img = bpy.data.images.new(name + "_bake", size, size, alpha=False)
    img.colorspace_settings.name = "sRGB"
    mat = bpy.data.materials.new(name + "_lo")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 0.8
    nt.nodes.active = tex
    lo_o.data.materials.clear()
    lo_o.data.materials.append(mat)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 4
    bpy.ops.object.select_all(action="DESELECT")
    hi_o.select_set(True)
    lo_o.select_set(True)
    bpy.context.view_layer.objects.active = lo_o
    d = max(lo_o.dimensions)
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, use_selected_to_active=True,
                        cage_extrusion=d * 0.02, max_ray_distance=d * 0.08, margin=24, margin_type="EXTEND")
    path = os.path.join(a.out, name + ".png")
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    img.filepath = path
    return path


for name, c in CFG.items():
    if name.startswith("_") or (only and name not in only):
        continue
    print(f"\n==== {name}", flush=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.expanduser(c["src"]))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.data.transform(mw)
        o.matrix_world = Matrix.Identity(4)
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    hi_o = bpy.context.view_layer.objects.active
    for o in list(bpy.context.scene.objects):
        if o is not hi_o:
            bpy.data.objects.remove(o)
    hi_o.name = name + "_hi"
    for m in hi_o.data.materials:   # a generation's metallic 1 bakes to black
        if m and m.use_nodes:
            for nd in m.node_tree.nodes:
                if nd.type == "BSDF_PRINCIPLED":
                    for l in list(nd.inputs["Metallic"].links):
                        m.node_tree.links.remove(l)
                    nd.inputs["Metallic"].default_value = 0.0
    bm = bmesh.new(); bm.from_mesh(hi_o.data)   # a painted generation is split along its UV seams: weld it first
    nv = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5 * max(hi_o.dimensions))
    print(f"welded {nv} → {len(bm.verts)} verts", flush=True)
    bm.to_mesh(hi_o.data); bm.free()
    parts, killed = drop_crumbs(hi_o, c.get("minPart", 0.02))
    print(f"parts {parts}, crumbs dropped {killed} verts", flush=True)

    # orient, size
    hi_o.data.transform(Euler([math.radians(v) for v in c.get("rot", [0, 0, 0])], "XYZ").to_matrix().to_4x4())
    P = verts_np(hi_o)
    if c.get("level"):   # fly: turn about X so the wing plane (least-variance axis, wing verts) faces +Z
        Q = P - P.mean(0)
        wing = Q[np.abs(Q[:, 0]) > 0.25 * np.abs(Q[:, 0]).max()]
        w, V = np.linalg.eigh(np.cov(wing.T))
        nrm = V[:, 0] if V[2, 0] >= 0 else -V[:, 0]
        ang = math.atan2(nrm[1], nrm[2]) + math.radians(c.get("pitch", 0.0))   # rotate by +ang about X: (y,z) → n on +Z
        R = np.array(Euler((ang, 0, 0), "XYZ").to_matrix())
        P = P @ R.T
        print(f"level: wing normal {np.round(nrm, 3)} → turned {math.degrees(ang):.1f}° about X", flush=True)
    P -= (P.min(0) + P.max(0)) / 2
    dim = P.max(0) - P.min(0)
    fit = c.get("fit", "length")
    if fit == "tips":    # beak tip (the most forward vertex, −Y) to the farthest vertex from it (the tail tip)
        tip = P[np.argmin(P[:, 1])]
        cur = float(np.linalg.norm(P - tip, axis=1).max())
    else:
        cur = {"length": dim[1], "span": dim[0], "height": dim[2]}[fit]
    s = c["size"] / cur
    P *= s
    if c.get("span") and c["pose"] == "fly":   # stretch the wings outboard of the body to the species' span
        hw0, _ = body_half_width(P, P[:, 0].max() - P[:, 0].min())
        half = (P[:, 0].max() - P[:, 0].min()) / 2
        k = (c["span"] / 2 - hw0) / (half - hw0)
        ax = np.abs(P[:, 0])
        out = ax > hw0
        P[out, 0] = np.sign(P[out, 0]) * (hw0 + (ax[out] - hw0) * k)
        print(f"wings stretched ×{k:.3f} outboard of {hw0:.3f}", flush=True)
    hw = None
    if c["pose"] == "fly":
        hw, th = body_half_width(P, P[:, 0].max() - P[:, 0].min())
        print(f"body half-width {hw:.3f}", flush=True)
        if c.get("flatten", True):
            P = flatten_wings(P, hw)
        if c.get("inflate"):   # a top-view generation is a bas-relief: thicken the body (and head) about its mid-plane
            ax = np.abs(P[:, 0])
            w = np.clip((hw * 1.4 - ax) / (hw * 0.6), 0, 1)
            zm = float(np.median(P[ax < hw, 2]))
            P[:, 2] = zm + (P[:, 2] - zm) * (1 + (c["inflate"] - 1) * w)
            print(f"body inflated ×{c['inflate']} about z={zm:.3f}", flush=True)
    # centre: the body's centroid (fly: inside the body half-width; perch: above the legs), x on the mirror plane
    if c["pose"] == "fly":
        B = P[np.abs(P[:, 0]) < hw]
    else:
        B = P[P[:, 2] > P[:, 2].min() + 0.3 * (P[:, 2].max() - P[:, 2].min())]
    ctr = B.mean(0)
    ctr[0] = (P[:, 0].min() + P[:, 0].max()) / 2
    P -= ctr
    set_verts(hi_o, P)

    # the low mesh: collapse to the budget
    lo_o = hi_o.copy()
    lo_o.data = hi_o.data.copy()
    lo_o.name = name
    bpy.context.scene.collection.objects.link(lo_o)
    if c.get("remesh"):   # a generation too torn for the collapse: decimate a voxel-remeshed copy (the bake still reads hi)
        rm = lo_o.modifiers.new("rm", "REMESH")
        rm.mode = "VOXEL"
        rm.voxel_size = c["remesh"]
        rm.adaptivity = 0.0
        dg = bpy.context.evaluated_depsgraph_get()
        me_r = bpy.data.meshes.new_from_object(lo_o.evaluated_get(dg))
        lo_o.modifiers.remove(rm)
        lo_o.data = me_r
        print(f"remeshed at {c['remesh']} m → {tri_count(lo_o)} tris", flush=True)
    src_me = lo_o.data
    target = c["tris"]
    ratio = target / max(1, tri_count(lo_o))
    for it in range(6):
        mod = lo_o.modifiers.new("dec", "DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.ratio = min(1.0, ratio)
        mod.use_collapse_triangulate = True
        dg = bpy.context.evaluated_depsgraph_get()
        ev = lo_o.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev)
        lo_o.modifiers.remove(mod)
        t = sum(len(p.vertices) - 2 for p in me.polygons)
        if target * 0.93 <= t <= target or it == 5:
            break
        ratio *= target * 0.97 / max(t, 1)
        bpy.data.meshes.remove(me)
    old = lo_o.data
    lo_o.data = me
    me.name = name
    if tri_count(lo_o) > target:
        # Blender's collapse stalls on a generation's open borders: a quadric simplifier without border locking
        site = os.path.expanduser(os.environ.get("BLENDER_SITE", "~/ml/img2mesh/blender-site"))
        if site not in sys.path:
            sys.path.append(site)
        import fast_simplification
        bm = bmesh.new(); bm.from_mesh(src_me)
        bmesh.ops.triangulate(bm, faces=bm.faces)
        v = np.array([x.co[:] for x in bm.verts], dtype=np.float32)
        bm.verts.index_update()
        f = np.array([[x.index for x in fc.verts] for fc in bm.faces], dtype=np.int64)
        bm.free()
        red = 1.0 - target * 0.98 / len(f)
        for _ in range(4):
            sv, sf = fast_simplification.simplify(v, f, target_reduction=red)
            if len(sf) <= target:
                break
            red = 1.0 - (1.0 - red) * target * 0.97 / len(sf)
        me.clear_geometry()
        me.from_pydata(sv.tolist(), [], sf.tolist())
        me.update()
        print(f"fqmr fallback → {len(sf)} tris", flush=True)
    print(f"tris {tri_count(lo_o)} (hi {tri_count(hi_o)}) ratio {ratio:.4f}", flush=True)
    # triangulate any quads/ngons left
    bm = bmesh.new(); bm.from_mesh(lo_o.data)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
    bm.to_mesh(lo_o.data); bm.free()
    for p in lo_o.data.polygons:
        p.use_smooth = True

    # UVs: fresh smart projection, packed with a margin
    bpy.ops.object.select_all(action="DESELECT")
    lo_o.select_set(True)
    bpy.context.view_layer.objects.active = lo_o
    while lo_o.data.uv_layers:
        lo_o.data.uv_layers.remove(lo_o.data.uv_layers[0])
    lo_o.data.uv_layers.new(name="UVMap")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    if c.get("uv", "charts") == "smart":
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.015, area_weight=0.0, correct_aspect=True)
    else:
        bpy.ops.object.mode_set(mode="OBJECT")
        nch = mark_chart_seams(lo_o, c.get("chartMin", 0.03))
        print(f"uv charts {nch}", flush=True)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.unwrap(method="ANGLE_BASED", margin=0.01)
    bpy.ops.uv.pack_islands(margin=0.012, rotate=True)
    bpy.ops.object.mode_set(mode="OBJECT")

    path = bake(hi_o, lo_o, name, a.bake)
    bake_position(lo_o, name, a.bake)
    m = measure(verts_np(hi_o), c["pose"], hw if hw else 0.0, c)
    for key in ("neck", "headAxis", "tailRoot", "tailAxis"):   # hand-read pivots (grid renders) win over the heuristics
        if key in c:
            m[key] = c[key]
            m["pivots"] = "hand-read from grid renders (birds.json), checked by birds_render.py --seg"
    m["headZ"], m["headY"], m["tailZ"] = m["neck"][2], m["neck"][1], m["tailRoot"][2]
    if "neck" in c:
        m.pop("neckHow", None)
    L = verts_np(lo_o)
    m["tris"] = tri_count(lo_o)
    GL = np.stack([L[:, 0], L[:, 2], -L[:, 1]], 1)
    m["bbox"] = {"min": [round(float(v), 4) for v in GL.min(0)], "max": [round(float(v), 4) for v in GL.max(0)]}
    m["feetY"] = round(float(L[:, 2].min()), 4)
    m["span"] = round(float(L[:, 0].max() - L[:, 0].min()), 4)
    m["length"] = round(float(L[:, 1].max() - L[:, 1].min()), 4)
    m["src"] = c["src"]
    uv = lo_o.data.uv_layers.active.data
    m["uvTris"] = [[[round(uv[li].uv[0], 5), round(uv[li].uv[1], 5)] for li in p.loop_indices] for p in lo_o.data.polygons]
    json.dump(m, open(os.path.join(a.out, name + ".json"), "w"), indent=1)
    print(json.dumps({k: v for k, v in m.items() if k != "uvTris"}), flush=True)

    bpy.data.objects.remove(hi_o)
    bpy.ops.export_scene.gltf(filepath=os.path.join(a.out, name + ".low.glb"), export_format="GLB",
                              export_image_format="AUTO", export_yup=True, export_apply=True)
print("done", flush=True)
