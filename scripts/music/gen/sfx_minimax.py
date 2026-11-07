"""SFX round 2: file MiniMax Music 3's sound-effect takes for sfx_build.py, each trimmed to its best-matching segment.

    ~/ml/music/analysis/.venv/bin/python scripts/music/gen/sfx_minimax.py <minimax-out> <sfx-raw>

<minimax-out>/sfx-<family>/minimax3-<seed>.wav (gen_minimax.py --jobs sfx-minimax-jobs.json) ->
<sfx-raw>/minimax/<family>/<seed>.wav + .json. The trim: CLAP (clap-htsat-fused) scores every window of the family's
length (beds 8 s, hums 6 s, one-shots 1.5-3 s, hop 0.25 s) against the family description; the best window is kept.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from analyze import CLAP_DIR, _tensor  # noqa: E402


def main() -> None:
    import torch
    from transformers import ClapModel, ClapProcessor

    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    fams = json.loads((HERE / "sfx-jobs.json").read_text())["families"]
    clap = ClapModel.from_pretrained(str(CLAP_DIR)).eval()
    proc = ClapProcessor.from_pretrained(str(CLAP_DIR))
    for wav in sorted(src.glob("sfx-*/minimax3-*.wav")):
        fam = wav.parent.name[len("sfx-"):]
        side = json.loads(wav.with_suffix(".json").read_text())
        j = fams[fam]
        x, sr = sf.read(str(wav), always_2d=True)
        win = {"bed": 8.0, "hum": 6.0}.get(j["kind"], min(max(float(j["duration"]), 1.5), 3.0))
        y48 = librosa.resample(x.mean(1).astype(np.float32), orig_sr=sr, target_sr=48000)
        starts = np.arange(0, max(len(y48) / 48000 - win, 0) + 1e-6, 0.25)
        with torch.no_grad():
            t = torch.nn.functional.normalize(_tensor(clap.get_text_features(**proc(text=[j["desc"]], return_tensors="pt"))), dim=-1)
            chunks = [y48[int(s * 48000): int((s + win) * 48000)] for s in starts]
            a = torch.nn.functional.normalize(_tensor(clap.get_audio_features(**proc(audio=chunks, sampling_rate=48000, return_tensors="pt"))), dim=-1)
            sims = (a @ t.T)[:, 0]
        k = int(sims.argmax())
        s0 = float(starts[k])
        seg = x[int(s0 * sr): int((s0 + win) * sr)]
        out = dst / "minimax" / fam / f"{side['seed']}.wav"
        out.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(out), seg, sr)
        out.with_suffix(".json").write_text(json.dumps({
            "model": "MiniMax Music 3", "repo": "MiniMaxAI/MiniMax-Music3", "code_commit": side["code_commit"],
            "family": fam, "kind": j["kind"], "seed": side["seed"], "prompt": side["prompt"], "desc": j["desc"],
            "duration_s": win, "steps": side["steps"], "gen_time_s": side["gen_time_s"], "mps_driver_gb": side.get("mps_driver_gb"),
            "trimmed_from_s": round(s0, 2), "rendered_s": round(len(x) / sr, 2)}, indent=2))
        print(f"{fam} seed {side['seed']}: best {win:.1f} s window at {s0:.2f} s (CLAP sim {float(sims[k]):.3f})")


if __name__ == "__main__":
    main()
