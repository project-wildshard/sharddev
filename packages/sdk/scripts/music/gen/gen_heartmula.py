"""HeartMuLa (RL-oss-3B-20260123 + HeartCodec-oss-20260123) bake-off generator, MLX port.

Runs in the heartlib-mlx checkout's venv, outside this repo:

    cd ~/ml/music/heartlib-mlx
    /usr/bin/time -l uv run python <repo>/scripts/music/gen/gen_heartmula.py \
        --styles piano,orchestral,folk --seeds 101,102 --out <scratch>/bakeoff-raw

Same sampling loop as heartlib-mlx's generate.py (CFG batch of 2, top-k, 12.5 Hz frames), plus:
  * a seed (mx.random.seed) so takes are reproducible;
  * STEREO output. heartlib-mlx's HeartCodec.detokenize() averages the codec's two decoded
    streams into mono; upstream HeartCodec returns them as the L/R channels, so this script
    re-implements the tail of detokenize() and keeps both.
Weights: ckpt/ are symlinks into ~/projects/weights/manual/HeartMuLa/; ckpt-mlx/ is the MLX
conversion, kept in ~/projects/weights/store/heartlib-mlx/.
"""

from __future__ import annotations

import argparse
import gc
import json
import os
import subprocess
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
HM_ROOT = Path(os.environ.get("HM_ROOT", Path.home() / "ml/music/heartlib-mlx"))


def git_rev(path: Path) -> str:
    try:
        return subprocess.check_output(["git", "-C", str(path), "rev-parse", "HEAD"], text=True).strip()
    except Exception:
        return "unknown"


