"""Face remaster for Nalati's image-to-3D camp people (NALATI-FINISH B5 / E302, the user: "all the models have terrible
faces … remaster the faces with Blender or Trellis or … Hunyuan 3D").

Why the faces are bad: a whole-body generation spends texels by surface area, so the head gets ~5 % of the atlas, and the
game packs each figure into a 256² cell on the phone (src/shards/nalati-grasslands/campPeopleModels.ts): the face ends up ~15 texels wide.
Every variant here therefore re-UVs the figure with the HEAD PRIORITISED (xatlas on a copy whose head is scaled up
`--head-scale` times, so its charts get that squared share of the atlas) and re-bakes, and then:

    (no --graft / --paint)   the current head, only re-UV'd + re-baked
    --graft <bust.glb>       the head replaced by a generated head-and-shoulders bust (Hunyuan3D-2 or TRELLIS.2 from a
                             new front portrait): the body above the neck cut is deleted, the bust scaled so its
                             neck→top matches the body's, centred on the old head, clipped a little below its neck
                             (so it tucks into the collar), decimated to --head-tris; baked from both hi sources
    --paint <json>           a simple readable face in the procedural figures' style painted on the head: the face
                             smoothed to one skin tone, then eyes (white, iris, lid), brows, a nose shade and a mouth,
                             drawn in the head's front projection (position / normal maps baked from the low mesh)

    blender -b -P face_remaster.py -- --body body.glb --out out.glb --neck 0.77 [--tex 1024] [--head-scale 2.6]
        [--graft bust.glb --bust-neck 0.52 --bust-clip 0.03 --head-tris 1800] [--paint '{"eye":0.9,...}']
        [--front front.png]

--neck        the procedural figure's neck height / its height (campPeople.ts: elder 0.769, herders 0.8, child 0.765,
              cook 0.829); the cut is the narrowest cross-section near it, as the runtime rig finds it
--bust-neck   where the bust's neck is, as a fraction of the bust's height from its top (from the portrait)
--front       an unlit ortho render of the head from the front (for tuning the paint; not shipped)
Output: <out> (uncompressed GLB, one material, one --tex² atlas) + <out>.json. Metres, +Y up, feet on 0, facing +Z.
"""
import bpy, bmesh, sys, os, json, math, argparse
import numpy as np
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--body", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--neck", type=float, required=True)
ap.add_argument("--neck-exact", action="store_true", help="E304: cut at --neck itself (no narrowest-section search: the "
                "King's hood is narrower at the face than at the neck)")
ap.add_argument("--tex", type=int, default=1024)
ap.add_argument("--head-scale", type=float, default=1.4)
ap.add_argument("--face-scale", type=float, default=5.0)
ap.add_argument("--face-top", type=float, default=0.6, help="the face's top (the hat brim), fraction of neck cut → head top")
ap.add_argument("--graft", default=None)
ap.add_argument("--bust-neck", type=float, default=0.5)
ap.add_argument("--bust-clip", type=float, default=0.03)
ap.add_argument("--bust-grow", type=float, default=1.0, help="extra scale on the bust (1 = neck-to-top matched)")
ap.add_argument("--bust-dz", type=float, default=0.0, help="nudge the bust up/down (fraction of the figure height)")
ap.add_argument("--bust-dy", type=float, default=0.0, help="nudge the bust forward (+) / back (fraction of height)")
ap.add_argument("--head-tris", type=int, default=4000)
ap.add_argument("--bust-beard", type=float, nargs=2, default=[0.0, 0.0], help="keep a front strip below the cut: half-width, depth (fractions of H)")
ap.add_argument("--no-weld", action="store_true")
ap.add_argument("--body-collar", type=float, nargs=2, default=None, help="E304: keep the body's faces over the cut up to <h> "
                "farther than <r> from the head's axis (a coat's high collar; fractions of H)")
ap.add_argument("--bust-collar", type=float, nargs=2, default=None, help="E304: drop the bust's collar and shoulders: its faces "
                "below the cut + <h> farther than <r> from the head's axis (both fractions of H; the beard strip is kept)")
ap.add_argument("--keep-above", type=float, default=None,
                help="E304: keep the body's own head above this height (fraction of H: the Golden King's tall hat); the bust "
                     "is cut there, and scaled so --bust-top lands on it")
ap.add_argument("--bust-top", type=float, default=None, help="with --keep-above: the bust point (fraction of its height from "
                "the top) that meets the kept part (the King's gold hood frame)")
ap.add_argument("--bust-overlap", type=float, default=0.006, help="with --keep-above: the bust reaches this far (fraction of "
                "H) over the cut, into the kept hat, so no gap shows")
ap.add_argument("--bust-image", default=None, help="the cutout the bust was generated from: projected on its front")
ap.add_argument("--project-top", type=float, default=None, help="E304: project the portrait only below this height (fraction "
                "of the neck cut → head top): a hat brim in front of the forehead took the portrait's forehead")
ap.add_argument("--paint", default=None)
ap.add_argument("--smooth-face", type=float, default=0.0, help="0..1: bend the face normals toward a head ellipsoid")
ap.add_argument("--front", default=None)
ap.add_argument("--graft-v2", action="store_true", help="E339 graft fix: the bust cut at ITS OWN neck (the narrowest section "
                "under the chin, so it never carries a collar), placed and scaled by it, both cuts straight (bisect), the bust's "
                "neck ring blended onto the body's (shape and colour), thin / sliver / floating fragments dropped, the head smooth")
ap.add_argument("--bust-neck-auto", type=float, nargs=2, default=None, help="with --graft-v2: search the bust's neck between "
                "these fractions of its height from the top (else --bust-neck)")
ap.add_argument("--bust-fit", default="height", choices=["height", "box"], help="scale the bust by neck-to-top (height) or by "
                "the geometric mean of that and the head's width (box: Pine Hollow's heads came out smaller than A's)")
ap.add_argument("--cut-tilt", type=float, default=30.0, help="with --graft-v2: the neck cut dips this many degrees toward the "
                "front (under the jaw: a level cut took the new chin off and left the old one)")
ap.add_argument("--ring-band", type=float, default=0.035, help="with --graft-v2: how far up the bust's neck (fraction of H) its "
                "ring is blended onto the body's")
ap.add_argument("--normal-map", action="store_true", help="E304 (Pine Hollow, PBR): also bake a tangent-space normal map from "
                "the hi sources (the body's own normal map included) and export it")
a = ap.parse_args(argv)


def log(*x):
    print("[face]", *x, flush=True)


