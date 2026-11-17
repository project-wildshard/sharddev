"""TRELLIS.2 (microsoft/TRELLIS.2-4B, MIT) image -> textured GLB on Apple Silicon (MPS), many images per process.

Runs in the trellis-mac venv (shivampkumar/trellis-mac + Pedro Naugusto's Metal backends; install recipe in
scripts/img2mesh/README.md). Loads the pipeline ONCE (~80 s), then per image writes into --out:
  <stem>.glb      decoder mesh decimated to --faces with a baked --tex PBR texture (base colour + MR)
  <stem>.hi.obj   the raw decoder mesh (0.3-3 M faces) for re-baking at a different budget
  <stem>.json     timings, counts, peak memory
Modelled on ~/projects/localai/bin/img2mesh/trellis_batch.py (the machine's shared runner).

Weights: --weights is a directory holding pipeline.json (default ~/ml/img2mesh/trellis-view, whose pipeline.json
points every model at ~/projects/weights/manual), or the hub id microsoft/TRELLIS.2-4B. Background removal is
ZhengPeng7/BiRefNet (MIT) instead of the gated, CC BY-NC briaai/RMBG-2.0; an RGBA input skips it.

The box is shared: launch through the machine-wide model lock, e.g.
  ~/projects/localai/bin/img2mesh/run-locked.sh ~/ml/img2mesh/logs/driftwood.log \
    ~/ml/img2mesh/trellis-mac/.venv/bin/python scripts/img2mesh/trellis_batch.py \
    --out ~/ml/img2mesh/out/driftwood art/driftwood-isle/round-8-assets/ref-palm-a.jpg ...
"""
import os
import sys

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
os.environ.setdefault("ATTN_BACKEND", "sdpa")
os.environ.setdefault("SPARSE_ATTN_BACKEND", "sdpa")
try:
    import flex_gemm  # noqa: F401  (mtlgemm: Metal sparse conv)
    os.environ.setdefault("SPARSE_CONV_BACKEND", "flex_gemm")
except (ImportError, RuntimeError):
    os.environ.setdefault("SPARSE_CONV_BACKEND", "none")

TM = os.path.expanduser(os.environ.get("TRELLIS_MAC", "~/ml/img2mesh/trellis-mac"))
sys.path.insert(0, os.path.join(TM, "TRELLIS.2"))
sys.path.insert(0, TM)
sys.path.append(os.path.join(TM, "stubs"))

import argparse  # noqa: E402
import json  # noqa: E402
import resource  # noqa: E402
import time  # noqa: E402

import numpy as np  # noqa: E402
import torch  # noqa: E402
from PIL import Image  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("images", nargs="+")
    ap.add_argument("--out", required=True)
    ap.add_argument("--weights", default=os.path.expanduser("~/ml/img2mesh/trellis-view"))
    ap.add_argument("--pipeline", default="1024_cascade", help="512 | 1024 | 1024_cascade")
    ap.add_argument("--faces", type=int, default=40000, help="face budget of the baked glb")
    ap.add_argument("--tex", type=int, default=1024)
    ap.add_argument("--seed", type=int, default=42)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    weights = a.weights if os.path.isdir(a.weights) else "microsoft/TRELLIS.2-4B"

    t0 = time.time()
    from trellis2.pipelines import rembg
    from trellis2.pipelines.trellis2_image_to_3d import Trellis2ImageTo3DPipeline

    if weights == "microsoft/TRELLIS.2-4B":  # hub config names the gated RMBG-2.0: swap in MIT BiRefNet
        init = rembg.BiRefNet.__init__
        rembg.BiRefNet.__init__ = lambda self, model_name=None, **_: init(self, "ZhengPeng7/BiRefNet")
    pipe = Trellis2ImageTo3DPipeline.from_pretrained(weights)
    pipe.rembg_model.model.float()  # BiRefNet's hub weights load as fp16; the pipeline feeds fp32
    pipe.to(torch.device("mps"))
    t_load = time.time() - t0
    print(f"[trellis] pipeline loaded in {t_load:.0f}s", flush=True)

    import fast_simplification
    import o_voxel.postprocess as pp

    for img_path in a.images:
        stem = os.path.splitext(os.path.basename(img_path))[0].removeprefix("ref-")
        rec = {"image": img_path, "pipeline": a.pipeline, "seed": a.seed, "load_s": round(t_load, 1)}
        t1 = time.time()
        out = pipe.run(Image.open(img_path), seed=a.seed, pipeline_type=a.pipeline)
        m = out[0] if isinstance(out, list) else out
        rec["gen_s"] = round(time.time() - t1, 1)
        v = m.vertices.cpu().numpy()
        f = m.faces.cpu().numpy()
        rec["raw_verts"], rec["raw_faces"] = int(len(v)), int(len(f))
        if len(f) == 0:  # the macOS GPU watchdog killed a decoder kernel
            rec["error"] = "empty mesh"
            json.dump(rec, open(os.path.join(a.out, stem + ".json"), "w"), indent=1)
            continue
        with open(os.path.join(a.out, stem + ".hi.obj"), "w") as fh:
            np.savetxt(fh, v, fmt="v %.5f %.5f %.5f")
            np.savetxt(fh, f + 1, fmt="f %d %d %d")
        t2 = time.time()
        tgt = min(200000, len(f))  # the Metal BVH is unstable above ~800 k faces
        sv, sf = fast_simplification.simplify(v, f, 1.0 - tgt / len(f)) if len(f) > tgt else (v, f)
        glb = pp.to_glb(
            vertices=torch.from_numpy(sv).float(), faces=torch.from_numpy(sf.astype("int32")),
            attr_volume=m.attrs.cpu(), coords=m.coords.cpu(), attr_layout=m.layout,
            voxel_size=m.voxel_size, aabb=[[-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]],
            decimation_target=a.faces, texture_size=a.tex, verbose=False)
        glb.export(os.path.join(a.out, stem + ".glb"))
        rec["bake_s"] = round(time.time() - t2, 1)
        rec["peak_rss_gb"] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1e9, 2)
        rec["mps_driver_gb"] = round(torch.mps.driver_allocated_memory() / 1e9, 2)
        json.dump(rec, open(os.path.join(a.out, stem + ".json"), "w"), indent=1)
        print(f"[trellis] {stem}: {json.dumps(rec)}", flush=True)
        torch.mps.empty_cache()


if __name__ == "__main__":
    main()
