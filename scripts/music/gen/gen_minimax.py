"""MiniMax Music 3 bake-off generator (diffusers ModularPipeline on PyTorch MPS).

Runs in its own venv (diffusers 0.40.0 carries the pipeline), outside this repo:

    ~/ml/music/minimax-music3/.venv/bin/python <repo>/scripts/music/gen/gen_minimax.py \
        --styles piano --seeds 101,102 --out <scratch>/bakeoff-raw

The model card says "Inference requires CUDA"; that means "only tested on CUDA". Porting notes:
  * weights load from ~/projects/weights/manual/MiniMaxAI/MiniMax-Music3 through a symlink view whose
    modular_model_index.json points every component at the local dir (the published one names the
    hub repo, so from_pretrained on the plain dir would reach for the network);
  * everything runs on "mps" in bf16 (the 8B Qwen3 global LM alone is ~16 GB in bf16);
  * the generator is a CPU torch.Generator - the pipeline samples top-k tokens on the generator's device,
    which also keeps seeds device-independent.
Licence: MiniMax-Music3 Community License - commercial use allowed, "MiniMax-Music3" must be displayed in the
product UI, written authorisation needed above USD 20M yearly revenue.
"""

from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = Path(os.environ.get("MINIMAX_WEIGHTS", Path.home() / "projects/weights/manual/MiniMaxAI/MiniMax-Music3"))
VIEW = Path(os.environ.get("MINIMAX_VIEW", Path.home() / "ml/music/minimax-music3/model-view"))
LYRICS = "[Intro]\n[Instrumental]\n[Solo]\n[Instrumental]\n[Outro]"


def build_view() -> Path:
    """Zero-byte view of the weight store with a local-path modular_model_index.json."""
    VIEW.mkdir(parents=True, exist_ok=True)
    for p in SRC.rglob("*"):
        if p.is_dir() or p.name == "modular_model_index.json" or "qwen_7B" in p.parts:
            continue
        dst = VIEW / p.relative_to(SRC)
        dst.parent.mkdir(parents=True, exist_ok=True)
        if not dst.is_symlink():
            dst.symlink_to(p)
    idx = json.loads((SRC / "modular_model_index.json").read_text())
    for k, v in idx.items():
        if isinstance(v, list) and len(v) == 3 and isinstance(v[2], dict) and "pretrained_model_name_or_path" in v[2]:
            v[2]["pretrained_model_name_or_path"] = str(VIEW)
    (VIEW / "modular_model_index.json").write_text(json.dumps(idx, indent=2))
    return VIEW


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--styles", default="piano,orchestral,folk")
    ap.add_argument("--seeds", default="101")
    ap.add_argument("--duration", type=float, default=None)
    ap.add_argument("--steps", type=int, default=30)
    ap.add_argument("--tag", default="minimax3")
    ap.add_argument("--out", required=True)
    ap.add_argument("--jobs", default=None, help="v3 jobs file (v3-jobs.json); renders --keys instead of --styles")
    ap.add_argument("--keys", default="", help="comma-separated job keys, e.g. piano/pine,piano/island")
    args = ap.parse_args()

    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    import soundfile as sf
    import torch
    from diffusers import ModularPipeline

    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    view = build_view()
    t0 = time.time()
    pipe = ModularPipeline.from_pretrained(str(view))
    pipe.load_components(dtype=torch.bfloat16)
    if os.environ.get("MINIMAX_OFFLOAD"):
        # memory cap (the user: "don't hammer the machine's memory"): the 8B global LM (~16 GB bf16) streams from
        # disk one leaf module at a time (diffusers group offloading); everything else sits on the device
        from diffusers.hooks import apply_group_offloading

        off = Path(os.environ.get("MINIMAX_OFFLOAD_DIR", Path.home() / "ml/music/minimax-music3/offload"))
        off.mkdir(parents=True, exist_ok=True)
        for name in pipe.components:
            comp = getattr(pipe, name, None)
            if isinstance(comp, torch.nn.Module) and name != "language_model":
                comp.to(dev)
        apply_group_offloading(pipe.language_model, onload_device=torch.device(dev), offload_device=torch.device("cpu"),
                               offload_type="leaf_level", offload_to_disk_path=str(off))  # leaf: the AR loop calls embed_tokens / lm_head directly
    else:
        pipe.to(dev)
    load_s = round(time.time() - t0, 1)
    print(f"[gen_minimax] loaded on {dev} in {load_s}s", flush=True)
    briefs = json.loads((HERE / "briefs.json").read_text())
    import diffusers

    # one work list for both modes: (folder, style, slot, prompt, lyrics, duration)
    work = []
    if args.jobs:
        jf = json.loads((HERE / args.jobs).read_text() if not Path(args.jobs).is_absolute() else Path(args.jobs).read_text())
        for key in [k for k in args.keys.split(",") if k]:
            j = jf["jobs"][key]
            work.append((key.replace("/", "-"), j["style"], j["slot"], j["prompt"], jf["lyrics"][j["lyrics"]],
                         args.duration or j["duration"]))
    else:
        for style in args.styles.split(","):
            s = briefs["styles"][style]
            work.append((style, style, None, s["minimax_prompt"], LYRICS, args.duration or briefs["shared"]["duration_s"]))

    for folder, style, slot, prompt, lyrics, dur in work:
        for seed in [int(x) for x in args.seeds.split(",")]:
            dest = Path(args.out) / folder / f"{args.tag}-{seed}.wav"
            if dest.exists():
                print(f"[gen_minimax] have {dest}", flush=True)
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            t1 = time.time()
            audio = pipe(prompt=prompt, lyrics=lyrics, audio_duration=dur, num_inference_steps=args.steps,
                         generator=torch.Generator("cpu").manual_seed(seed), output="audios")[0]
            import numpy as np

            wav = np.asarray(audio.float().cpu().numpy() if hasattr(audio, "cpu") else audio, dtype=np.float32)
            wav = wav.T if wav.ndim == 2 and wav.shape[0] in (1, 2) else wav
            sf.write(str(dest), wav, pipe.sampling_rate)
            dt = round(time.time() - t1, 1)
            side = {
                "model": "MiniMax Music 3",
                "variant": "MiniMaxAI/MiniMax-Music3 (8B global LM + 0.6B local LM + 2.4B flow-matching DiT)",
                "code_commit": f"diffusers {diffusers.__version__}, torch {torch.__version__}",
                "backend": f"PyTorch {dev} bf16",
                "style": style,
                "slot": slot,
                "seed": seed,
                "prompt": prompt,
                "lyrics": lyrics,
                "duration_s": dur,
                "steps": args.steps,
                "gen_time_s": dt,
                "model_load_s": load_s,
                "mps_driver_gb": round(torch.mps.driver_allocated_memory() / 1e9, 2) if dev == "mps" else None,
            }
            dest.with_suffix(".json").write_text(json.dumps(side, indent=2))
            print(f"[gen_minimax] {folder} seed={seed} {dt}s -> {dest}", flush=True)


if __name__ == "__main__":
    main()
