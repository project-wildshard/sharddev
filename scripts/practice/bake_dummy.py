"""Close and texture one TRELLIS.2 training-dummy decode (E285): npz -> watertight textured GLB.

Runs in the trellis-mac venv, no model load (GPU BVH / rasteriser only, a few seconds):

  ~/ml/img2mesh/trellis-mac/.venv/bin/python scripts/practice/bake_dummy.py <stem>.npz <out.glb> \
      [--faces 60000] [--tex 2048] [--band 2.0]

The <stem>.npz is the raw decode that ~/projects/localai/bin/img2mesh/trellis_batch.py saves beside each GLB
(mesh + the sparse voxel attribute volume). TRELLIS's raw surface is an open crust: thin straw and wraps come
back as see-through flakes (the E215 dummies' wire-claw hands and hollow shins). o_voxel's narrow-band dual
contouring remesh (`remesh=True`) rebuilds one closed surface `--band` voxels around that crust, and the base
colour / metal / roughness are then sampled straight from the voxel volume onto the new surface (no hi->low cage
bake, so nothing washes out). The result is still a TRELLIS-frame model: one metre tall, Z-up, front +X, which
scripts/practice/rig_dummy.py orients, cleans and rigs.
"""
import argparse
import json
import os
import time

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
import numpy as np  # noqa: E402
import torch  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("npz")
ap.add_argument("out")
ap.add_argument("--faces", type=int, default=60000)
ap.add_argument("--tex", type=int, default=2048)
ap.add_argument("--band", type=float, default=2.0, help="remesh shell thickness in voxels; wider closes wider gaps")
ap.add_argument("--no-remesh", action="store_true")
ap.add_argument("--presimplify", type=int, default=600000)
a = ap.parse_args()

import fast_simplification  # noqa: E402
import o_voxel.postprocess as pp  # noqa: E402

d = np.load(a.npz)
v, f = d["vertices"], d["faces"]
layout = {k: slice(*s) for k, s in json.loads(str(d["layout"])).items()}
t0 = time.time()
if len(f) > a.presimplify:
    v, f = fast_simplification.simplify(v, f, 1.0 - a.presimplify / len(f))
glb = pp.to_glb(
    vertices=torch.from_numpy(np.ascontiguousarray(v)).float(),
    faces=torch.from_numpy(np.ascontiguousarray(f).astype(np.int32)),
    attr_volume=torch.from_numpy(d["attrs"].astype(np.float32)),
    coords=torch.from_numpy(d["coords"]), attr_layout=layout,
    voxel_size=float(d["voxel_size"]), aabb=[[-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]],
    decimation_target=a.faces, texture_size=a.tex, remesh=not a.no_remesh, remesh_band=a.band,
    verbose=False)
glb.export(a.out)
print(f"[bake_dummy] {a.out}: {len(glb.faces)} faces, tex {a.tex}, band {a.band}, {time.time() - t0:.1f}s")