def import_mesh(path, name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    for o in bpy.context.scene.objects:
        o.select_set(o in meshes)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    mw = ob.matrix_world.copy()
    ob.parent = None
    ob.data.transform(mw)
    ob.matrix_world = Matrix.Identity(4)
    for o in new:
        if o != ob:
            bpy.data.objects.remove(o)
    ob.name = name
    # non-metallic sources (a Hunyuan GLB leaves metallicFactor unset = 1: the colour bake comes out black)
    for ms in ob.material_slots:
        m = ms.material
        if m and m.node_tree:
            for n in m.node_tree.nodes:
                if n.type == "BSDF_PRINCIPLED":
                    for l in list(n.inputs["Metallic"].links):
                        m.node_tree.links.remove(l)
                    n.inputs["Metallic"].default_value = 0.0
    return ob


def verts_np(ob):
    co = np.empty(len(ob.data.vertices) * 3, dtype=np.float64)
    ob.data.vertices.foreach_get("co", co)
    return co.reshape(-1, 3)


def delete_faces(ob, pred):
    """delete the faces whose centroid satisfies pred(centroid: Vector) -> bool"""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    kill = [f for f in bm.faces if pred(f.calc_center_median())]
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(ob.data); bm.free(); ob.data.update()
    return len(kill)


def ntris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def project_portrait(ob, path, neck_z):
    """lay the portrait the bust was generated from (its cutout: alpha = the subject) over the bust's front, orthographic
    along -Y: the generator rebuilt the subject in that image's frame, so its silhouette box = the alpha box. The generated
    paint keeps the sides and the back; the face comes from the portrait itself (the generator's own paint splits a face
    over several UV islands and leaves dark cracks at their seams)"""
    im = bpy.data.images.load(path)
    W_, H_ = im.size
    px_ = np.empty(W_ * H_ * 4, dtype=np.float32); im.pixels.foreach_get(px_)
    al = px_.reshape(H_, W_, 4)[..., 3]                                         # row 0 = the image's bottom
    ys, xs = np.where(al > 0.5)
    ax0, ax1, ay0, ay1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1        # in bottom-up rows
    Bv = verts_np(ob)
    x0, x1, z0, z1 = Bv[:, 0].min(), Bv[:, 0].max(), Bv[:, 2].min(), Bv[:, 2].max()
    # image column = a + x·k, row (bottom-up) = b + z·k: ONE scale (the generator keeps the aspect). A first guess from
    # the boxes (widths, tops), then fitted: the mesh's front silhouette against the alpha over the head (upper 60 %).
    # The box guess alone left the eyes a few rows off the geometry's sockets (a dark crease across the cook's eyes)
    k0 = (ax1 - ax0) / max(x1 - x0, 1e-6)
    step = int(np.ceil(max(W_, H_) / 256)); f_ = 1 / step
    am = al[::step, ::step] > 0.5
    hr, wr = am.shape
    top_rows = slice(int((ay1 - 0.6 * (ay1 - ay0)) * f_), hr)
    best_ = (-1.0, k0, ax0 - x0 * k0, ay0 - z0 * (ay1 - ay0) / max(z1 - z0, 1e-6))
    sz_box = (ay1 - ay0) / H_ / max(z1 - z0, 1e-6)
    for kk_ in ([] if os.environ.get("PORTRAIT_FIT", "0") != "1" else np.linspace(0.75, 1.15, 41) * k0):
        for da in np.linspace(-0.03, 0.03, 7) * W_:
            for db in np.linspace(-0.05, 0.05, 11) * H_:
                a_ = (ax0 + ax1) / 2 - (x0 + x1) / 2 * kk_ + da
                b_ = ay1 - z1 * kk_ + db
                cc = ((a_ + Bv[:, 0] * kk_) * f_).astype(int); rr = ((b_ + Bv[:, 2] * kk_) * f_).astype(int)
                ok = (cc >= 0) & (cc < wr) & (rr >= 0) & (rr < hr)
                mm = np.zeros((hr, wr), bool); mm[rr[ok], cc[ok]] = True
                mm = mm | np.roll(mm, 1, 0) | np.roll(mm, -1, 0) | np.roll(mm, 1, 1) | np.roll(mm, -1, 1)
                A_, M_ = am[top_rows], mm[top_rows]
                iou = (A_ & M_).sum() / max(1, (A_ | M_).sum())
                if iou > best_[0]:
                    best_ = (iou, kk_, a_, b_)
    iou, kf, af, bf = best_
    if iou >= 0:   # PORTRAIT_FIT=1 (off: the silhouette is mostly headwear, and the fit moved the eyes off the sockets)
        log(f"portrait fit: IoU {iou:.3f}, scale {kf / k0:.3f} of the box guess")
        sx = kf / W_; sz = kf / H_
        ax0, x0, ay0, z0 = af, 0.0, bf, 0.0
    else:          # the boxes: u = ax0/W + (x - x0)·sx ; v = ay0/H + (z - z0)·sz (the alpha box's bottom is the bust's)
        sx = k0 / W_; sz = sz_box
    hv = Bv[Bv[:, 2] > neck_z]                                                  # the head: above the neck
    hcen = (hv.max(0) + hv.min(0)) / 2; hrad = np.maximum((hv.max(0) - hv.min(0)) / 2, 1e-3)
    for ms in ob.material_slots:
        m = ms.material
        if not (m and m.node_tree):
            continue
        nt_ = m.node_tree
        bs = next((n for n in nt_.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bs is None or not bs.inputs["Base Color"].links:
            continue
        src = bs.inputs["Base Color"].links[0].from_socket
        tc = nt_.nodes.new("ShaderNodeTexCoord"); sep = nt_.nodes.new("ShaderNodeSeparateXYZ")
        nt_.links.new(tc.outputs["Object"], sep.inputs[0])
        def lin(sock, k, c):
            mm = nt_.nodes.new("ShaderNodeMath"); mm.operation = "MULTIPLY_ADD"
            nt_.links.new(sock, mm.inputs[0]); mm.inputs[1].default_value = k; mm.inputs[2].default_value = c
            return mm.outputs[0]
        u = lin(sep.outputs["X"], sx, ax0 / W_ - x0 * sx)
        v = lin(sep.outputs["Z"], sz, ay0 / H_ - z0 * sz)
        cmb = nt_.nodes.new("ShaderNodeCombineXYZ"); nt_.links.new(u, cmb.inputs[0]); nt_.links.new(v, cmb.inputs[1])
        ti = nt_.nodes.new("ShaderNodeTexImage"); ti.image = im; ti.extension = "CLIP"; ti.interpolation = "Cubic"
        nt_.links.new(cmb.outputs[0], ti.inputs["Vector"])
        # facing the camera, from the POSITION round the head's centre (an ellipsoid), not the surface normal: a dense
        # generated surface's normals are noise, and a normal test cut the face into a patchwork of portrait and paint
        sub = nt_.nodes.new("ShaderNodeVectorMath"); sub.operation = "SUBTRACT"
        nt_.links.new(tc.outputs["Object"], sub.inputs[0]); sub.inputs[1].default_value = tuple(hcen)
        scl = nt_.nodes.new("ShaderNodeVectorMath"); scl.operation = "MULTIPLY"
        nt_.links.new(sub.outputs[0], scl.inputs[0]); scl.inputs[1].default_value = tuple(1 / r for r in hrad)
        nrmz = nt_.nodes.new("ShaderNodeVectorMath"); nrmz.operation = "NORMALIZE"
        nt_.links.new(scl.outputs[0], nrmz.inputs[0])
        sn = nt_.nodes.new("ShaderNodeSeparateXYZ"); nt_.links.new(nrmz.outputs[0], sn.inputs[0])
        mr = nt_.nodes.new("ShaderNodeMapRange"); mr.inputs["From Min"].default_value = -0.2; mr.inputs["From Max"].default_value = -0.6
        nt_.links.new(sn.outputs["Y"], mr.inputs["Value"])
        fac = nt_.nodes.new("ShaderNodeMath"); fac.operation = "MULTIPLY"
        nt_.links.new(mr.outputs["Result"], fac.inputs[0]); nt_.links.new(ti.outputs["Alpha"], fac.inputs[1])
        if a.project_top is not None:
            zt = neck_z + a.project_top * (Bv[:, 2].max() - neck_z)
            mz = nt_.nodes.new("ShaderNodeMapRange"); mz.inputs["From Min"].default_value = zt
            mz.inputs["From Max"].default_value = zt - 0.012 * (Bv[:, 2].max() - neck_z) * 2
            nt_.links.new(sep.outputs["Z"], mz.inputs["Value"])
            fac2 = nt_.nodes.new("ShaderNodeMath"); fac2.operation = "MULTIPLY"
            nt_.links.new(fac.outputs[0], fac2.inputs[0]); nt_.links.new(mz.outputs["Result"], fac2.inputs[1])
            fac = fac2
        mix = nt_.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"
        nt_.links.new(fac.outputs[0], mix.inputs["Factor"])
        nt_.links.new(src, mix.inputs[6]); nt_.links.new(ti.outputs["Color"], mix.inputs[7])
        nt_.links.new(mix.outputs[2], bs.inputs["Base Color"])
    log(f"portrait {os.path.basename(path)} projected on the bust front (alpha box {ax1 - ax0}x{ay1 - ay0} px)")


def split_at(ob, z):
    """cut every face that crosses the plane z (no geometry removed): a straight edge there instead of a zig-zag"""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-6, plane_co=(0, 0, z), plane_no=(0, 0, 1))
    bm.to_mesh(ob.data); bm.free(); ob.data.update()


def drop_fragments(ob, sliver=0.0, keep_frac=0.02):
    """E339: the generated bust's torn paper — connected pieces smaller than keep_frac of the largest (collar flakes, loose
    strands), degenerate triangles, and (sliver > 0) needle triangles whose shortest height is under sliver × longest edge"""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    kill = set()
    if sliver > 0:
        # needles are collapsed, never deleted (a deleted needle is a hole): their shortest edge merged away
        for _ in range(3):
            short = []
            for f in bm.faces:
                if not f.is_valid or len(f.verts) != 3:
                    continue
                es = sorted(f.edges, key=lambda e: e.calc_length())
                lmax = es[-1].calc_length()
                if lmax > 0 and 2 * f.calc_area() / lmax < sliver * lmax and es[0].is_valid:
                    short.append(es[0])
            short = list({e for e in short if e.is_valid})
            if not short:
                break
            bmesh.ops.collapse(bm, edges=short, uvs=True)
            bmesh.ops.triangulate(bm, faces=bm.faces)
    for f in bm.faces:
        if f.calc_area() < 1e-12:
            kill.add(f)
    bmesh.ops.delete(bm, geom=list(kill), context="FACES")
    # islands by shared edges
    seen, islands = set(), []
    for f in bm.faces:
        if f in seen:
            continue
        stack, isl = [f], []
        seen.add(f)
        while stack:
            g = stack.pop(); isl.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h not in seen:
                        seen.add(h); stack.append(h)
        islands.append((sum(x.calc_area() for x in isl), isl))
    n = len(kill)
    if islands:
        big = max(i[0] for i in islands)
        small = [f for area, isl in islands if area < keep_frac * big for f in isl]
        bmesh.ops.delete(bm, geom=small, context="FACES"); n += len(small)
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(ob.data); bm.free(); ob.data.update()
    return n


def ring_blend(bust, body, z, band):
    """E339: the bust's neck meets the body's. Both are cut straight at z; per angle round the neck the bust's ring is moved
    onto the body's ring (radius and centre), fading out up to z + band, and its rim tucked a hair inside and below the
    body's so no crack shows"""
    BV = verts_np(body)
    rim = BV[np.abs(BV[:, 2] - z) < 1e-4 * max(1.0, abs(z) + 1)]
    Bu = verts_np(bust)
    brim = Bu[np.abs(Bu[:, 2] - z) < 1e-4 * max(1.0, abs(z) + 1)]
    if len(rim) < 6 or len(brim) < 6:
        log(f"ring blend skipped (rims: body {len(rim)}, bust {len(brim)})"); return
    # only the body rim round the neck (the cut also crosses a beard or a raised collar): near the bust's rim centre
    bc_ = brim[:, :2].mean(0)
    rr = np.hypot(rim[:, 0] - bc_[0], rim[:, 1] - bc_[1])
    rim = rim[rr < np.percentile(rr, 60) * 1.6]
    c_body, c_bust = rim[:, :2].mean(0), brim[:, :2].mean(0)
    NB = 36
    def prof(P, c):
        ang = np.arctan2(P[:, 1] - c[1], P[:, 0] - c[0]); r = np.hypot(P[:, 0] - c[0], P[:, 1] - c[1])
        out = np.full(NB, np.nan)
        idx = ((ang + np.pi) / (2 * np.pi) * NB).astype(int) % NB
        for b in range(NB):
            if (idx == b).any():
                out[b] = r[idx == b].max()
        ok = ~np.isnan(out)
        xs = np.arange(NB)
        return np.interp(xs, xs[ok], out[ok], period=NB) if ok.any() else out
    rb, ru = prof(rim, c_body), prof(brim, c_bust)
    # where the bust's rim is a beard / chin (far out from its neck), leave it: only the neck proper is blended
    wbin = np.clip((1.35 - ru / max(np.median(ru), 1e-6)) / 0.2, 0, 1)
    me = bust.data
    moved = 0
    for v in me.vertices:
        h = v.co.z - z
        if h > band or h < -1e-4:     # the neck band only (a beard kept below the cut is left alone)
            continue
        t = max(0.0, min(1.0, h / band)); w = 1 - t * t * (3 - 2 * t)
        dx, dy = v.co.x - c_bust[0], v.co.y - c_bust[1]
        ang = math.atan2(dy, dx); r = math.hypot(dx, dy)
        b = (ang + math.pi) / (2 * math.pi) * NB
        i0 = int(math.floor(b)) % NB; fr = b - math.floor(b); i1 = (i0 + 1) % NB
        tb = rb[i0] * (1 - fr) + rb[i1] * fr; tu = ru[i0] * (1 - fr) + ru[i1] * fr
        wb_ = wbin[i0] * (1 - fr) + wbin[i1] * fr
        # only the neck's own surface: a jaw or chin just above the cut stands far out of the rim — left where it is
        wb_ *= min(1.0, max(0.0, (1.2 - r / max(tu, 1e-6)) / 0.2))
        k_ = 1 + ((tb * 0.97) / max(tu, 1e-6) - 1) * w * wb_
        cx = c_bust[0] + (c_body[0] - c_bust[0]) * w * wb_; cy = c_bust[1] + (c_body[1] - c_bust[1]) * w * wb_
        v.co.x = cx + math.cos(ang) * r * k_; v.co.y = cy + math.sin(ang) * r * k_
        if h < 1e-4 and wb_ > 0.5:
            v.co.z = z - 0.004 * H
        moved += 1
    me.update()
    log(f"ring blend: {moved} bust verts onto the body's neck (body rim r≈{np.median(rb):.3f}, bust rim r≈{np.median(ru):.3f})")


bpy.ops.wm.read_factory_settings(use_empty=True)
body = import_mesh(a.body, "body")
V = verts_np(body)
zmin, zmax = V[:, 2].min(), V[:, 2].max()
H = zmax - zmin
# ── the neck cut: the narrowest torso cross-section near the procedural neck (the runtime rig's own search) ──
best, zc = 1e9, zmin + a.neck * H
for z in np.arange(zmin + (a.neck - 0.07) * H, zmin + (a.neck + 0.05) * H, 0.005 * H):
    band = V[(np.abs(V[:, 2] - z) < 0.006 * H) & (np.abs(V[:, 0]) < 0.14 * H)]
    if len(band) == 0:
        continue
    w = np.abs(band[:, 0]).max()
    if w < best:
        best, zc = w, z
if a.neck_exact:
    zc, best = zmin + a.neck * H, float("nan")
head_sel = V[:, 2] > zc
hc = V[head_sel].mean(0)
log(f"body {os.path.basename(a.body)}: H {H:.3f} m, neck cut z {zc - zmin:.3f} ({(zc - zmin) / H:.3f} H), half-width {best:.3f}, "
    f"head centre x {hc[0]:.3f} y {hc[1]:.3f}, tris {ntris(body)}")

his = [body]
if a.graft:
    bust = import_mesh(a.graft, "bust")
    # weld: the generator splits its vertices along every UV seam, and bake rays slipped through those hairline cracks
    # to the back of the head (white scarf lines across the face)
    # (not a TRELLIS crust: welded, its flakes turn non-manifold and the collapse stalls at ~30 k triangles)
    if not a.no_weld:
        bm = bmesh.new(); bm.from_mesh(bust.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5 * max(bust.dimensions))
        bm.to_mesh(bust.data); bm.free(); bust.data.update()
    B = verts_np(bust)
    bt, bb = B[:, 2].max(), B[:, 2].min()
    bc = bt - a.bust_neck * (bt - bb)
    if a.graft_v2 and a.bust_neck_auto is not None:
        # the neck = the narrowest section of the head's back half (a beard hangs in front) between chin and shoulders
        hb_ = bt - bb; tp_ = B[B[:, 2] > bt - 0.3 * hb_]; tcx, tcy = tp_[:, 0].mean(), tp_[:, 1].mean()
        bw_, bf_ = 1e9, a.bust_neck
        for f_ in np.arange(a.bust_neck_auto[0], a.bust_neck_auto[1] + 1e-6, 0.0125):
            z_ = bt - f_ * hb_
            band_ = B[np.abs(B[:, 2] - z_) < 0.006 * hb_]
            back_ = band_[band_[:, 1] > tcy - 0.02 * hb_]
            if len(back_) < 8:
                continue
            w_ = np.percentile(np.abs(back_[:, 0] - tcx), 95)
            if w_ < bw_:
                bw_, bf_ = w_, f_
        log(f"bust neck measured at {bf_:.3f} of its height from the top (was --bust-neck {a.bust_neck:.3f})")
        bc = bt - bf_ * hb_
    ztop = zmax if a.keep_above is None else zmin + a.keep_above * H
    btop = bt if a.bust_top is None else bt - a.bust_top * (bt - bb)
    s = (ztop - zc) / max(1e-6, btop - bc) * a.bust_grow
    if a.bust_fit == "box":
        # match the old head's width too (above the cut; the hat brim included), the geometric mean of the two scales
        ow_ = np.percentile(np.abs(V[V[:, 2] > zc][:, 0] - hc[0]), 99)
        bhv_ = B[B[:, 2] > bc]; nw_ = np.percentile(np.abs(bhv_[:, 0] - bhv_[:, 0].mean()), 99)
        sw_ = ow_ / max(nw_, 1e-6) * a.bust_grow
        log(f"bust scale: {s:.4f} by neck-to-top, {sw_:.4f} by width → {math.sqrt(s * sw_):.4f}")
        s = math.sqrt(s * sw_)
    # centre: the bust's head (above its neck) on the old head, horizontally; its neck on the cut
    bh = B[B[:, 2] > bc]
    bcx, bcy = bh[:, 0].mean(), bh[:, 1].mean()
    M = Matrix.Translation((hc[0], hc[1] - a.bust_dy * H, zc + a.bust_dz * H)) @ Matrix.Scale(s, 4) @ Matrix.Translation((-bcx, -bcy, -bc))
    bust.data.transform(M); bust.data.update()
    if a.bust_image:
        project_portrait(bust, a.bust_image, zc)
    if a.keep_above is not None:
        # the kept hat flares at its foot to the bust's width there (tapering to nothing at its tip), so the two meet
        def half_w(Vx, z):
            b_ = Vx[np.abs(Vx[:, 2] - z) < 0.01 * H]
            return (b_[:, 0].max() - b_[:, 0].min()) / 2 if len(b_) else 0.0, (b_[:, 1].max() - b_[:, 1].min()) / 2 if len(b_) else 0.0
        bwx, bwy = half_w(verts_np(bust), ztop)
        hwx, hwy = half_w(V, ztop)
        kx, ky = (bwx / hwx if hwx > 0 else 1.0), (bwy / hwy if hwy > 0 else 1.0)
        for ob_ in (body,):
            for v_ in ob_.data.vertices:
                if v_.co.z > ztop - 0.01 * H:
                    f_ = max(0.0, 1 - (v_.co.z - ztop) / max(1e-6, zmax - ztop))
                    v_.co.x = hc[0] + (v_.co.x - hc[0]) * (1 + (kx - 1) * f_)
                    v_.co.y = hc[1] + (v_.co.y - hc[1]) * (1 + (ky - 1) * f_)
            ob_.data.update()
        log(f"kept hat above {ztop - zmin:.3f}: its foot flared x{kx:.2f} / y{ky:.2f} to the bust's")
    tilt = None
    if a.graft_v2 and a.keep_above is None and a.cut_tilt > 0:
        # the cut dips under the jaw: work in a frame turned about x so that plane is level (turned back after the cuts)
        # (a shear, level behind the neck's centre and dipping in front of it: a turned plane rose at the back and left
        # the old neck standing up behind the new head like a collar)
        tk_ = math.tan(math.radians(a.cut_tilt)); py_ = float(hc[1])
        def tilt(ob_, sign):
            co_ = np.empty(len(ob_.data.vertices) * 3); ob_.data.vertices.foreach_get("co", co_); co_ = co_.reshape(-1, 3)
            co_[:, 2] += sign * np.maximum(0.0, py_ - co_[:, 1]) * tk_
            ob_.data.vertices.foreach_set("co", co_.ravel()); ob_.data.update()
        for ob_ in (body, bust):
            tilt(ob_, 1)
    if a.graft_v2:
        split_at(bust, zc); split_at(body, zc)          # straight cuts: the centroid rule left a zig-zag hem on both
    clip = zc - a.bust_clip * H if not a.graft_v2 else zc
    bw, bd = a.bust_beard
    # a beard hangs over the chest: keep the bust's front strip down to bd below the cut (bw wide) so the new beard
    # covers the old one
    if a.graft_v2:
        # the chin / beard that hangs forward of the neck below the cut: the bust keeps its own, the body loses its old one
        # (both measured against their own neck's front at the cut)
        def neck_front(ob):
            P_ = verts_np(ob); r_ = P_[(np.abs(P_[:, 2] - zc) < 0.004 * H) & (np.abs(P_[:, 0] - hc[0]) < 0.05 * H)]
            return np.percentile(r_[:, 1], 50) if len(r_) else hc[1]
        fb_, fo_ = neck_front(bust), neck_front(body)
        fwd_b = lambda c: bw > 0 and abs(c.x - hc[0]) < bw * H and c.z > zc - bd * H and c.y < fb_ - 0.01 * H
        k = delete_faces(bust, lambda c: c.z < zc and not fwd_b(c))
    else:
        k = delete_faces(bust, lambda c: c.z < clip and not (bw > 0 and abs(c.x - hc[0]) < bw * H and c.z > zc - bd * H and c.y < hc[1] - 0.02 * H))
    if a.keep_above is not None:
        k += delete_faces(bust, lambda c: c.z > ztop + a.bust_overlap * H)
    if a.bust_collar is not None:
        ch, cr = a.bust_collar
        k += delete_faces(bust, lambda c: c.z < zc + ch * H and math.hypot(c.x - hc[0], c.y - hc[1]) > cr * H
                          and not (bw > 0 and abs(c.x - hc[0]) < bw * H and c.y < hc[1] - 0.02 * H))
    log(f"bust {os.path.basename(a.graft)}: scale {s:.4f}, neck at {a.bust_neck:.2f} of its height, clipped {k} faces below {clip - zmin:.3f}")
    # the body keeps what is under the cut
    body_hi = body.copy(); body_hi.data = body.data.copy(); body_hi.name = "body_hi"
    bpy.context.collection.objects.link(body_hi)
    in_beard = lambda c: bw > 0 and abs(c.x - hc[0]) < bw * H * 0.9 and c.z > zc - bd * H * 0.9 and c.y < hc[1] - 0.03 * H
    if a.graft_v2:
        # the old beard goes only where the new one covers it (a face in the strip with the bust in front of it): a fixed
        # strip cut a hole in the coat wherever the new beard was shorter than the old (Baqyt Ata)
        from mathutils.bvhtree import BVHTree as _BVH
        _bm = bmesh.new(); _bm.from_mesh(bust.data); _tree = _BVH.FromBMesh(_bm); _bm.free()
        def in_beard(c):
            if not (bw > 0 and abs(c.x - hc[0]) < bw * H and c.z > zc - bd * H and c.z <= zc and c.y < fo_ - 0.015 * H):
                return False
            hit = _tree.ray_cast(Vector((c.x, c.y + 0.002 * H, c.z)), Vector((0.0, -1.0, 0.0)), 0.08 * H)
            return hit[0] is not None
    kept = (lambda c: False) if a.keep_above is None else (lambda c: c.z > ztop)
    if a.body_collar is not None:
        # a high coat collar: the body keeps its faces over the cut (up to <h>) farther than <r> from the head's axis (a
        # flat cut there left a jagged hem round the neck); the bust takes the inside
        kept0, (ch_, cr_) = kept, a.body_collar
        kept = lambda c: kept0(c) or (c.z < zc + ch_ * H and math.hypot(c.x - hc[0], c.y - hc[1]) > cr_ * H)
    k = delete_faces(body, lambda c: (c.z > zc and not kept(c)) or in_beard(c))  # the old beard goes with the old head
    log(f"body: {k} head faces removed")
    if a.graft_v2:
        k = drop_fragments(bust)
        log(f"bust: {k} floating / sliver faces dropped")
        if a.keep_above is None:
            ring_blend(bust, body, zc, a.ring_band * H)
        delete_faces(body_hi, lambda c: (c.z > zc and not kept(c)) or in_beard(c))
        if tilt is not None:
            for ob_ in (body, body_hi, bust):
                tilt(ob_, -1)
    # low bust: decimated copy
    bust_lo = bust.copy(); bust_lo.data = bust.data.copy(); bust_lo.name = "bust_lo"
    bpy.context.collection.objects.link(bust_lo)
    if ntris(bust_lo) > a.head_tris:
        m = bust_lo.modifiers.new("dec", "DECIMATE"); m.decimate_type = "COLLAPSE"
        m.ratio = a.head_tris / ntris(bust_lo); m.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = bust_lo
        bpy.ops.object.modifier_apply(modifier="dec")
    # the collapse flips a few triangles (see-through holes in a face once three culls back faces): turn each low face
    # to agree with the dense bust's surface nearest to it
    from mathutils.bvhtree import BVHTree
    dg = bpy.context.evaluated_depsgraph_get()
    tree = BVHTree.FromObject(bust, dg)
    bm = bmesh.new(); bm.from_mesh(bust_lo.data)
    flip = []
    for f in bm.faces:
        hit = tree.find_nearest(f.calc_center_median())
        if hit[1] is not None and f.normal.dot(hit[1]) < -0.2:
            flip.append(f)
    bmesh.ops.reverse_faces(bm, faces=flip)
    # then against its neighbours: a face whose winding disagrees with its corners' (area-weighted) vertex normals is
    # still inside out — drawn double-sided, three lights it from behind: a dark line across the eyes (the cook)
    nmore = 0
    for _ in range(3):
        bm.normal_update()
        more = [f for f in bm.faces if f.normal.dot(sum((v.normal for v in f.verts), Vector())) < 0]
        if not more:
            break
        bmesh.ops.reverse_faces(bm, faces=more); nmore += len(more)
    flip += [None] * nmore
    bm.to_mesh(bust_lo.data); bm.free(); bust_lo.data.update()
    log(f"bust: {ntris(bust_lo)} tris after the collapse, {len(flip)} flipped faces turned back")
    if a.graft_v2:
        log(f"bust lo: {drop_fragments(bust_lo, sliver=0.06)} sliver / floating faces dropped after the collapse")
    # hi = the untouched body minus its head + the full bust; low = the body minus its head + the decimated bust
    if not a.graft_v2:
        delete_faces(body_hi, lambda c: (c.z > zc and not kept(c)) or in_beard(c))
    his = [body_hi, bust]
    for o in bpy.context.scene.objects:
        o.select_set(o in (body, bust_lo))
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    low = body
else:
    low = body.copy(); low.data = body.data.copy(); low.name = "low"
    bpy.context.collection.objects.link(low)
low.name = "low"

# ── fresh UVs, head first ──
sys.path.append(os.path.expanduser(os.environ.get("XATLAS_PY", "~/ml/img2mesh/blender-py")))
import xatlas  # noqa: E402
bm = bmesh.new(); bm.from_mesh(low.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5 * H)
bmesh.ops.triangulate(bm, faces=bm.faces); bm.to_mesh(low.data); bm.free()
while low.data.uv_layers:
    low.data.uv_layers.remove(low.data.uv_layers[0])
low.data.uv_layers.new(name="UVMap")
LV = verts_np(low).astype(np.float32)
F = np.array([p.vertices[:] for p in low.data.polygons], dtype=np.uint32)
t = np.clip((LV[:, 2] - (zc - 0.04 * H)) / (0.05 * H), 0, 1)
t = t * t * (3 - 2 * t)
# the face (the head's front, below the hat) gets --face-scale, the rest of the head --head-scale — a smooth field, so the
# charts that cross it only stretch (a little more texel there), never tear
LN = np.empty(len(low.data.vertices) * 3, dtype=np.float32); low.data.vertices.foreach_get("normal", LN); LN = LN.reshape(-1, 3)
ftop = zc + a.face_top * (zmax - zc)
fr = np.clip((-LN[:, 1] - 0.15) / 0.5, 0, 1) * np.clip((ftop - LV[:, 2]) / (0.08 * (zmax - zc)), 0, 1)
kk = 1 + t * ((a.head_scale - 1) + (a.face_scale - a.head_scale) * fr)
piv = np.array([hc[0], hc[1], zc + 0.4 * (zmax - zc)], dtype=np.float32)
LVs = piv + (LV - piv) * kk[:, None]
atlas = xatlas.Atlas(); atlas.add_mesh(LVs, F)
po = xatlas.PackOptions(); po.resolution = a.tex; po.padding = 8; po.bilinear = True; po.bruteForce = True
co_ = xatlas.ChartOptions()
co_.max_cost = float(os.environ.get("XATLAS_COST", "8")); co_.normal_seam_weight = 1.0   # fewer, bigger charts: a face in one piece
atlas.generate(co_, po)
vmap, idx, uvs = atlas[0]
# the face as ONE planar chart (front projection): xatlas still cut it into 2–4 charts, and on the phone's 256-px cell
# with its mipmaps every cut through the face read as a dark line (the cook's "glasses")
FF = F.astype(np.int64)
c3 = LV[FF].mean(1)
nf = np.cross(LV[FF[:, 1]] - LV[FF[:, 0]], LV[FF[:, 2]] - LV[FF[:, 0]])
nf /= np.maximum(np.linalg.norm(nf, axis=1, keepdims=True), 1e-12)
face_tri = (c3[:, 2] > zc + 0.01 * H) & (c3[:, 2] < ftop) & (nf[:, 1] < -0.3) & (c3[:, 1] < hc[1])
if face_tri.sum() > 8 and os.environ.get("FACE_CHART", "1") == "1":
    keys, P2, U2 = {}, [], []
    F2 = np.zeros_like(FF)
    for t in range(len(FF)):
        for k in range(3):
            if face_tri[t]:
                ov = int(FF[t, k]); uv = (10.0 + float(LV[ov, 0]), float(LV[ov, 2])); key = (ov, "f")
                pos_ = LVs[ov]
            else:
                av = int(idx[t][k]); ov = int(vmap[av]); uv = (float(uvs[av][0]), float(uvs[av][1])); key = (ov, av)
                pos_ = LVs[ov]
            j = keys.get(key)
            if j is None:
                j = keys[key] = len(P2); P2.append(pos_); U2.append(uv)
            F2[t, k] = j
    at2 = xatlas.Atlas()
    at2.add_mesh(np.array(P2, np.float32), F2.astype(np.uint32), None, np.array(U2, np.float32))
    co2 = xatlas.ChartOptions(); co2.use_input_mesh_uvs = True
    at2.generate(co2, po)
    _, idx, uvs = at2[0]
    log(f"face chart: {int(face_tri.sum())} triangles in one front projection, {at2.chart_count} charts")
uvl = low.data.uv_layers["UVMap"]
for p, tri in zip(low.data.polygons, idx):
    for li, q in zip(p.loop_indices, tri):
        uvl.data[li].uv = uvs[q]
# how much of the atlas the head got (uv area share of the faces above the cut)
def uv_area(sel):
    s = 0.0
    for p, tri in zip(low.data.polygons, idx):
        if sel(p):
            u = uvs[tri]
            s += abs((u[1][0] - u[0][0]) * (u[2][1] - u[0][1]) - (u[2][0] - u[0][0]) * (u[1][1] - u[0][1])) / 2
    return s
ha, ta = uv_area(lambda p: p.center.z > zc), uv_area(lambda p: True)
fa = uv_area(lambda p: zc < p.center.z < ftop and p.normal.y < -0.5)
log(f"xatlas: {atlas.chart_count} charts, head {ha / max(ta, 1e-9):.2f} / face {fa / max(ta, 1e-9):.2f} of the charts (x{a.head_scale} / x{a.face_scale})")

# ── bake the base colour hi → low ── (low smooth-shaded first: the cage is extruded along its normals, and flat
# faces tore the cage at every edge — the rays there hit the scarf behind the cheek: light lines along the edges)
for poly in low.data.polygons:
    poly.use_smooth = True
img = bpy.data.images.new("atlas", a.tex, a.tex, alpha=False)
mat = bpy.data.materials.new("atlas"); mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes.get("Principled BSDF")
tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img
nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.85; bsdf.inputs["Metallic"].default_value = 0.0
low.data.materials.clear(); low.data.materials.append(mat)
nt.nodes.active = tex
sc = bpy.context.scene
sc.render.engine = "CYCLES"
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"; prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    sc.cycles.device = "GPU"
except Exception:
    pass
sc.cycles.samples = 4
for o in sc.objects:
    o.select_set(o in his or o == low)
bpy.context.view_layer.objects.active = low
ext = float(os.environ.get("BAKE_EXT", "0.012")) * H
bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, use_selected_to_active=True, cage_extrusion=ext,
                    max_ray_distance=ext * 4, margin=3, margin_type="EXTEND")   # margin < padding / 2: no chart's margin runs into its neighbour
nimg = None
if a.normal_map:
    nimg = bpy.data.images.new("normal", a.tex, a.tex, alpha=False)
    nimg.colorspace_settings.name = "Non-Color"
    ntex = nt.nodes.new("ShaderNodeTexImage"); ntex.image = nimg
    nt.nodes.active = ntex
    bpy.ops.object.bake(type="NORMAL", normal_space="TANGENT", use_selected_to_active=True, cage_extrusion=ext,
                        max_ray_distance=ext * 4, margin=3, margin_type="EXTEND")
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(ntex.outputs["Color"], nmap.inputs["Color"]); nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    nt.nodes.active = tex
    log("normal map baked (tangent space)")
for o in his:
    bpy.data.objects.remove(o)


def raster_maps(zlo):
    """the low mesh's position + face normal per texel (uv-rasterised, faces above zlo only) → two (tex, tex, 3) arrays,
    row 0 = v 0 (Blender's pixel order); texels off those faces stay far away (pos 1e3) so no paint lands there"""
    T = a.tex
    pos = np.full((T, T, 3), 1e3, np.float32); nrm = np.zeros((T, T, 3), np.float32)
    uvd = low.data.uv_layers["UVMap"].data
    vco = low.data.vertices
    cov = np.zeros((T, T), bool)
    for poly in low.data.polygons:
        head = poly.center.z >= zlo
        li = list(poly.loop_indices)
        uv = np.array([uvd[k].uv[:] for k in li], np.float64) * T - 0.5
        P3 = np.array([vco[low.data.loops[k].vertex_index].co[:] for k in li], np.float64)
        for t in range(1, len(li) - 1):
            U = uv[[0, t, t + 1]]; Q = P3[[0, t, t + 1]]
            x0, y0 = np.floor(U.min(0)).astype(int); x1, y1 = np.ceil(U.max(0)).astype(int)
            x0, y0 = max(x0 - 1, 0), max(y0 - 1, 0); x1, y1 = min(x1 + 1, T - 1), min(y1 + 1, T - 1)
            gx, gy = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
            d = (U[1, 1] - U[2, 1]) * (U[0, 0] - U[2, 0]) + (U[2, 0] - U[1, 0]) * (U[0, 1] - U[2, 1])
            if abs(d) < 1e-12:
                continue
            l0 = ((U[1, 1] - U[2, 1]) * (gx - U[2, 0]) + (U[2, 0] - U[1, 0]) * (gy - U[2, 1])) / d
            l1 = ((U[2, 1] - U[0, 1]) * (gx - U[2, 0]) + (U[0, 0] - U[2, 0]) * (gy - U[2, 1])) / d
            l2 = 1 - l0 - l1
            e_ = -0.6 / max(1.0, np.abs(U.max(0) - U.min(0)).max())               # a little over the edge: no seams
            ins = (l0 >= e_) & (l1 >= e_) & (l2 >= e_)
            if not ins.any():
                continue
            w = np.stack([l0[ins], l1[ins], l2[ins]], -1)
            cov[gy[ins], gx[ins]] = True
            if head:
                pos[gy[ins], gx[ins]] = w @ Q
                nrm[gy[ins], gx[ins]] = poly.normal[:]
    return pos, nrm, cov


if a.graft and a.graft_v2 and a.keep_above is None:
    # E339: the neck's colour runs on from the body into the bust over the blended band (the bust's own neck paint met the
    # body's in a hard line): per angle round the neck, the bust side shifted by the difference of the two sides' means
    pos, nrm, _ = raster_maps(zc - 0.06 * H)
    px = np.empty(a.tex * a.tex * 4, dtype=np.float32); img.pixels.foreach_get(px)
    col = px.reshape(a.tex, a.tex, 4)
    ok = pos[..., 0] < 1e2
    rel = pos[..., 2] - zc
    rad = np.hypot(pos[..., 0] - hc[0], pos[..., 1] - hc[1])
    near = ok & (rad < 0.12 * H)
    NB_ = 24
    bi = (((np.arctan2(pos[..., 1] - hc[1], pos[..., 0] - hc[0]) + np.pi) / (2 * np.pi)) * NB_).astype(int) % NB_
    below = near & (rel > -0.03 * H) & (rel < -0.004 * H)
    above = near & (rel > 0.004 * H) & (rel < 0.03 * H)
    band_ = a.ring_band * H
    if below.sum() > 20 and above.sum() > 20:
        gb, ga = col[below][:, :3].mean(0), col[above][:, :3].mean(0)
        dif = np.zeros((NB_, 3), np.float32)
        for b in range(NB_):
            mb = below & (bi == b); ma = above & (bi == b)
            dif[b] = (col[mb][:, :3].mean(0) if mb.sum() > 4 else gb) - (col[ma][:, :3].mean(0) if ma.sum() > 4 else ga)
        sel = near & (rel > -0.002 * H) & (rel < band_)
        t = np.clip(rel / band_, 0, 1); w = (1 - t * t * (3 - 2 * t)) * 0.85
        col[..., :3] = np.where(sel[..., None], np.clip(col[..., :3] + dif[bi] * w[..., None], 0, 1), col[..., :3])
        img.pixels.foreach_set(col.ravel())
        log(f"neck colour blended over {int(sel.sum())} texels (mean body-bust gap {np.abs(gb - ga).mean():.3f})")

if a.paint:
    P = json.loads(a.paint)
    pos, nrm, _ = raster_maps(zc - 0.06 * H)
    px = np.empty(a.tex * a.tex * 4, dtype=np.float32); img.pixels.foreach_get(px)
    col = px.reshape(a.tex, a.tex, 4)
    rgb = col[..., :3]
    # the face frame: front = -Y (glTF +Z); x across (the figure's LEFT is +x); z up. Units: eye spacing e (m)
    # the spec is in the --front render's pixels (768², ortho): "eyes": [x left, x right, y] and optional rows
    # "brow_y", "nose_y", "mouth_y", "keep_y" (the beard / scarf below stay as generated), "face_y" (the oval's centre)
    fscale = (zmax - zc) * 1.5; mpp = fscale / 768; fmid = zc + (zmax - zc) * 0.45
    zpx = lambda py: fmid + (384 - py) * mpp
    xl, xr, ey = P["eyes"]
    e = (xr - xl) * mpp
    cx = hc[0] + ((xl + xr) / 2 - 384) * mpp
    ez = zpx(ey)
    vpx = lambda py: (zpx(py) - ez) / e
    for k in ("brow", "nose", "mouth", "keep", "face"):
        if f"{k}_y" in P:
            P[{"keep": "keep_below", "face": "face_cv"}.get(k, f"{k}_v")] = vpx(P[f"{k}_y"])
    u = (pos[..., 0] - cx) / e
    v = (pos[..., 2] - ez) / e
    front = np.clip((-nrm[..., 1] - 0.15) / 0.45, 0, 1)                          # facing the camera
    ahead = pos[..., 1] < (hc[1] + P.get("dy", 0.0) * e)                        # the front half of the head
    fw = front * ahead * (pos[..., 2] > zc - 0.02 * H)
    log(f"paint maps: pos x {pos[..., 0].min():.2f}..{pos[..., 0].max():.2f} z {pos[..., 2].min():.2f}..{pos[..., 2].max():.2f}, "
        f"-ny>0.5 on {(nrm[..., 1] < -0.5).mean():.3f}, front-facing head texels {(fw > 0.5).sum()}")

    def ell(cu, cv, ru, rv, soft=0.35):
        d = np.sqrt(((u - cu) / ru) ** 2 + ((v - cv) / rv) ** 2)
        return np.clip((1 - d) / soft, 0, 1)

    def put(mask, c, alpha=1.0):
        m = (mask * fw * alpha)[..., None]
        rgb[...] = rgb * (1 - m) + np.array(c, dtype=np.float32)[None, None, :] * m

    # 1. one skin tone over the face oval (the generated face is mottled: blotches read as dirt at 3 m) — only on
    #    skin-coloured texels (not the beard, the scarf, the hat brim), below the brim (top_y) and above keep_y
    fu, fv = P.get("face", [1.25, 1.55])
    oval = ell(0, P.get("face_cv", -0.35), fu, fv, soft=0.5)
    r_, g_, b_ = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    lum = (r_ + g_ + b_) / 3
    skin0 = np.clip(((r_ - b_) - 0.08) / 0.1, 0, 1) * (r_ >= g_) * (lum > 0.2) * (lum < 0.92)
    # the middle of the face: the dark streaks and blotches go too (only white — a beard, a scarf — stays)
    inner = ell(0, P.get("face_cv", -0.35), fu * 0.72, fv * 0.72, soft=0.3) * (lum < 0.8)
    skinlike = np.maximum(skin0, inner * P.get("blemish", 1.0))
    inface = oval * (v > P.get("keep_below", -99.0)) * (v < (vpx(P["top_y"]) if "top_y" in P else 99.0))
    sel = (inface > 0.6) & (fw > 0.6) & (skin0 > 0.5)
    skin = np.array(P["skin"], np.float32) if "skin" in P else (np.median(rgb[sel], axis=0) if sel.sum() > 20 else np.array([0.72, 0.5, 0.38], np.float32))
    ml = lum[sel].mean() if sel.sum() > 20 else 0.5
    shade = (0.5 + 0.5 * np.clip(lum / max(ml, 1e-3), 0.85, 1.12))[..., None]
    m = (inface * fw * skinlike * P.get("smooth", 0.85))[..., None]
    rgb[...] = rgb * (1 - m) + (skin[None, None, :] * shade) * m
    dark = np.array(P.get("line", [0.12, 0.07, 0.05]), np.float32)
    # 2. cheeks: a warm flush
    for s in (-1, 1):
        put(ell(s * 0.62, -0.62, 0.34, 0.22, soft=1.0), P.get("cheek", [0.78, 0.42, 0.36]), P.get("cheek_a", 0.35))
    # 3. eyes: white, iris, pupil, upper lid (the procedural figures' black eyes, grown into something that reads)
    er = P.get("eye_r", [0.22, 0.12])
    for s in (-1, 1):
        put(ell(s * 0.5, 0, er[0], er[1], 0.25), P.get("white", [0.93, 0.9, 0.84]))
        put(ell(s * 0.5, -0.005, er[1] * 1.0, er[1] * 1.0, 0.25), P.get("iris", [0.2, 0.12, 0.07]))
        put(ell(s * 0.5, -0.005, er[1] * 0.45, er[1] * 0.45, 0.3), [0.03, 0.02, 0.02])
        put(ell(s * 0.5, er[1] * 0.75, er[0] * 1.08, er[1] * 0.38, 0.4), dark)
        # 4. brows
        bc = P.get("brow", [0.14, 0.09, 0.06])
        put(ell(s * 0.52, P.get("brow_v", 0.36), 0.3, P.get("brow_t", 0.075), 0.4), bc)
    # 5. nose: a shade under it and on its side
    put(ell(0, P.get("nose_v", -0.62), 0.2, 0.08, 0.8), [x * 0.72 for x in skin.tolist()], 0.8)
    put(ell(0.1, P.get("nose_v", -0.62) + 0.3, 0.07, 0.28, 0.9), [x * 0.85 for x in skin.tolist()], 0.6)
    # 6. mouth
    if P.get("mouth", True):
        put(ell(0, P.get("mouth_v", -1.02), P.get("mouth_w", 0.34), 0.055, 0.45), P.get("lip", [0.45, 0.16, 0.13]))
    if P.get("moustache"):
        mv = P.get("mouth_v", -1.02) + 0.13
        put(ell(0, mv, P.get("moustache_w", 0.5), 0.06, 0.4), P.get("moustache_c", [0.1, 0.07, 0.05]))
        for s in (-1, 1):                                                        # the ends droop
            put(ell(s * P.get("moustache_w", 0.5) * 0.85, mv - 0.08, 0.1, 0.1, 0.5), P.get("moustache_c", [0.1, 0.07, 0.05]))
    col[..., :3] = np.clip(rgb, 0, 1)
    img.pixels.foreach_set(col.ravel())
    log(f"painted face: eye z {ez - zmin:.3f}, spacing {e:.3f} m, skin {np.round(skin, 2).tolist()}")

# ── fill every texel off the charts (push-pull): the black gutters bled into the faces as dark seams once the phone's
#    256² cell and its mipmaps averaged across them ──
_, _, cov = raster_maps(1e9)
for _ in range(3):   # keep the bake's own EXTEND margin round every chart (bilinear reads half a texel past the edge)
    cov = cov | np.roll(cov, 1, 0) | np.roll(cov, -1, 0) | np.roll(cov, 1, 1) | np.roll(cov, -1, 1)
px = np.empty(a.tex * a.tex * 4, dtype=np.float32); img.pixels.foreach_get(px)
col = px.reshape(a.tex, a.tex, 4)


def push_pull(c, m):
    if c.shape[0] <= 1:
        return c
    w = m.astype(np.float32)
    h2 = c.shape[0] // 2
    cw = (c * w[..., None]).reshape(h2, 2, h2, 2, 3).sum((1, 3))
    ww = w.reshape(h2, 2, h2, 2).sum((1, 3))
    small = np.where(ww[..., None] > 0, cw / np.maximum(ww[..., None], 1e-6), 0)
    small = push_pull(small, ww > 0)
    up = small.repeat(2, 0).repeat(2, 1)
    return np.where(m[..., None], c, up)


if os.environ.get("NO_FILL") != "1":
    col[..., :3] = push_pull(col[..., :3].copy(), cov)
img.pixels.foreach_set(col.ravel())
log(f"gutters filled: {(~cov).mean():.2f} of the atlas was off the charts")
img.file_format = "PNG"
img.pack()
if nimg is not None:
    npx = np.empty(a.tex * a.tex * 4, dtype=np.float32); nimg.pixels.foreach_get(npx)
    ncol = npx.reshape(a.tex, a.tex, 4)
    if os.environ.get("NO_FILL") != "1":
        ncol[..., :3] = push_pull(ncol[..., :3].copy(), cov)
    nimg.pixels.foreach_set(ncol.ravel())
    nimg.file_format = "PNG"
    nimg.pack()
# smooth shading, hard only past 50° (the join + weld dropped the imported normals: a grafted head came out faceted, every
# decimated triangle its own flat patch under the cel bands — rings round the eyes, shards in a beard)
for o in bpy.context.scene.objects:
    o.select_set(o == low)
bpy.context.view_layer.objects.active = low
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(50))
for md in list(low.modifiers):
    try:
        bpy.ops.object.modifier_apply(modifier=md.name)
    except Exception:
        pass
