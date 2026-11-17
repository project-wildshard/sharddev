# img2mesh: image-to-3D on this Mac (Apple M5 Max, 128 GB, macOS 26.5, no CUDA)

Summary (2026-09-23): **TRELLIS.2-4B runs on MPS** through the community port shivampkumar/trellis-mac, and it
produced every Driftwood hero prop. A prop takes 1–3.5 min to generate plus 3–5 s of texture bake at
`1024_cascade`, or ~35 s at `512`; the pipeline loads once per batch in ~80–90 s.
**Hunyuan3D-2's shape model runs on MPS too.** Its texture painter needs a CUDA rasteriser, which I rebuilt for CPU.
Measured numbers are in §3. Installs and weights live outside the repo:
- installs: `~/ml/img2mesh/{trellis-mac,Hunyuan3D-2}`;
- weights: `~/projects/weights/manual/` (the machine's single weight store; see its AGENTS.md);
- CC0 kits: `~/models/cc0/` (see CC0.md).

The box is shared. Every model load goes through the machine-wide lock:
`~/projects/localai/bin/img2mesh/run-locked.sh <log> <cmd…>` (lockf on `~/projects/localai/.model.lock`; it waits
until anonymous memory is below 70 GB and evicts afterwards).

## 1. The pipeline

```
concept art ──codex image_gen──▶ art/driftwood-isle/round-8-assets/ref-<prop>.jpg   (one object, white bg, 3/4 view)
      │  (a sheet of small objects: split_sheet.py → one RGBA crop per object: a sheet makes TRELLIS pile them up)
      ▼
trellis_batch.py (MPS, under the lock) ──▶ ~/ml/img2mesh/out/driftwood/<ref>.glb   (~40 k faces, 1024² PBR texture)
      ▼
driftwood_post.py (Blender 5.2, headless) ──▶ faceted low-poly, one colour per facet (+ optional WebP atlas),
      │   Cycles AO in the vertex alpha, metres, pivot at the base
      ▼
build_driftwood.sh (gltf-transform meshopt) ──▶ public/assets/models/driftwood-hero/<asset>/<asset>.glb (+ .tex.glb, .json)
```

| File | What |
|---|---|
| `trellis_batch.py` | TRELLIS.2 batch runner: loads once, writes `<stem>.glb` (decimated + baked), `<stem>.hi.obj` (raw), `<stem>.json` (timings) |
| `driftwood_post.py` | the clean-up: weld → drop crumbs → `--split` sets into assets → decimate (`--simplifier fqmr` quadric / `blender` collapse, `--remesh` voxel first for solid props) → per-facet colour from the generated texture (4 BVH samples, HSV grade, k-means `--quant`) → AO → scale / pivot → glb; `--atlas N` also bakes an N² WebP base-colour atlas (`<asset>.tex.glb`); `--keep-texture` is the PBR mode (below) |
| `build_props.py` | any shard: `build_props.py <props.json> <out dir> [ref …]`: runs `driftwood_post.py` per prop of the list into a staging folder, then meshopt into `<out dir>/<asset>/` (PH-0.3) |
| `build_driftwood.sh` | Driftwood's: `build_props.py src/shards/driftwood-isle/art/hero-props.json public/assets/models/driftwood-hero` (the list: every size, budget and option) |
| `props/<list>.json` | a prop list: `gen` (the generations), `stage`, `args` for every prop (`["--keep-texture"]` for a photoreal shard), `props: [{ref, args}]` |
| `src/shards/nalati-grasslands/art/model-recipe.json` | not a `build_props.py` list: the recipe of Nalati's models (M10, E315), copied from localai's `bin/img2mesh/nalati-jobs.tsv` and its finish settings. Per model: the generator that ships, the TRELLIS rebake and `blender_post.py` settings, the reference prompt, and what was delivered. The runners stay in localai |
| `split_sheet.py` | cut a sheet of separate objects on white into one RGBA crop per object |
| `render_still.py` | a 3/4 Eevee still, the same sun + sky for every model; `a.glb,b.glb,…` lays a set out in a row |
| `board.py` | the comparison board `art/driftwood-isle/round-8-assets/board.jpg`: concept crop, reference, new asset, current in-game model |
| `hunyuan_cpu_rasterizer.sh` | builds Hunyuan3D-2's `custom_rasterizer` without CUDA (its CPU path, results copied back to MPS) |
| `cc0_export.py`, `build_cc0.sh` | CC0 kit models → Driftwood palette (per-face CIELAB snap, `--family rock|bleach|wood`) → `public/assets/models/driftwood-cc0/` |
| `CC0.md` | the CC0 library: every pack, its licence, URL and local path |

The output convention matches `scripts/blender/` and `src/world/BlenderIsland.ts`:
- `COLOR_0`: rgb is the albedo, a is the baked AO (0.35–1);
- flat normals, no textures (except `.tex.glb`);
- metres, Y-up, pivot at the base centre (a leaning palm pivots on its trunk foot);
- `EXT_meshopt_compression`, so the loader needs `new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)`.

**PBR mode (`--keep-texture`, a photoreal shard such as Pine Hollow, PH-0.3).** No facet flattening. The prop is shaded
smooth, with edges past `--smooth-angle` (40°) kept hard. The generated texture is baked **ungraded** onto the low mesh's
own UVs (`--atlas`, default 1024). A tangent-space normal map is baked from the high mesh (`--normal-map`, default the
atlas size). `<asset>.glb` carries that material: WebP base colour + normal, `--roughness`, no `COLOR_0`, no AO bake and
no `.tex.glb`. Driftwood's outputs are unchanged: `build_driftwood.sh` re-produces the committed `driftwood-hero` files
byte-for-byte.

To regenerate one prop, e.g. the hut:
```bash
A=art/driftwood-isle/round-8-assets
~/projects/localai/bin/img2mesh/run-locked.sh ~/ml/img2mesh/logs/driftwood.log \
  ~/ml/img2mesh/trellis-mac/.venv/bin/python scripts/img2mesh/trellis_batch.py --out ~/ml/img2mesh/out/driftwood $A/ref-hut.jpg
bash scripts/img2mesh/build_driftwood.sh hut
```

## 2. Install (exact, as run 2026-09-23)

Versions:
- Python 3.11.15 (uv 0.11.26), torch 2.14.0 (MPS), torchvision 0.29.0, transformers 5.17.0;
- Blender 5.2.1 LTS (`/opt/homebrew/bin/blender`);
- trellis-mac `d58628f`, microsoft/TRELLIS.2 `75fbf01`, mtlgemm `566c133`, trellis2-apple `1734724`;
- Tencent-Hunyuan/Hunyuan3D-2 `f8db630`, diffusers 0.40.0.

### TRELLIS.2 (MIT), via shivampkumar/trellis-mac

```bash
mkdir -p ~/ml/img2mesh && cd ~/ml/img2mesh
git clone https://github.com/shivampkumar/trellis-mac.git && cd trellis-mac
bash setup.sh          # venv (py3.11), deps, clones TRELLIS.2 + Pedro Naugusto's Metal backends, applies MPS patches
# setup.sh's Metal builds all FAIL with torch 2.14 (headers need C++20 / macOS 12; o-voxel needs Eigen). Rebuild:
brew install eigen
source .venv/bin/activate
export MACOSX_DEPLOYMENT_TARGET=12.0 CPATH=/opt/homebrew/include/eigen3
for d in mtlbvh mtldiffrast mtlmesh mtlgemm trellis2-apple/o-voxel; do uv pip install --no-build-isolation deps/$d; done
```

Weights (~18 GB) go into `~/projects/weights/manual` with that store's `bin/fetch-repo.sh`, not `hf download`:
- `microsoft/TRELLIS.2-4B`;
- `microsoft/TRELLIS-image-large` (only `ckpts/ss_dec_conv3d_16l8_fp16.*`);
- `facebook/dinov3-vitl16-pretrain-lvd1689m` (gated: request access on HF; this account has it);
- `ZhengPeng7/BiRefNet`.

`~/ml/img2mesh/trellis-view/pipeline.json` is TRELLIS.2's `pipeline.json` with every model path pointed into
`manual/`. It also swaps the background remover: the hub config names `briaai/RMBG-2.0`, which is gated (no
access here) and **CC BY-NC**, so it uses **BiRefNet (MIT)**. BiRefNet's weights load as fp16, and
`trellis_batch.py` casts them to fp32 because the pipeline feeds it fp32.

### Hunyuan3D-2 (allowed for shipped assets, like TRELLIS.2: the game ships in North and South America only)

```bash
cd ~/ml/img2mesh && git clone --depth 1 https://github.com/Tencent-Hunyuan/Hunyuan3D-2.git && cd Hunyuan3D-2
uv venv .venv --python 3.11 && source .venv/bin/activate
uv pip install torch torchvision diffusers einops opencv-python numpy transformers omegaconf tqdm trimesh pymeshlab \
  pygltflib xatlas accelerate rembg onnxruntime ninja pybind11 scikit-image setuptools wheel
uv pip install -e .
bash <repo>/scripts/img2mesh/hunyuan_cpu_rasterizer.sh     # texture painter: custom_rasterizer without CUDA
```

Weights: `tencent/Hunyuan3D-2` (`hunyuan3d-dit-v2-0(-turbo)`, `hunyuan3d-vae-v2-0(-turbo)`, `hunyuan3d-paint-v2-0-turbo`,
`hunyuan3d-delight-v2-0`) and `tencent/Hunyuan3D-2mini` (`hunyuan3d-dit-v2-mini-turbo`, `hunyuan3d-vae-v2-mini`), in
`manual/tencent/`. The shared runner is `~/projects/localai/bin/img2mesh/hy3d_batch.py`: `--shape turbo|full`,
`--no-paint`.

### Blender side

`driftwood_post.py --simplifier fqmr` imports `fast-simplification`. It is installed next to Blender, not into it:
```bash
/Applications/Blender.app/Contents/Resources/5.2/python/bin/python3.13 -m pip install \
  --target ~/ml/img2mesh/blender-site fast-simplification
```

## 3. Measured (M5 Max, 2026-09-23, under the shared lock, other sessions active)

TRELLIS.2-4B, `1024_cascade`, seed 42, 12 steps per stage. The pipeline load was 92 s in batch 1 and 82 s in batch 2.

| Ref | Generate | Raw faces | Bake → 40 k faces + 1024² | Peak RSS |
|---|---|---|---|---|
| boulders (sheet of 5) | 62 s | 1.6 M | 2.5 s | 20.8 GB |
| palm-a | 89 s | 2.4 M | 3.2 s | |
| driftwood (sheet of 4) | 119 s | 4.6 M | 3.5 s | |
| piling | 110 s | 4.0 M | 3.3 s | |
| palm-b | 142 s | 5.0 M | 4.7 s | |
| shrine | 136 s | 5.2 M | 4.2 s | |
| sailboat | 178 s | 7.6 M | 12.8 s | |
| clutter (sheet; replaced by single crops) | 182 s | 7.7 M | 9.3 s | 21.6 GB |
| coco (sheet; replaced by single crops) | 196 s | 7.1 M | 4.5 s | 22.4 GB |
| palm-c | 206 s | 6.9 M | 4.4 s | |
| wreck | 249 s | 10.9 M | 21.6 s | |
| hut | 501 s | 16.5 M | 15.2 s | |

- **512:** 35 s generate + 7 s bake (palm-a) and 22 s + 8 s (boulders), after a 78 s load.
- **Post:** `driftwood_post.py` is 1–10 s per prop (Cycles AO on CPU at 64 samples; the atlas bake is 4 samples).
- **Board stills:** `render_still.py` takes ~1–2 s each.

**Hunyuan3D-2 on the same refs** (`hy3d_batch.py --shape turbo`, i.e. `hunyuan3d-dit-v2-0-turbo` with FlashVDM +
`hunyuan3d-paint-v2-0-turbo`, octree 380):
- load: 26 s;
- palm-a: shape 7.4 s (701 k faces → 40 k), paint 18.0 s;
- hut: shape 4.8 s (1.58 M → 40 k), paint 12.7 s;
- 94 s wall for both, 34.5 GB peak footprint.

That is **~10× faster than TRELLIS.2**, with a comparable hut and a palm whose crown is a better solid mass.
Its trunk comes back painted in red-and-cream stripes, and its thatch is flatter.
Side by side: `art/driftwood-isle/round-8-assets/hunyuan-vs-trellis.jpg`.

## 4. What works, what doesn't, and why

- **TRELLIS.2 is the one we use.**
  - Best silhouettes of the two, and fast enough to iterate: a whole prop set in two ~15-minute batches.
  - It ships a baked PBR texture, which is what the per-facet colour sampling reads.
  - The Mac port skips hole filling: `cumesh` is CUDA-only and its Metal port segfaults at decoder sizes. So meshes
    keep small holes and open plank shells, and Blender's collapse decimation stalls on them at 3–5× the budget.
    That is why `driftwood_post.py` offers `--simplifier fqmr` (palms), `--remesh` (piling, sailboat) and a plain
    collapse (rocks, driftwood, hut, shrine).
  - The wreck is made of open, single-sided plank shells, and every decimator tore them apart (7.7 k tris at best).
    `--solidify 0.004 --remesh 0.005` thickens the shells first and then voxel-remeshes them. The result is a 3.0 k
    LOD0 plus a 1.4 k `wreck-lod1`, with chunkier planks than the reference.
  - Flat items (starfish) come back as a flat, open sheet. `--up x90` stands them up the right way, then `--remesh 0.025`
    closes them. Before `--up` could rotate anything, the glTF import had to be switched out of QUATERNION mode.
  - Palm frond `frond-a` (a straight pinnate leaf) fell apart into loose leaflets and was dropped. The curled
    `frond-b` survived.
  - A sheet of several objects comes back as one tight pile (the clutter sheet did). So small objects each get
    their own crop via `split_sheet.py`.
- **Hunyuan3D-2 runs on Apple Silicon, with caveats:**
  - `hy3dgen.shapegen` runs as-is on `device='mps'`;
  - the texture painter's `custom_rasterizer` is a CUDA extension. It does carry a CPU rasteriser, and
    `hunyuan_cpu_rasterizer.sh` builds just that;
  - the multiview paint pipeline also needs `trust_remote_code` for its custom diffusers pipeline.
  - **Which to use:** Hunyuan3D-2 and TRELLIS.2 are equally allowed for shipped game assets (the game ships in
    North and South America only, AGENTS.md). Run both where it matters and ship the better model.

## 4b. Hi3D refine (opt-in, HI3D-REFINE, 2026-10-24)

[Hi3D v1.0](https://github.com/hi3d-official/Hi3Dv1.0) refines a generation's mesh against its reference into ~1 M
clean faces (geometry only). Runtime, numbers and traps: localai [`docs/hi3d.md`](../../../../localai/docs/hi3d.md).

```bash
L=~/projects/localai/bin/img2mesh/run-locked.sh
$L ~/ml/img2mesh/logs/<job>-hi3d.log ~/ml/img2mesh/hi3d-mlx/.venv/bin/python -I scripts/img2mesh/hi3d_refine.py \
  --res 1024 ~/ml/img2mesh/out/hi3d/<shard> <gen>/<ref>.glb <ref image> [<gen>/<ref>.glb <ref image> …]
REFINE=~/ml/img2mesh/out/hi3d/<shard> python3 scripts/img2mesh/build_props.py <list>.json <out dir> <ref>   # or "refine": {"dir", "res"} in the list
```

- `hi3d_refine.py` turns each mesh to the reference's camera (`--turn auto`), refines, fits the result back onto the
  GLB (bbox + ICP) and records time, memory and mesh health. `driftwood_post.py --geo` decimates the refined mesh and
  bakes the normal map from it; colour still comes from the generation. Off by default: outputs rebuild byte-for-byte.
- **Use it** for messy generator geometry (spikes, torn flaps, holes after decimation), faceted props and normal-mapped
  heroes. **Not** for detail the generator only painted (it carves the reference's version under the old paint) or a
  look without a normal map (no gain). `hi3d_paint.py` (Hunyuan repaint of the refined mesh) lost every test.
- Boards: `art/hi3d-refine/round-1-heroes/`. Driftwood props built with `--simplifier blender` need `fqmr` under Hi3D
  (the collapse stalls at ~10× the budget on 1 M faces).

## 5. Next

- Wreck (V-M2): a hand retopo in Blender so the planks read as planks. The remeshed 3 k LOD0 is blobby next to the
  reference. Hi3D does this at the same 3 k (HI3D-REFINE board-wreck): railings, ribs and planks read.
- Emissive rune on the shrine: the atlas has the glowing diamond, and the vertex-colour build loses it.
- Kitbash coconuts into the palms' crowns: the coconut-cluster asset exists, but TRELLIS dropped the nuts from palm-a.
- Try TRELLIS.2 at `1024_cascade` with 20+ steps for the hut, and check a Hunyuan 2.1 PBR build against it.
