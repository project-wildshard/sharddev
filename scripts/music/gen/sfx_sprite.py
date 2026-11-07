"""Pack Pine Hollow's one-shots + barks into ONE audio sprite, and ship its mono-sourced beds mono (PINE-HOLLOW-REMASTER
load lane: the bar fetched the set one file at a time, 228 requests on a phone cold launch against the 180 budget row).

    python3 scripts/music/gen/sfx_sprite.py                          # pack public/assets/sfx/pine-hollow/ (from the shipped files)
    ~/ml/music/analysis/.venv/bin/python scripts/music/gen/sfx_sprite.py --raw <sfx-raw-dir>   # from the lossless takes

Run at the end of sfx_merge.py's merge_set (which rebuilds an own set from the stage dir and would
otherwise un-pack it), and by hand. Idempotent: a set whose sfx.json already has a `sprite` and none of the packed files is
left as it is (the beds step skips a bed that is already mono). A set with a sprite AND new one-shot files (merge_set
--only: a later round added families) is re-packed: a take already in the sprite is sourced from its lossless take as
ever, or else from its slice of the old sprite's decode; the old clips keep their order (and so their offsets), the new
ones follow, and a clip no family lists any more is dropped.

Sprite. Every file under sfx.json "oneshots" (every family, the barks too) laid end to end on one 48 kHz mono timeline with
GAP (0.2 s) of silence before the first clip, between clips and after the last, encoded as ONE AAC-LC 48 kHz mono .m4a at
the one-shots' own rate (64 kb/s over the sounding part; the silent gaps cost ~nothing), content-addressed `oneshots-<sha1[:8]>.m4a`. sfx.json gets a top-level
    "sprite": {"file": "oneshots-….m4a", "gap": 0.2, "duration": <s>, "clips": {"<original file name>": [startSec, durSec], …}}
(oneshots' family -> files lists and the provenance stay as they are, so provenance still names each take and the game
maps a family's files to their clips), then the individual one-shot files are deleted. A clip's source is its lossless
take re-derived exactly as sfx_build.py shipped it (trim, -18 LUFS, soxr to 48 kHz, mono) when --raw is given and that
re-derivation is the shipped file (lag 0, the same level, correlation >= MATCH_MIN), else the shipped file's own decode
(one AAC generation more).
Offsets are PROVEN, not assumed: the sprite is decoded with ffmpeg AND with afconvert (CoreAudio, Safari's decoder), each
clip's source is cross-correlated against both decodes around its stored start, and the stored start must hold to within
TOL_S (1 ms) in both (the AAC priming is carried by the m4a edit list, which both honour). A table is printed; any miss
fails the run before anything is written or deleted.

Beds (--raw only). A bed whose lossless take is MONO (every MOSS-SoundEffect bed: its model renders one channel) was
shipped as 2 identical channels at 64 kb/s stereo, whose side channel is pure coding noise. It is re-encoded mono from
the lossless take (the seam and the -24 LUFS level exactly as sfx_build.py made them, at the old per-channel level:
UPMIX) with Apple's AAC encoder, content-addressed, at the lowest rate of BED_MONO_KBPS that passes every check: the new
decode lines up with the old one in ffmpeg and in afconvert (lag 0, so loopStart / loopEnd stay valid), afconvert's
decoded length equals the old one and the take's within 1 ms (ffmpeg's carries the encoder's tail padding: recorded as
`duration`), and it is never worse than what shipped (its band at least as wide, its mean spectral error against the
lossless take no larger: the fidelity() numbers). A stereo take (Stable Audio's) keeps its file, and so does a bed
ForestAmbience pans (panned_beds: a StereoPannerNode pans a 2-channel input by another law).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from audio_jobs import tag_name  # noqa: E402
REPO = HERE.parents[2]
PH = REPO / "public/assets/sfx/pine-hollow"
SR = 48000
GAP = 0.2
KBPS = 64
# a mono bed: Apple's AAC encoder (afconvert, the one CoreAudio ships), ABR, at the lowest of these rates that is never
# worse than the shipped file. ffmpeg's own encoder is not: mono at 64 kb/s still has ~1.5x the old in-band error (measured)
BED_MONO_KBPS = (32, 40, 48)
TOL_S = 0.001
# a re-derived take is "the shipped file" when it lines up at lag 0 with the same level: AAC smears clicks and substitutes
# noise (exact in spectrum, not in waveform), so a correct re-derivation can correlate as low as ~0.7; another take gives ~0
MATCH_MIN, MATCH_DB = 0.5, 0.5
# a take compared with its slice of an older SPRITE (a re-pack): that sprite was cut from the same lossless takes (lag 0
# proven), but its encode (57 kb/s over the file) sits further from them in level than a 64 kb/s file of its own: measured
# up to 0.76 dB on the gaps round's re-pack
SPRITE_DB = 1.0
RAW_DIR = {"moss": "moss", "sa3-medium": "medium"}  # sfx-raw-dir/<model>/<family>/<seed>.wav
# ffmpeg's `-ac 2` (stems.encode) put a mono take in each channel at -3.01 dB (swresample's centre mix level); WebAudio
# up-mixes a mono buffer to L = R = m ("speakers"), so the mono file carries that same per-channel level
UPMIX = 1 / np.sqrt(2)
AMBIENCE = REPO / "src/shards/pine-hollow/data/audioSource.json"


def panned_beds() -> set[str]:
    """the beds ForestAmbience sends through a StereoPannerNode (its PANNED set). Those stay stereo: the panner pans a mono
    input at equal power but a 2-channel one by its stereo law, which on these dual-mono files is up to ~3 dB louder
    off-centre, so a mono file would change how loud the bed is to one side"""
    beds = json.loads(AMBIENCE.read_text())["audio"]["zones"]["routing"]["samples"]["beds"]
    return {bed["id"] for bed in beds if bed["panned"]}


# ─────────────── decode / encode ───────────────
def ff_decode(path: Path, channels: int = 1) -> np.ndarray:
    """(channels, n) float at 48 kHz as ffmpeg decodes it (it honours the mp4 edit list, as Chromium's decodeAudioData does)"""
    out = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", str(channels), "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(out, np.float32).reshape(-1, channels).T.astype(np.float64)


def read_wav(path: Path) -> np.ndarray:
    """(channels, n) float from a 32-bit float WAVE (afconvert's output; chunks walked, not assumed)"""
    b = path.read_bytes()
    assert b[:4] == b"RIFF" and b[8:12] == b"WAVE", path
    pos, fmt, data = 12, None, None
    while pos + 8 <= len(b):
        cid, size = b[pos:pos + 4], struct.unpack("<I", b[pos + 4:pos + 8])[0]
        body = b[pos + 8:pos + 8 + size]
        if cid == b"fmt ":
            fmt = struct.unpack("<HHIIHH", body[:16])
        elif cid == b"data":
            data = body
        pos += 8 + size + (size & 1)
    assert fmt is not None and data is not None, path
    tag, ch, rate, _, _, bits = fmt
    assert rate == SR and bits == 32 and tag in (3, 0xFFFE), (path, fmt)
    return np.frombuffer(data, "<f4").reshape(-1, ch).T.astype(np.float64)


def af_decode(path: Path, channels: int = 1) -> np.ndarray:
    """(channels, n) float at 48 kHz as CoreAudio decodes it (afconvert: Safari's decoder; honours the edit list / iTunSMPB)"""
    with tempfile.TemporaryDirectory() as d:
        wav = Path(d) / "x.wav"
        subprocess.run(["afconvert", "-f", "WAVE", "-d", f"LEF32@{SR}", "-c", str(channels), str(path), str(wav)], check=True, capture_output=True)
        return read_wav(wav)


def write_wav(y: np.ndarray, path: Path) -> None:
    """(channels, n) float -> a 32-bit float WAVE at 48 kHz"""
    data = np.ascontiguousarray(y.T, dtype="<f4").tobytes()
    ch = y.shape[0]
    fmt = struct.pack("<HHIIHH", 3, ch, SR, SR * 4 * ch, 4 * ch, 32)
    path.write_bytes(b"RIFF" + struct.pack("<I", 4 + 8 + len(fmt) + 8 + len(data)) + b"WAVE"
                     + b"fmt " + struct.pack("<I", len(fmt)) + fmt + b"data" + struct.pack("<I", len(data)) + data)


def encode(y: np.ndarray, dest: Path, kbps: int, apple: bool = False) -> None:
    """(channels, n) float at 48 kHz -> AAC-LC .m4a: ffmpeg's encoder (as stems.encode ships every file), or Apple's through
    afconvert (ABR, best quality) - its own m4a writer, whose priming / padding CoreAudio and ffmpeg both read right
    (ffmpeg's muxer around its aac_at wrapper leaves CoreAudio ~12 ms of tail padding: measured)"""
    if apple:
        with tempfile.TemporaryDirectory() as d:
            wav = Path(d) / "x.wav"
            write_wav(y, wav)
            subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", str(kbps * 1000), "-s", "1", "-q", "127", str(wav), str(dest)],
                           check=True, capture_output=True)
        return
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", str(y.shape[0]), "-i", "-", "-c:a", "aac",
                    "-b:a", f"{kbps}k", "-movflags", "+faststart", str(dest)],
                   input=np.ascontiguousarray(y.T, dtype="<f4").tobytes(), check=True)


