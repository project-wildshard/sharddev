"""ACE-Step 1.5 bake-off generator (project/archive/2026-09-23-music.md checkpoint 2).

Runs inside the ACE-Step checkout's venv, outside this repo:

    cd ~/ml/music/ace-step-1.5
    HF_HUB_OFFLINE=1 /usr/bin/time -l uv run python \
        <repo>/scripts/music/gen/gen_ace_step.py --dit acestep-v15-xl-sft --lm acestep-5Hz-lm-4B \
        --styles piano,orchestral,folk --seeds 101,102,103 --out <scratch>/bakeoff-raw

Writes <out>/<style>/<tag>-<seed>.wav plus a .json sidecar (prompt, seed, model, settings, time).
Weights: ~/ml/music/ace-step-1.5/checkpoints/* are symlinks into ~/projects/weights/manual/ACE-Step/.
Apple Silicon: DiT runs on MLX (use_mlx_dit), the 5Hz LM on the mlx backend.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ACE_ROOT = Path(os.environ.get("ACE_ROOT", Path.home() / "ml/music/ace-step-1.5"))


def git_rev(path: Path) -> str:
    try:
        return subprocess.check_output(["git", "-C", str(path), "rev-parse", "HEAD"], text=True).strip()
    except Exception:
        return "unknown"


def peak_mem_gb() -> float | None:
    try:
        import mlx.core as mx

        fn = getattr(mx, "get_peak_memory", None) or mx.metal.get_peak_memory
        return round(fn() / 1e9, 2)
    except Exception:
        return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dit", default="acestep-v15-xl-sft")
    ap.add_argument("--lm", default="acestep-5Hz-lm-4B", help="'none' disables LM thinking")
    ap.add_argument("--styles", default="piano,orchestral,folk")
    ap.add_argument("--seeds", default="101")
    ap.add_argument("--duration", type=float, default=None)
    ap.add_argument("--steps", type=int, default=None)
    ap.add_argument("--guidance", type=float, default=None)
    ap.add_argument("--shift", type=float, default=3.0)
    ap.add_argument("--tag", default=None, help="file-name prefix (default: derived from dit+lm)")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    os.chdir(ACE_ROOT)
    sys.path.insert(0, str(ACE_ROOT))
    from acestep.handler import AceStepHandler
    from acestep.inference import GenerationConfig, GenerationParams, generate_music
    from acestep.llm_inference import LLMHandler

    briefs = json.loads((HERE / "briefs.json").read_text())
    shared = briefs["shared"]
    turbo = "turbo" in args.dit
    steps = args.steps or (8 if turbo else 50)
    guidance = args.guidance if args.guidance is not None else (1.0 if turbo else 7.0)
    use_lm = args.lm != "none"
    short = {"acestep-v15-": "", "acestep-5Hz-lm-": "lm"}
    tag = args.tag or "ace-" + args.dit.replace("acestep-v15-", "") + ("-" + args.lm.replace("acestep-5Hz-lm-", "lm") if use_lm else "-nolm")
    del short

    t0 = time.time()
    dit = AceStepHandler()
    msg, ok = dit.initialize_service(project_root=str(ACE_ROOT), config_path=args.dit, device="auto", use_mlx_dit=True)
    if not ok:
        raise SystemExit(f"DiT init failed: {msg}")
    llm = LLMHandler()
    if use_lm:
        msg, ok = llm.initialize(checkpoint_dir=str(ACE_ROOT / "checkpoints"), lm_model_path=args.lm, backend="mlx", device="auto")
        if not ok:
            raise SystemExit(f"LM init failed: {msg}")
    load_s = round(time.time() - t0, 1)
    print(f"[gen_ace_step] loaded {args.dit} + {args.lm} in {load_s}s", flush=True)

    out_root = Path(args.out)
    tmp = out_root / "_tmp_ace"
    for style in args.styles.split(","):
        s = briefs["styles"][style]
        dur = args.duration or shared["duration_s"]
        for seed in [int(x) for x in args.seeds.split(",")]:
            dest = out_root / style / f"{tag}-{seed}.wav"
            if dest.exists():
                print(f"[gen_ace_step] have {dest}", flush=True)
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            params = GenerationParams(
                task_type="text2music",
                caption=s["ace_caption"],
                lyrics="[Instrumental]",
                instrumental=True,
                bpm=s["bpm"],
                keyscale=s["key"],
                timesignature="4",
                duration=dur,
                inference_steps=steps,
                guidance_scale=guidance,
                shift=args.shift,
                seed=seed,
                thinking=use_lm,
            )
            cfg = GenerationConfig(batch_size=1, use_random_seed=False, seeds=[seed], audio_format="wav")
            t1 = time.time()
            res = generate_music(dit, llm, params, cfg, save_dir=str(tmp))
            dt = round(time.time() - t1, 1)
            if not res.success or not res.audios:
                print(f"[gen_ace_step] FAIL {style} {seed}: {res.error}", flush=True)
                continue
            a = res.audios[0]
            shutil.move(a["path"], dest)
            p = a.get("params", {}) or {}
            meta = res.extra_outputs.get("lm_metadata") or {}
            side = {
                "model": "ACE-Step 1.5",
                "variant": args.dit,
                "lm": args.lm,
                "code_commit": git_rev(ACE_ROOT),
                "backend": "MLX (DiT + 5Hz LM)",
                "style": style,
                "seed": seed,
                "prompt": s["ace_caption"],
                "lyrics": "[Instrumental]",
                "bpm": s["bpm"],
                "key": s["key"],
                "timesig": "4/4",
                "duration_s": dur,
                "steps": steps,
                "guidance": guidance,
                "shift": args.shift,
                "gen_time_s": dt,
                "model_load_s": load_s,
                "mlx_peak_gb": peak_mem_gb(),
                "lm_metadata": {k: v for k, v in meta.items() if isinstance(v, (str, int, float))} if isinstance(meta, dict) else None,
                "resolved": {k: p.get(k) for k in ("bpm", "keyscale", "timesignature", "duration", "cot_caption") if k in p},
            }
            dest.with_suffix(".json").write_text(json.dumps(side, indent=2))
            print(f"[gen_ace_step] {style} seed={seed} {dt}s -> {dest}", flush=True)
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
