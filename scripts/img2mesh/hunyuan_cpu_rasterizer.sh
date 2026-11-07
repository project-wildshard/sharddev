#!/bin/bash
# Build Hunyuan3D-2's custom_rasterizer WITHOUT CUDA (Apple Silicon): the kernel already has a CPU rasteriser
# (rasterize_image_cpu); this drops the .cu file + CUDA header, makes __host__/__device__ no-ops, and routes every
# call (MPS tensors included) through the CPU path, copying the result back to the caller's device.
#   bash scripts/img2mesh/hunyuan_cpu_rasterizer.sh [~/ml/img2mesh/Hunyuan3D-2]
set -euo pipefail
HY=${1:-$HOME/ml/img2mesh/Hunyuan3D-2}
K=$HY/hy3dgen/texgen/custom_rasterizer
cd "$K"
python3 - "$K" <<'EOF'
import pathlib, sys
k = pathlib.Path(sys.argv[1])
h = k / "lib/custom_rasterizer_kernel/rasterizer.h"
s = h.read_text()
s = s.replace("#include <ATen/cuda/CUDAContext.h> // For CUDA context",
              "#ifndef __CUDACC__\n#define __host__\n#define __device__\n#endif")
h.write_text(s)
c = k / "lib/custom_rasterizer_kernel/rasterizer.cpp"
s = c.read_text()
old = """    int device_id = V.get_device();
    if (device_id == -1)
        return rasterize_image_cpu(V, F, D, width, height, occlusion_truncation, use_depth_prior);
    else
        return rasterize_image_gpu(V, F, D, width, height, occlusion_truncation, use_depth_prior);"""
new = """    auto dev = V.device();
    auto r = rasterize_image_cpu(V.cpu().contiguous(), F.cpu().contiguous(), D.cpu().contiguous(),
        width, height, occlusion_truncation, use_depth_prior);
    return {r[0].to(dev), r[1].to(dev)};"""
if old in s:
    c.write_text(s.replace(old, new))
p = k / "setup.py"
p.write_text("""from setuptools import setup, find_packages
from torch.utils.cpp_extension import BuildExtension, CppExtension
setup(packages=find_packages(), version='0.1', name='custom_rasterizer', include_package_data=True,
      package_dir={'': '.'},
      ext_modules=[CppExtension('custom_rasterizer_kernel', [
          'lib/custom_rasterizer_kernel/rasterizer.cpp',
          'lib/custom_rasterizer_kernel/grid_neighbor.cpp'], extra_compile_args=['-O3', '-std=c++20', '-Wno-c++11-narrowing'])],
      cmdclass={'build_ext': BuildExtension})
""")
EOF
MACOSX_DEPLOYMENT_TARGET=12.0 uv pip install --python "$HY/.venv/bin/python" --no-build-isolation .
