"""E289 finishing passes for the training dummies, used by rig_dummy.py (Blender's Python, numpy only).

- squeeze_atlas: the baked atlas is full; move its content up by STRIP of the height and free a strip at the bottom
  for the parts built here (the cross-foot base's wood and iron).
- replace_base: TRELLIS's cross-foot bases came back blocky and speckled; cut the base, the post and the braces off
  the figure and build the approved one instead (a square post, two crossed feet, four braces, iron end caps), its
  wood and iron painted into the free strip.
- smooth_regions: pull in the flaky remesh fuzz (the straw neck and fists).
- flatten_face: smooth the dent at the centre of the painted face target.
- weather_steel: darken and rust the steel towards the approved dark iron, in the texture.
"""
import math

import bmesh
import numpy as np
from mathutils import Matrix, Vector

STRIP = 0.125  # the bottom eighth of the atlas


def images(me):
    nodes = me.materials[0].node_tree.nodes
    base = next(n.image for n in nodes if n.type == "TEX_IMAGE" and any(
        l.to_socket.name == "Base Color" for l in n.outputs["Color"].links))
    mr = next((n.image for n in nodes if n.type == "TEX_IMAGE" and n.image is not base), None)
    return base, mr


def read_px(img):
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(h, w, 4)


def write_px(img, px):
    img.pixels.foreach_set(px.ravel())
    img.pack()


def squeeze_atlas(me):
    """Rows [0, STRIP) of both maps become free; every UV moves to v' = STRIP + v (1 - STRIP)."""
    for img in images(me):
        if img is None:
            continue
        px = read_px(img)
        h = px.shape[0]
        top = h - int(round(h * STRIP))
        src = (np.arange(top) + 0.5) * h / top - 0.5
        i0 = np.clip(np.floor(src).astype(int), 0, h - 1)
        i1 = np.clip(i0 + 1, 0, h - 1)
        t = (src - i0)[:, None, None]
        out = px.copy()
        out[h - top:] = px[i0] * (1 - t) + px[i1] * t
        out[:h - top] = 0.0
        out[:h - top, :, 3] = 1.0
        write_px(img, out)
    for d in me.uv_layers.active.data:
        d.uv.y = STRIP + d.uv.y * (1 - STRIP)


def value_noise(shape, cells, rng):
    """Smooth 2D value noise in [0, 1], `cells` lattice cells across each axis."""
    g = rng.random((cells[0] + 2, cells[1] + 2))
    ys = np.linspace(0, cells[0], shape[0], endpoint=False)
    xs = np.linspace(0, cells[1], shape[1], endpoint=False)
    y0, x0 = ys.astype(int), xs.astype(int)
    ty, tx = (ys - y0)[:, None], (xs - x0)[None, :]
    ty, tx = ty * ty * (3 - 2 * ty), tx * tx * (3 - 2 * tx)
    a = g[y0][:, x0]
    b = g[y0][:, x0 + 1]
    c = g[y0 + 1][:, x0]
    d = g[y0 + 1][:, x0 + 1]
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty


def noise3(p, freq, seed):
    """Cheap smooth 3D noise in [0, 1] at points p (N, 3): a sum of offset sine products."""
    rng = np.random.default_rng(seed)
    acc = np.zeros(len(p))
    amp_total = 0.0
    for octave in range(3):
        f = freq * (2 ** octave)
        amp = 0.5 ** octave
        for _ in range(3):
            k = rng.normal(size=3)
            k /= np.linalg.norm(k)
            ph = rng.random() * 6.283
            acc += amp * np.sin(p @ k * f * 6.283 + ph)
            amp_total += amp
    return 0.5 + 0.5 * acc / amp_total * 1.7


# ---------------------------------------------------------------------------------------------- the cross-foot base
WOOD_BOX = (0.0, 0.004, 0.75, STRIP - 0.004)   # u0, v0, u1, v1 of the wood tile
IRON_BOX = (0.77, 0.004, 0.995, STRIP - 0.004)  # the iron tile
PX_PER_M = 0.7  # UV units per metre (the wood tile is 0.75 wide: 1.07 m of grain, 0.167 m across)


