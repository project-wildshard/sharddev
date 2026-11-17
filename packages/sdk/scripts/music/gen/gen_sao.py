"""Stable Audio Open 1.0 bake-off generator (diffusers StableAudioPipeline on PyTorch MPS).

Runs in its own venv, outside this repo:

    ~/ml/music/stable-audio-open/.venv/bin/python <repo>/scripts/music/gen/gen_sao.py \
        --styles piano,orchestral,folk --seeds 101,102 --out <scratch>/bakeoff-raw

SAO 1.0 is capped at 47.55 s per generation (its training window), so these takes are 47 s, not 75 s.
Weights: ~/projects/weights/manual/AEmotionStudio/stable-audio-open-models, an ungated mirror of
stabilityai/stable-audio-open-1.0 (the official repo is gated behind an HF login + licence click).
Licence: Stability AI Community License (free below USD 1M annual revenue).
No MLX port exists for SAO, so this is the MPS path.
"""

from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
SAO = Path(os.environ.get("SAO_WEIGHTS", Path.home() / "projects/weights/manual/AEmotionStudio/stable-audio-open-models"))


def patch_brownian_noise_for_mps() -> None:
    """SAO's CosineDPMSolverMultistepScheduler draws SDE noise from a torchsde BrownianInterval over
    [sigma_min, sigma_max] = [0.3, 500]. On the LAST step sigma = float32(0.3) = 0.30000001 and sigma_next = 0,
    below the tree's t0: torchsde's interval search then recurses until `RecursionError: maximum recursion
    depth exceeded` (brownian_interval._split). Seen first on MPS, reproduced on CPU with the scheduler alone.
    Fix: build the tree on the CPU in float64 with plain-float times, clamp times into [sigma_min, sigma_max],
    and return zero noise for an interval narrower than 1e-5 (the tree's tol is 1e-6). Noise comes back float32.
    """
    import torch
    from diffusers.schedulers import scheduling_cosine_dpmsolver_multistep as cos
    from diffusers.schedulers.scheduling_dpmsolver_sde import BatchedBrownianTree

    class CpuBrownianTreeNoiseSampler:
        def __init__(self, x, sigma_min, sigma_max, seed=None, transform=lambda v: v):
            self.lo, self.hi = float(sigma_min), float(sigma_max)
            self.shape = x.shape
            self.tree = BatchedBrownianTree(x.detach().to("cpu", torch.float64), self.lo, self.hi, seed)

        def __call__(self, sigma, sigma_next):
            t0 = min(max(float(sigma), self.lo), self.hi)
            t1 = min(max(float(sigma_next), self.lo), self.hi)
            if abs(t1 - t0) < 1e-5:  # below torchsde tol=1e-6 the interval search never ends
                return torch.zeros(self.shape)
            return (self.tree(t0, t1) / abs(t1 - t0) ** 0.5).float()

    cos.BrownianTreeNoiseSampler = CpuBrownianTreeNoiseSampler


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--styles", default="piano,orchestral,folk")
    ap.add_argument("--seeds", default="101")
    ap.add_argument("--seconds", type=float, default=47.0)
    ap.add_argument("--steps", type=int, default=100)
    ap.add_argument("--cfg", type=float, default=7.0)
    ap.add_argument("--dtype", default="float32", choices=["float32", "float16"])
    ap.add_argument("--tag", default="sao1.0")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    import soundfile as sf
    import torch
    from diffusers import StableAudioPipeline

    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    dtype = torch.float16 if args.dtype == "float16" else torch.float32
    if dev == "mps":
        patch_brownian_noise_for_mps()
    briefs = json.loads((HERE / "briefs.json").read_text())
    t0 = time.time()
    pipe = StableAudioPipeline.from_pretrained(str(SAO), torch_dtype=dtype).to(dev)
    load_s = round(time.time() - t0, 1)
    print(f"[gen_sao] loaded on {dev} in {load_s}s", flush=True)
    sr = pipe.vae.sampling_rate

    for style in args.styles.split(","):
        s = briefs["styles"][style]
        for seed in [int(x) for x in args.seeds.split(",")]:
            dest = Path(args.out) / style / f"{args.tag}-{seed}.wav"
            if dest.exists():
                print(f"[gen_sao] have {dest}", flush=True)
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            if dev == "mps":
                torch.mps.reset_peak_memory_stats() if hasattr(torch.mps, "reset_peak_memory_stats") else None
            t1 = time.time()
            g = torch.Generator("cpu").manual_seed(seed)
            audio = pipe(
                s["sao_prompt"], negative_prompt=s["sao_negative"], num_inference_steps=args.steps,
                guidance_scale=args.cfg, audio_end_in_s=args.seconds, num_waveforms_per_prompt=1, generator=g,
            ).audios[0]
            wav = audio.float().cpu().numpy().T
            sf.write(str(dest), wav, sr)
            dt = round(time.time() - t1, 1)
            side = {
                "model": "Stable Audio Open",
                "variant": "stable-audio-open-1.0 (mirror AEmotionStudio/stable-audio-open-models)",
                "code_commit": "diffusers " + __import__("diffusers").__version__ + ", torch " + torch.__version__,
                "backend": f"PyTorch {dev} ({args.dtype})",
                "style": style,
                "seed": seed,
                "prompt": s["sao_prompt"],
                "negative_prompt": s["sao_negative"],
                "duration_s": args.seconds,
                "steps": args.steps,
                "cfg": args.cfg,
                "gen_time_s": dt,
                "model_load_s": load_s,
                "mps_driver_gb": round(torch.mps.driver_allocated_memory() / 1e9, 2) if dev == "mps" else None,
            }
            dest.with_suffix(".json").write_text(json.dumps(side, indent=2))
            print(f"[gen_sao] {style} seed={seed} {dt}s -> {dest}", flush=True)


if __name__ == "__main__":
    main()
