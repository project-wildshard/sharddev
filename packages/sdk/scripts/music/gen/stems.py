"""MUSIC.md v3 row 5: turn each slot's pick into the game's files - demucs stems, bar-exact loops, -18 LUFS, AAC.

    ~/ml/music/analysis/.venv/bin/python scripts/music/gen/stems.py <raw3-dir> [--style piano] [--pick piano/pine=minimax3-303 ...]

Reads the picks from scripts/music/gen/v3-<style>.json (rank_v3.py); --pick overrides one (after the user's veto).
Writes public/assets/music/<style>/ :
  pine-calm-<h>.m4a  pine-tension-<h>.m4a  island-calm-<h>.m4a  island-tension-<h>.m4a  title-<h>.m4a
  sting-pickup-<h>.m4a  sting-death-<h>.m4a  sting-chunk-<h>.m4a  music.json   (<h> = content hash, see 6.)
and scripts/music/gen/v3-<style>-build.json (every decision: grid, loop search, gains, sizes).

Per loop slot (pine / island):
  1. htdemucs splits the take (44.1 kHz) into drums / bass / other / vocals; residual = mix - sum(stems).
  2. calm    = mix - drums - bass/2   (= other + vocals-stem + residual + bass at -6 dB; the vocals stem of an
               instrumental take is lead-instrument bleed. If it holds a real voice - over 3 % of the energy -
               it is dropped from calm instead.)
     tension = drums + bass/2         so calm + tension == the original mix, sample for sample.
  3. Beats: librosa's detected beats (MiniMax does not play to a click, so a straight-line grid drifts off them).
  4. Loop: loopStart on a detected downbeat, loopEnd on the detected beat 4*N beats later; the manifest's bpm is
     defined as 4N beats over that span, so the loop is exactly N bars by construction. Seam score = chroma + MFCC
     similarity over 2 s either side of both cut points x level match; the longest loop within 0.06 of the best
     seam wins (less repetition); length capped so a style fits 5 MB.
  5. Seam: the last bar before loopEnd is crossfaded (equal-gain) into the bar before loopStart, so the audio at
     loopEnd continues exactly as it did at loopStart; after loopEnd the file carries 1 bar of the loop's start,
     faded out, for a player that runs off the end. Same operation on both stems, so they stay sample-aligned.
  6. One gain for both stems: calm integrated loudness -> -18 LUFS; then ONE lookahead limiter curve (driven by the
     mix and by calm alone, ceiling PEAK_DB) multiplies both stems, so peaks are caught without lowering the whole
     loop and calm + tension is still the mix.
  File names are content-addressed (<slot>-calm-<sha1[:8]>.m4a ...): the service worker serves audio cache-first, so
  a changed file must never keep its old name.
  7. AAC-LC 48 kHz: calm stereo 96 kb/s, tension MONO 64 kb/s (the phone holds both decoded: ~25 MB per stereo
     66 s stem). Loop points are then re-measured on the DECODED files (ffmpeg honours the mp4 edit list the way
     decodeAudioData does): the decoder lag is added to them, calm and tension must decode to the same length
     (< 50 ms apart) and the same lag, and loopEnd must sit inside the decoded length.
  loopStart is always a DOWNBEAT: of the 4 beat phases, the one whose beats carry the most low-band (< 200 Hz)
  onset energy in the drums + bass stem.
Title: the full mix, same beats / loop / seam, -18 LUFS. Stings: CUT from the style's own takes (cut_stings: the
title's final chord = death, its biggest downbeat swell = chunk, the Pine Hollow take's brightest onset = pickup),
faded, -16 LUFS so they sit just above the score. MiniMax's own 6 s sting renders did not work (see v3-jobs.json).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
OUT = REPO / "public/assets/music"
DEMUCS_DIR = Path(os.environ.get("DEMUCS_WEIGHTS", Path.home() / "projects/weights/manual/facebook/demucs"))
LICENCE = "MiniMax-Music3 Community (UI credit, < $20M)"
MAX_LOOP_S = 64.0     # loop body cap: 2 slots x 2 stems x ~66 s + title + stings at 96 kb/s stays under 5 MB
TITLE_MAX_S = 72.0
CALM_LUFS = -18.0
STING_LUFS = -16.0
PEAK_DB = -2.0       # sample-peak ceiling of the limiter before AAC (the encoder overshoots ~1 dB)


def lufs(x: np.ndarray, sr: int) -> tuple[float, float]:
    """integrated LUFS and true peak (dBFS) via ffmpeg ebur128"""
    with tempfile.NamedTemporaryFile(suffix=".wav") as f:
        sf.write(f.name, x.T, sr, subtype="FLOAT")
        p = subprocess.run(["ffmpeg", "-nostats", "-hide_banner", "-i", f.name, "-filter_complex", "ebur128=peak=true",
                            "-f", "null", "-"], capture_output=True, text=True)
    tail = p.stderr[p.stderr.rfind("Summary:"):]
    i = re.search(r"I:\s+(-?[\d.]+) LUFS", tail)
    pk = re.search(r"Peak:\s+(-?[\d.]+) dBFS", tail)
    return (float(i.group(1)) if i else -70.0), (float(pk.group(1)) if pk else -70.0)


def encode(x: np.ndarray, sr: int, dest: Path, mono: bool = False, kbps: int | None = None) -> int:
    """AAC-LC in .m4a at 48 kHz; stereo 96 kb/s, or mono 64 kb/s (the tension stem: the phone keeps it decoded); `kbps` overrides"""
    dest.parent.mkdir(parents=True, exist_ok=True)
    y = librosa.resample(x, orig_sr=sr, target_sr=48000, res_type="soxr_hq") if sr != 48000 else x  # this ffmpeg has no soxr
    if mono:
        y = y.mean(0, keepdims=True)
    with tempfile.NamedTemporaryFile(suffix=".wav") as f:
        sf.write(f.name, y.T, 48000, subtype="FLOAT")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", f.name, "-ac", "1" if mono else "2", "-c:a", "aac",
                        "-b:a", f"{kbps}k" if kbps else ("64k" if mono else "96k"), "-movflags", "+faststart", str(dest)], check=True)
    return dest.stat().st_size


def decoded(path: Path) -> np.ndarray:
    """the file as a decoder sees it (ffmpeg honours the mp4 edit list, as browsers' decodeAudioData does), 48 kHz"""
    p = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", "48000", "-"],
                       capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype=np.float32)