def content_name(tmp: Path, stem: str) -> str:
    """<stem>-<sha1[:8]>.m4a (stems.shipped_name's rule: the service worker serves audio cache-first)"""
    name = f"{stem}-{hashlib.sha1(tmp.read_bytes()).hexdigest()[:8]}.m4a"
    tmp.replace(tmp.parent / name)
    return name


def probe(path: Path) -> dict:
    p = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name,profile,sample_rate,channels,bit_rate",
                        "-of", "json", str(path)], capture_output=True, check=True, text=True)
    return json.loads(p.stdout)["streams"][0]


def xlag(a: np.ndarray, b: np.ndarray, search: int) -> tuple[int, float]:
    """(lag of b inside a in samples - positive = b sits later in a, normalised correlation at that lag); a is b's window
    padded by `search` samples on both sides"""
    n = len(a) + len(b)
    c = np.fft.irfft(np.fft.rfft(a, n) * np.conj(np.fft.rfft(b, n)), n)[: 2 * search + 1]
    k = int(np.argmax(c))
    seg = a[k:k + len(b)]
    den = float(np.sqrt((seg ** 2).sum() * (b ** 2).sum())) or 1.0
    return k - search, float(c[k] / den)


# ─────────────── the lossless takes (the analysis venv: librosa, soundfile) ───────────────
class Lossless:
    """a shipped file re-derived from its raw take exactly as sfx_build.py made it (before its AAC encode)"""

    def __init__(self, raw: Path, tag: str = "ph") -> None:
        sys.path.insert(0, str(HERE))
        import librosa
        import soundfile as sf
        from sfx_build import LEVEL, trim
        from stems import lufs, seam

        self.raw, self.librosa, self.sf, self.LEVEL, self.trim, self.lufs, self.seam = raw, librosa, sf, LEVEL, trim, lufs, seam
        self.rank = {s: json.loads((HERE / f"sfx-{tag}-{s}.json").read_text())["families"] for s in RAW_DIR}

    def wav(self, prov: dict, fam: str) -> Path:
        return self.raw / RAW_DIR[prov["set_of_origin"]] / fam / f"{prov['seed']}.wav"

    def take(self, prov: dict, fam: str, kind: str) -> tuple[np.ndarray, int]:
        """(channels, n) at 48 kHz (mono for a one-shot, the take's own channels for a bed), and the raw take's channels"""
        x, sr = self.sf.read(str(self.wav(prov, fam)), always_2d=True)
        x = x.T.astype(np.float64)
        if kind == "bed":
            row = next(r for r in self.rank[prov["set_of_origin"]][fam] if r["seed"] == prov["seed"])
            y, _ = self.seam(x, sr, {"loopStart": row["seam"]["start_s"], "loopEnd": row["seam"]["end_s"]}, 1.0)
        else:
            y = self.trim(x, sr, 3.0)
        L, tp = self.lufs(y, sr)
        y = y * 10 ** (min(self.LEVEL[kind] - L, -1.0 - tp) / 20)
        y = self.librosa.resample(y, orig_sr=sr, target_sr=SR, res_type="soxr_hq") if sr != SR else y
        return (y.mean(0, keepdims=True) if kind == "oneshot" else y), x.shape[0]


