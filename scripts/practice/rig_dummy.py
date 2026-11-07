"""Orient, clean and rig one training dummy (E285): a humanoid skeleton on a post, heat weights, one skinned draw.

  blender -b -P scripts/practice/rig_dummy.py -- <baked.glb> <rigged.glb> --variant straw-cloth [--report r.json]
  blender -b -P scripts/practice/rig_dummy.py -- <baked.glb> <normal.glb> --variant straw-cloth --stage normalize

<baked.glb> is scripts/practice/bake_dummy.py's closed, volume-textured TRELLIS.2 figure: one metre, Z-up, front along
--front (TRELLIS picks the facing per generation: -y, x, -x or y; the E215 bakes faced +X).
The game needs a 2.65 m figure standing at Y = 0 and facing +Z in three.js (Blender -Y): the code scales it by
TRAINING_DUMMY_SCALE = 1.8 / 2.65. `--stage normalize` stops after orienting and cleaning (for measuring joints).

Cleanup: weld, drop crumbs, delete the inner shells the narrow-band remesh leaves inside every closed part (they are
invisible and would double the triangle count), then decimate to the phone budget (--faces, 45k by default).

The skeleton, by the exact names src/client/engine/practice/TrainingDummy.ts reads (DUMMY_BONE_NAMES):
  Root (the post foot, at the origin)
    Pelvis > Spine > Chest > Neck > Head
                     Chest > {Left,Right}Shoulder > ...UpperArm > ...ForeArm > ...Hand
    {Left,Right}Thigh > ...Shin          (the legs hang from Root: the figure stands on its post and the upper body
                                          sways from Pelvis / Spine without lifting the feet off the base)
Left is the figure's own left: +X in three.js when it faces +Z. Every bone's local Y runs along the bone; the spine
chain's local X is the figure's left and local Z its front, so rotation.x pitches it forward / back and rotation.z
leans it sideways. Arm bones are rolled so local Z points to the figure's front.

Weights: geodesic voxel binding (distance through the solid, see the weights section), then the post and base forced onto Root, the legs limited to their
own side's thigh / shin (with Pelvis only at the hip), arm and hand bones kept off the other side, the fists made
rigid on the hand, at most four influences, normalised. The joint positions per variant (JOINTS) were measured on
the E285 bakes with a metre grid; depth (Y) is taken from the mesh itself at each joint.
"""
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

HEIGHT = 2.65
argv = sys.argv[sys.argv.index("--") + 1:]
source, target = argv[:2]


def opt(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


VARIANT = opt("--variant")
STAGE = opt("--stage", "rig")
FACES = int(opt("--faces", "45000"))
REPORT = opt("--report")
SOURCE_FRONT = opt("--front", "-y")  # where the baked figure faces in Blender: -y | x | -x | y

# Figure-left joints (x >= 0) in metres after normalisation: (x, z). The right side mirrors them.
# post_r: half-width of the post + a margin; base_top: the top of the cross-foot base (everything under it is Root);
# hem: the skirt's lower edge; target: (z, radius) of the painted face target (straw and wood); helm: (bottom, top)
# of a closed great helm to line dark and plug (steel).
JOINTS = {
    "straw-cloth": dict(pelvis=1.30, spine=1.55, chest=1.85, neck=2.17, head=2.27, crown=2.64,
                        clavicle=(0.07, 2.09), shoulder=(0.32, 2.02), elbow=(0.44, 1.72), wrist=(0.57, 1.47),
                        fist=(0.63, 1.27), hip=(0.19, 1.20), knee=(0.24, 0.83), ankle=(0.26, 0.27),
                        post_r=0.06, base_top=0.14, hem=1.00, target=(2.43, 0.105),
                        smooth=[(0.0, 2.15, 0.14), (0.63, 1.27, 0.11), (-0.63, 1.27, 0.11)], neck_plug=(1.9, 2.25)),
    "wood": dict(pelvis=1.30, spine=1.55, chest=1.85, neck=2.17, head=2.29, crown=2.64,
                 clavicle=(0.07, 2.09), shoulder=(0.33, 2.02), elbow=(0.47, 1.73), wrist=(0.57, 1.48),
                 fist=(0.63, 1.27), hip=(0.20, 1.20), knee=(0.26, 0.92), ankle=(0.28, 0.32),
                 post_r=0.06, base_top=0.14, hem=1.00, target=(2.425, 0.10)),
    "wood-steel": dict(pelvis=1.30, spine=1.55, chest=1.85, neck=2.17, head=2.22, crown=2.64,
                       clavicle=(0.07, 2.09), shoulder=(0.32, 2.02), elbow=(0.47, 1.76), wrist=(0.57, 1.50),
                       fist=(0.59, 1.30), hip=(0.19, 1.20), knee=(0.24, 0.86), ankle=(0.29, 0.30),
                       post_r=0.06, base_top=0.14, hem=1.00, helm=(2.22, 2.64), weather=True),  # E289: great helm
}
if VARIANT not in JOINTS:
    raise SystemExit(f"--variant must be one of {sorted(JOINTS)}")
J = JOINTS[VARIANT]
report = {"variant": VARIANT, "source": source}

# ---------------------------------------------------------------- import + orient
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=source)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
if not meshes:
    raise RuntimeError("no mesh in " + source)
for o in bpy.context.scene.objects:
    o.select_set(o in meshes)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
