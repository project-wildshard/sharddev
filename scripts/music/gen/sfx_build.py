"""MUSIC.md v3 row 6 (E33), SFX round 2: rank every model's sound-effect takes with CLAP, ship each model's set, and
build the side-by-side comparison page.

    ~/ml/music/analysis/.venv/bin/python scripts/music/gen/sfx_build.py <sfx-raw-dir>
    ~/ml/music/analysis/.venv/bin/python scripts/music/gen/sfx_build.py <sfx-raw-dir> --jobs sfx-ph-jobs.json --stage <dir>

--jobs / --stage (PINE-HOLLOW-REMASTER PH-A2..A4): rank another families file; each model's set is written to <dir>/<set>/
(a staging area outside public/, for sfx_merge.py --jobs to pick the winners from) and the rankings to
scripts/music/gen/sfx-<tag>-<set>.json (--tag defaults to ph); no comparison page (ph_page.py / nd_page.py make it). A family's
optional `group` (an NPC's barks, the footstep surfaces) keeps its siblings out of its CLAP competitors, so near-identical
descriptions do not rank each other down. With --stage, beds encode stereo at BED_KBPS (Pine Hollow has 14 of them).

--only fam,fam,... (with --stage): a later round of a few families (the remaster's sound gaps). Only those families' takes
are ranked (against every family's description, as ever), and only their rows in sfx-ph-<set>.json, their entries in
<dir>/<set>/sfx.json and their files are replaced; every other family keeps what its own round decided (a new competitor
reshuffles near-tied takes of families nobody asked to change: in the gaps round 9 old families would have swapped
takes and bark-miller-7 dropped out). The per-model summary is left as it is.

Reads <raw>/<model>/<family>/<seed>.wav + .json (gen_sfx.py / gen_sfx_moss.py / gen_sfx_ezaudio.py / MiniMax via
sfx_minimax.py). For every take:
  CLAP (laion/clap-htsat-fused, the model's own logit scale): softmax of its own family description against every
  other family's description plus three foils ("music with melody and instruments", "a person speaking", "silence").
  `p` = the share its own description gets, `rank` = where it places among all of them (1 = best match).
  Beds / hums also need a loop: the best seam on a 1 s grid (analyze.loop_seam), made seamless like the music
  (stems.seam: the last second crossfaded into the second before loopStart), loop points measured on the decoded file.
Per (model, family) the best take ships if it ranks <= SHIP_MAX_RANK (5); one-shots add their 2nd take as a variant when
it also ranks <= 3. A family whose best take ranks lower is listed in sfx.json's `synth_keeps` (the synth plays it).
Writes public/assets/sfx/<set>/ for every model in SETS: content-addressed files (<family>-<seed>-<sha1[:8]>.m4a: the
service worker serves audio cache-first) + sfx.json
  { model, credit, licence, beds: {forest: {file, loopStart, loopEnd, duration, gain}}, hums: {...},
    oneshots: {<Audio method / AnimalSound id>: {files: [...], gain}}, synth_keeps: [...], provenance: [...] }
Beds / hums: stereo AAC 96 kb/s; one-shots: mono AAC 64 kb/s, trimmed to the sounding part. Levels: beds -24 LUFS,
hums -26 LUFS, one-shots -18 LUFS (the game applies its own gains on top: beds 0.5, pickup hum 0.35, shrine 0.6).
Also writes scripts/music/gen/sfx-<set>.json (every take, every score), sfx-summary.json (per model: families shipped,
mean rank, speed, memory) and art/sfx/round-2-top3/ (MP3 of each family's best take per model, side by side; MiniMax
Music 3 as a fourth column for the ten families it was tried on).
"""

from __future__ import annotations

import html
import json
import subprocess
import sys
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from audio_jobs import family_key, read_sfx, tag_name  # noqa: E402

REPO = HERE.parents[2]
OUT = REPO / "public/assets/sfx"
ART = REPO / "art/sfx/round-2-top3"
STABILITY = ("Stability AI Community License: free below USD 1M annual revenue; register with Stability AI for commercial use; "
             "show 'Powered by Stability AI'; keep the licence + NOTICE with any redistribution. Its T5Gemma text encoder adds the Gemma terms.")
