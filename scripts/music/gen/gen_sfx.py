"""MUSIC.md v3 row 6 (E33): render every sound effect family with Stable Audio 3 (small-sfx or medium).

Runs in the stable-audio-3 checkout's venv (github.com/Stability-AI/stable-audio-3, MIT), outside this repo:

    cd ~/ml/music/sfx/stable-audio-3
    HF_HUB_OFFLINE=1 uv run python <repo>/scripts/music/gen/gen_sfx.py --model small-sfx --seeds 1,2,3 --out <scratch>/sfx-raw

Writes <out>/<model>/<family>/<seed>.wav + .json (prompt, seed, steps, timing). Families: scripts/music/gen/sfx-jobs.json.
Weights come from the weight store (~/projects/weights/manual/cocktailpeanut/stable-audio-3-*, ungated mirrors of the
gated stabilityai repos); the T5Gemma text encoder inside each repo is passed as a local `model_path`, so nothing is
fetched. Device: mps (PyTorch; SA3 has no MLX path in mlx-audio 0.5.5), fp32 (the library turns half off off-CUDA).
Licence: Stability AI Community (free below USD 1M revenue, register for commercial use, "Powered by Stability AI")
plus the Gemma terms for the bundled T5Gemma encoder.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
W = Path.home() / "projects/weights/manual/cocktailpeanut"
REPOS = {"small-sfx": W / "stable-audio-3-small-sfx", "medium": W / "stable-audio-3-medium"}
SA3 = Path.home() / "ml/music/sfx/stable-audio-3"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", choices=list(REPOS), required=True)
    ap.add_argument("--seeds", default="1,2,3")
    ap.add_argument("--families", default="", help="comma list (default: all)")
    ap.add_argument("--steps", type=int, default=8)
    ap.add_argument("--cfg", type=float, default=1.0)
    ap.add_argument("--out", required=True)
    ap.add_argument("--jobs", default="sfx-jobs.json", help="families file in this folder (sfx-ph-jobs.json: Pine Hollow)")
    args = ap.parse_args()

    import soundfile as sf
    import torch
    from stable_audio_3.loading_utils import load_diffusion_cond
    from stable_audio_3.model import StableAudioModel

    repo = REPOS[args.model]
    cfg = json.loads((repo / "model_config.json").read_text())

    def patch(node: object) -> None:  # point every T5Gemma conditioner at the repo's local copy
        if isinstance(node, dict):
            if node.get("type") == "t5gemma" and isinstance(node.get("config"), dict):
                c = node["config"]
                c["model_path"] = str(repo / c.pop("subfolder", "t5gemma-b-b-ul2"))
                c.pop("repo_id", None)
            for v in node.values():
                patch(v)
        elif isinstance(node, list):
            for v in node:
                patch(v)

    patch(cfg)
    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    t0 = time.time()
    net = load_diffusion_cond(cfg, str(repo / "model.safetensors"), device=dev, model_half=False)
    net.use_lora, net.lora_names = False, []
    model = StableAudioModel(net, cfg, dev, False)
    load_s = round(time.time() - t0, 1)
    sr = cfg["sample_rate"]
    rev = subprocess.run(["git", "-C", str(SA3), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    print(f"[gen_sfx] {args.model} loaded on {dev} in {load_s}s", flush=True)

    fams = json.loads((HERE / args.jobs).read_text())["families"]
    want = [f for f in args.families.split(",") if f] or list(fams)
    for fam in want:
        j = fams[fam]
        for seed in [int(s) for s in args.seeds.split(",")]:
            dest = Path(args.out) / args.model / fam / f"{seed}.wav"
            if dest.exists():
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            t1 = time.time()
            audio = model.generate(prompt=j["prompt"], duration=j["duration"], steps=args.steps, cfg_scale=args.cfg, seed=seed)
            wav = audio[0].float().cpu().numpy().T if audio.dim() == 3 else audio.float().cpu().numpy().T
            sf.write(str(dest), wav, sr)
            dt = round(time.time() - t1, 2)
            side = {"model": f"Stable Audio 3 {args.model}", "repo": f"stabilityai/stable-audio-3-{args.model} (mirror {repo.name})",
                    "code_commit": f"stable-audio-3 {rev}, torch {torch.__version__}", "backend": f"PyTorch {dev} fp32",
                    "family": fam, "kind": j["kind"], "seed": seed, "prompt": j["prompt"], "desc": j["desc"],
                    "duration_s": j["duration"], "steps": args.steps, "cfg": args.cfg, "gen_time_s": dt, "model_load_s": load_s,
                    "mps_driver_gb": round(torch.mps.driver_allocated_memory() / 1e9, 2) if dev == "mps" else None}
            dest.with_suffix(".json").write_text(json.dumps(side, indent=2))
            print(f"[gen_sfx] {args.model} {fam} seed={seed} {dt}s", flush=True)


if __name__ == "__main__":
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    main()