def decode_offset(path: Path, src: np.ndarray, sr: int) -> tuple[float, float]:
    """(lag of the decoded file vs the source in seconds - positive = decoded starts late, decoded length in seconds)"""
    d = decoded(path)
    ref = librosa.resample(src.mean(0), orig_sr=sr, target_sr=48000, res_type="soxr_hq") if sr != 48000 else src.mean(0)
    n = min(len(d), len(ref), 48000 * 8)
    a, b = d[:n], ref[:n].astype(np.float32)
    c = np.fft.irfft(np.fft.rfft(a, 2 * n) * np.conj(np.fft.rfft(b, 2 * n)))
    lag = int(np.argmax(np.concatenate([c[-4096:], c[:4096]]))) - 4096
    return lag / 48000, len(d) / 48000


def separate(x: np.ndarray, sr: int) -> dict[str, np.ndarray]:
    import torch
    from demucs.apply import apply_model
    from demucs.pretrained import get_model

    model = get_model("htdemucs", repo=DEMUCS_DIR).eval()
    assert sr == model.samplerate, f"take is {sr} Hz, htdemucs wants {model.samplerate}"
    with torch.no_grad():
        st = apply_model(model, torch.from_numpy(x.astype(np.float32))[None], device="cpu", split=True, overlap=0.25, shifts=2)[0]
    return {src: st[i].numpy() for i, src in enumerate(model.sources)}


def grid(x: np.ndarray, sr: int) -> dict:
    """the detected beats (librosa) - MiniMax does not play to a click, so the loop is cut on real beats, not on a
    straight-line grid (which drifted ~0.1 s off the beats on these takes)"""
    y = librosa.resample(x.mean(0), orig_sr=sr, target_sr=22050)
    _, beats = librosa.beat.beat_track(y=y, sr=22050, units="time")
    beats = np.asarray(beats, dtype=np.float64)
    if 60 / np.median(np.diff(beats)) > 140:  # tracked at double time: keep every other beat, the parity with more onset
        env = librosa.onset.onset_strength(y=y, sr=22050)
        fr = librosa.time_to_frames(beats, sr=22050)
        fr = fr[fr < len(env)]
        beats = beats[int(np.argmax([env[fr[0::2]].sum(), env[fr[1::2]].sum()]))::2]
    ibi = np.diff(beats)
    return {"beats": beats, "median_bpm": round(float(60 / np.median(ibi)), 2), "beats_found": int(len(beats)),
            "ibi_cv": round(float(ibi.std() / ibi.mean()), 3)}