mesh = bpy.context.view_layer.objects.active
bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
for o in list(bpy.context.scene.objects):
    if o is not mesh:
        bpy.data.objects.remove(o)
mesh.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = mesh.data
# The importer keeps the generator's split normals as custom normals, and they would not follow any vertex this
# script moves (spike relax, smoothing, the flattened face): drop them, the mesh's own smooth normals take over.
if me.has_custom_normals:
    bpy.ops.mesh.customdata_custom_splitnormals_clear()

# TRELLIS picks the figure's facing per generation; turn it to face Blender -Y (glTF / three.js +Z).
TURN = {"-y": 0.0, "x": -90.0, "-x": 90.0, "y": 180.0}[SOURCE_FRONT]
if TURN:
    me.transform(Matrix.Rotation(math.radians(TURN), 4, "Z"))
zs = [v.co.z for v in me.vertices]
zmin, zmax = min(zs), max(zs)
s = HEIGHT / (zmax - zmin)
base = [v.co for v in me.vertices if v.co.z < zmin + 0.10 * (zmax - zmin)]
cx = (min(p.x for p in base) + max(p.x for p in base)) / 2
cy = (min(p.y for p in base) + max(p.y for p in base)) / 2
me.transform(Matrix.Scale(s, 4) @ Matrix.Translation((-cx, -cy, -zmin)))
me.update()
mesh.name = "TrainingDummy"
me.name = "TrainingDummy"

# ---------------------------------------------------------------- cleanup
bm = bmesh.new()
bm.from_mesh(me)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bm.faces.ensure_lookup_table()


def components(bm):
    seen = set()
    out = []
    for f in bm.faces:
        if f.index in seen:
            continue
        stack, comp = [f], []
        seen.add(f.index)
        while stack:
            g = stack.pop()
            comp.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:
                        seen.add(h.index)
                        stack.append(h)
        out.append(comp)
    return out


comps = components(bm)
report["components_in"] = len(comps)
face_comp = {}
for ci, comp in enumerate(comps):
    for f in comp:
        face_comp[f.index] = ci
bvh = BVHTree.FromBMesh(bm)
dirs = [Vector(d) for d in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1),
                            (0.577, 0.577, 0.577), (-0.577, -0.577, 0.577))]


def enclosed(point, ci):
    for d in dirs:
        o = point + d * 1e-4
        hit_other = False
        for _ in range(64):
            loc, _n, fi, _dist = bvh.ray_cast(o, d)
            if loc is None:
                break
            if face_comp[fi] != ci:
                hit_other = True
                break
            o = loc + d * 1e-4
        if not hit_other:
            return False
    return True


drop = set()
crumbs = inner = 0
for ci, comp in enumerate(comps):
    area = sum(f.calc_area() for f in comp)
    if len(comp) < 40 or area < 2e-4:
        drop.add(ci)
        crumbs += 1
        continue
    if len(comp) == max(len(c) for c in comps):
        continue
    step = max(1, len(comp) // 24)
    samples = [comp[i].calc_center_median() for i in range(0, len(comp), step)]
    if sum(enclosed(p, ci) for p in samples) >= 0.85 * len(samples):
        drop.add(ci)
        inner += 1
bmesh.ops.delete(bm, geom=[f for ci in drop for f in comps[ci]], context="FACES")

# Pinholes: the remesh's clean-up leaves a few small open loops; with the inner wall culled below they would be
# see-through. Fill every open loop of up to 24 edges, UVs borrowed from each vertex's neighbouring face.
boundary = [e for e in bm.edges if e.is_boundary]
before = set(bm.faces)
bmesh.ops.holes_fill(bm, edges=boundary, sides=24)
uv = bm.loops.layers.uv.active
filled = [f for f in bm.faces if f not in before]
for f in filled:
    for loop in f.loops:
        for other in loop.vert.link_loops:
            if other.face not in filled and other.face.is_valid:
                loop[uv].uv = other[uv].uv.copy()
                break
bmesh.ops.triangulate(bm, faces=[f for f in filled if len(f.verts) > 3])
report["filled_holes"] = len(filled)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

# Hidden faces: the remesh thickens every crust into a shell, so a closed part keeps an inner wall no camera can
# see. A face is kept when any of 160 rays (a Fibonacci sphere, from just off either side of it) escapes the figure.
bm.faces.ensure_lookup_table()
bvh = BVHTree.FromBMesh(bm)
K = 160
golden = math.pi * (3 - math.sqrt(5))
sphere = []
for k in range(K):
    zk = 1 - 2 * (k + 0.5) / K
    rk = math.sqrt(1 - zk * zk)
    sphere.append(Vector((math.cos(golden * k) * rk, math.sin(golden * k) * rk, zk)))
hidden = []
for f in bm.faces:
    c = f.calc_center_median()
    n = f.normal
    seen = False
    for d in sphere:
        o = c + (n if d.dot(n) >= 0 else -n) * 2e-4 + d * 1e-4
        if bvh.ray_cast(o, d)[0] is None:
            seen = True
            break
    if not seen:
        hidden.append(f)
# A culled face that would leave a pinhole in a kept surface (two or more of its edges border kept faces) is a false
# positive of the ray test (grazing slivers); put it back, repeatedly, until no pinhole is left.
hidden = set(hidden)
while True:
    back = [f for f in hidden if sum(1 for e in f.edges if any(g not in hidden and g is not f for g in e.link_faces)) >= 2]
    if not back:
        break
    hidden.difference_update(back)
hidden = list(hidden)
report["dropped_hidden_faces"] = len(hidden)
bmesh.ops.delete(bm, geom=hidden, context="FACES")
loose = [v for v in bm.verts if not v.link_faces]
bmesh.ops.delete(bm, geom=loose, context="VERTS")
# The cull can open a pit the rays could not see into (the straw fists, the collar, E289): close every open loop of up
# to 80 edges the cull left, UVs borrowed from the neighbouring faces.
before = set(bm.faces)
bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=80)
refilled = [f for f in bm.faces if f not in before]
for f in refilled:
    for loop in f.loops:
        for other in loop.vert.link_loops:
            if other.face not in refilled and other.face.is_valid:
                loop[uv].uv = other[uv].uv.copy()
                break
