"""SFX round 2 (E33): render every sound-effect family with EzAudio-XL (OpenSound/EzAudio, MIT; text-to-audio).

Runs in the EzAudio checkout's venv, outside this repo:

    cd ~/ml/music/sfx/EzAudio
    HF_HUB_OFFLINE=1 PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.5 .venv/bin/python \
        <repo>/scripts/music/gen/gen_sfx_ezaudio.py --seeds 1,2,3 --out <scratch>/sfx-raw

Writes <out>/ezaudio/<family>/<seed>.wav + .json (same layout as gen_sfx.py). 24 kHz mono, at most 10 s per
generation (its training length), so beds are 10 s takes looped. Weights from the store: the s3_xl DiT + VAE from
manual/OpenSound/EzAudio, the text encoder from manual/google/flan-t5-xl (loaded bf16 - the encoder only, ~2.4 GB).
Memory discipline as gen_sfx_moss.py: batch 1, bf16 text encoder, MPS high-watermark 0.5, pause between takes
while pressure is not normal (~/ml/music/mem-ok2.sh).
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
W = Path.home() / "projects/weights/manual"
EZ = Path.home() / "ml/music/sfx/EzAudio"
GATE = Path.home() / "ml/music/mem-ok2.sh"


def wait_for_memory() -> None:
    env = {**os.environ, "EXCLUDE_PID": str(os.getpid())}  # the gate must not count this process against itself
    while subprocess.run(["bash", str(GATE)], capture_output=True, env=env).returncode != 0:
        print("[gen_sfx_ezaudio] memory busy - waiting 2 min", flush=True)
        time.sleep(120)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", default="1,2,3")
    ap.add_argument("--families", default="")
    ap.add_argument("--steps", type=int, default=100)
    ap.add_argument("--cfg", type=float, default=5.0)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    os.chdir(EZ)
    sys.path.insert(0, str(EZ))
    import soundfile as sf
    import torch
    import transformers
    from src.models.conditioners import MaskDiT
    from src.modules.autoencoder_wrapper import Autoencoder
    from src.utils import load_yaml_with_includes
    from diffusers import DDIMScheduler
    from api import ezaudio as ez

    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    t0 = time.time()
    params = load_yaml_with_includes(str(W / "OpenSound/EzAudio/ckpts/ezaudio-xl.yml"))
    ae = Autoencoder(ckpt_path=str(W / "OpenSound/EzAudio/ckpts/vae/1m.pt"), model_type=params["autoencoder"]["name"],
                     quantization_first=params["autoencoder"]["q_first"]).to(dev).eval()
    t5 = str(W / "google/flan-t5-xl")
    tok = transformers.T5Tokenizer.from_pretrained(t5)
    te = transformers.T5EncoderModel.from_pretrained(t5, torch_dtype=torch.bfloat16).to(dev).eval()
    unet = MaskDiT(**params["model"]).to(dev)
    unet.load_state_dict(torch.load(str(W / "OpenSound/EzAudio/ckpts/s3/ezaudio_s3_xl.pt"), map_location="cpu")["model"])
    unet.eval()
    sched = DDIMScheduler(**params["diff"])
    model = ez.EzAudio.__new__(ez.EzAudio)
    model.device, model.autoencoder, model.unet, model.tokenizer, model.text_encoder, model.noise_scheduler, model.params = \
        dev, ae, unet, tok, te, sched, params

    # the T5 encoder runs in bf16; hand the DiT fp32 context
    orig = te.forward

    def fwd(*a, **k):
        out = orig(*a, **k)
        out.last_hidden_state = out.last_hidden_state.float()
        return out

    te.forward = fwd
    load_s = round(time.time() - t0, 1)
    rev = subprocess.run(["git", "-C", str(EZ), "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()
    print(f"[gen_sfx_ezaudio] loaded on {dev} in {load_s}s", flush=True)

    fams = json.loads((HERE / "sfx-jobs.json").read_text())["families"]
    for fam in [f for f in args.families.split(",") if f] or list(fams):
        j = fams[fam]
        secs = int(min(max(round(float(j["duration"])), 1), 10))
        for seed in [int(s) for s in args.seeds.split(",")]:
            dest = Path(args.out) / "ezaudio" / fam / f"{seed}.wav"
            if dest.exists():
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            wait_for_memory()
            t1 = time.time()
            sr, audio = model.generate_audio(j["prompt"], length=secs, guidance_scale=args.cfg, ddim_steps=args.steps, random_seed=seed)
            sf.write(str(dest), audio, sr)
            dt = round(time.time() - t1, 2)
            side = {"model": "EzAudio-XL", "repo": "OpenSound/EzAudio (s3_xl) + google/flan-t5-xl",
                    "code_commit": f"EzAudio {rev}, torch {torch.__version__}", "backend": f"PyTorch {dev} (DiT fp32, T5 bf16)",
                    "family": fam, "kind": j["kind"], "seed": seed, "prompt": j["prompt"], "desc": j["desc"],
                    "duration_s": secs, "steps": args.steps, "cfg": args.cfg, "gen_time_s": dt, "model_load_s": load_s,
                    "mps_driver_gb": round(torch.mps.driver_allocated_memory() / 1e9, 2) if dev == "mps" else None}
            dest.with_suffix(".json").write_text(json.dumps(side, indent=2))
            print(f"[gen_sfx_ezaudio] {fam} seed={seed} {dt}s", flush=True)


if __name__ == "__main__":
    main()