def matches(src: np.ndarray, shipped: np.ndarray) -> tuple[int, float, float]:
    """(lag, correlation, level difference in dB) of a re-derived take against the shipped file's decode (mono, 48 kHz)"""
    n = min(len(src), len(shipped))
    pad = np.concatenate([np.zeros(480), shipped[:n], np.zeros(480)])
    lag, r = xlag(pad, src[:n], 480)
    return lag, r, float(10 * np.log10((src[:n] ** 2).sum() / max((shipped[:n] ** 2).sum(), 1e-20)))


def same(m: tuple[int, float, float], db: float = MATCH_DB) -> bool:
    return m[0] == 0 and m[1] >= MATCH_MIN and abs(m[2]) <= db


# ─────────────── the sprite ───────────────
def pack(ph: Path, lossless: Lossless | None) -> None:
    man_path = ph / "sfx.json"
    man = json.loads(man_path.read_text())
    shots = man.get("oneshots", {})
    order: list[tuple[str, str]] = []  # (file, family), families in sfx.json order
    for fam, v in shots.items():
        for f in (v["files"] if isinstance(v, dict) else v):
            if f not in [o for o, _ in order]:
                order.append((f, fam))
    have = [f for f, _ in order if (ph / f).exists()]
    if "sprite" in man and not have:
        print(f"sprite: already packed ({man['sprite']['file']}, {len(man['sprite']['clips'])} clips) - nothing to do")
        return
    # a later round's files next to the packed set: the packed takes come out of the old sprite
    old = man.get("sprite")
    old_dec = ff_decode(ph / old["file"])[0] if old and (ph / old["file"]).exists() else None
    old_clips: dict[str, list[float]] = old["clips"] if old_dec is not None else {}
    missing = [f for f, _ in order if not (ph / f).exists() and f not in old_clips]
    if missing:
        raise SystemExit(f"sprite: {len(missing)} one-shot files are missing and there is no sprite to keep: {missing[:5]}")
    if not order:
        print("sprite: no shipped one-shots - nothing to pack")
        return
    rates = {int(probe(ph / f)["bit_rate"]) for f, _ in order if (ph / f).exists()}
    print(f"sprite: {len(order)} one-shots, their rates {min(rates) // 1000}-{max(rates) // 1000} kb/s -> one file, {KBPS} kb/s where it sounds")

    prov = {p["file"]: p for p in man.get("provenance", [])}
    gap = round(GAP * SR)
    parts: list[np.ndarray] = [np.zeros(gap)]
    clips: dict[str, list[float]] = {}
    srcs: dict[str, np.ndarray] = {}
    origin: dict[str, str] = {}
    pos = gap
    def shipped_of(f: str) -> np.ndarray:
        if (ph / f).exists():
            return ff_decode(ph / f)[0]
        a, n = round(old_clips[f][0] * SR), round(old_clips[f][1] * SR)
        return old_dec[a:a + n]  # its slice of the old sprite (lag 0: proven when that sprite was packed)

    for f, fam in order:
        shipped = shipped_of(f)
        src, how = shipped, "aac"
        if lossless is not None and f in prov and lossless.wav(prov[f], fam).exists():
            y, _ = lossless.take(prov[f], fam, "oneshot")
            m = matches(y[0], shipped)
            if same(m, MATCH_DB if (ph / f).exists() else SPRITE_DB):
                src, how = y[0], "lossless"
            else:
                print(f"  {f}: the raw take does not match the shipped file (lag {m[0]}, r {m[1]:.3f}, {m[2]:+.2f} dB) - its shipped decode is packed")
        srcs[f], origin[f] = src, how
        clips[f] = [round(pos / SR, 6), round(len(src) / SR, 6)]
        parts += [src, np.zeros(gap)]
        pos += len(src) + gap
    timeline = np.concatenate(parts)[None]

    tmp = ph / ".sprite.tmp.m4a"
    # the encoder's rate control averages over the whole file and a silent frame costs ~4 bytes: the gaps' share of the
    # time comes off the target, so the clips get the originals' 64 kb/s (not ~72)
    encode(timeline, tmp, round(KBPS * (pos - gap * (len(order) + 1)) / pos))
    decs = {"ffmpeg": ff_decode(tmp)[0], "afconvert": af_decode(tmp)[0]}
    fails = verify(clips, srcs, origin, decs)
    if fails:
        tmp.unlink()
        raise SystemExit(f"sprite: {fails} clip offsets are off by more than {TOL_S * 1000:.0f} ms - nothing written")
    before = sum((ph / f).stat().st_size for f, _ in order if (ph / f).exists()) + sum(o.stat().st_size for o in ph.glob("oneshots-*.m4a"))
    for o in ph.glob("oneshots-*.m4a"):
        o.unlink()
    name = content_name(tmp, "oneshots")
    man["sprite"] = {"file": name, "gap": GAP, "duration": round(min(len(d) for d in decs.values()) / SR, 6), "clips": clips}  # decoded
    man_path.write_text(json.dumps(man, indent=2, ensure_ascii=False) + "\n")
    for f, _ in order:
        (ph / f).unlink(missing_ok=True)
    after = (ph / name).stat().st_size
    p = probe(ph / name)
    print(f"sprite: {name} {after / 1e3:.1f} kB ({p['codec_name']} {p['profile']} {p['sample_rate']} Hz {p['channels']} ch {int(p['bit_rate']) // 1000} kb/s, "
          f"{len(timeline[0]) / SR:.2f} s) holds {len(order)} takes (was {before / 1e3:.1f} kB); "
          f"sources: {sum(1 for v in origin.values() if v == 'lossless')} lossless, {sum(1 for v in origin.values() if v == 'aac')} shipped AAC")