if a.graft and a.graft_v2:
    # E339: the grafted head smooth all over (the 50° split left beards, scarves and fur as torn-paper facets)
    bm = bmesh.new(); bm.from_mesh(low.data)
    for f_ in bm.faces:
        if f_.calc_center_median().z > zc - 0.01 * H:
            f_.smooth = True
            for e_ in f_.edges:
                e_.smooth = True
    bm.to_mesh(low.data); bm.free(); low.data.update()
if a.smooth_face > 0:
    # the generated face is a few hundred lumpy facets: under the painterly cel bands a dent reads as a dark blob (the
    # cook's cheek, the child's nose). Bend the face's normals toward an ellipsoid round the head — the procedural
    # figures' smooth sphere head, lit as one surface — keeping the silhouette
    Vn = verts_np(low)
    Nn = np.empty(len(low.data.vertices) * 3, dtype=np.float64); low.data.vertices.foreach_get("normal", Nn); Nn = Nn.reshape(-1, 3)
    band = (Vn[:, 2] > zc) & (Vn[:, 2] < ftop)
    c = Vn[band].mean(0); r = np.maximum((Vn[band].max(0) - Vn[band].min(0)) / 2, 1e-3)
    ne = (Vn - c) / (r * r); ne /= np.maximum(np.linalg.norm(ne, axis=1, keepdims=True), 1e-9)
    tt = np.clip((Vn[:, 2] - zc) / (0.03 * H), 0, 1) * np.clip((ftop - Vn[:, 2]) / (0.05 * H), 0, 1)
    wf = tt * np.clip((-Nn[:, 1] + 0.2) / 0.5, 0, 1) * a.smooth_face
    nn = Nn * (1 - wf[:, None]) + ne * wf[:, None]
    nn /= np.maximum(np.linalg.norm(nn, axis=1, keepdims=True), 1e-9)
    for poly in low.data.polygons:
        poly.use_smooth = True
    low.data.normals_split_custom_set_from_vertices([tuple(x) for x in nn])
    log(f"face normals smoothed toward the head ellipsoid on {(wf > 0.05).sum()} verts")
