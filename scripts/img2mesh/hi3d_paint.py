"""hi3d_paint.py — Hunyuan3D-2 paint on Hi3D-refined meshes: a texture made for the new shape (HI3D-REFINE arm C, E494).

  ~/projects/localai/bin/img2mesh/run-locked.sh <log> ~/ml/img2mesh/Hunyuan3D-2/.venv/bin/python -I \
    scripts/img2mesh/hi3d_paint.py [--faces 40000] [--tex 1024] <out dir> <refined.obj> <ref image> […]

Why: the refined geometry carves the reference's detail, which never lines up with the generator's own painted
texture (stone-a: Hi3D carved the reference's branches under TRELLIS's painted circles). Here each refined mesh
(hi3d_refine.py, in its generation's GLB frame, facing +Z like Hunyuan's own output) is reduced to --faces with
Hunyuan's FaceReducer, painted by hunyuan3d-paint-v2-0-turbo from the reference (cut out on white), and written as
<out>/<stem>.glb with <stem>.json. <stem> drops the .hi3d<res> suffix, so build_props.py can take <out> as GEN and the
refined dir as REFINE: colour from this paint, geometry and normal map from the 1 M-face mesh.
Uses localai's Hunyuan3D-2 install (hy3d-mac-setup.sh) and the same MPS float64 guard as its hy3d_batch.py.
"""
import argparse
import json
import os
import sys
import time

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
os.environ.setdefault("HY3DGEN_MODELS", os.path.expanduser("~/projects/weights/manual"))
sys.path.insert(0, os.path.expanduser(os.environ.get("HY3D_REPO", "~/ml/img2mesh/Hunyuan3D-2")))

import numpy as np  # noqa: E402
import torch  # noqa: E402
import trimesh  # noqa: E402
from PIL import Image  # noqa: E402

_orig_to = torch.Tensor.to


def _to_mps_safe(self, *args, **kw):
    """MPS has no float64: hy3dgen's texgen moves numpy float64 tensors to the device."""
    tgt = kw.get("device", args[0] if args else None)
    if self.dtype == torch.float64 and ((isinstance(tgt, str) and tgt.startswith("mps"))
                                        or (isinstance(tgt, torch.device) and tgt.type == "mps")):
        self = self.float()
    return _orig_to(self, *args, **kw)


torch.Tensor.to = _to_mps_safe

from hy3dgen.shapegen import FaceReducer  # noqa: E402
from hy3dgen.texgen import Hunyuan3DPaintPipeline  # noqa: E402
from hy3dgen.texgen.pipelines import Hunyuan3DTexGenConfig  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--faces", type=int, default=40000)
ap.add_argument("--tex", type=int, default=1024)
ap.add_argument("--render", type=int, default=1024)
ap.add_argument("out")
ap.add_argument("pairs", nargs="+", help="<refined.obj> <ref image> …")
a = ap.parse_args()
if len(a.pairs) % 2:
    ap.error("pairs come as <refined.obj> <ref image>")
os.makedirs(a.out, exist_ok=True)


def cutout(path):
    """The reference with alpha: its own, else everything that is not near-white (as hi3d_refine.py)."""
    im = Image.open(path)
    if im.mode == "RGBA" and np.asarray(im)[..., 3].min() < 255:
        return im
    rgb = np.asarray(im.convert("RGB"))
    alpha = ((255 - rgb.astype(np.int16)).max(axis=2) > 18).astype(np.uint8) * 255
    return Image.fromarray(np.dstack([rgb, alpha]))


orig_init = Hunyuan3DTexGenConfig.__init__


def config_init(self, *args, **kw):
    orig_init(self, *args, **kw)
    self.device = "mps"
    self.render_size = a.render
    self.texture_size = a.tex


Hunyuan3DTexGenConfig.__init__ = config_init
t0 = time.time()
paint = Hunyuan3DPaintPipeline.from_pretrained(os.path.join(os.environ["HY3DGEN_MODELS"], "tencent/Hunyuan3D-2"),
                                               subfolder="hunyuan3d-paint-v2-0-turbo")
load_s = round(time.time() - t0, 1)
for obj, ref in zip(a.pairs[::2], a.pairs[1::2]):
    stem = os.path.basename(obj).split(".hi3d")[0]
    mesh = FaceReducer()(trimesh.load(os.path.expanduser(obj), force="mesh"), max_facenum=a.faces)
    t1 = time.time()
    painted = paint(mesh, image=cutout(os.path.expanduser(ref)))
    painted.export(os.path.join(a.out, stem + ".glb"))
    rec = {"refined": obj, "ref": ref, "faces": int(len(mesh.faces)), "tex": a.tex, "load_s": load_s,
           "paint_s": round(time.time() - t1, 1)}
    json.dump(rec, open(os.path.join(a.out, stem + ".json"), "w"), indent=1)
    print(json.dumps(rec), flush=True)
    torch.mps.empty_cache()