def verify(clips: dict[str, list[float]], srcs: dict[str, np.ndarray], origin: dict[str, str], decs: dict[str, np.ndarray]) -> int:
    """print each clip's measured start error in every decoder; the number of clips off by more than TOL_S"""
    search, tol = round(0.05 * SR), round(TOL_S * SR)
    print(f"  {'clip':34s} {'start s':>8s} {'dur s':>6s} {'src':8s}" + "".join(f" {k + ' lag':>14s} {'r':>5s}" for k in decs))
    fails, worst = 0, dict.fromkeys(decs, 0)
    for f, (start, _) in clips.items():
        s, src = round(start * SR), srcs[f]
        row = f"  {f[:34]:34s} {start:8.4f} {len(src) / SR:6.3f} {origin[f]:8s}"
        for k, d in decs.items():
            win = d[s - search:s + len(src) + search]
            lag, r = xlag(win, src, search)
            worst[k] = max(worst[k], abs(lag))
            bad = abs(lag) > tol or r < MATCH_MIN  # the clip must be there (another sound: r ~ 0); AAC blurs clicks to ~0.7-0.9
            fails += bad
            row += f" {lag:+6d} ({lag / SR * 1000:+.2f}ms) {r:5.3f}" + (" !" if bad else "")
        print(row)
    print("  worst |lag|: " + ", ".join(f"{k} {v} samples ({v / SR * 1000:.3f} ms)" for k, v in worst.items()) + f"; tolerance {tol} samples ({TOL_S * 1000:.0f} ms)")
    return fails