def paint_base_tiles(me, wood_rgb, seed=7):
    base, mr = images(me)
    rng = np.random.default_rng(seed)
    for img, kind in ((base, "base"), (mr, "mr")):
        if img is None:
            continue
        px = read_px(img)
        h, w = px.shape[:2]
        for box, mat in ((WOOD_BOX, "wood"), (IRON_BOX, "iron")):
            x0, x1 = int(box[0] * w), int(box[2] * w)
            y0, y1 = int(box[1] * h), int(box[3] * h)
            H, Wd = y1 - y0, x1 - x0
            if kind == "mr":
                region = np.zeros((H, Wd, 4), np.float32)
                region[..., 0] = 1.0
                region[..., 3] = 1.0
                if mat == "wood":
                    region[..., 1] = 0.82 + 0.1 * value_noise((H, Wd), (4, 16), rng)
                    region[..., 2] = 0.0
                else:
                    rust = value_noise((H, Wd), (6, 10), rng)
                    region[..., 1] = 0.5 + 0.35 * rust
                    region[..., 2] = 0.75 - 0.55 * rust
            elif mat == "wood":
                # grain runs along u (the beam's length): stretched noise bands, darker seams, a few knots
                warp = value_noise((H, Wd), (6, 5), rng) * 9.0
                fine = value_noise((H, Wd), (60, 8), rng)
                rows = np.arange(H)[:, None] * 0.55
                grain = 0.5 + 0.5 * np.sin(rows + warp + fine * 2.5)
                blotch = value_noise((H, Wd), (5, 24), rng)
                tone = 0.72 + 0.22 * grain + 0.16 * (blotch - 0.5)
                seam = (np.abs(((np.arange(H) / H * 3.0) % 1.0) - 0.5) > 0.485)[:, None]
                tone = np.where(seam, tone * 0.55, tone)
                rgb = np.clip(np.asarray(wood_rgb)[None, None, :] * tone[..., None], 0, 1)
                region = np.concatenate([rgb, np.ones((H, Wd, 1))], -1).astype(np.float32)
            else:
                iron = np.array([0.15, 0.145, 0.14])
                rust_c = np.array([0.34, 0.17, 0.08])
                rust = np.clip((value_noise((H, Wd), (6, 10), rng) - 0.45) * 2.5, 0, 1)
                speck = value_noise((H, Wd), (40, 60), rng)
                rgb = iron[None, None] * (0.85 + 0.35 * speck[..., None])
                rgb = rgb * (1 - rust[..., None]) + rust_c[None, None] * rust[..., None] * (0.8 + 0.4 * speck[..., None])
                # rivets: a row of light dots along the middle
                yy, xx = np.mgrid[0:H, 0:Wd]
                for cx in np.linspace(Wd * 0.1, Wd * 0.9, 6):
                    for cy in (H * 0.3, H * 0.7):
                        d = np.hypot(xx - cx, yy - cy)
                        rgb = np.where((d < H * 0.05)[..., None], np.array([0.42, 0.40, 0.37]) * (1.2 - d[..., None] / (H * 0.05)), rgb)
                region = np.concatenate([np.clip(rgb, 0, 1), np.ones((H, Wd, 1))], -1).astype(np.float32)
            px[y0:y1, x0:x1] = region
        write_px(img, px)


def _box(bm, uvl, center, size, tile, rot=None, grain_axis=None):
    """A box of `size` at `center` (optionally rotated), UV-projected into `tile` by each face's normal."""
    m = Matrix.Translation(center) @ (rot or Matrix.Identity(4)) @ Matrix.Diagonal((*size, 1.0))
    geom = bmesh.ops.create_cube(bm, size=1.0, matrix=m)
    faces = {f for v in geom["verts"] for f in v.link_faces}
    u0, v0, u1, v1 = tile
    local_inv = ((rot or Matrix.Identity(4)).to_3x3()).inverted()
    for f in faces:
        n = local_inv @ f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        others = [i for i in range(3) if i != ax]
        # u runs along the longer of the face's two axes (the grain follows the beam)
        others.sort(key=lambda i: -size[i])
        for loop in f.loops:
            p = local_inv @ (loop.vert.co - Vector(center))
            a = (p[others[0]] + size[others[0]] / 2) * PX_PER_M
            b = (p[others[1]] + size[others[1]] / 2) * PX_PER_M
            loop[uvl].uv = (u0 + min(a, u1 - u0 - 1e-3), v0 + min(b, v1 - v0 - 1e-3))
        f.smooth = False
    return faces