low.data.name = low.name = os.path.splitext(os.path.basename(a.out))[0]
for o in bpy.context.scene.objects:
    o.select_set(o == low)
bpy.context.view_layer.objects.active = low
# the neck cut rides along as a node extra (glTF extras.neckCut, fraction of the height): the game's rig pivots the head
# there (campPeopleModels.ts). Its own search — the narrowest cross-section near the procedural neck — found a new
# head's face narrower than the neck and bent the face across the eyes whenever the head turned (a crease under the brows)
low["neckCut"] = round(float((zc - zmin) / H), 4)
bpy.ops.export_scene.gltf(filepath=a.out, export_format="GLB", use_selection=True, export_image_format="AUTO",
                          export_yup=True, export_apply=True, export_extras=True,
                          export_tangents=a.normal_map)
json.dump({"tris": ntris(low), "verts": len(low.data.vertices), "neck_cut": round(float((zc - zmin) / H), 4),
           "head_share": round(float(ha / max(ta, 1e-9)), 3), "height": round(float(H), 3)}, open(a.out + ".json", "w"), indent=1)
log(f"{a.out}: {ntris(low)} tris, {len(low.data.vertices)} verts")

if a.front:
    # an unlit ortho render of the head from the front, with a z grid every 1 % of H (for tuning the paint)
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x = sc.render.resolution_y = 768
    world = bpy.data.worlds.new("w"); sc.world = world; world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.5, 0.5, 0.5, 1)
    em = nt.nodes.new("ShaderNodeEmission"); nt.links.new(tex.outputs["Color"], em.inputs["Color"])
    nt.links.new(em.outputs["Emission"], nt.nodes["Material Output"].inputs["Surface"])
    sc.view_settings.view_transform = "Standard"
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.type = "ORTHO"; cam.data.ortho_scale = (zmax - zc) * 1.5
    sc.collection.objects.link(cam); sc.camera = cam
    mid = zc + (zmax - zc) * 0.45
    cam.location = (hc[0], hc[1] - 3, mid); cam.rotation_euler = (math.pi / 2, 0, 0)
    sc.render.filepath = a.front
    bpy.ops.render.render(write_still=True)
    json.dump({"z_bottom": float((mid - cam.data.ortho_scale / 2 - zmin) / H), "z_top": float((mid + cam.data.ortho_scale / 2 - zmin) / H),
               "x0": float(hc[0] - cam.data.ortho_scale / 2), "scale": float(cam.data.ortho_scale), "H": float(H)},
              open(a.front + ".json", "w"), indent=1)
    log(f"front render {a.front}: rows span z {(mid - cam.data.ortho_scale / 2 - zmin) / H:.3f}..{(mid + cam.data.ortho_scale / 2 - zmin) / H:.3f} H")