# raw-dir name -> the shipped set (None = compared on the page only)
SETS = {
    "medium": {"set": "sa3-medium", "title": "Stable Audio 3 Medium", "licence": STABILITY,
               "credit": "SFX: Stable Audio 3 Medium — Powered by Stability AI", "short": "Stability AI Community (< $1M, register, credit)"},
    "moss": {"set": "moss", "title": "MOSS-SoundEffect v2.0", "short": "Apache-2.0",
             "licence": "Apache-2.0 (OpenMOSS-Team/MOSS-SoundEffect-v2.0): commercial use OK; keep the licence and NOTICE text with any redistribution of the weights; outputs are unrestricted.",
             "credit": "SFX: MOSS-SoundEffect v2.0 by OpenMOSS (Apache-2.0)"},
    "ezaudio": {"set": "ezaudio", "title": "EzAudio-XL", "short": "MIT (+ flan-t5-xl, Apache-2.0)",
                "licence": "MIT (OpenSound/EzAudio: code and weights); the flan-t5-xl text encoder is Apache-2.0. Commercial use OK; keep the copyright notice with any redistribution of the weights.",
                "credit": "SFX: EzAudio by OpenSound (MIT)"},
    "minimax": {"set": None, "title": "MiniMax Music 3", "short": "MiniMax-Music3 Community (< $20M, UI credit)",
                "licence": "MiniMax-Music3 Community License", "credit": "Music: MiniMax-Music3"},
}
FOILS = ["music with melody and instruments", "a person speaking", "silence"]
LEVEL = {"bed": -24.0, "hum": -26.0, "oneshot": -18.0}
SHIP_MAX_RANK = 5
BED_KBPS = 64
GAIN = {"bed-forest": 0.5, "bed-island": 0.5, "bed-underwater": 0.5, "hum-pickup": 0.35, "hum-shrine": 0.6}


