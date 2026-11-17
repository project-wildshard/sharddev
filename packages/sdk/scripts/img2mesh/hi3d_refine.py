"""hi3d_refine.py — Hi3D v1.0 refinement of TRELLIS.2 / Hunyuan3D generations (HI3D-REFINE, E494).

  ~/projects/localai/bin/img2mesh/run-locked.sh <log> ~/ml/img2mesh/hi3d-mlx/.venv/bin/python -I \
    scripts/img2mesh/hi3d_refine.py [--res 1024] [--seed 0] <out dir> <gen.glb> <ref image> [<gen.glb> <ref image> …]

Runs in the MLX port's venv (cguldogan/mlx-vlm@hi3d, ~/ml/img2mesh/hi3d-mlx). The model loads once per batch. For each
pair it writes <out>/<stem>.hi3d<res>.obj and <stem>.hi3d<res>.json:
 1. the coarse mesh is the generation's textured GLB itself (Hi3D re-voxelizes at 64³ on its first pass, so the raw
    decoder mesh adds nothing), in the glTF frame (Y-up). The port conditions as if the reference were shot from +Z, but
    each reference has its own camera (stone-a's glyph side is −Z, the bear and the ranger are 3/4 views), so the coarse
    mesh is turned about Y going in and back coming out. --turn auto (the default) picks the turn whose coloured,
    orthographic render best matches the reference (every 15°); a number forces it. A wrong turn carves the
    reference's detail into the wrong side (stone-a, 2026-10-24);
 2. the reference is cut out on its white background (the refs are one object on white) unless it carries alpha;
 3. Hi3D's output (centred, unit radius) is moved back onto the GLB: bounding-box centre and the mean extent ratio, then
    ICP with scale onto the GLB's surface, so driftwood_post.py --geo can bake the generated texture onto it (a loose
    fit smears that texture: stone-a's painted glyphs, 2026-10-24). --reuse re-fits an existing output without Hi3D;
 4. the JSON records the timings, the peak MLX memory and both meshes' health (loose parts, hole edges, non-manifold
    edges) plus how far the refined surface strays from the coarse one (the mean nearest distance / the bbox diagonal).
"""
import argparse
import json
import os
import time

import mlx.core as mx
import numpy as np
import trimesh
from PIL import Image, ImageDraw

from mlx_vlm.models.hi3d import Model

MODEL = os.path.expanduser("~/projects/weights/manual/mlx-community/Hi3Dv1.0-mlx")

ap = argparse.ArgumentParser()
ap.add_argument("--res", type=int, default=1024, choices=(512, 1024, 1536))
ap.add_argument("--seed", type=int, default=0)
ap.add_argument("--turn", default="auto", help="degrees about Y that bring the reference's view to +Z, or auto")
ap.add_argument("--model", default=MODEL)
ap.add_argument("--reuse", action="store_true", help="re-fit <out>/<stem>.hi3d<res>.obj when it exists; no Hi3D run")
ap.add_argument("--dry", action="store_true", help="print each pair's turn and stop (no Hi3D)")
ap.add_argument("out")
ap.add_argument("pairs", nargs="+", help="<gen.glb> <ref image> …")
a = ap.parse_args()
if len(a.pairs) % 2:
    ap.error("pairs come as <gen.glb> <ref image>")
os.makedirs(a.out, exist_ok=True)


def cutout(path):
    """The reference with alpha: its own, else everything that is not near-white."""
    im = Image.open(path)
    if im.mode == "RGBA" and np.asarray(im)[..., 3].min() < 255:
        return im
    rgb = np.asarray(im.convert("RGB"))
    alpha = ((255 - rgb.astype(np.int16)).max(axis=2) > 18).astype(np.uint8) * 255
    return Image.fromarray(np.dstack([rgb, alpha]))


SIDE = 96