def replace_base(me, J, depth_fn, report):
    """Cut the TRELLIS base, post and braces; build the approved cross-foot. Returns the new vertices' indices."""
    bm = bmesh.new()
    bm.from_mesh(me)
    uvl = bm.loops.layers.uv.active
    bt = J["base_top"]
    hx, hz = J["hip"]
    kx, kz = J["knee"]
    ax_, az = J["ankle"]

    def leg_axis(z, side):
        pts = [(hx, hz), (kx, kz), (ax_, az)]
        if z >= kz:
            (x0, z0), (x1, z1) = pts[0], pts[1]
        else:
            (x0, z0), (x1, z1) = pts[1], pts[2]
        t = min(1.0, max(0.0, (z - z0) / (z1 - z0)))
        x = x0 + (x1 - x0) * t
        return side * x

    leg_y = {s: depth_fn(s * ax_, (az + kz) / 2, 0.08) for s in (-1, 1)}
    py = (leg_y[-1] + leg_y[1]) / 2  # the post and both beams cross under the feet
    old_post_y = depth_fn(0.0, 0.6, 0.1)
    base_img, _ = images(me)
    bpx = read_px(base_img)
    H, Wd = bpx.shape[:2]
    wood_samples = []
    for f in bm.faces:  # the old base's top: its wood colour
        c = f.calc_center_median()
        if c.z < bt and f.normal.z > 0.7 and abs(c.x) > 0.4:
            u = f.loops[0][uvl].uv
            wood_samples.append(bpx[min(H - 1, int(u.y * H)), min(Wd - 1, int(u.x * Wd)), :3])
    # everything under the new beams' top goes, cut clean along the plane (the feet's soles end flat on the beam)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-5, plane_co=(0, 0, bt),
                           plane_no=(0, 0, 1), clear_inner=True)
    cut = []
    for f in bm.faces:
        c = f.calc_center_median()
        if c.z > 0.9:
            continue
        side = 1 if c.x >= 0 else -1
        near_leg = abs(c.x - leg_axis(c.z, side)) < 0.15 and abs(c.y - leg_y[side]) < 0.17 and c.z > az + 0.04
        foot = c.z < az + 0.1 and leg_y[side] - 0.32 < c.y < leg_y[side] + 0.14 \
            and ax_ - 0.1 < side * c.x < ax_ + 0.14  # the old braces met the feet on their inner side: that side goes
        post = abs(c.x) < J["post_r"] + 0.02 and abs(c.y - old_post_y) < J["post_r"] + 0.03
        if (not near_leg and not foot) and (c.z < 0.62 or post):
            cut.append(f)
    bmesh.ops.delete(bm, geom=cut, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    # crumbs the cut left behind
    bm.faces.ensure_lookup_table()
    seen, small = set(), []
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
        if len(comp) < 200 and max(v.co.z for g in comp for v in g.verts) < 0.9:
            small += comp
    bmesh.ops.delete(bm, geom=small, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    # close the soles (flat, on the cut plane) and the small holes the old braces leave in the feet; each cap takes
    # one texel of the surface next to it, so it reads as a plain sole instead of smeared texture
    before = set(bm.faces)
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary and max(v.co.z for v in e.verts) < 1.0],
                         sides=200)
    capped = [f for f in bm.faces if f not in before]
    for f in capped:
        one = None
        for v in f.verts:
            for other in v.link_loops:
                if other.face not in capped and other.face.is_valid:
                    one = other[uvl].uv.copy()
                    break
            if one is not None:
                break
        for loop in f.loops:
            if one is not None:
                loop[uvl].uv = one
    bmesh.ops.triangulate(bm, faces=[f for f in capped if len(f.verts) > 3])
    report["base_cut_capped"] = len(capped)
    report["base_faces_cut"] = len(cut)
    report["base_crumbs_cut"] = len(small)

    wood = np.median(np.array(wood_samples), 0) if wood_samples else np.array([0.42, 0.27, 0.15])
    wood = np.clip(wood * 0.78, 0.05, 0.9)  # the approved bases are darker, oiled wood
    report["base_wood_rgb"] = [round(float(c), 3) for c in wood]

    n_before = len(bm.verts)
    fy = py
    L = 1.08       # the side beam (x)
    F = 0.92       # the front-back beam (y)
    bw, bh = 0.17, bt
    cap = 0.075
    new = set()
    new |= _box(bm, uvl, (0, fy, bh / 2), (L - 2 * cap, bw, bh), WOOD_BOX)
    new |= _box(bm, uvl, (0, py, bh / 2 - 0.004), (bw * 0.9, F - 2 * cap, bh - 0.008), WOOD_BOX)
    for s in (-1, 1):  # iron end caps, a little proud of the wood
        new |= _box(bm, uvl, (s * (L / 2 - cap / 2), fy, (bh + 0.014) / 2), (cap, bw + 0.02, bh + 0.014), IRON_BOX)
        new |= _box(bm, uvl, (0, py + s * (F / 2 - cap / 2), (bh + 0.01) / 2), (bw * 0.9 + 0.02, cap, bh + 0.01), IRON_BOX)
    # the square post, up into the body (the skirt hides its top)
    post_w = 0.085
    top = J["pelvis"] + 0.05
    new |= _box(bm, uvl, (0, py, bh + (top - bh) / 2), (post_w, post_w, top - bh), WOOD_BOX)
    new |= _box(bm, uvl, (0, py, bh + 0.03), (post_w + 0.03, post_w + 0.03, 0.06), IRON_BOX)  # the collar at its foot
    # four braces from the beams up to the post
    # the old braces landed under the feet' inner edges (the wood figure's fit: from x = 0.25 at the beam to the post at
    # 0.37 m): the new ones follow the same line, so the stubs the feet kept end up inside them
    reach, rise = 0.27, 0.30
    run = reach - post_w / 2
    blen = math.hypot(run, rise) + 0.03
    ang = math.atan2(rise, run)
    for s in (-1, 1):
        mid = post_w / 2 + run / 2
        new |= _box(bm, uvl, (s * mid, py, bh + rise / 2), (blen, 0.07, 0.07), WOOD_BOX,
                    Matrix.Rotation(s * ang, 4, "Y"))
        new |= _box(bm, uvl, (0, py + s * mid, bh + rise / 2), (blen, 0.07, 0.07), WOOD_BOX,
                    Matrix.Rotation(math.pi / 2, 4, "Z") @ Matrix.Rotation(s * ang, 4, "Y"))
    bmesh.ops.triangulate(bm, faces=list(new))
    bm.verts.ensure_lookup_table()
    n_after = len(bm.verts)
    bm.to_mesh(me)
    bm.free()
    me.update()
    paint_base_tiles(me, wood)
    report["base_new_faces"] = len(new)
    return set(range(n_before, n_after))