def downbeat(x_low: np.ndarray, sr: int, beats: np.ndarray) -> int:
    """which beat index mod 4 is the downbeat: the one carrying the most low-band (< 200 Hz) onset energy - kick and
    bass land on 1. x_low is the drums + bass stem (loops) or the full mix (title)."""
    y = librosa.resample(x_low.mean(0), orig_sr=sr, target_sr=22050)
    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=512))
    low = S[librosa.fft_frequencies(sr=22050, n_fft=2048) < 200].sum(0)
    onset = np.maximum(0, np.diff(low, prepend=low[0]))
    fps = 22050 / 512
    acc = np.zeros(4)
    for i, t in enumerate(beats):
        j = int(t * fps)
        acc[i % 4] += onset[max(j - 2, 0):j + 3].max(initial=0.0)
    return int(np.argmax(acc))


def find_loop(x: np.ndarray, sr: int, beats: np.ndarray, db: int, max_s: float) -> dict:
    """loopStart = a detected downbeat, loopEnd = the detected beat 4*N beats later; bpm := 4N beats / (loopEnd -
    loopStart), so the loop is exactly N bars at the manifest's bpm by construction. Seam score = chroma + MFCC
    similarity over 2 s either side of both cut points x level match; the longest loop within 0.06 of the best wins."""
    y = librosa.resample(x.mean(0), orig_sr=sr, target_sr=22050)
    hop = 512
    fps = 22050 / hop
    chroma = librosa.feature.chroma_cqt(y=y, sr=22050, hop_length=hop)
    mfcc = librosa.feature.mfcc(y=y, sr=22050, n_mfcc=20, hop_length=hop)
    mfcc = (mfcc - mfcc.mean(1, keepdims=True)) / (mfcc.std(1, keepdims=True) + 1e-6)
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    feat = np.vstack([chroma, 0.5 * mfcc])
    w = int(2.0 * fps)
    dur = x.shape[1] / sr

    def cos(a: np.ndarray, b: np.ndarray) -> float:
        a, b = a.flatten(), b.flatten()
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))

    cands = []
    for i in range(len(beats)):
        if i % 4 != db or beats[i] > 0.4 * dur:
            continue
        for nb in range(8, 64):
            j = i + 4 * nb
            if j >= len(beats):
                break
            a, b = beats[i], beats[j]
            bar = (b - a) / nb
            if b - a > max_s or b > dur - bar - 0.2 or a < bar + 0.02:   # a bar before (seam) and after (tail)
                if b - a > max_s or b > dur - bar - 0.2:
                    break
                continue
            ia, ib = int(a * fps), int(b * fps)
            if ia - w < 0 or ib + w > feat.shape[1]:
                continue
            sim = 0.5 * (cos(feat[:, ia:ia + w], feat[:, ib:ib + w]) + cos(feat[:, ia - w:ia], feat[:, ib - w:ib]))
            ra, rb = float(rms[ia - w:ia + w].mean()), float(rms[ib - w:ib + w].mean())
            level = min(ra, rb) / (max(ra, rb) + 1e-9)
            ib_ = np.diff(beats[i:j + 1])
            cands.append({"score": round(sim * (0.7 + 0.3 * level), 4), "similarity": round(sim, 3), "level_match": round(level, 3),
                          "loopStart": float(a), "loopEnd": float(b), "bars": nb, "bpm": round(240.0 * nb / (b - a), 3),
                          "beat_jitter_s": round(float(np.abs(ib_ - (b - a) / (4 * nb)).max()), 3)})
    top = max(c["score"] for c in cands)
    near = [c for c in cands if c["score"] >= top - 0.06]
    best = max(near, key=lambda c: (c["bars"], c["score"]))
    best["best_seam_score"] = top
    return best


def seam(x: np.ndarray, sr: int, loop: dict, bar: float) -> tuple[np.ndarray, float]:
    """the file: [0, loopEnd) with the last bar crossfaded into the bar before loopStart, + 1 faded bar of the loop start"""
    S, E, F = round(loop["loopStart"] * sr), round(loop["loopEnd"] * sr), round(bar * sr)
    assert S >= F, "loopStart must leave one bar before it for the seam crossfade"
    out = x[:, :E].copy()
    ramp = np.linspace(0.0, 1.0, F, endpoint=False)[None]
    out[:, E - F:E] = x[:, E - F:E] * (1 - ramp) + x[:, S - F:S] * ramp
    tail = x[:, S:S + F].copy() * np.linspace(1.0, 0.0, F)[None]
    return np.concatenate([out, tail], axis=1), (E + F) / sr