bmesh.ops.triangulate(bm, faces=[f for f in refilled if len(f.verts) > 3])
report["refilled_after_cull"] = len(refilled)

# Winding: TRELLIS's shells come back with mixed winding (the material is double-sided, so it only showed as dark
# patches where smooth normals of opposite faces cancel: the straw collar and fists, E289). Every face turns to the
# side it can be seen from: of 16 rays on each side of it, the side more of them escape from is outside.
bm.faces.ensure_lookup_table()
bm.normal_update()
tree = BVHTree.FromBMesh(bm)
hemi = sphere[::10]
flipped = 0
for f in bm.faces:
    c = f.calc_center_median()
    n = f.normal
    if n.length < 1e-8:
        continue
    plus = minus = 0
    for d in hemi[:16]:
        dd = d if d.dot(n) >= 0 else -d
        if tree.ray_cast(c + n * 2e-4 + dd * 1e-4, dd)[0] is None:
            plus += 1
        if tree.ray_cast(c - n * 2e-4 - dd * 1e-4, -dd)[0] is None:
            minus += 1
    if minus > plus:
        f.normal_flip()
        flipped += 1
report["faces_flipped_outward"] = flipped
report["dropped_crumbs"] = crumbs
report["dropped_inner_shells"] = inner

# Needles: the remesh leaves single-vertex spikes on thin rims (helmet brim, pauldron edges). A vertex sitting more
# than 0.75 mean edge lengths off the average of its neighbours (a needle: every neighbour on one side) is pulled
# most of the way back, twice.
spikes = 0
for _ in range(2):
    moves = []
    for v in bm.verts:
        if len(v.link_edges) < 3 or v.is_boundary:  # a ragged hem keeps its rags
            continue
        nb = [e.other_vert(v).co for e in v.link_edges]
        avg = sum(nb, Vector()) / len(nb)
        mean_len = sum((c - v.co).length for c in nb) / len(nb)
        if (avg - v.co).length > 0.75 * mean_len:
            moves.append((v, v.co.lerp(avg, 0.8)))
    for v, co in moves:
        v.co = co
    spikes += len(moves)
report["spikes_relaxed"] = spikes
bm.to_mesh(me)
bm.free()
me.update()
tris = sum(len(p.vertices) - 2 for p in me.polygons)
report["tris_after_clean"] = tris
if tris > FACES:
    dec = mesh.modifiers.new("budget", "DECIMATE")
    dec.ratio = FACES / tris
    dec.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=dec.name)
report["tris"] = sum(len(p.vertices) - 2 for p in me.polygons)
report["verts"] = len(me.vertices)
for p in me.polygons:
    p.use_smooth = True

if STAGE == "normalize":
    bpy.ops.export_scene.gltf(filepath=target, export_format="GLB", export_yup=True, export_animations=False)
    print("REPORT", json.dumps(report))
    raise SystemExit(0)

# ---------------------------------------------------------------- skeleton
verts = [v.co.copy() for v in me.vertices]


def depth(x, z, r=0.06):
    """The mesh's own front-back centre near (x, z): bones sit inside the figure, not on its front plane."""
    ys = [p.y for p in verts if abs(p.x - x) < r and abs(p.z - z) < r]
    if not ys:
        return 0.0
    return (min(ys) + max(ys)) / 2


def P(x, z):
    return Vector((x, depth(x, z), z))


# ---------------------------------------------------------------- E289 finishing passes (scripts/practice/dummy_parts.py)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dummy_parts as parts  # noqa: E402

parts.squeeze_atlas(me)
if J.get("smooth"):  # the straw neck and fists: pull the remesh flakes in
    spheres = [((x, depth(x, z, 0.08), z), r) for x, z, r in J["smooth"]]
    report["smoothed_verts"] = parts.smooth_regions(me, spheres)
    parts.despeckle(me, spheres, report)
if J.get("neck_plug"):
    fists = [((x, depth(x, z, 0.08), z), r) for x, z, r in J.get("smooth", []) if abs(x) > 0.3]
    parts.neck_plug(me, *J["neck_plug"], report, fists=fists)
if J.get("target"):  # the dent under the face target
    report["face_flattened_verts"] = parts.flatten_face(me, J["target"][0], J["target"][1], depth(0.0, J["target"][0], 0.08))
if J.get("weather"):
    parts.weather_steel(me, report)
BASE_IDX = parts.replace_base(me, J, depth, report)
verts = [v.co.copy() for v in me.vertices]

