"""SFX round 2 (E33): render every sound-effect family with MOSS-SoundEffect v2.0 (OpenMOSS, Apache-2.0).

Runs in the MOSS-TTS checkout's venv, outside this repo:

    cd ~/ml/music/sfx/MOSS-TTS/moss_soundeffect_v2
    TORCHDYNAMO_DISABLE=1 PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.5 PYTORCH_MPS_LOW_WATERMARK_RATIO=0.4 .venv/bin/python \
        <repo>/scripts/music/gen/gen_sfx_moss.py --seeds 1,2,3 --out <scratch>/sfx-raw

Writes <out>/moss/<family>/<seed>.wav + .json, the same layout as gen_sfx.py, so sfx_build.py ranks all models alike.
Weights: ~/projects/weights/manual/OpenMOSS-Team/MOSS-SoundEffect-v2.0 (a local diffusers-style dir: no hub calls).
Porting to Apple Silicon: the DiT forward is wrapped in torch.compile(triton cudagraphs) -> TORCHDYNAMO_DISABLE=1; the
timestep embedding is built in float64 on the device (MPS has none) -> patched to compute it on the CPU; the RoPE
tables are complex128 buffers -> patched to complex64;
device "mps", bf16 (the pipeline's own autocast); the other autocast("cuda") blocks just disable themselves.
Memory discipline (the user): batch 1, bf16, PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.5, and between takes the run
waits while macOS memory pressure is not normal or swap use is over 8 GB (~/ml/music/mem-ok2.sh).
The pipeline always denoises a fixed 30 s latent and crops, so a 1 s take costs as much as a 30 s one.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
W = Path(os.environ.get("MOSS_WEIGHTS", Path.home() / "projects/weights/manual/OpenMOSS-Team/MOSS-SoundEffect-v2.0"))
MOSS = Path.home() / "ml/music/sfx/MOSS-TTS"
GATE = Path.home() / "ml/music/mem-ok2.sh"


def wait_for_memory() -> None:
    env = {**os.environ, "EXCLUDE_PID": str(os.getpid())}  # the gate must not count this process against itself
    while subprocess.run(["bash", str(GATE)], capture_output=True, env=env).returncode != 0:
        print("[gen_sfx_moss] memory busy - waiting 2 min", flush=True)
        time.sleep(120)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", default="1,2,3")
    ap.add_argument("--families", default="")
    ap.add_argument("--steps", type=int, default=100)
    ap.add_argument("--cfg", type=float, default=4.0)
    ap.add_argument("--out", required=True)
    ap.add_argument("--jobs", default="sfx-jobs.json", help="families file in this folder (sfx-ph-jobs.json: Pine Hollow)")
    args = ap.parse_args()

    import soundfile as sf
    import torch
    from moss_soundeffect_v2 import MossSoundEffectPipeline  # installed editable in the venv
    from moss_soundeffect_v2.diffsynth.models import wan_audio_dit, wan_video_dit
    from moss_soundeffect_v2.diffsynth.pipelines import wan_audio

    # MPS has no float64: the timestep embedding is computed in float64 on the tensor's device. Same maths on the CPU.
    def sinusoidal_embedding_1d(dim, position):
        pos = position.detach().cpu().to(torch.float64)
        sinusoid = torch.outer(pos, torch.pow(10000, -torch.arange(dim // 2, dtype=torch.float64).div(dim // 2)))
        x = torch.cat([torch.cos(sinusoid), torch.sin(sinusoid)], dim=1)
        return x.to(device=position.device, dtype=position.dtype)

    wan_video_dit.sinusoidal_embedding_1d = sinusoidal_embedding_1d
    wan_audio_dit.sinusoidal_embedding_1d = sinusoidal_embedding_1d
    wan_audio.sinusoidal_embedding_1d = sinusoidal_embedding_1d  # imported by name there

    # the RoPE tables are complex128 buffers (polar of float64) - MPS has no complex128. Compute in float64 on the CPU
    # and store complex64, which is what rope_apply reads anyway (.real / .imag cast to float32).
    orig_freqs = wan_audio_dit.precompute_freqs_cis

    def precompute_freqs_cis(*a, **k):
        return orig_freqs(*a, **k).to(torch.complex64)

    wan_audio_dit.precompute_freqs_cis = precompute_freqs_cis
    wan_video_dit.precompute_freqs_cis = precompute_freqs_cis

    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    t0 = time.time()
    pipe = MossSoundEffectPipeline.from_pretrained(str(W), torch_dtype=torch.bfloat16, device=dev)
    load_s = round(time.time() - t0, 1)
    rev = subprocess.run(["git", "-C", str(MOSS), "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()
    print(f"[gen_sfx_moss] loaded on {dev} in {load_s}s", flush=True)

    fams = json.loads((HERE / args.jobs).read_text())["families"]
    for fam in [f for f in args.families.split(",") if f] or list(fams):
        j = fams[fam]
        secs = min(float(j["duration"]), 30.0)
        for seed in [int(s) for s in args.seeds.split(",")]:
            dest = Path(args.out) / "moss" / fam / f"{seed}.wav"
            if dest.exists():
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            wait_for_memory()
            t1 = time.time()
            audio = pipe(prompt=j["prompt"], seconds=secs, num_inference_steps=args.steps, cfg_scale=args.cfg, seed=seed,
                         progress_bar_cmd=lambda x: x)
            wav = audio[0].float().cpu().numpy().T
            sf.write(str(dest), wav, pipe.sample_rate)
            dt = round(time.time() - t1, 2)
            side = {"model": "MOSS-SoundEffect v2.0", "repo": "OpenMOSS-Team/MOSS-SoundEffect-v2.0",
                    "code_commit": f"MOSS-TTS {rev}, torch {torch.__version__}", "backend": f"PyTorch {dev} bf16",
                    "family": fam, "kind": j["kind"], "seed": seed, "prompt": j["prompt"], "desc": j["desc"],
                    "duration_s": secs, "steps": args.steps, "cfg": args.cfg, "gen_time_s": dt, "model_load_s": load_s,
                    "mps_driver_gb": round(torch.mps.driver_allocated_memory() / 1e9, 2) if dev == "mps" else None}
            dest.with_suffix(".json").write_text(json.dumps(side, indent=2))
            print(f"[gen_sfx_moss] {fam} seed={seed} {dt}s", flush=True)


if __name__ == "__main__":
    main()