def trim_sting(x: np.ndarray, sr: int) -> np.ndarray:
    env = np.abs(x).max(0)
    thr = env.max() * 10 ** (-40 / 20)
    idx = np.where(env > thr)[0]
    a, b = max(int(idx[0]) - int(0.01 * sr), 0), min(int(idx[-1]) + int(0.05 * sr), x.shape[1])
    b = min(b, a + int(6.0 * sr))
    y = x[:, a:b].copy()
    n = int(0.15 * sr)
    y[:, -n:] *= np.linspace(1.0, 0.0, n)[None]
    return y


def _fade(y: np.ndarray, sr: int, fin: float, fout: float) -> np.ndarray:
    y = y.copy()
    a, b = int(fin * sr), int(fout * sr)
    if a:
        y[:, :a] *= np.linspace(0.0, 1.0, a)[None]
    if b:
        y[:, -b:] *= np.linspace(1.0, 0.0, b)[None] ** 1.5
    return y


def cut_stings(sources: dict[str, tuple[np.ndarray, dict]], sr: int) -> dict[str, tuple[np.ndarray, str, float, str]]:
    """three stings from the style's own takes (same instruments as the score):
    death  - the title's last 4.5 s of sound: the resolved final chord the title prompt asks for, ringing out
    chunk  - 3.5 s of the title from the downbeat with the biggest energy rise (a swell / an entrance)
    pickup - 2 s of the Pine Hollow take from its brightest strong onset (spectral centroid x onset strength)"""
    out: dict[str, tuple[np.ndarray, str, float, str]] = {}
    x, loop = sources["title"]
    env = np.abs(x).max(0)
    last = int(np.where(env > env.max() * 10 ** (-40 / 20))[0][-1])
    a = max(0, last - int(4.5 * sr))
    out["death"] = (_fade(x[:, a:last], sr, 0.35, 0.6), "title", a / sr, "the final chord")
    y = librosa.resample(x.mean(0), orig_sr=sr, target_sr=22050)
    rms = librosa.feature.rms(y=y, hop_length=512)[0]
    fps = 22050 / 512
    bar = (loop["loopEnd"] - loop["loopStart"]) / loop["bars"]
    best, t_best = -1.0, 1.0
    t = loop["loopStart"] % bar
    while t + 3.5 < x.shape[1] / sr - 5:
        i = int(t * fps)
        pre, post = rms[max(0, i - int(bar * fps)):i].mean() if i > 0 else 0.0, rms[i:i + int(bar * fps)].mean()
        rise = post / (pre + 1e-6)
        if t > 2 and rise > best:
            best, t_best = rise, t
        t += bar
    a = int(max(0.0, t_best - 0.25) * sr)
    out["chunk"] = (_fade(x[:, a:a + int(3.5 * sr)], sr, 0.25, 1.0), "title", a / sr, f"a {best:.1f}x swell on a downbeat")
    xp, _ = sources["pine"]
    yp = librosa.resample(xp.mean(0), orig_sr=sr, target_sr=22050)
    on = librosa.onset.onset_strength(y=yp, sr=22050)
    cen = librosa.feature.spectral_centroid(y=yp, sr=22050)[0][: len(on)]
    score = on[: len(cen)] * cen
    score[: int(3 * fps)] = 0
    score[-int(4 * fps):] = 0
    j = int(np.argmax(score))
    a = max(0, int((j / fps - 0.03) * sr))
    out["pickup"] = (_fade(xp[:, a:a + int(2.0 * sr)], sr, 0.01, 0.9), "pine", a / sr, "its brightest onset")
    return out


def limiter(sig: np.ndarray, sr: int, ceil_db: float, look_s: float = 0.005, hold_s: float = 0.12, smooth_s: float = 0.02) -> np.ndarray:
    """a gain curve r(t) <= 1 such that |sig * r| <= ceil everywhere: lookahead peak limiting as min-filter + moving
    average (the min window is wider than the average window, so r never exceeds the per-sample need)"""
    from scipy.ndimage import minimum_filter1d, uniform_filter1d

    ceil = 10 ** (ceil_db / 20)
    need = np.minimum(1.0, ceil / (np.abs(sig).max(0) + 1e-12))
    a = max(1, int(smooth_s * sr)) | 1
    held = minimum_filter1d(need, size=int(2 * look_s * sr + hold_s * sr + a) | 1)
    return np.minimum(uniform_filter1d(held, size=a), need)


def shipped_name(dest: Path, tmp: Path, stem: str) -> str:
    """content-addressed file name <stem>-<sha1[:8]>.m4a: the service worker serves audio cache-first, so a file whose
    content changes must never keep its old name (a re-roll or a re-master lands under a new name automatically)"""
    import hashlib

    h = hashlib.sha1(tmp.read_bytes()).hexdigest()[:8]
    name = f"{stem}-{h}.m4a"
    tmp.replace(dest / name)
    return name