# ---------------------------------------------------------------- the face target
# TRELLIS draws the painted target from one front view and smears it: lopsided rings with a diamond or a spiral in
# the middle (E285). Repaint it into the base-colour texture as the approved sheets have it: red dot, white, red
# ring, white, red ring, projected flat from the front onto the front of the head. The cloth / wood grain of the
# Around the new rings the old smear fades to the plain surface (the median texel further out), grain kept.
def paint_target(cz, radius):
    import numpy as np
    mat = me.materials[0]
    tex = next(n for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and any(
        l.to_socket.name == "Base Color" for l in n.outputs["Color"].links))
    img = tex.image
    W_, H_ = img.size
    px = np.empty(W_ * H_ * 4, np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(H_, W_, 4)
    red, white = np.array([0.66, 0.12, 0.09]), np.array([0.90, 0.87, 0.80])
    bands = [(0.00, 0.19, red), (0.19, 0.38, white), (0.38, 0.58, red), (0.58, 0.77, white), (0.77, 0.97, red)]
    uv = me.uv_layers.active.data
    head_y = depth(0.0, cz, 0.08)

    def texel_patches():
        """(slice, inside mask, r) for every front-of-head triangle near the target, in texture space."""
        for poly in me.polygons:
            c = poly.center
            if abs(c.x) > radius * 1.9 or abs(c.z - cz) > radius * 1.9 or c.y > head_y or (
                    poly.normal.y > -0.25 and math.hypot(c.x, c.z - cz) > radius):  # inside the disc: every face
                continue
            if len(poly.vertices) != 3:
                continue
            P3 = [me.vertices[i].co for i in poly.vertices]
            T2 = [uv[li].uv for li in poly.loop_indices]
            xs = [t.x * W_ for t in T2]
            ys = [t.y * H_ for t in T2]
            x0, x1 = max(0, int(min(xs)) - 2), min(W_ - 1, int(max(xs)) + 2)
            y0, y1 = max(0, int(min(ys)) - 2), min(H_ - 1, int(max(ys)) + 2)
            gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            (ax, ay), (bx, by), (qx, qy) = zip(xs, ys)
            den = (by - qy) * (ax - qx) + (qx - bx) * (ay - qy)
            if abs(den) < 1e-9:
                continue
            l0 = ((by - qy) * (gx - qx) + (qx - bx) * (gy - qy)) / den
            l1 = ((qy - ay) * (gx - qx) + (ax - qx) * (gy - qy)) / den
            l2 = 1 - l0 - l1
            inside = (l0 > -0.08) & (l1 > -0.08) & (l2 > -0.08)  # a texel of gutter too, so mips do not bleed
            if not inside.any():
                continue
            X = l0 * P3[0].x + l1 * P3[1].x + l2 * P3[2].x
            Z = l0 * P3[0].z + l1 * P3[1].z + l2 * P3[2].z
            yield (slice(y0, y1 + 1), slice(x0, x1 + 1)), inside, np.hypot(X, Z - cz) / radius

    # the plain surface around the old smear (hood cloth / bare wood): an unpainted texel just outside it
    def plain_texels(sl, m, r):
        t = px[sl][..., :3]
        unpainted = (t[..., 1] > 0.6 * t[..., 0]) & (t.mean(-1) > 0.25)
        return t[m & (r > 1.0) & (r < 1.6) & unpainted]
    ring = [plain_texels(sl, m, r) for sl, m, r in texel_patches()]
    ring = np.concatenate([x for x in ring if len(x)]) if any(len(x) for x in ring) else np.array([[0.8, 0.8, 0.8]])
    surface = np.percentile(ring, 75, axis=0)  # the lit cloth / wood, not the grey smudges round the old rings
    s_lum = float(surface.mean())
    painted = 0
    for sl, inside, r in texel_patches():
        region = px[sl][..., :3]
        # past the new outer ring the old smeared rings fade to the plain surface, keeping the grain's light / dark
        lum = region.mean(-1, keepdims=True)
        old_paint = (region[..., 1:2] < 0.6 * region[..., 0:1]) | (lum < 0.25)
        plain = np.where(old_paint, surface, surface * np.clip(lum / s_lum, 0.9, 1.08))
        fade = np.clip((1.45 - r) / 0.2, 0, 1)[..., None]
        base = region * (1 - fade) + plain * fade
        colour = np.zeros_like(region)
        alpha = np.zeros(r.shape, np.float32)
        for lo_, hi_, col in bands:
            edge = 0.025
            a_ = np.clip((r - lo_ + edge) / (2 * edge), 0, 1) * np.clip((hi_ - r + edge) / (2 * edge), 0, 1)
            colour += a_[..., None] * col
            alpha = np.maximum(alpha, a_)
        out = base * (1 - alpha[..., None]) + np.clip(colour, 0, 1) * alpha[..., None]
        m = inside[..., None]
        px[sl][..., :3] = np.where(m, out, region)
        painted += 1
    img.pixels.foreach_set(px.ravel())
    img.pack()
    return painted, [round(float(c), 3) for c in surface]


if J.get("target"):
    report["target_faces_painted"] = paint_target(*J["target"])


# ---------------------------------------------------------------- a closed helm (E289)
# The great helm's eye slit and breaths look into the helm. TRELLIS leaves its inside lit steel, and through the slit
# (which wraps round the front corners) the room shows straight through the head. So: every inward-facing helm face
# takes a dark texel, and a dark plug (a 16-sided cylinder at 70 % of the helm's inner width) fills the head, so a
# slit only ever shows shadow. The dark texel is an 8x8 block painted in a free corner of the atlas.
def close_helm(z0, z1):
    import numpy as np
    mat = me.materials[0]
    tex = next(n for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and any(
        l.to_socket.name == "Base Color" for l in n.outputs["Color"].links))
    img = tex.image
    W_, H_ = img.size
    uv = me.uv_layers.active.data
    # a free 8x8 texel cell: no triangle's UV box touches it or its neighbours
    cell = 8
    used = np.zeros((H_ // cell + 2, W_ // cell + 2), bool)
    for poly in me.polygons:
        us = [uv[li].uv for li in poly.loop_indices]
        cx0, cx1 = int(min(u.x for u in us) * W_) // cell, int(max(u.x for u in us) * W_) // cell
        cy0, cy1 = int(min(u.y for u in us) * H_) // cell, int(max(u.y for u in us) * H_) // cell
        used[max(0, cy0 - 1):cy1 + 2, max(0, cx0 - 1):cx1 + 2] = True
    free = np.argwhere(~used[1:-1, 1:-1])
    if len(free) == 0:
        raise RuntimeError("no free texel cell for the helm's dark lining")
    fy, fx = free[len(free) // 2]
    px = np.empty(W_ * H_ * 4, np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(H_, W_, 4)
    px[fy * cell:(fy + 1) * cell, fx * cell:(fx + 1) * cell, :3] = 0.035
    img.pixels.foreach_set(px.ravel())
    img.pack()
    dark = Vector(((fx + 0.5) * cell / W_, (fy + 0.5) * cell / H_))

    band = [v.co for v in me.vertices if z0 + 0.04 < v.co.z < z1 - 0.06]
    xs, ys = [p.x for p in band], [p.y for p in band]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    rx, ry = (max(xs) - min(xs)) / 2, (max(ys) - min(ys)) / 2
    # Inner lining: a helm face whose outward (away from the head's axis) ray runs into another wall. The normals
    # cannot tell (TRELLIS shells come back with mixed winding and render double-sided).
    helm_bvh = BVHTree.FromPolygons([v.co for v in me.vertices], [p.vertices for p in me.polygons])
    lined = 0
    for poly in me.polygons:
        c = poly.center
        if not (z0 < c.z < z1 and abs(c.x - cx) < rx * 1.05 and abs(c.y - cy) < ry * 1.05):
            continue
        out = Vector((c.x - cx, c.y - cy, 0.0))
        if out.length < 1e-6:
            continue
        out.normalize()
        hit = helm_bvh.ray_cast(c + out * 0.002, out, 0.5)[0]
        up = helm_bvh.ray_cast(c + Vector((0, 0, 0.002)), Vector((0, 0, 1)), 0.5)[0] if c.z > z1 - 0.12 else True
        # the wall it meets must be the helm's own (a face on the rim looking out at a pauldron is outside, E289)
        own = hit is not None and abs(hit.x - cx) < rx * 1.08 and abs(hit.y - cy) < ry * 1.08 and z0 + 0.02 < hit.z
        if own and up is not None and c.z > z0 + 0.03:
            for li in poly.loop_indices:
                uv[li].uv = dark
            lined += 1

    # the plug: a tube that hugs the helm's inside. Per ring height and per angle, a ray from the head's axis finds
    # the wall; the plug vertex sits 1.8 cm short of the nearest wall at that angle and the rings either side. Rays that leave through the slit or a breath take the
    # neighbouring angles' distance, so the plug fills the slit's back without poking out of it.
    N = 32
    ring_z = [z0 + 0.03 + (z1 - 0.07 - z0 - 0.03) * k / 9 for k in range(10)]
    dist, opens = [], []
    for z in ring_z:
        ts = []
        for k in range(N):
            a_ = 2 * math.pi * k / N
            d = Vector((math.cos(a_), math.sin(a_), 0.0))
            hit = helm_bvh.ray_cast(Vector((cx, cy, z)) + d * 0.005, d, 0.6)
            ts.append(hit[3] + 0.005 if hit[0] is not None and hit[3] > 0.02 else None)
        open_ = [t is None for t in ts]
        for _ in range(N):  # fill the escapes (and the hits on the old core) from the neighbours
            for k in range(N):
                if ts[k] is None:
                    nb = [t for t in (ts[k - 1], ts[(k + 1) % N]) if t is not None]
                    if nb:
                        ts[k] = max(nb)
        dist.append([t if t is not None else 0.05 for t in ts])
        opens.append(open_)
    rings = []
    for r, z in enumerate(ring_z):  # the nearest wall over this ring and its neighbours: the tube never cuts a recess
        rings.append([])
        for k in range(N):
            if opens[r][k]:  # behind the slit / a breath: reach into it (shadow fills the opening)
                t = dist[r][k]
            else:
                t = min(dist[rr][kk] for rr in (r - 1, r, r + 1) if 0 <= rr < len(dist) for kk in (k - 1, k, (k + 1) % N)
                        if not opens[rr][kk])
            a_ = 2 * math.pi * k / N
            rings[-1].append(Vector((cx + math.cos(a_) * max(0.01, t - 0.018), cy + math.sin(a_) * max(0.01, t - 0.018), z)))
    bm_ = bmesh.new()
    bm_.from_mesh(me)
    uvl = bm_.loops.layers.uv.active
    vr = [[bm_.verts.new(p_) for p_ in ring] for ring in rings]
    faces = []
    for r0, r1 in zip(vr, vr[1:]):
        for k in range(N):
            faces.append(bm_.faces.new((r0[k], r0[(k + 1) % N], r1[(k + 1) % N], r1[k])))
    faces.append(bm_.faces.new(list(reversed(vr[0]))))
    faces.append(bm_.faces.new(vr[-1]))
    for f in faces:
        f.smooth = True
        for loop in f.loops:
            loop[uvl].uv = dark
    faces = set(faces)
    bmesh.ops.triangulate(bm_, faces=list(faces))
    bm_.to_mesh(me)
    bm_.free()
    me.update()
    return lined, len(faces)


if J.get("helm"):
    report["helm_lined_faces"], report["helm_plug_faces"] = close_helm(*J["helm"])
    verts = [v.co.copy() for v in me.vertices]
    report["tris"] = sum(len(p.vertices) - 2 for p in me.polygons)

arm_data = bpy.data.armatures.new("TrainingDummyRig")
arm = bpy.data.objects.new("TrainingDummyRig", arm_data)
bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
for o in bpy.context.scene.objects:
    o.select_set(o is arm)
bpy.ops.object.mode_set(mode="EDIT")
FRONT = Vector((0, -1, 0))


def bone(name, head, tail, parent=None, connect=False, roll_to=FRONT):
    b = arm_data.edit_bones.new(name)
    b.head, b.tail = head, tail
    b.align_roll(roll_to) if roll_to is not None else None
    if parent:
        b.parent = arm_data.edit_bones[parent]
        b.use_connect = connect
    return b


# The spine chain: roll so the bone's Z axis is the figure's front (-Y) and X its left (+X).
yc = depth(0.0, J["chest"], 0.08)
bone("Root", Vector((0, 0, 0)), Vector((0, 0, J["base_top"])))
bone("Pelvis", Vector((0, depth(0, J["pelvis"], 0.1), J["pelvis"])), Vector((0, depth(0, J["spine"], 0.1), J["spine"])), "Root")
bone("Spine", arm_data.edit_bones["Pelvis"].tail.copy(), Vector((0, yc, J["chest"])), "Pelvis", True)
bone("Chest", arm_data.edit_bones["Spine"].tail.copy(), Vector((0, depth(0, J["neck"], 0.05), J["neck"])), "Spine", True)
bone("Neck", arm_data.edit_bones["Chest"].tail.copy(), Vector((0, depth(0, J["head"], 0.06), J["head"])), "Chest", True)
bone("Head", arm_data.edit_bones["Neck"].tail.copy(), Vector((0, depth(0, J["head"], 0.06), J["crown"])), "Neck", True)
for side, sx in (("Left", 1.0), ("Right", -1.0)):
    def M(key):
        x, z = J[key]
        return P(sx * x, z)
    clav = Vector((sx * J["clavicle"][0], yc, J["clavicle"][1]))
    bone(f"{side}Shoulder", clav, M("shoulder"), "Chest")
    bone(f"{side}UpperArm", M("shoulder"), M("elbow"), f"{side}Shoulder", True)
    bone(f"{side}ForeArm", M("elbow"), M("wrist"), f"{side}UpperArm", True)
    bone(f"{side}Hand", M("wrist"), M("fist"), f"{side}ForeArm", True)
    bone(f"{side}Thigh", M("hip"), M("knee"), "Root")
    bone(f"{side}Shin", M("knee"), M("ankle"), f"{side}Thigh", True)
bpy.ops.object.mode_set(mode="OBJECT")
NAMES = [b.name for b in arm_data.bones]
report["bones"] = NAMES

# ---------------------------------------------------------------- weights
# Geodesic voxel binding (Dionne & de Lasa 2013, the img2-character skill's rig_geodesic_skinning, in numpy):
# Blender's bone heat fails outright on these surfaces (thin cloth, culled inner walls). Voxelise the figure at
# VOXEL m, flood the outside in from the grid border, call everything else solid, and measure each bone's distance
# THROUGH the solid. A fist near the skirt is then far from the pelvis (the path runs up the arm), so nothing leaks
# across an air gap. Weight = exp(-(d - d_nearest) / SIGMA) over the four nearest bones: a vertex belongs to its
# nearest bone and blends only within a few centimetres of a joint.
import numpy as np  # noqa: E402

VOXEL, SIGMA, ITER = 0.02, 0.035, 140
for o in bpy.context.scene.objects:
    o.select_set(o in (mesh, arm))
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type="ARMATURE_NAME")  # the Skin modifier + one empty group per bone
me.calc_loop_triangles()
V = np.empty(len(me.vertices) * 3, np.float64)
me.vertices.foreach_get("co", V)
V = V.reshape(-1, 3)
T = np.empty(len(me.loop_triangles) * 3, np.int64)
me.loop_triangles.foreach_get("vertices", T)
T = T.reshape(-1, 3)
bary = np.array([[1, 0, 0], [0, 1, 0], [0, 0, 1], [1 / 3, 1 / 3, 1 / 3], [.5, .5, 0], [0, .5, .5], [.5, 0, .5],
                 [2 / 3, 1 / 6, 1 / 6], [1 / 6, 2 / 3, 1 / 6], [1 / 6, 1 / 6, 2 / 3]])
S = np.einsum("kj,tjd->tkd", bary, V[T]).reshape(-1, 3)
lo = V.min(0) - 3 * VOXEL
shape = tuple(int(n) for n in np.ceil((V.max(0) + 3 * VOXEL - lo) / VOXEL))
surf = np.zeros(shape, bool)
ix = np.floor((S - lo) / VOXEL).astype(int)
surf[ix[:, 0], ix[:, 1], ix[:, 2]] = True


def shifted_or(a):
    out = a.copy()
    out[1:] |= a[:-1]; out[:-1] |= a[1:]
    out[:, 1:] |= a[:, :-1]; out[:, :-1] |= a[:, 1:]
    out[:, :, 1:] |= a[:, :, :-1]; out[:, :, :-1] |= a[:, :, 1:]
    return out


ext = np.zeros(shape, bool)
ext[0], ext[-1], ext[:, 0], ext[:, -1], ext[:, :, 0], ext[:, :, -1] = True, True, True, True, True, True
ext &= ~surf
while True:
    grown = shifted_or(ext) & ~surf
    if grown.sum() == ext.sum():
        break
    ext = grown
solid = ~ext
bone_list = [b for b in arm_data.bones]
B = len(bone_list)
D = np.full((B,) + shape, np.inf, np.float32)
for k, b in enumerate(bone_list):
    h, t = np.array(b.head_local), np.array(b.tail_local)
    n = max(2, int(np.linalg.norm(t - h) / (VOXEL / 3)))
    pts = h + (t - h) * np.linspace(0, 1, n)[:, None]
    bi = np.clip(np.floor((pts - lo) / VOXEL).astype(int), 0, np.array(shape) - 1)
    solid[bi[:, 0], bi[:, 1], bi[:, 2]] = True  # the bone itself is solid, so a hollow limb still conducts
    D[k, bi[:, 0], bi[:, 1], bi[:, 2]] = 0.0
# The torso is wide and the arms hang close to it: measured from the spine's centre line, the side of a
# breastplate is nearer the elbow (through the few centimetres where arm and torso touch) than the spine, and an
# arm swing drags the tassets along. So the spine chain seeds the whole torso core: every solid voxel within
# TORSO_HALF of the midline, from the skirt hem up to the neck, belongs to Pelvis / Spine / Chest by height.
TORSO_HALF = 0.20
gx = lo[0] + (np.arange(shape[0]) + 0.5) * VOXEL
gz = lo[2] + (np.arange(shape[2]) + 0.5) * VOXEL
core_x = np.abs(gx) < TORSO_HALF
for k, b in enumerate(bone_list):
    if b.name not in ("Pelvis", "Spine", "Chest"):
        continue
    z0 = J["hem"] if b.name == "Pelvis" else b.head_local.z
    band_z = (gz >= z0) & (gz < b.tail_local.z)
    core = solid & core_x[:, None, None] & band_z[None, None, :]
    D[k][core] = 0.0
blocked = ~solid
offsets = [(dx, dy, dz, math.sqrt(dx * dx + dy * dy + dz * dz)) for dx in (-1, 0, 1) for dy in (-1, 0, 1)
           for dz in (-1, 0, 1) if (dx, dy, dz) != (0, 0, 0)]


def sl(d, n):
    return (slice(d, n), slice(0, n - d)) if d > 0 else ((slice(0, n + d), slice(-d, n)) if d < 0 else (slice(0, n), slice(0, n)))


for it in range(ITER):
    prev = D.copy() if it % 10 == 9 else None
    for dx, dy, dz, c in offsets:
        (xd, xs), (yd, ys), (zd, zs) = sl(dx, shape[0]), sl(dy, shape[1]), sl(dz, shape[2])
        np.minimum(D[:, xd, yd, zd], D[:, xs, ys, zs] + c, out=D[:, xd, yd, zd])
    D[:, blocked] = np.inf
    if prev is not None and np.array_equal(np.isfinite(prev), np.isfinite(D)) and np.allclose(prev[np.isfinite(prev)], D[np.isfinite(D)]):
        break
report["geodesic_iterations"] = it + 1
report["voxels"] = [int(n) for n in shape]
vi = np.clip(np.floor((V - lo) / VOXEL).astype(int), 0, np.array(shape) - 1)
Dv = D[:, vi[:, 0], vi[:, 1], vi[:, 2]].T * VOXEL  # metres, (verts, bones)
bad = ~np.isfinite(Dv).any(1)
report["geodesic_unreached"] = int(bad.sum())
Dv[~np.isfinite(Dv)] = 1e3
Wv = np.exp(-(Dv - Dv.min(1, keepdims=True)) / SIGMA)
names_by_k = [b.name for b in bone_list]
W = []  # per-vertex {bone: weight}
for i in range(len(V)):
    row = Wv[i]
    top = np.argsort(-row)[:4]
    W.append({names_by_k[k]: float(row[k]) for k in top})
del D
vg = {g.name: g for g in mesh.vertex_groups}

bones = {b.name: (arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local) for b in arm_data.bones}


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (a + ab * t - p).length


def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


hip_z = J["hip"][1]
for i, p in enumerate(verts):
    w = W[i]
    x, y, z = p
    side = "Left" if x >= 0 else "Right"
    other = "Right" if side == "Left" else "Left"
    # Unweighted by heat: nearest bone.
    if not w:
        best = min(NAMES, key=lambda n: seg_dist(p, *bones[n]))
        w = {best: 1.0}
    # The base and the post: rigid on Root.
    on_post = abs(x) < J["post_r"] and z < J["pelvis"] - 0.05 and abs(y - depth(0, z, 0.1)) < J["post_r"] * 1.5
    feet = z < J["ankle"][1] + 0.04 and abs(abs(x) - J["ankle"][0]) < 0.2
    if z < J["base_top"] or on_post or feet or i in BASE_IDX:
        w = {"Root": 1.0}
    else:
        # Nothing crosses the midline: the other side's limbs never pull this vertex.
        w = {n: v for n, v in w.items() if not n.startswith(other)}
        # The legs hang from Root: above the hem (the skirt, the waist) they have no say, Pelvis does.
        if z >= J["hem"]:
            moved = sum(v for n, v in w.items() if n.endswith(("Thigh", "Shin")))
            if moved:
                w = {n: v for n, v in w.items() if not n.endswith(("Thigh", "Shin"))}
                w["Pelvis"] = w.get("Pelvis", 0) + moved
        # The torso is armour and stuffing, not flesh: it bends in horizontal bands. Whatever share the spine chain
        # holds is re-split by height alone, 8 cm blends at each joint (the geodesic split of a hollow breastplate
        # is blotchy, and let the neck claim the middle of the chest).
        chain = ("Pelvis", "Spine", "Chest", "Neck", "Head")
        share = sum(w.get(n, 0.0) for n in chain)
        if share > 0:
            cuts = (J["spine"], J["chest"], J["neck"], J["head"])
            band = [1.0, 0.0, 0.0, 0.0, 0.0]
            for k, c in enumerate(cuts):
                t = smoothstep(c - 0.04, c + 0.04, z)
                band[k + 1] = band[k] * t
                band[k] *= 1 - t
            w = {n: v for n, v in w.items() if n not in chain}
            for n, b in zip(chain, band):
                if b > 1e-4:
                    w[n] = w.get(n, 0.0) + share * b
        # The collar bone moves the shoulder, not the breastplate: fade it out towards the midline.
        sh = f"{side}Shoulder"
        if sh in w:
            f = smoothstep(0.10, 0.20, abs(x))
            if f < 1:
                w["Chest"] = w.get("Chest", 0) + w[sh] * (1 - f)
                w[sh] *= f
        # Below the skirt hem: only this side's leg bones and Root; the top of the leg blends into Pelvis over 12 cm
        # under the hem, so a pelvis sway bends the hip instead of tearing the skirt off the legs.
        hem = J["hem"]
        if z < hem and abs(abs(x) - J["hip"][0]) < 0.16:
            keep = {f"{side}Thigh", f"{side}Shin", "Root"}
            leg = {n: v for n, v in w.items() if n in keep} or {f"{side}Thigh": 1.0}
            pel = smoothstep(hem - 0.12, hem, z)
            tot = sum(leg.values())
            w = {n: v / tot * (1 - pel) for n, v in leg.items()}
            if pel > 0:
                w["Pelvis"] = pel
        # The fist is rigid on the hand; the wrist blends over 6 cm.
        wx, wz = J["wrist"]
        fist_dir = (Vector((J["fist"][0], 0, J["fist"][1])) - Vector((wx, 0, wz))).normalized()
        along = (Vector((abs(x), 0, z)) - Vector((wx, 0, wz))).dot(fist_dir)
        arm_share = sum(v for n, v in w.items() if n.startswith(side) and n.endswith(("Arm", "Hand")))
        near_fist = seg_dist(Vector((abs(x), 0, z)), Vector((wx, 0, wz)), Vector((J["fist"][0], 0, J["fist"][1]))) < 0.10
        if arm_share > 0.5 and along > -0.06 and near_fist:
            h = smoothstep(-0.06, 0.0, along)
            rest = {n: v for n, v in w.items() if n != f"{side}Hand"}
            tot = sum(rest.values()) or 1.0
            w = {n: v / tot * (1 - h) for n, v in rest.items()}
            w[f"{side}Hand"] = w.get(f"{side}Hand", 0) + h
    # Four influences, normalised.
    top = sorted(w.items(), key=lambda kv: -kv[1])[:4]
    tot = sum(v for _, v in top)
    W[i] = {n: v / tot for n, v in top if v / tot > 0.01}

for g in mesh.vertex_groups:
    g.remove(list(range(len(me.vertices))))
for i, w in enumerate(W):
    tot = sum(w.values())
    for n, v in w.items():
        vg[n].add([i], v / tot, "REPLACE")

counts = {n: 0 for n in NAMES}
for w in W:
    for n in w:
        counts[n] += 1
report["verts_per_bone"] = counts
report["max_influences"] = max(len(w) for w in W)

next(m for m in mesh.modifiers if m.type == "ARMATURE").name = "Skin"
for d in me.uv_layers.active.data:  # pack_dummy.mjs quantizes UVs to 16 bits: they must sit inside [0, 1]
    d.uv = (min(1.0, max(0.0, d.uv.x)), min(1.0, max(0.0, d.uv.y)))
arm.data.display_type = "STICK"
os.makedirs(os.path.dirname(os.path.abspath(target)), exist_ok=True)
if target.endswith(".blend"):
    bpy.ops.wm.save_as_mainfile(filepath=target)
else:
    bpy.ops.export_scene.gltf(filepath=target, export_format="GLB", export_yup=True, export_animations=False,
                              export_skins=True, export_def_bones=False, export_apply=False)
report["out"] = target
print("REPORT", json.dumps(report))
if REPORT:
    json.dump(report, open(REPORT, "w"), indent=1)