# ---------------------------------------------------------------------------------------------- geometry smoothing
def smooth_regions(me, spheres, repeat=6, factor=0.6):
    """Laplacian-smooth the vertices inside any (centre, radius) sphere: pulls the remesh's loose flakes in."""
    bm = bmesh.new()
    bm.from_mesh(me)
    sel = [v for v in bm.verts if any((v.co - Vector(c)).length < r for c, r in spheres)]
    for _ in range(repeat):
        bmesh.ops.smooth_vert(bm, verts=sel, factor=factor, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(me)
    bm.free()
    me.update()
    return len(sel)


def flatten_face(me, cz, radius, front_y):
    """The face under the painted target: a quadratic fitted to the surface round it replaces its dents."""
    V = np.array([v.co[:] for v in me.vertices])
    r = np.hypot(V[:, 0], V[:, 2] - cz) / radius
    front = V[:, 1] < front_y
    ring = front & (r > 1.1) & (r < 1.7)
    inner = front & (r < 1.15)
    if ring.sum() < 12 or inner.sum() == 0:
        return 0
    x, z = V[ring, 0], V[ring, 2] - cz
    A = np.stack([np.ones_like(x), x, z, x * x, z * z, x * z], 1)
    coef, *_ = np.linalg.lstsq(A, V[ring, 1], rcond=None)
    xi, zi = V[inner, 0], V[inner, 2] - cz
    fit = np.stack([np.ones_like(xi), xi, zi, xi * xi, zi * zi, xi * zi], 1) @ coef
    w = np.clip((1.15 - r[inner]) / 0.2, 0, 1)
    V[inner, 1] = V[inner, 1] * (1 - w) + fit * w
    me.vertices.foreach_set("co", V.ravel())
    me.update()
    return int(inner.sum())


# ---------------------------------------------------------------------------------------------- steel weathering
def rasterize(me, fn, box=None):
    """For every triangle: fn(sl, inside, l0, l1, l2, poly) over its texels (barycentrics in texture space)."""
    base, _ = images(me)
    W_, H_ = base.size
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        if len(poly.vertices) != 3:
            continue
        T2 = [uv[li].uv for li in poly.loop_indices]
        xs = [t.x * W_ for t in T2]
        ys = [t.y * H_ for t in T2]
        x0, x1 = max(0, int(min(xs)) - 2), min(W_ - 1, int(max(xs)) + 2)
        y0, y1 = max(0, int(min(ys)) - 2), min(H_ - 1, int(max(ys)) + 2)
        if x1 < x0 or y1 < y0:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        (ax, ay), (bx, by), (qx, qy) = zip(xs, ys)
        den = (by - qy) * (ax - qx) + (qx - bx) * (ay - qy)
        if abs(den) < 1e-9:
            continue
        l0 = ((by - qy) * (gx - qx) + (qx - bx) * (gy - qy)) / den
        l1 = ((qy - ay) * (gx - qx) + (ax - qx) * (gy - qy)) / den
        l2 = 1 - l0 - l1
        inside = (l0 > -0.1) & (l1 > -0.1) & (l2 > -0.1)
        if inside.any():
            fn((slice(y0, y1 + 1), slice(x0, x1 + 1)), inside, l0, l1, l2, poly)


def weather_steel(me, report, darken=0.6):
    """Metal texels (the material map's blue > 0.35) darken to iron, gather grime, and rust in patches (3D noise)."""
    base, mr = images(me)
    bpx, mpx = read_px(base), read_px(mr)
    V = np.array([v.co[:] for v in me.vertices])
    grime_v = noise3(V, 4.0, 11)
    rust_v = noise3(V, 11.0, 23)
    done = np.zeros(bpx.shape[:2], bool)
    rust_c = np.array([0.24, 0.14, 0.08])  # a brown, dry rust, not orange
    count = [0]

    def fn(sl, inside, l0, l1, l2, poly):
        i0, i1, i2 = poly.vertices
        region_b, region_m = bpx[sl], mpx[sl]
        metal = (region_m[..., 2] > 0.35) & inside & ~done[sl]
        if not metal.any():
            return
        g = l0 * grime_v[i0] + l1 * grime_v[i1] + l2 * grime_v[i2]
        r = l0 * rust_v[i0] + l1 * rust_v[i1] + l2 * rust_v[i2]
        rust = np.clip((r - 0.7) / 0.14, 0, 1) * 0.55
        rgb = region_b[..., :3] * darken * (0.8 + 0.3 * g)[..., None]
        lum = region_b[..., :3].mean(-1, keepdims=True)
        rgb = rgb * (1 - rust[..., None]) + rust_c * (0.7 + 0.8 * lum) * rust[..., None]
        m = metal[..., None]
        bpx[sl][..., :3] = np.where(m, rgb, region_b[..., :3])
        mpx[sl][..., 1] = np.where(metal, np.clip(region_m[..., 1] + 0.12 + 0.35 * rust, 0, 1), region_m[..., 1])
        mpx[sl][..., 2] = np.where(metal, region_m[..., 2] * (1 - 0.7 * rust), region_m[..., 2])
        done[sl] |= metal
        count[0] += 1

    rasterize(me, fn)
    write_px(base, bpx)
    write_px(mr, mpx)
    report["steel_weathered_faces"] = count[0]


def despeckle(me, spheres, report):
    """Inside each (centre, radius) sphere, texels far off the sphere's own colour (the bake's blue-grey gaps and
    black specks on the straw neck and fists, E289) take that colour back, keeping their light / dark grain."""
    base, _ = images(me)
    px = read_px(base)
    V = np.array([v.co[:] for v in me.vertices])
    fixed = [0]
    for centre, radius in spheres:
        c = np.asarray(centre)
        polys = [p for p in me.polygons if np.linalg.norm(V[list(p.vertices)].mean(0) - c) < radius]
        if not polys:
            continue
        samples = []

        def collect(sl, inside, l0, l1, l2, poly):
            samples.append(px[sl][..., :3][inside])

        _raster_polys(me, polys, collect)
        allpx = np.concatenate(samples)
        lum = allpx.mean(1)
        good = allpx[(allpx[:, 0] > allpx[:, 2] + 0.05) & (lum > np.percentile(lum, 25))]
        if len(good) < 10:
            continue
        med = np.median(good, 0)
        mlum = float(med.mean())

        def fix(sl, inside, l0, l1, l2, poly):
            reg = px[sl][..., :3]
            lum_ = reg.mean(-1)
            bad = inside & ((reg[..., 2] > reg[..., 0] - 0.02) | (lum_ < 0.55 * mlum))
            if bad.any():
                grain = np.clip(lum_ / max(mlum, 1e-3), 0.8, 1.1)[..., None]
                px[sl][..., :3] = np.where(bad[..., None], med * grain, reg)
                fixed[0] += int(bad.sum())

        _raster_polys(me, polys, fix)
    write_px(base, px)
    report["despeckled_texels"] = fixed[0]


def _raster_polys(me, polys, fn):
    base, _ = images(me)
    W_, H_ = base.size
    uv = me.uv_layers.active.data
    for poly in polys:
        if len(poly.vertices) != 3:
            continue
        T2 = [uv[li].uv for li in poly.loop_indices]
        xs = [t.x * W_ for t in T2]
        ys = [t.y * H_ for t in T2]
        x0, x1 = max(0, int(min(xs)) - 1), min(W_ - 1, int(max(xs)) + 1)
        y0, y1 = max(0, int(min(ys)) - 1), min(H_ - 1, int(max(ys)) + 1)
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        (ax, ay), (bx, by), (qx, qy) = zip(xs, ys)
        den = (by - qy) * (ax - qx) + (qx - bx) * (ay - qy)
        if abs(den) < 1e-9:
            continue
        l0 = ((by - qy) * (gx - qx) + (qx - bx) * (gy - qy)) / den
        l1 = ((qy - ay) * (gx - qx) + (ax - qx) * (gy - qy)) / den
        l2 = 1 - l0 - l1
        inside = (l0 > -0.05) & (l1 > -0.05) & (l2 > -0.05)
        if inside.any():
            fn((slice(y0, y1 + 1), slice(x0, x1 + 1)), inside, l0, l1, l2, poly)


def neck_plug(me, z0, z1, report, fists=()):
    """The straw collar's gaps (open straight through the body, E289): a straw-coloured tube just inside the neck's
    wall, so a gap shows straw instead of the room."""
    from mathutils.bvhtree import BVHTree
    base, mr = images(me)
    V = np.array([v.co[:] for v in me.vertices])
    band = V[(V[:, 2] > z0 + 0.05) & (V[:, 2] < z1 - 0.03) & (np.abs(V[:, 0]) < 0.2)]
    cx, cy = float(np.median(band[:, 0])), float(np.median(band[:, 1]))
    # its colour: the median straw texel of the neck, painted into a cell of the free strip
    px = read_px(base)
    H, W = px.shape[:2]
    uv = me.uv_layers.active.data
    cols = []
    for p in me.polygons:
        c = p.center
        if z0 + 0.05 < c.z < z1 - 0.03 and math.hypot(c.x - cx, c.y - cy) < 0.2:
            u = uv[p.loop_indices[0]].uv
            t = px[min(H - 1, int(u.y * H)), min(W - 1, int(u.x * W)), :3]
            if t[0] > t[2] + 0.1:
                cols.append(t)
    straw = np.median(np.array(cols), 0) if cols else np.array([0.62, 0.48, 0.26])
    x0, x1 = int(0.752 * W), int(0.768 * W)
    y0, y1 = int(0.02 * H), int(0.05 * H)
    px[y0:y1, x0:x1, :3] = straw
    write_px(base, px)
    if mr is not None:
        mpx = read_px(mr)
        mpx[y0:y1, x0:x1, 1] = 0.9
        mpx[y0:y1, x0:x1, 2] = 0.0
        write_px(mr, mpx)
    cell = Vector(((x0 + x1) / 2 / W, (y0 + y1) / 2 / H))

    # a tube that follows the neck's own wall 8 mm inside it: each vertex sits on its own ray from the neck's axis
    # (hits closer than 4 cm are loose flakes inside and are skipped); where a ray leaves through a gap it takes its
    # neighbours' distance, so the gap shows the tube
    tree = BVHTree.FromPolygons([v.co for v in me.vertices], [p.vertices for p in me.polygons])
    N, R = 48, 13
    grid = []
    for r in range(R):
        z = z0 + (z1 - z0) * r / (R - 1)
        row = []
        for k in range(N):
            a_ = 2 * math.pi * k / N
            d = Vector((math.cos(a_), math.sin(a_), 0.0))
            hit = tree.ray_cast(Vector((cx, cy, z)) + d * 0.04, d, 0.25)
            row.append(hit[3] + 0.04 if hit[0] is not None else None)
        for _ in range(N):
            for k in range(N):
                if row[k] is None:
                    nb = [t for t in (row[k - 1], row[(k + 1) % N]) if t is not None]
                    if nb:
                        row[k] = min(nb)
        grid.append([min(0.15, t) if t is not None else 0.06 for t in row])  # never wider than the neck
    bm = bmesh.new()
    bm.from_mesh(me)
    uvl = bm.loops.layers.uv.active
    vr = []
    for r in range(R):
        z = z0 + (z1 - z0) * r / (R - 1)
        vr.append([bm.verts.new((cx + math.cos(2 * math.pi * k / N) * max(0.03, grid[r][k] - 0.008),
                                 cy + math.sin(2 * math.pi * k / N) * max(0.03, grid[r][k] - 0.008), z)) for k in range(N)])
    faces = []
    for r0, r1 in zip(vr, vr[1:]):
        for k in range(N):
            faces.append(bm.faces.new((r0[k], r0[(k + 1) % N], r1[(k + 1) % N], r1[k])))
    for f in faces:
        f.smooth = True
        for loop in f.loops:
            loop[uvl].uv = cell
    bmesh.ops.triangulate(bm, faces=faces)
    # the fists: a straw blob inside each, pushed out to 6 mm under its wall, so their gaps show straw too
    Vn = np.array([v.co[:] for v in me.vertices])
    for fc, fr in fists:
        fc = np.asarray(fc)
        near = Vn[np.linalg.norm(Vn - fc, axis=1) < fr]
        if len(near) < 20:
            continue
        o = Vector(near.mean(0))
        blob = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0, matrix=Matrix.Translation(o))
        for v in blob["verts"]:
            d = (v.co - o).normalized()
            hit = tree.ray_cast(o, d, fr)
            t = hit[3] if hit[0] is not None else fr * 0.5
            v.co = o + d * max(0.015, t - 0.006)
        for f in {f for v in blob["verts"] for f in v.link_faces}:
            f.smooth = True
            for loop in f.loops:
                loop[uvl].uv = cell
    bm.to_mesh(me)
    bm.free()
    me.update()
    report["neck_tube_faces"] = len(faces) * 2