def detokenize_stereo(codec, codes, duration: float, num_steps: int = 10, guidance_scale: float = 1.25):
    import mlx.core as mx

    frame_rate = codec.config.frame_rate
    target = int(duration * frame_rate)
    if codes.shape[1] < target:
        pad = mx.zeros((codes.shape[0], target - codes.shape[1], codes.shape[2]), dtype=codes.dtype)
        codes = mx.concatenate([codes, pad], axis=1)
    codes = codes[:, :target, :]
    lat = codec.flow_matching(codes=codes, num_steps=num_steps, guidance_scale=guidance_scale)
    b, t, f = lat.shape
    lat = lat.reshape(b, t, 2, f // 2).transpose(0, 2, 1, 3).reshape(b * 2, t, f // 2)
    audio = codec.scalar_model.decode(lat)  # (b*2, samples, 1)
    audio = audio.reshape(b, 2, audio.shape[1])[:, :, : int(duration * codec.config.sample_rate)]
    return audio[0]  # (2, samples)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--styles", default="piano,orchestral,folk")
    ap.add_argument("--seeds", default="101")
    ap.add_argument("--duration", type=float, default=None)
    ap.add_argument("--cfg-scale", type=float, default=1.5)
    ap.add_argument("--temperature", type=float, default=1.0)
    ap.add_argument("--topk", type=int, default=50)
    ap.add_argument("--ckpt", default=str(HM_ROOT / "ckpt-mlx"))
    ap.add_argument("--variant", default="HeartMuLa-RL-oss-3B-20260123")
    ap.add_argument("--tag", default="heartmula-rl3b")
    ap.add_argument("--tags-key", default="heartmula_tags", help="which briefs.json tag string to send")
    ap.add_argument("--lyrics", default="", help='structure-only lyrics, e.g. "[intro]\\n[instrumental]\\n[outro]"')
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    import mlx.core as mx
    import numpy as np
    import soundfile as sf
    from tokenizers import Tokenizer

    from heartlib_mlx.heartcodec import HeartCodec
    from heartlib_mlx.heartmula import HeartMuLa

    briefs = json.loads((HERE / "briefs.json").read_text())
    t0 = time.time()
    model = HeartMuLa.from_pretrained(f"{args.ckpt}/heartmula")
    codec = HeartCodec.from_pretrained(f"{args.ckpt}/heartcodec")
    model.set_dtype(mx.bfloat16)
    tok = Tokenizer.from_file(str(HM_ROOT / "ckpt" / "tokenizer.json"))
    load_s = round(time.time() - t0, 1)
    print(f"[gen_heartmula] loaded in {load_s}s", flush=True)

    bos, eos, audio_eos, ncb = 128000, 128001, 8193, 8
    par = ncb + 1
    fr = 12.5
    for style in args.styles.split(","):
        s = briefs["styles"][style]
        dur = args.duration or briefs["shared"]["duration_s"]
        for seed in [int(x) for x in args.seeds.split(",")]:
            dest = Path(args.out) / style / f"{args.tag}-{seed}.wav"
            if dest.exists():
                print(f"[gen_heartmula] have {dest}", flush=True)
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            mx.random.seed(seed)
            mx.reset_peak_memory()
            t1 = time.time()
            ids = tok.encode(f"<tag>{s[args.tags_key]}</tag>".lower()).ids
            if ids[0] != bos:
                ids = [bos] + ids
            if ids[-1] != eos:
                ids = ids + [eos]
            lyr = args.lyrics.replace("\\n", "\n")
            lids = []
            if lyr:
                lids = tok.encode(lyr.lower()).ids
                if lids[0] != bos:
                    lids = [bos] + lids
                if lids[-1] != eos:
                    lids = lids + [eos]
            plen = len(ids) + 1 + len(lids)
            pt = np.zeros((plen, par), dtype=np.int64)
            pt[: len(ids), -1] = ids
            if lids:
                pt[len(ids) + 1:, -1] = lids
            pm = np.zeros((plen, par), dtype=np.float32)
            pm[:, -1] = 1.0
            tokens = mx.concatenate([mx.array(pt)[None]] * 2, axis=0)
            mask = mx.concatenate([mx.array(pm)[None]] * 2, axis=0)
            pos = mx.broadcast_to(mx.arange(plen)[None, :], (2, plen))
            model.setup_caches(2)
            cur = model.generate_frame(
                tokens=tokens, tokens_mask=mask, input_pos=pos, temperature=args.temperature, topk=args.topk,
                cfg_scale=args.cfg_scale, continuous_segments=mx.zeros((2, model.config.muq_dim)), starts=[len(ids), len(ids)],
            )
            mx.eval(cur)
            frames = [cur[0:1]]
            nmax = int(dur * fr)
            eos_at = None
            for i in range(nmax - 1):
                padded = mx.concatenate([cur[:, None, :], mx.zeros((2, 1, 1), dtype=mx.int32)], axis=-1)
                pmask = mx.concatenate([mx.ones((2, 1, ncb)), mx.zeros((2, 1, 1))], axis=-1)
                cur = model.generate_frame(
                    tokens=padded, tokens_mask=pmask, input_pos=pos[:, -1:] + i + 1,
                    temperature=args.temperature, topk=args.topk, cfg_scale=args.cfg_scale,
                )
                mx.eval(cur)
                if (i + 1) % 25 == 0:
                    mx.clear_cache()
                    gc.collect()
                if mx.any(cur[0] >= audio_eos).item():
                    eos_at = i + 1
                    break
                frames.append(cur[0:1])
            gen_s = time.time() - t1
            codes = mx.concatenate(frames, axis=0)[None]
            got = len(frames) / fr
            audio = detokenize_stereo(codec, codes, duration=got)
            mx.eval(audio)
            wav = np.array(audio.astype(mx.float32)).T  # (samples, 2)
            sf.write(str(dest), wav, codec.config.sample_rate)
            dt = round(time.time() - t1, 1)
            side = {
                "model": "HeartMuLa",
                "variant": args.variant,
                "codec": "HeartCodec-oss-20260123",
                "code_commit": "heartlib-mlx " + git_rev(HM_ROOT),
                "backend": "MLX (heartlib-mlx port, bf16 LM, fp32 codec)",
                "style": style,
                "seed": seed,
                "prompt": s[args.tags_key],
                "lyrics": lyr,
                "duration_s": round(got, 2),
                "requested_s": dur,
                "early_eos_frame": eos_at,
                "cfg_scale": args.cfg_scale,
                "temperature": args.temperature,
                "topk": args.topk,
                "gen_time_s": dt,
                "lm_time_s": round(gen_s, 1),
                "model_load_s": load_s,
                "mlx_peak_gb": round(mx.get_peak_memory() / 1e9, 2),
                "note": "no BPM/key conditioning in HeartMuLa - tags only",
            }
            dest.with_suffix(".json").write_text(json.dumps(side, indent=2))
            print(f"[gen_heartmula] {style} seed={seed} {dt}s ({got:.1f}s audio) -> {dest}", flush=True)
            model.reset_caches()


if __name__ == "__main__":
    main()
