"""Stable Audio Open Small bake-off generator (stable-audio-tools on PyTorch MPS).

Runs in the stable-audio-tools checkout's venv, outside this repo:

    cd ~/ml/music/stable-audio-tools/src
    HF_HUB_OFFLINE=1 uv run --with soundfile --with pytorch_lightning==2.5.5 python <repo>/scripts/music/gen/gen_sao_small.py \
        --styles piano,orchestral,folk --seeds 101,102 --out <scratch>/bakeoff-raw

SAO Small is a 341M rectified-flow model with an ~11.9 s window (sample_size 524288 @ 44.1 kHz):
it makes loops and one-shots, not a 60-90 s theme. Takes here are 11 s.
Weights: ~/projects/weights/manual/joeriben/stable-audio-open-small (ungated mirror of the gated
stabilityai/stable-audio-open-small) + manual/google-t5/t5-base, passed to the T5 conditioner as a
local model_path so nothing is fetched into an HF cache.
Licence: Stability AI Community License (free below USD 1M annual revenue; register for commercial
use; "Powered by Stability AI" attribution).
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
W = Path.home() / "projects/weights/manual"
SMALL = Path(os.environ.get("SAO_SMALL_WEIGHTS", W / "joeriben/stable-audio-open-small"))
T5 = Path(os.environ.get("T5_BASE_WEIGHTS", W / "google-t5/t5-base"))
SAT_ROOT = Path.home() / "ml/music/stable-audio-tools/src"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--styles", default="piano,orchestral,folk")
    ap.add_argument("--seeds", default="101")
    ap.add_argument("--seconds", type=float, default=11.0)
    ap.add_argument("--steps", type=int, default=8)
    ap.add_argument("--cfg", type=float, default=1.0)
    ap.add_argument("--tag", default="sao-small")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    import soundfile as sf
    import torch
    from stable_audio_tools.inference.generation import generate_diffusion_cond
    from stable_audio_tools.models.factory import create_model_from_config
    from stable_audio_tools.models.utils import load_ckpt_state_dict

    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    cfg = json.loads((SMALL / "model_config.json").read_text())
    for c in cfg["model"]["conditioning"]["configs"]:
        if c["type"] == "t5":
            c["config"]["model_path"] = str(T5)
    t0 = time.time()
    model = create_model_from_config(cfg)
    model.load_state_dict(load_ckpt_state_dict(str(SMALL / "model.safetensors")))
    model = model.to(dev).eval()
    load_s = round(time.time() - t0, 1)
    sr = cfg["sample_rate"]
    print(f"[gen_sao_small] loaded on {dev} in {load_s}s", flush=True)
    rev = subprocess.run(["git", "-C", str(SAT_ROOT), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()

    briefs = json.loads((HERE / "briefs.json").read_text())
    for style in args.styles.split(","):
        s = briefs["styles"][style]
        for seed in [int(x) for x in args.seeds.split(",")]:
            dest = Path(args.out) / style / f"{args.tag}-{seed}.wav"
            if dest.exists():
                print(f"[gen_sao_small] have {dest}", flush=True)
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            t1 = time.time()
            with torch.no_grad():
                out = generate_diffusion_cond(
                    model, steps=args.steps, cfg_scale=args.cfg,
                    conditioning=[{"prompt": s["sao_prompt"], "seconds_total": args.seconds}],
                    sample_size=cfg["sample_size"], sample_rate=sr, seed=seed, device=dev,
                )
            wav = out[0].float().clamp(-1, 1).cpu().numpy().T[: int(args.seconds * sr)]
            sf.write(str(dest), wav, sr)
            dt = round(time.time() - t1, 1)
            side = {
                "model": "Stable Audio Open Small",
                "variant": "stable-audio-open-small (mirror joeriben/stable-audio-open-small)",
                "code_commit": f"stable-audio-tools {rev}, torch {torch.__version__}",
                "backend": f"PyTorch {dev}",
                "style": style,
                "seed": seed,
                "prompt": s["sao_prompt"],
                "duration_s": args.seconds,
                "steps": args.steps,
                "cfg": args.cfg,
                "gen_time_s": dt,
                "model_load_s": load_s,
                "mps_driver_gb": round(torch.mps.driver_allocated_memory() / 1e9, 2) if dev == "mps" else None,
            }
            dest.with_suffix(".json").write_text(json.dumps(side, indent=2))
            print(f"[gen_sao_small] {style} seed={seed} {dt}s -> {dest}", flush=True)


if __name__ == "__main__":
    main()