def crop_square(rgb, mask):
    """The masked subject on white, cropped to its bbox, padded square and resized to SIDE² (float RGB)."""
    ys, xs = np.nonzero(mask)
    rgb = np.where(mask[..., None], rgb, 255)[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = rgb.shape[:2]
    s = max(h, w)
    sq = np.full((s, s, 3), 255, np.uint8)
    sq[(s - h) // 2:(s - h) // 2 + h, (s - w) // 2:(s - w) // 2 + w] = rgb
    return np.asarray(Image.fromarray(sq).resize((SIDE, SIDE), Image.BILINEAR), np.float32)


def view(mesh, colours, yaw):
    """Orthographic render from +Z of the mesh turned by yaw about Y: flat face colours, far faces first."""
    v = mesh.vertices @ trimesh.transformations.rotation_matrix(np.radians(yaw), [0, 1, 0])[:3, :3].T
    lo, span = v[:, :2].min(0), (v[:, :2].max(0) - v[:, :2].min(0)).max()
    px = (v[:, :2] - lo) / span * (4 * SIDE - 1)
    px[:, 1] = 4 * SIDE - 1 - px[:, 1]
    tris = mesh.faces[np.argsort(v[mesh.faces, 2].mean(1))]
    img = Image.new("RGB", (4 * SIDE, 4 * SIDE), (255, 255, 255))
    mask = Image.new("L", img.size, 0)
    draw, dm = ImageDraw.Draw(img), ImageDraw.Draw(mask)
    for f in tris:
        pts = [tuple(p) for p in px[f]]
        draw.polygon(pts, fill=tuple(int(c) for c in colours[f].mean(0)[:3]))
        dm.polygon(pts, fill=255)
    return crop_square(np.asarray(img), np.asarray(mask) > 0)


def auto_turn(mesh, ref_rgba):
    """The yaw (every 15°) whose render is closest to the reference, with every yaw's score."""
    ref = np.asarray(ref_rgba)
    target = crop_square(ref[..., :3], ref[..., 3] > 127)
    colours = mesh.visual.to_color().vertex_colors
    scores = {yaw: float(np.abs(view(mesh, colours, yaw) - target).mean()) for yaw in range(0, 360, 15)}
    return min(scores, key=scores.get), scores


def health(m):
    edges = np.sort(m.edges, axis=1)
    _, counts = np.unique(edges, axis=0, return_counts=True)
    return {"faces": int(len(m.faces)), "loose_parts": len(m.split(only_watertight=False)),
            "hole_edges": int((counts == 1).sum()), "nonmanifold_edges": int((counts > 2).sum())}


def drift(fine, coarse, seed):
    """Mean distance from the coarse surface to the refined one, over the coarse bbox diagonal."""
    _, dist, _ = trimesh.proximity.closest_point(fine, coarse.sample(20000, seed=seed))
    return round(float(dist.mean()) / float(np.linalg.norm(coarse.extents)), 5)


model, load_s = None, 0.0
for glb, ref in zip(a.pairs[::2], a.pairs[1::2]):
    stem = os.path.basename(glb).removesuffix(".glb")
    path = os.path.join(a.out, f"{stem}.hi3d{a.res}.obj")
    coarse = trimesh.load(os.path.expanduser(glb), force="mesh")
    coarse.merge_vertices()
    rec = {"source": glb, "ref": ref, "res": a.res, "seed": a.seed, "turn": a.turn}
    if a.reuse and os.path.exists(path):
        fine = trimesh.load(path, force="mesh", process=False)
        rec.update(json.load(open(path.removesuffix(".obj") + ".json")))
    else:
        if model is None:
            t0 = time.perf_counter()
            model = Model.from_pretrained(a.model)
            load_s = time.perf_counter() - t0
        image = cutout(os.path.expanduser(ref))
        if a.turn == "auto":
            yaw, scores = auto_turn(coarse, image.convert("RGBA"))
            rec["turn_scores"] = {k: round(s, 2) for k, s in scores.items()}
        else:
            yaw = float(a.turn)
        rec["turn"] = yaw
        if a.dry:
            print(stem, "turn", yaw, json.dumps(rec.get("turn_scores", {})), flush=True)
            continue
        turn = trimesh.transformations.rotation_matrix(np.radians(yaw), [0, 1, 0])
        facing = coarse.copy()
        facing.apply_transform(turn)
        mx.reset_peak_memory()
        t1 = time.perf_counter()
        res = model(image, np.asarray(facing.vertices, np.float32),
                    np.asarray(facing.faces, np.int32), resolution=a.res, seed=a.seed)
        fine = trimesh.Trimesh(np.asarray(res.vertices), np.asarray(res.faces), process=False)
        fine.apply_transform(np.linalg.inv(turn))
        scale = float(np.mean(coarse.extents / fine.extents))
        fine.apply_scale(scale)
        fine.apply_translation(coarse.bounds.mean(0) - fine.bounds.mean(0))
        rec.update({"seconds": round(time.perf_counter() - t1, 1), "load_seconds": round(load_s, 1),
                    "timings": {k: round(v, 2) for k, v in res.timings.items()},
                    "peak_memory_gb": round(mx.get_peak_memory() / 1e9, 2), "scale_back": round(scale, 5)})
    rec["drift_bbox"] = drift(fine, coarse, a.seed)
    fit, _, _ = trimesh.registration.icp(fine.sample(8000, seed=a.seed), coarse, scale=True, max_iterations=40)
    fine.apply_transform(fit)
    rec["drift"] = drift(fine, coarse, a.seed)
    rec.update({"coarse": health(coarse), "refined": health(fine)})
    fine.export(path)
    with open(path.removesuffix(".obj") + ".json", "w") as fh:
        json.dump(rec, fh, indent=1)
    print(json.dumps(rec), flush=True)
