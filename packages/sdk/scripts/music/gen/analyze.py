"""Objective checks for the Music v2 bake-off takes (nobody can listen from here, so measure).

    ~/ml/music/analysis/.venv/bin/python scripts/music/gen/analyze.py <raw-dir> [--force]

For every <raw-dir>/<style>/<take>.wav with a .json sidecar, writes <take>.metrics.json:
  loudness    ffmpeg ebur128: integrated LUFS, LRA, true peak
  clipping    samples at |x| >= 0.999 (and runs of them)
  silence     ffmpeg silencedetect (-45 dB, >= 1 s): longest gap that is not the head/tail
  spectrum    librosa: centroid, 95 % rolloff, flatness, energy share above 12 kHz / below 60 Hz
  tempo       librosa beat tracker vs the brief's BPM (half/double tolerated)
  key         Krumhansl-Schmuckler on mean CQT chroma vs D major (relative B minor accepted)
  loop seam   best loop (start in the first 40 %, >= 16 bars long (8 for < 60 s takes, 2 for < 30 s), whole bars at the brief's BPM)
              scored by chroma+MFCC similarity of the 2 s either side of the two cut points + level match
  vocals      htdemucs source separation: vocal-stem energy share + fraction of 1 s windows with a voice
              above -20 dB of the mix (the real instrumental check; CLAP's vocal guess is kept for reference)
  CLAP        laion/clap-htsat-fused (larger_clap_music ships untrained-looking logit scales and
              near-identical text embeddings - unusable): which of the three style briefs the audio matches best
              (softmax over the 3), and a vocals-vs-instrumental score
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
CLAP_DIR = Path(os.environ.get("CLAP_WEIGHTS", Path.home() / "projects/weights/manual/laion/clap-htsat-fused"))

STYLE_TEXT = {
    "piano": "sparse solo piano with soft ambient pads, calm open-world video game music",
    "orchestral": "warm cinematic orchestra with strings, flute, harp and choir, fantasy film score",
    "folk": "folk adventure music with fiddle, acoustic guitar, marimba and hand percussion, sea shanty",
}
VOCAL_TEXT = ["a person singing lyrics, lead vocals, a song with a singer", "instrumental music with no vocals"]

MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def ffmpeg_loudness(path: Path) -> dict:
    p = subprocess.run(["ffmpeg", "-nostats", "-hide_banner", "-i", str(path), "-filter_complex", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True)
    tail = p.stderr[p.stderr.rfind("Summary:"):]
    get = lambda pat: float(m.group(1)) if (m := re.search(pat, tail)) else None  # noqa: E731
    return {"lufs": get(r"I:\s+(-?[\d.]+) LUFS"), "lra": get(r"LRA:\s+(-?[\d.]+) LU"), "true_peak_dbfs": get(r"Peak:\s+(-?[\d.]+) dBFS")}


def ffmpeg_silences(path: Path, dur: float) -> dict:
    p = subprocess.run(["ffmpeg", "-nostats", "-hide_banner", "-i", str(path), "-af", "silencedetect=noise=-45dB:d=1.0", "-f", "null", "-"],
                       capture_output=True, text=True)
    starts = [float(x) for x in re.findall(r"silence_start: (-?[\d.]+)", p.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end: (-?[\d.]+)", p.stderr)]
    gaps = []
    for i, s in enumerate(starts):
        e = ends[i] if i < len(ends) else dur
        gaps.append((max(s, 0.0), e))
    internal = [(s, e) for s, e in gaps if s > 0.5 and e < dur - 0.5]
    head = next((e for s, e in gaps if s <= 0.5), 0.0)
    tail = next((dur - s for s, e in gaps if e >= dur - 0.5), 0.0)
    return {
        "longest_internal_gap_s": round(max((e - s for s, e in internal), default=0.0), 2),
        "internal_gaps": len(internal),
        "head_silence_s": round(head, 2),
        "tail_silence_s": round(tail, 2),
        "total_silence_s": round(sum(e - s for s, e in gaps), 2),
    }


def key_estimate(chroma_mean: np.ndarray) -> dict:
    scores = []
    for i in range(12):
        scores.append((np.corrcoef(np.roll(MAJOR, i), chroma_mean)[0, 1], f"{NOTES[i]} major"))
        scores.append((np.corrcoef(np.roll(MINOR, i), chroma_mean)[0, 1], f"{NOTES[i]} minor"))
    scores.sort(reverse=True)
    target = {s: c for c, s in scores}
    rank = [s for _, s in scores].index("D major") + 1
    return {
        "best_key": scores[0][1],
        "best_r": round(float(scores[0][0]), 3),
        "d_major_r": round(float(target["D major"]), 3),
        "d_major_rank": rank,
        "key_ok": scores[0][1] in ("D major", "B minor") or rank <= 2,
    }


def loop_seam(y: np.ndarray, sr: int, bpm: float, dur: float, beats_per_bar: int = 4) -> dict:
    if type(beats_per_bar) is not int or not 1 <= beats_per_bar <= 12:
        raise ValueError("Loop meter must be one to twelve beats per bar")
    hop = 512
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop)
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=20, hop_length=hop)
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    mfcc = (mfcc - mfcc.mean(1, keepdims=True)) / (mfcc.std(1, keepdims=True) + 1e-6)
    feat = np.vstack([chroma, 0.5 * mfcc])
    fps = sr / hop
    w = int(2.0 * fps)
    bar = beats_per_bar * 60.0 / bpm
    best = {"score": -1.0}

    def win(i: int, left: bool) -> np.ndarray:
        return feat[:, i - w:i] if left else feat[:, i:i + w]

    def cos(a: np.ndarray, b: np.ndarray) -> float:
        a, b = a.flatten(), b.flatten()
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))

    step = 0.25
    a = 2.0
    min_bars = 16 if dur >= 60 else (8 if dur >= 30 else 2)  # 47 s SAO takes hold 8+ bars, 11 s SAO Small 2+
    best["min_bars"] = min_bars
    while a <= 0.4 * dur:
        nb = min_bars
        while a + nb * bar <= dur - 2.2:
            b = a + nb * bar
            ia, ib = int(a * fps), int(b * fps)
            if ia - w < 0 or ib + w > feat.shape[1]:
                nb += 1
                continue
            sim = 0.5 * (cos(win(ia, False), win(ib, False)) + cos(win(ia, True), win(ib, True)))
            ra = float(rms[ia - w:ia + w].mean())
            rb = float(rms[ib - w:ib + w].mean())
            level = min(ra, rb) / (max(ra, rb) + 1e-9)
            score = sim * (0.7 + 0.3 * level)
            if score > best["score"]:
                best = {"min_bars": min_bars, "score": round(score, 3), "similarity": round(sim, 3), "level_match": round(level, 3),
                        "start_s": round(a, 2), "end_s": round(b, 2), "bars": nb, "loop_s": round(b - a, 2)}
            nb += 1
        a += step
    return best


def _tensor(out):
    # transformers >= 5 returns a ModelOutput from get_*_features; older versions return the tensor
    return out if hasattr(out, "norm") else (out.pooler_output if getattr(out, "pooler_output", None) is not None else out[0])


class Clap:
    def __init__(self) -> None:
        import torch
        from transformers import ClapModel, ClapProcessor

        self.torch = torch
        self.model = ClapModel.from_pretrained(str(CLAP_DIR)).eval()
        self.proc = ClapProcessor.from_pretrained(str(CLAP_DIR))
        texts = [STYLE_TEXT[k] for k in ("piano", "orchestral", "folk")] + VOCAL_TEXT
        with torch.no_grad():
            t = self.proc(text=texts, return_tensors="pt", padding=True)
            self.text = torch.nn.functional.normalize(_tensor(self.model.get_text_features(**t)), dim=-1)

    def score(self, y48: np.ndarray) -> dict:
        torch = self.torch
        seg = 48000 * 10
        chunks = [y48[i:i + seg] for i in range(0, max(len(y48) - seg // 2, 1), seg)]
        chunks = [c for c in chunks if np.sqrt((c ** 2).mean()) > 1e-3] or chunks[:1]
        with torch.no_grad():
            a = self.proc(audio=chunks, sampling_rate=48000, return_tensors="pt")
            emb = torch.nn.functional.normalize(_tensor(self.model.get_audio_features(**a)), dim=-1).mean(0, keepdim=True)
            emb = torch.nn.functional.normalize(emb, dim=-1)
            sims = (emb @ self.text.T)[0]
        scale = float(self.model.logit_scale_a.exp())  # the model's own audio-text logit scale
        p = torch.softmax(sims[:3] * scale, 0).tolist()
        v = torch.softmax(sims[3:] * scale, 0).tolist()
        return {
            "style_prob": {k: round(x, 3) for k, x in zip(("piano", "orchestral", "folk"), p)},
            "style_sim": {k: round(float(x), 4) for k, x in zip(("piano", "orchestral", "folk"), sims[:3])},
            "vocal_prob": round(v[0], 3),
        }


DEMUCS_DIR = Path(os.environ.get("DEMUCS_WEIGHTS", Path.home() / "projects/weights/manual/facebook/demucs"))


class Vocals:
    """Source separation (htdemucs, local repo in the weight store): how much of the take is a voice.
    CLAP's vocal guess called every full-band take vocal; a separated vocal stem is the real test.
    Demucs bleeds lead instruments (fiddle, flute, whistle) into the vocal stem a little, so treat a
    share under ~10 % as instrumental."""

    def __init__(self) -> None:
        import torch
        from demucs.pretrained import get_model

        self.torch = torch
        self.model = get_model("htdemucs", repo=DEMUCS_DIR).eval()
        self.dev = os.environ.get("DEMUCS_DEVICE", "cpu")
        self.model.to(self.dev)

    def score(self, y_st: np.ndarray, sr: int) -> dict:
        from demucs.apply import apply_model

        torch = self.torch
        msr = self.model.samplerate
        y = y_st.T.astype(np.float32)
        if y.shape[0] == 1:
            y = np.vstack([y, y])
        if sr != msr:
            y = librosa.resample(y, orig_sr=sr, target_sr=msr)
        mix = torch.from_numpy(y)[None]
        with torch.no_grad():
            stems = apply_model(self.model, mix, device=self.dev, split=True, overlap=0.1)[0]
        vi = self.model.sources.index("vocals")
        voc = stems[vi].numpy()
        tot = float((stems.numpy() ** 2).sum()) + 1e-12
        share = float((voc ** 2).sum()) / tot
        win = msr  # 1 s windows: how much of the time is there a voice above -20 dB of the mix
        n = voc.shape[1] // win
        vr = np.array([np.sqrt((voc[:, i * win:(i + 1) * win] ** 2).mean()) for i in range(n)])
        mr = np.array([np.sqrt((y[:, i * win:(i + 1) * win] ** 2).mean()) for i in range(n)]) + 1e-9
        active = float((20 * np.log10(vr / mr + 1e-9) > -20).mean()) if n else 0.0
        st = stems.numpy()
        shares = {src: round(float((st[i] ** 2).sum()) / tot, 4) for i, src in enumerate(self.model.sources)}
        # groove continuity for the v3 tension layer: share of 1 s windows where drums+bass sit within 20 dB of the mix
        gb = st[self.model.sources.index("drums")] + st[self.model.sources.index("bass")]
        gr = np.array([np.sqrt((gb[:, i * win:(i + 1) * win] ** 2).mean()) for i in range(n)])
        groove = float((20 * np.log10(gr / mr + 1e-9) > -20).mean()) if n else 0.0
        dr = st[self.model.sources.index("drums")]
        drr = np.array([np.sqrt((dr[:, i * win:(i + 1) * win] ** 2).mean()) for i in range(n)])
        drums_active = float((20 * np.log10(drr / mr + 1e-9) > -24).mean()) if n else 0.0
        return {"vocal_energy_share": round(share, 4), "vocal_active_frac": round(active, 3), "stem_share": shares,
                "groove_active_frac": round(groove, 3), "drums_active_frac": round(drums_active, 3)}


def analyze(wav: Path, side: dict, brief: dict, clap: Clap | None, vocals: Vocals | None = None) -> dict:
    info = sf.info(str(wav))
    dur = info.duration
    y_st, sr = sf.read(str(wav), always_2d=True)
    clip = np.abs(y_st) >= 0.999
    m: dict = {"duration_s": round(dur, 2), "sample_rate": sr, "channels": info.channels}
    m["loudness"] = ffmpeg_loudness(wav)
    m["clipping"] = {"clipped_samples": int(clip.sum()), "clipped_frac": float(clip.mean()), "peak": round(float(np.abs(y_st).max()), 4)}
    m["silence"] = ffmpeg_silences(wav, dur)
    y = y_st.mean(1).astype(np.float32)
    y22 = librosa.resample(y, orig_sr=sr, target_sr=22050)
    S = np.abs(librosa.stft(y, n_fft=4096, hop_length=2048)) ** 2
    freqs = librosa.fft_frequencies(sr=sr, n_fft=4096)
    tot = S.sum() + 1e-12
    m["spectrum"] = {
        "centroid_hz": round(float(librosa.feature.spectral_centroid(S=np.sqrt(S), sr=sr).mean()), 1),
        "rolloff95_hz": round(float(librosa.feature.spectral_rolloff(S=np.sqrt(S), sr=sr, roll_percent=0.95).mean()), 1),
        "flatness": round(float(librosa.feature.spectral_flatness(S=np.sqrt(S)).mean()), 4),
        "hf_above_12k": round(float(S[freqs > 12000].sum() / tot), 5),
        "sub_below_60": round(float(S[freqs < 60].sum() / tot), 4),
        "stereo_corr": round(float(np.corrcoef(y_st[:, 0], y_st[:, 1])[0, 1]), 3) if info.channels == 2 else 1.0,
    }
    tempo, _ = librosa.beat.beat_track(y=y22, sr=22050)
    tempo = float(np.atleast_1d(tempo)[0])
    bpm = float(brief["bpm"])
    err = min(abs(t - bpm) / bpm for t in (tempo, tempo * 2, tempo / 2))
    m["tempo"] = {"estimated_bpm": round(tempo, 1), "brief_bpm": bpm, "rel_err": round(err, 3)}
    chroma = librosa.feature.chroma_cqt(y=y22, sr=22050)
    m["key"] = key_estimate(chroma.mean(1))
    loop_bpm = bpm if err < 0.04 else (tempo if tempo > 0 else bpm)
    m["loop"] = loop_seam(y22, 22050, loop_bpm, dur, brief.get("beatsPerBar", 4))
    m["loop"]["beats_per_bar"] = brief.get("beatsPerBar", 4)
    m["loop"]["grid_bpm"] = round(loop_bpm, 1)
    if clap is not None:
        y48 = librosa.resample(y, orig_sr=sr, target_sr=48000) if sr != 48000 else y
        m["clap"] = clap.score(y48)
    if vocals is not None:
        m["vocals"] = vocals.score(y_st, sr)
    return m


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("raw")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--no-clap", action="store_true")
    ap.add_argument("--only-vocals", action="store_true", help="add the demucs vocal check to existing metrics")
    args = ap.parse_args()
    briefs = json.loads((HERE / "briefs.json").read_text())
    clap = None if (args.no_clap or args.only_vocals) else Clap()
    vocals = Vocals()
    for wav in sorted(Path(args.raw).glob("*/*.wav")):
        side_p = wav.with_suffix(".json")
        out = wav.with_suffix(".metrics.json")
        if args.only_vocals and out.exists() and side_p.exists():
            m = json.loads(out.read_text())
            if "vocals" in m and not args.force:
                continue
            y_st, sr = sf.read(str(wav), always_2d=True)
            m["vocals"] = vocals.score(y_st, sr)
            out.write_text(json.dumps(m, indent=2))
            print(f"{wav.parent.name}/{wav.name}: vocals {m['vocals']}", flush=True)
            continue
        if not side_p.exists() or (out.exists() and not args.force):
            continue
        side = json.loads(side_p.read_text())
        brief = briefs["styles"].get(side["style"]) or {"bpm": side.get("bpm") or 100}  # v3 stings / sfx have no style brief
        m = analyze(wav, side, brief, clap, vocals)
        out.write_text(json.dumps(m, indent=2))
        c = m.get("clap", {})
        print(f"{wav.parent.name}/{wav.name}: {m['loudness']['lufs']} LUFS, tempo {m['tempo']['estimated_bpm']}, "
              f"key {m['key']['best_key']}, seam {m['loop']['score']}, style {c.get('style_prob')}, vocals {m.get('vocals')}", flush=True)


if __name__ == "__main__":
    sys.exit(main())