# ─────────────── the beds ───────────────
def beds(ph: Path, lossless: Lossless) -> None:
    man_path = ph / "sfx.json"
    man = json.loads(man_path.read_text())
    prov = {p["file"]: p for p in man.get("provenance", [])}
    changed, gone, pan = False, [], panned_beds()
    print(f"  {'bed':12s} {'take':10s} {'raw ch':>6s} {'side/mid':>9s} {'old kB':>7s} {'new kB':>7s} {'ff lag':>6s} {'af lag':>6s} {'ff dur':>9s} {'af dur':>9s}"
          f" {'band old':>8s} {'new':>6s} {'err old':>7s} {'new':>6s}")
    for name, b in man.get("beds", {}).items():
        f = b["file"]
        p, fam = prov.get(f), f"bed-{name}"
        if p is None or not lossless.wav(p, fam).exists():
            print(f"  {name:12s} no lossless take - kept")
            continue
        if probe(ph / f)["channels"] == 1:
            print(f"  {name:12s} already mono - kept")
            continue
        y, raw_ch = lossless.take(p, fam, "bed")
        old = ff_decode(ph / f, 2)
        mid, side = old.mean(0), (old[0] - old[1]) / 2
        sm = 10 * np.log10((side ** 2).mean() / (mid ** 2).mean())
        if raw_ch != 1:
            print(f"  {name:12s} {p['set_of_origin']:10s} {raw_ch:6d} {sm:8.1f}dB  stereo take - kept")
            continue
        if name in pan:
            print(f"  {name:12s} {p['set_of_origin']:10s} {raw_ch:6d} {sm:8.1f}dB  panned (ForestAmbience PANNED): its stereo pan law - kept")
            continue
        src = y.mean(0) * UPMIX
        m0 = matches(src, mid)
        if not same(m0):
            print(f"  {name:12s} the raw take does not match the shipped bed (lag {m0[0]}, r {m0[1]:.3f}, {m0[2]:+.2f} dB) - kept")
            continue
        tmp, old_af = ph / ".bed.tmp.m4a", af_decode(ph / f)[0]
        bw_old, err_old = fidelity(src, mid)
        ok, kbps = False, 0
        for kbps in BED_MONO_KBPS:
            encode(src[None], tmp, kbps, apple=True)
            new_ff, new_af = ff_decode(tmp)[0], af_decode(tmp)[0]
            lag_ff, lag_af = matches(new_ff, mid)[0], matches(new_af, old_af)[0]
            dff, daf = (len(new_ff) - old.shape[1]) / SR, (len(new_af) - len(old_af)) / SR
            bw_new, err_new = fidelity(src, new_ff)
            # afconvert trims the AAC padding at both ends (the valid-frame count): exact. ffmpeg trims only the priming, so its
            # length carries the encoder's tail padding (Apple's differs from ffmpeg's): recorded as `duration`, past loopEnd
            ok = (lag_ff == 0 and lag_af == 0 and abs(daf) <= TOL_S and abs(len(new_af) - len(src)) <= TOL_S * SR
                  and b["loopEnd"] <= min(len(new_af), len(new_ff)) / SR
                  and bw_new >= bw_old and err_new <= err_old)  # never worse than what ships
            print(f"  {name:12s} {p['set_of_origin']:10s} {raw_ch:6d} {sm:8.1f}dB {(ph / f).stat().st_size / 1e3:7.1f} {tmp.stat().st_size / 1e3:7.1f} "
                  f"{lag_ff:6d} {lag_af:6d} {dff * 1000:+8.2f}ms {daf * 1000:+8.2f}ms {bw_old:6.1f}kHz {bw_new:4.1f}kHz {err_old:5.2f}dB {err_new:4.2f}dB"
                  f"  mono {kbps} kb/s" + ("" if ok else " - worse, next rate"))
            if ok:
                break
        if not ok:
            tmp.unlink()
            print(f"  {name:12s} no mono rate is as good as the shipped file - kept")
            continue
        new = content_name(tmp, f.rsplit("-", 1)[0])
        gone.append(f)
        b["file"] = new
        p["file"] = new
        b["duration"] = round(len(new_ff) / SR, 4)
        p["reencode"] = f"mono {kbps} kb/s (Apple AAC) from the lossless mono take (was 2 identical channels at 64 kb/s stereo; side/mid {sm:.1f} dB = coding noise)"
        changed = True
    if changed:
        man_path.write_text(json.dumps(man, indent=2, ensure_ascii=False) + "\n")
    for f in gone:  # only once sfx.json names the new files
        (ph / f).unlink()