def build_style(raw: Path, style: str, overrides: dict[str, str]) -> None:
    v3 = json.loads((HERE / f"v3-{style}.json").read_text())
    dest = OUT / style
    dest.mkdir(parents=True, exist_ok=True)
    for old in dest.glob("*.m4a"):  # this folder holds only this script's output
        old.unlink()
    tmpd = Path(tempfile.mkdtemp())
    manifest: dict = {"style": style, "model": "MiniMax-Music3", "credit": "Music: MiniMax-Music3", "slots": {}, "stings": {}, "provenance": []}
    report: dict = {"style": style, "slots": {}}
    total = 0

    def prov(file: str, take: dict, extra: dict | None = None) -> None:
        manifest["provenance"].append({"file": file, "model": "MiniMaxAI/MiniMax-Music3", "diffusers": "0.40.0",
                                       "prompt": take["prompt"], "lyrics": take["lyrics"], "seed": take["seed"],
                                       "steps": take["steps"], "licence": LICENCE, **(extra or {})})

    sources: dict[str, tuple[np.ndarray, dict]] = {}
    sources_take: dict[str, dict] = {}
    sr_src = 44100
    for slot in ("pine", "island", "title"):
        pid = overrides.get(f"{style}/{slot}") or v3["slots"][slot]["pick"]
        take = next(t for t in v3["slots"][slot]["takes"] if t["id"] == pid)
        x, sr = sf.read(str(raw / f"{style}-{slot}" / f"{pid}.wav"), always_2d=True)
        x = x.T.astype(np.float64)
        sr_src = sr
        g = grid(x, sr)
        st = separate(x, sr) if slot != "title" else None
        db = downbeat(st["drums"] + st["bass"] if st else x, sr, g["beats"])
        loop = find_loop(x, sr, g["beats"], db, MAX_LOOP_S if slot != "title" else TITLE_MAX_S)
        bar = (loop["loopEnd"] - loop["loopStart"]) / loop["bars"]
        g = {k: v for k, v in g.items() if k != "beats"} | {"downbeat_index_mod4": db}
        rec = {"take": pid, "grid": g, "loop": loop}
        sources[slot] = (x, loop)
        sources_take[slot] = take
        if slot == "title":
            full, dur = seam(x, sr, loop, bar)
            L, _ = lufs(full, sr)
            k = 10 ** ((CALM_LUFS - L) / 20)
            full = full * k * limiter(full * k, sr, PEAK_DB)[None]
            encode(full, sr, tmpd / "t.m4a")
            lag, dlen = decode_offset(tmpd / "t.m4a", full, sr)
            name = shipped_name(dest, tmpd / "t.m4a", "title")
            n = (dest / name).stat().st_size
            total += n
            manifest["slots"]["title"] = {"full": name, "bpm": loop["bpm"], "beatsPerBar": 4,
                                          "loopStart": round(loop["loopStart"] + lag, 4), "loopEnd": round(loop["loopEnd"] + lag, 4),
                                          "duration": round(dlen, 4)}
            assert loop["loopEnd"] + lag <= dlen
            rec.update(decode_lag_s=lag, decoded_s=dlen, file=name, gain_db=round(float(20 * np.log10(k)), 2), bytes=n)
            prov(name, take, {"take": pid, "gain_db": rec["gain_db"], "limiter_ceiling_db": PEAK_DB})
        else:
            assert st is not None
            resid = x - sum(st.values())
            voice = float((st["vocals"] ** 2).sum() / ((x ** 2).sum() + 1e-12))
            tension = st["drums"] + 0.5 * st["bass"]
            calm = x - tension if voice <= 0.03 else st["other"] + resid + 0.5 * st["bass"]
            calm_f, dur = seam(calm, sr, loop, bar)
            ten_f, _ = seam(tension, sr, loop, bar)
            L, _ = lufs(calm_f, sr)
            k = 10 ** ((CALM_LUFS - L) / 20)
            # one limiter curve for both stems (driven by the mix and by calm alone), so calm + tension stays the mix
            r = np.minimum(limiter((calm_f + ten_f) * k, sr, PEAK_DB), limiter(calm_f * k, sr, PEAK_DB))[None]
            calm_o, ten_o = calm_f * k * r, ten_f * k * r
            encode(calm_o, sr, tmpd / "c.m4a")
            encode(ten_o, sr, tmpd / "t.m4a", mono=True)
            # loop points in DECODED time: measure the decoder's lag on both files; they must agree, and match in length
            lag_c, len_c = decode_offset(tmpd / "c.m4a", calm_o, sr)
            lag_t, len_t = decode_offset(tmpd / "t.m4a", ten_o, sr)
            assert abs(len_c - len_t) < 0.05, f"calm {len_c:.3f}s vs tension {len_t:.3f}s"
            assert abs(lag_c - lag_t) < 0.002, f"decode lag calm {lag_c} vs tension {lag_t}"
            cn, tn = shipped_name(dest, tmpd / "c.m4a", f"{slot}-calm"), shipped_name(dest, tmpd / "t.m4a", f"{slot}-tension")
            nc, nt = (dest / cn).stat().st_size, (dest / tn).stat().st_size
            total += nc + nt
            manifest["slots"][slot] = {"calm": cn, "tension": tn, "bpm": loop["bpm"], "beatsPerBar": 4,
                                       "loopStart": round(loop["loopStart"] + lag_c, 4), "loopEnd": round(loop["loopEnd"] + lag_c, 4),
                                       "duration": round(min(len_c, len_t), 4)}
            assert loop["loopEnd"] + lag_c <= min(len_c, len_t)
            gdb = round(float(20 * np.log10(k)), 2)
            for f, part in ((cn, "calm: mix - drums - bass/2"), (tn, "tension: drums + bass/2 (htdemucs), mono")):
                prov(f, take, {"take": pid, "stem": part, "gain_db": gdb, "limiter_ceiling_db": PEAK_DB})
            share = {s_: round(float((a_ ** 2).sum() / ((x ** 2).sum() + 1e-12)), 4) for s_, a_ in st.items()}
            rec.update(stem_share=share, voice_in_calm=voice <= 0.03, gain_db=gdb, limited_min_gain=round(float(r.min()), 3),
                       decode_lag_s={"calm": lag_c, "tension": lag_t}, decoded_s={"calm": len_c, "tension": len_t},
                       files={"calm": cn, "tension": tn}, bytes={"calm": nc, "tension": nt})
        report["slots"][slot] = rec
        print(f"{style}/{slot}: {pid} bpm {loop['bpm']:.1f} loop {loop['loopStart']:.2f}-{loop['loopEnd']:.2f} ({loop['bars']} bars, seam {loop['similarity']})", flush=True)

    # stings are CUT from this style's own takes: MiniMax's 6 s "sting" renders came back as 6 s of mid-song band
    # music (no silence after, and CLAP heard the wrong style in most) - see cut_stings()
    for sting, (y, src_slot, t0, why) in cut_stings(sources, sr_src).items():
        take = sources_take[src_slot]
        L, _ = lufs(y, sr_src)
        k = 10 ** ((STING_LUFS - L) / 20)
        y = y * k * limiter(y * k, sr_src, PEAK_DB - 1.0)[None]
        encode(y, sr_src, tmpd / "s.m4a")
        name = shipped_name(dest, tmpd / "s.m4a", f"sting-{sting}")
        n = (dest / name).stat().st_size
        total += n
        manifest["stings"][sting] = name
        prov(name, take, {"take": take["id"], "cut_from": f"{src_slot} at {t0:.2f}s ({why})",
                          "seconds": round(y.shape[1] / sr_src, 2), "gain_db": round(float(20 * np.log10(k)), 2)})
        report["slots"][f"sting-{sting}"] = {"from": src_slot, "take": take["id"], "at_s": round(t0, 2), "why": why, "file": name,
                                             "seconds": round(y.shape[1] / sr_src, 2), "bytes": n}

    (dest / "music.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    report["total_bytes"] = total
    (HERE / f"v3-{style}-build.json").write_text(json.dumps(report, indent=2) + "\n")
    print(f"{style}: {total / 1e6:.2f} MB of audio -> {dest}", flush=True)
    assert total <= 5_000_000, f"{style} is {total / 1e6:.2f} MB, over the 5 MB budget"


# ---------------------------------------------------------------- --set pine-hollow (PINE-HOLLOW-REMASTER PH-A1)
# Pine Hollow's own slots (ph-jobs.json, ranked by rank_v3.py --set pine-hollow into v3-ph-<style>.json), written to
# public/assets/music/pine-hollow-<style>/ with its own music.json: a folder the loading bar does not fetch for every shard
# (MUSIC_STYLES names only piano / orchestral / folk), so Driftwood's load is untouched and Pine Hollow fetches it itself.
#   night  calm + tension, exactly like the pine / island loops
#   boss   ONE take, three layers on one timeline: base = mix - drums - bass (stereo), bass, drums (mono). The manifest's
#          `phases` are the layer gains per boss phase (I the Warden, II Lanterns Fall, III the Last Light); base + bass +
#          drums == the take, sample for sample
#   dawn   the reward sting, cut from the dawn take: its last PH_STING_S of sound (the resolved chord ringing out and the
#          phrase that lands on it), -16 LUFS like the other stings
PH_MAX_LOOP_S = 48.0     # a style's Pine Hollow set: night (2 stems) + boss (3) at <= 48 s + the sting stays ~2.5 MB
PH_STING_S = 8.0
PH_PHASES = {"1": [0.6, 0.0], "2": [1.0, 0.55], "3": [1.0, 1.0]}   # [bass, drums] gain per phase; base is always 1
PH_PHASE_NAMES = {"1": "I - the Warden", "2": "II - Lanterns Fall", "3": "III - the Last Light"}


def build_ph_style(raw: Path, style: str, overrides: dict[str, str]) -> None:
    v3 = json.loads((HERE / f"v3-ph-{style}.json").read_text())
    dest = OUT / f"pine-hollow-{style}"
    dest.mkdir(parents=True, exist_ok=True)
    for old in dest.glob("*.m4a"):  # this folder holds only this function's output
        old.unlink()
    tmpd = Path(tempfile.mkdtemp())
    manifest: dict = {"style": style, "set": "pine-hollow", "model": "MiniMax-Music3", "credit": "Music: MiniMax-Music3",
                      "slots": {}, "stings": {}, "provenance": []}
    report: dict = {"style": style, "set": "pine-hollow", "slots": {}}
    total = 0

    def prov(file: str, take: dict, extra: dict) -> None:
        manifest["provenance"].append({"file": file, "model": "MiniMaxAI/MiniMax-Music3", "diffusers": "0.40.0", "prompt": take["prompt"],
                                       "lyrics": take["lyrics"], "seed": take["seed"], "steps": take["steps"], "licence": LICENCE, **extra})

    for slot in ("night", "boss", "dawn"):
        pid = overrides.get(f"{style}/{slot}") or v3["slots"][slot]["pick"]
        take = next(t for t in v3["slots"][slot]["takes"] if t["id"] == pid)
        x, sr = sf.read(str(raw / f"{style}-{slot}" / f"{pid}.wav"), always_2d=True)
        x = x.T.astype(np.float64)
        if slot == "dawn":
            env = np.abs(x).max(0)
            last = int(np.where(env > env.max() * 10 ** (-40 / 20))[0][-1])
            a = max(0, last - int(PH_STING_S * sr))
            y = _fade(x[:, a:last], sr, 0.5, 1.2)
            L, _ = lufs(y, sr)
            k = 10 ** ((STING_LUFS - L) / 20)
            y = y * k * limiter(y * k, sr, PEAK_DB - 1.0)[None]
            encode(y, sr, tmpd / "s.m4a")
            name = shipped_name(dest, tmpd / "s.m4a", "sting-dawn")
            n = (dest / name).stat().st_size
            total += n
            manifest["stings"]["dawn"] = name
            prov(name, take, {"take": pid, "cut_from": f"dawn at {a / sr:.2f}s (the last {PH_STING_S:.0f} s: the resolve)",
                              "seconds": round(y.shape[1] / sr, 2), "gain_db": round(float(20 * np.log10(k)), 2)})
            report["slots"]["sting-dawn"] = {"take": pid, "at_s": round(a / sr, 2), "file": name, "bytes": n, "seconds": round(y.shape[1] / sr, 2)}
            print(f"{style}/dawn sting: {pid} at {a / sr:.2f}s", flush=True)
            continue
        g = grid(x, sr)
        st = separate(x, sr)
        db = downbeat(st["drums"] + st["bass"], sr, g["beats"])
        loop = find_loop(x, sr, g["beats"], db, PH_MAX_LOOP_S)
        bar = (loop["loopEnd"] - loop["loopStart"]) / loop["bars"]
        g = {k: v for k, v in g.items() if k != "beats"} | {"downbeat_index_mod4": db}
        resid = x - sum(st.values())
        voice = float((st["vocals"] ** 2).sum() / ((x ** 2).sum() + 1e-12))
        if slot == "night":
            layers = {"tension": st["drums"] + 0.5 * st["bass"]}
            calm = x - layers["tension"] if voice <= 0.03 else st["other"] + resid + 0.5 * st["bass"]
        else:
            layers = {"bass": st["bass"], "drums": st["drums"]}
            calm = x - st["drums"] - st["bass"] if voice <= 0.03 else st["other"] + resid
        calm_f, _ = seam(calm, sr, loop, bar)
        lay_f = {k: seam(v, sr, loop, bar)[0] for k, v in layers.items()}
        L, _ = lufs(calm_f + sum(lay_f.values()) if slot == "boss" else calm_f, sr)  # the boss is levelled on its full phase III mix
        k = 10 ** ((CALM_LUFS - L) / 20)
        r = np.minimum(limiter((calm_f + sum(lay_f.values())) * k, sr, PEAK_DB), limiter(calm_f * k, sr, PEAK_DB))[None]
        calm_o = calm_f * k * r
        encode(calm_o, sr, tmpd / "c.m4a")
        lag_c, len_c = decode_offset(tmpd / "c.m4a", calm_o, sr)
        stem = "night" if slot == "night" else "boss"
        cn = shipped_name(dest, tmpd / "c.m4a", f"{stem}-{'calm' if slot == 'night' else 'base'}")
        files, sizes = {"calm": cn}, {"calm": (dest / cn).stat().st_size}
        for name_, v in lay_f.items():
            o = v * k * r
            encode(o, sr, tmpd / "l.m4a", mono=True)
            lag_l, len_l = decode_offset(tmpd / "l.m4a", o, sr)
            assert abs(len_c - len_l) < 0.05, f"{slot}: calm {len_c:.3f}s vs {name_} {len_l:.3f}s"
            assert abs(lag_c - lag_l) < 0.002, f"{slot}: decode lag calm {lag_c} vs {name_} {lag_l}"
            fn = shipped_name(dest, tmpd / "l.m4a", f"{stem}-{name_}")
            files[name_], sizes[name_] = fn, (dest / fn).stat().st_size
        total += sum(sizes.values())
        spec = {"calm": cn, "bpm": loop["bpm"], "beatsPerBar": 4, "loopStart": round(loop["loopStart"] + lag_c, 4),
                "loopEnd": round(loop["loopEnd"] + lag_c, 4), "duration": round(len_c, 4)}
        assert loop["loopEnd"] + lag_c <= len_c
        gdb = round(float(20 * np.log10(k)), 2)
        if slot == "night":
            spec["tension"] = files["tension"]
            prov(cn, take, {"take": pid, "stem": "calm: mix - drums - bass/2", "gain_db": gdb})
            prov(files["tension"], take, {"take": pid, "stem": "tension: drums + bass/2 (htdemucs), mono", "gain_db": gdb})
        else:
            spec["layers"] = [files["bass"], files["drums"]]
            spec["phases"] = PH_PHASES
            spec["phaseNames"] = PH_PHASE_NAMES
            prov(cn, take, {"take": pid, "stem": "base: mix - drums - bass", "gain_db": gdb})
            prov(files["bass"], take, {"take": pid, "stem": "bass (htdemucs), mono", "gain_db": gdb})
            prov(files["drums"], take, {"take": pid, "stem": "drums (htdemucs), mono", "gain_db": gdb})
        manifest["slots"][slot] = spec
        share = {s_: round(float((a_ ** 2).sum() / ((x ** 2).sum() + 1e-12)), 4) for s_, a_ in st.items()}
        report["slots"][slot] = {"take": pid, "grid": g, "loop": loop, "stem_share": share, "voice_in_calm": voice <= 0.03, "gain_db": gdb,
                                 "limited_min_gain": round(float(r.min()), 3), "decode_lag_s": lag_c, "decoded_s": len_c, "files": files, "bytes": sizes}
        print(f"{style}/{slot}: {pid} bpm {loop['bpm']:.1f} loop {loop['loopStart']:.2f}-{loop['loopEnd']:.2f} ({loop['bars']} bars, seam {loop['similarity']})", flush=True)

    (dest / "music.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    report["total_bytes"] = total
    (HERE / f"v3-ph-{style}-build.json").write_text(json.dumps(report, indent=2) + "\n")
    print(f"pine-hollow-{style}: {total / 1e6:.2f} MB of audio -> {dest}", flush=True)
    assert total <= 5_000_000, f"pine-hollow-{style} is {total / 1e6:.2f} MB, over the 5 MB budget"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("raw")
    ap.add_argument("--style", default="piano,orchestral,folk")
    ap.add_argument("--pick", nargs="*", default=[], help="style/slot=take-id overrides, e.g. piano/pine=minimax3-303")
    ap.add_argument("--set", default=None, choices=["pine-hollow"], help="pine-hollow: Pine Hollow's night / boss / dawn (ph-jobs.json)")
    args = ap.parse_args()
    overrides = dict(p.split("=", 1) for p in args.pick)
    for style in args.style.split(","):
        (build_ph_style if args.set == "pine-hollow" else build_style)(Path(args.raw), style, overrides)


if __name__ == "__main__":
    main()