def trim(x: np.ndarray, sr: int, max_s: float) -> np.ndarray:
    import numpy as np

    env = np.abs(x).max(0)
    idx = np.where(env > env.max() * 10 ** (-45 / 20))[0]
    a, b = max(int(idx[0]) - int(0.005 * sr), 0), min(int(idx[-1]) + int(0.03 * sr), x.shape[1], int(idx[0]) + int(max_s * sr))
    y = x[:, a:b].copy()
    n = min(int(0.04 * sr), y.shape[1] // 4)
    y[:, -n:] *= np.linspace(1.0, 0.0, n)[None]
    return y


def main() -> None:
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("raw", nargs="?")
    ap.add_argument("--jobs", default="sfx-jobs.json")
    ap.add_argument("--stage", default=None, help="write each model's set under this dir instead of public/assets/sfx/")
    ap.add_argument("--only", default="", help="with --stage: rank and ship only these families (comma list); the rest keep their round's")
    ap.add_argument("--tag", default="ph", type=tag_name, help="staged ranking prefix sfx-<tag>-<model>.json (default ph)")
    ap.add_argument("--list", action="store_true", help="validate and print job families; no model imports")
    ap.add_argument("--dry", action="store_true", help="replay cached ranking JSON without loading models or writing files")
    args = ap.parse_args()
    only = {f for f in args.only.split(",") if f}
    if only and not args.stage:
        raise SystemExit("--only needs --stage")
    fams = read_sfx(HERE / args.jobs)["families"]
    if only - fams.keys():
        ap.error(f"unknown --only families: {sorted(only - fams.keys())}")
    out_root, prefix = (Path(args.stage), f"sfx-{args.tag}-") if args.stage else (OUT, "sfx-")
    if args.list:
        print(json.dumps(fams, indent=2, ensure_ascii=False))
        return
    if args.dry:
        cached = {meta["set"] or model: (HERE / f"{prefix}{meta['set'] or model}.json") for model, meta in SETS.items()}
        cached = {model: p for model, p in cached.items() if p.exists()}
        if not cached:
            ap.error("--dry needs cached rankings from a previous run; use --list to validate new jobs")
        for p in cached.values():
            rows = json.loads(p.read_text())["families"]
            if not (only or set(fams)) <= rows.keys():
                ap.error(f"{p}: missing cached families (run the model ranking first)")
        print(json.dumps({str(p): p.read_text() for p in cached.values()}, indent=2, ensure_ascii=False))
        return
    if args.raw is None:
        ap.error("raw is required unless --list or --dry is used")
    raw = Path(args.raw)
    import librosa
    import numpy as np
    import soundfile as sf
    import torch
    from transformers import ClapModel, ClapProcessor
    from analyze import CLAP_DIR, _tensor, loop_seam
    from stems import decode_offset, encode, lufs, seam, shipped_name
    clap = ClapModel.from_pretrained(str(CLAP_DIR)).eval()
    proc = ClapProcessor.from_pretrained(str(CLAP_DIR))
    scale = float(clap.logit_scale_a.detach().exp())
    names = list(fams)
    texts = [fams[f]["desc"] for f in names] + FOILS
    with torch.no_grad():
        te = torch.nn.functional.normalize(_tensor(clap.get_text_features(**proc(text=texts, return_tensors="pt", padding=True))), dim=-1)

    picks: dict[str, dict[str, list[dict]]] = {}
    summary: dict[str, dict] = {}
    for model, meta in SETS.items():
        takes = []
        for wav in sorted((raw / model).glob("*/*.wav")):
            side = json.loads(wav.with_suffix(".json").read_text())
            fam = side["family"]
            if only and fam not in only:
                continue
            x, sr = sf.read(str(wav), always_2d=True)
            y = x.mean(1).astype(np.float32)
            y48 = librosa.resample(y, orig_sr=sr, target_sr=48000)
            seg = 48000 * 10
            chunks = [y48[i:i + seg] for i in range(0, max(len(y48) - seg // 2, 1), seg)] or [y48]
            with torch.no_grad():
                a = proc(audio=chunks, sampling_rate=48000, return_tensors="pt")
                ae = torch.nn.functional.normalize(_tensor(clap.get_audio_features(**a)), dim=-1).mean(0, keepdim=True)
                sims = (torch.nn.functional.normalize(ae, dim=-1) @ te.T)[0]
            i = names.index(fam)
            grp = fams[fam].get("group")
            keep = torch.tensor([j == i or grp is None or j >= len(names) or fams[names[j]].get("group") != grp for j in range(len(texts))])
            ks = sims[keep]
            ki = int(keep[:i].sum())  # this family's index among the kept competitors
            r = {"family": fam, "seed": side["seed"], "wav": str(wav), "side": side,
                 "p": round(float(torch.softmax(ks * scale, 0)[ki]), 3), "rank": int((ks > ks[ki]).sum()) + 1,
                 "best_match": texts[int(sims.argmax())], "peak": round(float(np.abs(x).max()), 3)}
            if fams[fam]["kind"] in ("bed", "hum"):
                r["seam"] = loop_seam(librosa.resample(y, orig_sr=sr, target_sr=22050), 22050, 240.0, len(y) / sr)  # 1 s grid
            takes.append(r)
        if not takes:
            continue
        by_fam: dict[str, list[dict]] = {}
        for r in takes:
            by_fam.setdefault(r["family"], []).append(r)
        for rs in by_fam.values():
            rs.sort(key=lambda r: (r["rank"] <= 3, r["p"] * (0.7 + 0.3 * max(r.get("seam", {}).get("score", 1.0), 0.0))), reverse=True)
        picks[model] = by_fam
        best = {f: rs[0] for f, rs in by_fam.items()}
        ranks = [b["rank"] for b in best.values()]
        gens = [r["side"].get("gen_time_s", 0) for r in takes]
        summary[model] = {"title": meta["title"], "licence": meta["short"], "families_rendered": len(best),
                          "rank1": sum(x == 1 for x in ranks), "top5": sum(x <= SHIP_MAX_RANK for x in ranks),
                          "mean_rank": round(float(np.mean(ranks)), 2), "median_rank": float(np.median(ranks)),
                          "mean_gen_s": round(float(np.mean(gens)), 2),
                          "mps_driver_gb_max": max((r["side"].get("mps_driver_gb") or 0) for r in takes)}
        tag = meta["set"] or model
        rows = {f: [{k: v for k, v in r.items() if k != "wav"} for r in rs] for f, rs in by_fam.items()}
        if only:  # every other family keeps its own round's rows
            rows = {**json.loads((HERE / f"{prefix}{tag}.json").read_text())["families"], **rows}
        (HERE / f"{prefix}{tag}.json").write_text(json.dumps({"model": meta["title"], "families": rows}, indent=2) + "\n")
        if meta["set"] is None:
            continue

        # ---- ship this model's set
        dest = out_root / meta["set"]
        dest.mkdir(parents=True, exist_ok=True)
        man: dict = {"model": meta["title"], "credit": meta["credit"], "licence": meta["licence"],
                     "beds": {}, "hums": {}, "oneshots": {}, "provenance": []}
        total, skipped = 0, []
        if only:  # keep the other families' entries and files; drop these families' old ones
            man = json.loads((dest / "sfx.json").read_text())
            gone: list[str] = []
            for fam in only:
                kind = fams[fam]["kind"]
                sec, key = (man["oneshots"], fam) if kind == "oneshot" else (man["beds" if kind == "bed" else "hums"], family_key(fam))
                e = sec.pop(key, None)
                if e is not None:
                    gone += e["files"] if "files" in e else [e["file"]]
            man["provenance"] = [p for p in man["provenance"] if p["file"] not in gone]
            for f in gone:
                (dest / f).unlink(missing_ok=True)
            skipped = [f for f in man.get("synth_keeps", []) if f not in only]
        else:
            for old in dest.glob("*.m4a"):  # this folder holds only this script's output
                old.unlink()
        for fam, rs in sorted(by_fam.items()):
            kind = fams[fam]["kind"]
            if rs[0]["rank"] > SHIP_MAX_RANK:  # its best take sounds more like some other family: the synth keeps it
                skipped.append(fam)
                continue
            chosen = rs[:1] if kind != "oneshot" else [r for r in rs[:2] if r is rs[0] or r["rank"] <= 3]
            for r in chosen:
                x, sr = sf.read(r["wav"], always_2d=True)
                x = x.T.astype(np.float64)
                if kind in ("bed", "hum"):
                    s = r["seam"]
                    y, _ = seam(x, sr, {"loopStart": s["start_s"], "loopEnd": s["end_s"]}, 1.0)
                else:
                    y = trim(x, sr, 3.0)
                L, tp = lufs(y, sr)
                y = y * 10 ** (min(LEVEL[kind] - L, -1.0 - tp) / 20)
                tmp = dest / ".tmp.m4a"
                total += encode(y, sr, tmp, mono=(kind == "oneshot"), kbps=BED_KBPS if (args.stage and kind == "bed") else None)
                lag, dlen = decode_offset(tmp, y, sr) if kind in ("bed", "hum") else (0.0, 0.0)
                fname = shipped_name(dest, tmp, f"{fam}-{r['seed']}")
                if kind in ("bed", "hum"):
                    entry = {"file": fname, "loopStart": round(r["seam"]["start_s"] + lag, 4), "loopEnd": round(r["seam"]["end_s"] + lag, 4),
                             "duration": round(dlen, 4), "gain": GAIN.get(fam, 0.5)}
                    assert entry["loopEnd"] <= dlen and entry["loopEnd"] - entry["loopStart"] > 0.5
                    man["beds" if kind == "bed" else "hums"][family_key(fam)] = entry
                else:
                    man["oneshots"].setdefault(fam, {"files": [], "gain": 1.0})["files"].append(fname)
                man["provenance"].append({"file": fname, "model": r["side"]["repo"], "code": r["side"]["code_commit"], "prompt": r["side"]["prompt"],
                                          "seed": r["seed"], "steps": r["side"]["steps"], "clap_p": r["p"], "clap_rank": r["rank"]})
        man["synth_keeps"] = sorted(skipped)
        (dest / "sfx.json").write_text(json.dumps(man, indent=2, ensure_ascii=False) + "\n")
        summary[model].update(shipped=len(by_fam) - len(skipped), synth_keeps=sorted(skipped), bytes=total)
        print(f"{meta['set']}: {total / 1e6:.2f} MB {'added' if only else ''}, {'ranked' if only else 'ships'} {len(by_fam)}, synth keeps {sorted(skipped)}", flush=True)

    peaks = HERE / "sfx-peaks.json"  # measured peak RSS per model process (/usr/bin/time -l), written from the run logs
    if peaks.exists():
        for m, gb in json.loads(peaks.read_text()).items():
            if m in summary:
                summary[m]["peak_gb"] = gb
    if args.stage and only:
        return
    if args.stage:
        (HERE / f"sfx-{args.tag}-summary.json").write_text(json.dumps(summary, indent=2) + "\n")
        return
    (HERE / "sfx-summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    page(raw, picks, summary, names, fams)


def page(raw: Path, picks: dict, summary: dict, names: list[str], fams: dict) -> None:
    from build_page import PAGE_CSS

    for old in ART.glob("*/*.mp3"):
        old.unlink()
    cols = [m for m in SETS if m in picks]
    rows = []
    for fam in names:
        cells = []
        best_rank = min((picks[m][fam][0]["rank"] for m in cols if fam in picks[m]), default=None)
        for m in cols:
            rs = picks[m].get(fam)
            if not rs:
                cells.append("<td class='empty'>not tried</td>")
                continue
            r = rs[0]
            mp3 = ART / (SETS[m]["set"] or m) / f"{fam}-{r['seed']}.mp3"
            mp3.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", r["wav"], "-t", "20", "-ac", "1", "-af", "loudnorm=I=-18:TP=-1.5",
                            "-c:a", "libmp3lame", "-b:a", "96k", str(mp3)], check=True)
            tone = "good" if r["rank"] == 1 else ("warn" if r["rank"] <= SHIP_MAX_RANK else "bad")
            if SETS[m]["set"] is None:
                ship = "compared only"
            else:
                ship = "in the game" if r["rank"] <= SHIP_MAX_RANK else "synth plays"
            star = " <span class='chip good'><b>best</b></span>" if r["rank"] == best_rank else ""
            cells.append(f"<td><audio controls preload='none' src='{html.escape(mp3.parent.name)}/{html.escape(mp3.name)}'></audio>"
                         f"<div class='chips'><span class='chip {tone}'><b>CLAP</b> rank {r['rank']} &middot; {r['p'] * 100:.0f}%</span>"
                         f"<span class='chip'>{ship}</span>{star}</div></td>")
        rows.append(f"<tr><th scope='row'>{html.escape(fam)}<br><span class='meta'>{html.escape(fams[fam]['desc'])}</span></th>{''.join(cells)}</tr>")
    srows = []
    for m in cols:
        s = summary[m]
        shipped = f"{s['shipped']} of {s['families_rendered']}" if "shipped" in s else f"compared on {s['families_rendered']}"
        srows.append(f"<tr><td><b>{html.escape(s['title'])}</b></td><td>{shipped}</td><td>{s['rank1']}</td><td>{s['mean_rank']}</td>"
                     f"<td>{s['mean_gen_s']} s</td><td>{s.get('peak_gb', s['mps_driver_gb_max'])} GB</td><td>{html.escape(s['licence'])}</td></tr>")
    (ART / "index.html").write_text(f"""<title>Wildshard Sound Effects Round 2</title>
<meta name="description" content="Every Wildshard sound effect from the top three commercial-licence local SFX models, side by side, CLAP-ranked.">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500;6..72,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
{PAGE_CSS}
.grid td, .grid th {{ white-space: normal; vertical-align: top; }}
.grid th[scope=row] {{ text-transform: none; letter-spacing: 0; font-size: 13px; color: var(--ink); min-width: 150px; }}
.grid audio {{ width: 200px; max-width: 100%; }}
</style>
<div class="wrap">
  <header>
    <h1>Wildshard sound effects, round 2</h1>
    <p class="lede">Every sound the game makes that is not music, from the three best local sound-effect models whose licences allow commercial use. Each cell is that model's best of three takes, ranked by CLAP: "rank 1" means the audio matched its own description better than any of the other {len(names) - 1} families and three foils. A set carries a family only when its take ranks in the top {SHIP_MAX_RANK}; otherwise the game's synth plays it. All three sets are in the game (Settings, Sound effects). MiniMax Music 3 was tried on ten families as a fourth column.</p>
  </header>
  <section class="notes"><h2>The models</h2>
    <div class="tablewrap"><table class="models">
      <thead><tr><th>model</th><th>families in the game</th><th>rank 1</th><th>mean rank</th><th>time per take</th><th>peak memory</th><th>licence</th></tr></thead>
      <tbody>{''.join(srows)}</tbody>
    </table></div>
  </section>
  <section class="style"><div class="tablewrap"><table class="grid">
    <thead><tr><th>family</th>{''.join(f'<th>{html.escape(SETS[m]["title"])}</th>' for m in cols)}</tr></thead>
    <tbody>{''.join(rows)}</tbody>
  </table></div></section>
</div>
""")
    print(f"page -> {ART / 'index.html'}")


if __name__ == "__main__":
    main()