def fidelity(src: np.ndarray, dec: np.ndarray) -> tuple[float, float]:
    """(the decode's band in kHz: the highest bin within 6 dB of the source's, the mean |spectral error| over 50 Hz-8 kHz in dB)
    - a waveform SNR says little about AAC on noise (its noise substitution is exact in spectrum, not in waveform)"""
    def psd(x: np.ndarray) -> np.ndarray:
        n, w = 4096, np.hanning(4096)
        return (np.abs(np.fft.rfft(np.stack([x[i:i + n] * w for i in range(0, len(x) - n, n // 2)]), axis=1)) ** 2).mean(0)
    n = min(len(src), len(dec))
    a, b, f = psd(src[:n]), psd(dec[:n]), np.fft.rfftfreq(4096, 1 / SR)
    r = 10 * np.log10((b + 1e-20) / (a + 1e-20))
    k = (f > 50) & (f < 8000)
    return float(f[np.where(r > -6)[0].max()] / 1000), float(np.abs(r[k]).mean())


def run(ph: Path = PH, raw: Path | None = None, *, set_name: str = "pine-hollow", tag: str = "ph", dry: bool = False) -> None:
    """the whole step (sfx_merge.py's merge_set calls this last): the beds (with the lossless takes), then the sprite"""
    if dry:
        # Planning must never decode/re-encode or alter the shipped manifest. The normal pack proves offsets in both decoders.
        print(json.dumps({str(ph / "sfx.json"): (ph / "sfx.json").read_text()}, indent=2, ensure_ascii=False))
        return
    lossless = Lossless(raw, tag) if raw is not None else None
    if lossless is not None and set_name == "pine-hollow":
        print("beds:")
        beds(ph, lossless)
    else:
        print("beds: no --raw or no declared panning contract for this set - left as they are")
    pack(ph, lossless)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--raw", default=None, help="the sfx raw dir sfx_build.py read (<raw>/<model>/<family>/<seed>.wav): lossless sources")
    ap.add_argument("--dir", default=str(PH), help="the set to pack (default public/assets/sfx/pine-hollow)")
    ap.add_argument("--set", default="pine-hollow", type=tag_name, help="public/assets/sfx/<set>/ (default pine-hollow)")
    ap.add_argument("--tag", type=tag_name, help="ranking tag (default ph; nine-dragon-stack uses nd)")
    ap.add_argument("--dry", action="store_true", help="replay the existing manifest JSON, no decoding or changes")
    args = ap.parse_args()
    dest = Path(args.dir) if args.dir != str(PH) else REPO / "public/assets/sfx" / args.set
    tag = args.tag or ("nd" if args.set == "nine-dragon-stack" else "ph")
    run(dest, Path(args.raw) if args.raw else None, set_name=args.set, tag=tag, dry=args.dry)


if __name__ == "__main__":
    main()
