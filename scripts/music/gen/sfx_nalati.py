"""NALATI-MERGE A1: Nalati's sound families into main's ONE merged set (AGENTS.md "Audio engines": every sound generated
with MOSS-SoundEffect v2 AND Stable Audio 3 Medium, the better take ships, picked per sound).

    ~/ml/music/analysis/.venv/bin/python scripts/music/gen/sfx_nalati.py <sfx-raw-dir> [--dry-run]

Reads <raw>/moss/<family>/<seed>.wav and <raw>/medium/<family>/<seed>.wav (+ .json) — gen_sfx_moss.py / gen_sfx.py
--jobs sfx-nalati-jobs.json. Per take, CLAP (laion/clap-htsat-fused) as in sfx_build.py: the softmax of its own family
description against every OTHER Nalati family's description (siblings in the same `group` left out: a hoof on grass is
not a hoof on gravel's competitor) plus the three foils; `rank` 1 = its own description matches best.
Per family: each model's best take (rank <= 3 first, then p, beds weighted by their loop seam); the winner is the lower
rank of the two, ties to the higher p (sfx_merge.py's rule). It ships only if it ranks <= SHIP_MAX_RANK (5); a one-shot
adds the winner's second take as a variant when that also ranks <= 3. A family nobody wins keeps its synth.
Encoding (sfx_build.py's): one-shots mono AAC 64 kb/s trimmed to the sounding part at -18 LUFS; beds stereo AAC 64 kb/s
(the budget: +~2 MB accepted by the user) at -24 LUFS, looped on the best seam >= 10 s (analyze.loop_seam on a 5 s grid),
the seam crossfaded (stems.seam) and the loop points re-measured on the decoded file.
Merged INTO public/assets/sfx/best/ additively: every entry is tagged `shard: 'nalati'` (src/client/engine/audio/preload.ts decodes it on
the steppe only); a re-run first removes the previous Nalati files (the provenance rows marked `round: 'nalati'`) and
nothing else. Writes scripts/music/gen/sfx-nalati.json (every take, every score, the decision per family) and adds the
rows to sfx-best.json under `nalati`.

    ... sfx_nalati.py <new-raw-dir> --only fam,fam,...      (NALATI-FINISH B3)

A later round of a few families, after the first round's raw takes are gone: only these families' takes in <raw> are
ranked (against every family's description, as ever) and pooled with the takes sfx-nalati.json already scored for them;
the same rule decides. A first-round take that still ships keeps its shipped file (found by family, seed and engine in
the provenance); one that was never shipped cannot be re-encoded and is skipped; one scored by another rubric (the family
got a `clap_desc` since) is left out of the pool. Only these families' files, rows and
`synth_keeps` entries change; every other Nalati family, bed and file stays as it is.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from analyze import CLAP_DIR, _tensor, loop_seam  # noqa: E402
from sfx_build import FOILS, LEVEL, SHIP_MAX_RANK, trim  # noqa: E402
from stems import decode_offset, lufs, seam, shipped_name  # noqa: E402

REPO = HERE.parents[2]
BEST = REPO / "public/assets/sfx/best"
MODELS = {"moss": "MOSS-SoundEffect v2.0 (OpenMOSS-Team/MOSS-SoundEffect-v2.0, Apache-2.0)",
          "medium": "Stable Audio 3 Medium (stabilityai/stable-audio-3-medium, Stability AI Community License)"}
SET_OF = {"moss": "moss", "medium": "sa3-medium"}
BED_GAIN = 0.5


def encode(x: np.ndarray, sr: int, dest: Path, mono: bool) -> int:
    """AAC-LC .m4a at 48 kHz, 64 kb/s (mono one-shots, stereo beds)"""
    import subprocess
    import tempfile

    dest.parent.mkdir(parents=True, exist_ok=True)
    y = librosa.resample(x, orig_sr=sr, target_sr=48000, res_type="soxr_hq") if sr != 48000 else x
    if mono:
        y = y.mean(0, keepdims=True)
    with tempfile.NamedTemporaryFile(suffix=".wav") as f:
        sf.write(f.name, y.T, 48000, subtype="FLOAT")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", f.name, "-ac", "1" if mono else "2", "-c:a", "aac", "-b:a", "64k",
                        "-movflags", "+faststart", str(dest)], check=True)
    return dest.stat().st_size


def rank_all(raw: Path, fams: dict, only: set[str] | None = None) -> dict[str, dict[str, list[dict]]]:
    import torch
    from transformers import ClapModel, ClapProcessor

    clap = ClapModel.from_pretrained(str(CLAP_DIR)).eval()
    proc = ClapProcessor.from_pretrained(str(CLAP_DIR))
    scale = float(clap.logit_scale_a.detach().exp())
    names = list(fams)
    texts = [fams[f]["desc"] for f in names] + FOILS
    with torch.no_grad():
        te = torch.nn.functional.normalize(_tensor(clap.get_text_features(**proc(text=texts, return_tensors="pt", padding=True))), dim=-1)
    # `clap_desc`: the text a family's OWN takes are judged by, when its `desc` is a weak CLAP anchor (B3: "a spear thrust fast
    # forward" lost to a bowstring on every take, whatever the take). Other families still meet its plain `desc` as a rival.
    own = {f: fams[f]["clap_desc"] for f in names if "clap_desc" in fams[f]}
    with torch.no_grad():
        te_own = {f: torch.nn.functional.normalize(_tensor(clap.get_text_features(**proc(text=[t], return_tensors="pt", padding=True))), dim=-1)[0]
                  for f, t in own.items()}
    out: dict[str, dict[str, list[dict]]] = {}
    for model in MODELS:
        by: dict[str, list[dict]] = {}
        for wav in sorted((raw / model).glob("*/*.wav")):
            side = json.loads(wav.with_suffix(".json").read_text())
            fam = side["family"]
            if fam not in fams or (only and fam not in only):
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
            ttexts = list(texts)
            if fam in te_own:
                sims = sims.clone()
                sims[i] = float((torch.nn.functional.normalize(ae, dim=-1)[0] * te_own[fam]).sum())
                ttexts[i] = own[fam]
            grp = fams[fam].get("group")
            keep = torch.tensor([j == i or j >= len(names) or grp is None or fams[names[j]].get("group") != grp for j in range(len(texts))])
            ks, ki = sims[keep], int(keep[:i].sum())
            r = {"family": fam, "model": model, "seed": side["seed"], "wav": str(wav), "side": side,
                 "p": round(float(torch.softmax(ks * scale, 0)[ki]), 3), "rank": int((ks > ks[ki]).sum()) + 1,
                 "best_match": ttexts[int(sims.argmax())], "rubric": ttexts[i], "peak": round(float(np.abs(x).max()), 3)}
            if fams[fam]["kind"] == "bed":
                r["seam"] = loop_seam(librosa.resample(y, orig_sr=sr, target_sr=22050), 22050, 48.0, len(y) / sr)  # a 5 s grid, >= 10 s loops
            by.setdefault(fam, []).append(r)
        for rs in by.values():
            order(rs)
        out[model] = by
    return out


def order(rs: list[dict]) -> None:
    """best take first: rank <= 3 first, then p (a bed's p weighted by its loop seam)"""
    rs.sort(key=lambda r: (r["rank"] <= 3, r["p"] * (0.7 + 0.3 * max(r.get("seam", {}).get("score", 1.0), 0.0))), reverse=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("raw")
    ap.add_argument("--dry-run", action="store_true", help="rank and decide only; write sfx-nalati.json, touch no shipped file")
    ap.add_argument("--only", default="", help="a later round: rank just these families' new takes, pool them with the scored ones, replace only these")
    args = ap.parse_args()
    raw = Path(args.raw)
    fams = json.loads((HERE / "sfx-nalati-jobs.json").read_text())["families"]
    only = {f for f in args.only.split(",") if f}
    if only:
        unknown = only - set(fams)
        if unknown:
            raise SystemExit(f"--only: not Nalati families: {sorted(unknown)}")
        only_round(raw, fams, only, args.dry_run)
        return
    ranked = rank_all(raw, fams)

    table: dict[str, dict] = {}
    winners: dict[str, list[dict]] = {}
    for fam in fams:
        best = {m: ranked[m].get(fam, []) for m in MODELS}
        row: dict = {m: ({"rank": rs[0]["rank"], "p": rs[0]["p"], "seed": rs[0]["seed"], "best_match": rs[0]["best_match"]} if rs else None) for m, rs in best.items()}
        cands = [(rs[0]["rank"], -rs[0]["p"], m) for m, rs in best.items() if rs]
        if not cands:
            row["winner"] = "missing"
        else:
            rank, _, win = min(cands)
            row["winner"] = win if rank <= SHIP_MAX_RANK else "synth"
            if rank <= SHIP_MAX_RANK:
                rs = best[win]
                winners[fam] = rs[:1] if fams[fam]["kind"] != "oneshot" else [r for r in rs[:2] if r is rs[0] or r["rank"] <= 3]
        table[fam] = row
    wins = {k: sum(1 for t in table.values() if t["winner"] == k) for k in ("moss", "medium", "synth", "missing")}
    rec = {"rule": "per family: each model's best take by CLAP (siblings in a group not competing); the lower rank wins, ties to the higher p; ships only in the top 5",
           "wins": wins, "families": table,
           "takes": {m: {f: [{k: v for k, v in r.items() if k != "wav"} for r in rs] for f, rs in by.items()} for m, by in ranked.items()}}
    if args.dry_run:
        (HERE / "sfx-nalati.json").write_text(json.dumps(rec, indent=2, ensure_ascii=False) + "\n")
        print(f"dry run: wins {wins}")
        return

    man = json.loads((BEST / "sfx.json").read_text())
    # the previous Nalati round out (its files and rows only)
    old = [p for p in man["provenance"] if p.get("round") == "nalati"]
    for p in old:
        (BEST / p["file"]).unlink(missing_ok=True)
    man["provenance"] = [p for p in man["provenance"] if p.get("round") != "nalati"]
    for sec in ("beds", "oneshots"):
        for k in [k for k, v in man[sec].items() if v.get("shard") == "nalati"]:
            del man[sec][k]
    total = 0
    for fam, takes in winners.items():
        kind = fams[fam]["kind"]
        for r in takes:
            x, sr = sf.read(r["wav"], always_2d=True)
            x = x.T.astype(np.float64)
            if kind == "bed":
                s = r["seam"]
                y, _ = seam(x, sr, {"loopStart": s["start_s"], "loopEnd": s["end_s"]}, 1.0)
            else:
                y = trim(x, sr, 5.0 if fam in ("stampede", "thunder-near", "thunder-far", "wolf_howl") else 3.0)
            L, tp = lufs(y, sr)
            y = y * 10 ** (min(LEVEL[kind] - L, -1.0 - tp) / 20)
            tmp = BEST / ".tmp.m4a"
            total += encode(y, sr, tmp, mono=(kind == "oneshot"))
            lag, dlen = decode_offset(tmp, y, sr) if kind == "bed" else (0.0, 0.0)
            fname = shipped_name(BEST, tmp, f"{fam}-{r['seed']}")
            if kind == "bed":
                e = {"file": fname, "loopStart": round(r["seam"]["start_s"] + lag, 4), "loopEnd": round(r["seam"]["end_s"] + lag, 4),
                     "duration": round(dlen, 4), "gain": BED_GAIN, "shard": "nalati"}
                assert e["loopEnd"] <= dlen and e["loopEnd"] - e["loopStart"] > 0.5
                man["beds"][fam.split("-", 1)[1]] = e
            else:
                man["oneshots"].setdefault(fam, {"files": [], "gain": 1.0, "shard": "nalati"})["files"].append(fname)
            man["provenance"].append({"file": fname, "model": r["side"]["repo"], "code": r["side"]["code_commit"], "prompt": r["side"]["prompt"],
                                      "seed": r["seed"], "steps": r["side"]["steps"], "clap_p": r["p"], "clap_rank": r["rank"],
                                      "source": MODELS[r["model"]], "set_of_origin": SET_OF[r["model"]], "round": "nalati"})
    man["synth_keeps"] = sorted(set(man.get("synth_keeps", [])) | {f for f, t in table.items() if t["winner"] in ("synth", "missing")})
    (BEST / "sfx.json").write_text(json.dumps(man, indent=2, ensure_ascii=False) + "\n")
    rec["bytes"] = total
    (HERE / "sfx-nalati.json").write_text(json.dumps(rec, indent=2, ensure_ascii=False) + "\n")
    bt = json.loads((HERE / "sfx-best.json").read_text())
    bt["nalati"] = {"rule": rec["rule"], "wins": wins, "bytes": total, "families": table}
    (HERE / "sfx-best.json").write_text(json.dumps(bt, indent=2) + "\n")
    print(f"nalati: +{total / 1e6:.2f} MB into best/, wins {wins}")


def ship_take(r: dict, fam: str, kind: str) -> tuple[str, int, dict]:
    """trim / level / encode one take into best/ (sfx_build.py's rules); returns its file name, bytes and bed entry"""
    x, sr = sf.read(r["wav"], always_2d=True)
    x = x.T.astype(np.float64)
    if kind == "bed":
        s = r["seam"]
        y, _ = seam(x, sr, {"loopStart": s["start_s"], "loopEnd": s["end_s"]}, 1.0)
    else:
        y = trim(x, sr, 5.0 if fam in ("stampede", "thunder-near", "thunder-far", "wolf_howl") else 3.0)
    L, tp = lufs(y, sr)
    y = y * 10 ** (min(LEVEL[kind] - L, -1.0 - tp) / 20)
    tmp = BEST / ".tmp.m4a"
    size = encode(y, sr, tmp, mono=(kind == "oneshot"))
    lag, dlen = decode_offset(tmp, y, sr) if kind == "bed" else (0.0, 0.0)
    fname = shipped_name(BEST, tmp, f"{fam}-{r['seed']}")
    bed: dict = {}
    if kind == "bed":
        bed = {"file": fname, "loopStart": round(r["seam"]["start_s"] + lag, 4), "loopEnd": round(r["seam"]["end_s"] + lag, 4),
               "duration": round(dlen, 4), "gain": BED_GAIN, "shard": "nalati"}
        assert bed["loopEnd"] <= dlen and bed["loopEnd"] - bed["loopStart"] > 0.5
    return fname, size, bed


def only_round(raw: Path, fams: dict, only: set[str], dry_run: bool) -> None:
    """NALATI-FINISH B3: a later round of `only`, pooled with the takes sfx-nalati.json already scored"""
    rec = json.loads((HERE / "sfx-nalati.json").read_text())
    new = rank_all(raw, fams, only)
    man = json.loads((BEST / "sfx.json").read_text())
    prov = {p["file"]: p for p in man["provenance"] if p.get("round") == "nalati"}
    for fam in sorted(only):
        kind = fams[fam]["kind"]
        pools: dict[str, list[dict]] = {}
        for m in MODELS:
            fresh = new[m].get(fam, [])
            seeds = {r["seed"] for r in fresh}
            rubric = fams[fam].get("clap_desc", fams[fam]["desc"])  # a take scored by another rubric is not comparable: left out
            prior = [{**r, "prior": True} for r in rec["takes"].get(m, {}).get(fam, [])
                     if r["seed"] not in seeds and r.get("rubric", fams[fam]["desc"]) == rubric]
            pools[m] = prior + fresh
            order(pools[m])
        row: dict = {m: ({"rank": rs[0]["rank"], "p": rs[0]["p"], "seed": rs[0]["seed"], "best_match": rs[0]["best_match"]} if rs else None)
                     for m, rs in pools.items()}
        cands = [(rs[0]["rank"], -rs[0]["p"], m) for m, rs in pools.items() if rs]
        rank, _, win = min(cands)
        row["winner"] = win if rank <= SHIP_MAX_RANK else "synth"
        chosen: list[dict] = []
        if rank <= SHIP_MAX_RANK:
            rs = pools[win]
            chosen = rs[:1] if kind != "oneshot" else [r for r in rs[:2] if r is rs[0] or r["rank"] <= 3]
        row["round"] = "b3"
        old_files = [f for f, p in prov.items() if p["file"].startswith(f"{fam}-") and
                     (man["oneshots"].get(fam, {}).get("files", []).count(f) or man["beds"].get(fam.split("-", 1)[1], {}).get("file") == f)]
        keep: list[tuple[dict, str | None]] = []
        for r in chosen:
            if r.get("prior"):
                f = next((f for f in old_files if f.startswith(f"{fam}-{r['seed']}-") and prov[f]["set_of_origin"] == SET_OF[r["model"]]), None)
                if f is None:
                    print(f"  {fam}: {r['model']} seed {r['seed']} (first round) was never shipped and its wav is gone: skipped")
                    continue
                keep.append((r, f))
            else:
                keep.append((r, None))
        row["ships"] = [f"{r['model']} seed {r['seed']} rank {r['rank']} p {r['p']}" + (" (kept)" if f else " (new)") for r, f in keep]
        print(f"{fam}: winner {row['winner']}  " + "; ".join(row["ships"]) + f"   (was {rec['families'].get(fam, {}).get('winner')})")
        rec["families"][fam] = row
        for m in MODELS:
            rec["takes"].setdefault(m, {})[fam] = [{k: v for k, v in r.items() if k != "wav"} for r in pools[m]]
        if dry_run:
            continue
        kept = {f for _, f in keep if f}
        for f in old_files:
            if f not in kept:
                (BEST / f).unlink(missing_ok=True)
        man["provenance"] = [p for p in man["provenance"] if not (p["file"] in old_files and p["file"] not in kept)]
        files: list[str] = []
        for r, f in keep:
            if f is None:
                f, _, bed = ship_take(r, fam, kind)
                if kind == "bed":
                    man["beds"][fam.split("-", 1)[1]] = bed
                man["provenance"].append({"file": f, "model": r["side"]["repo"], "code": r["side"]["code_commit"], "prompt": r["side"]["prompt"],
                                          "seed": r["seed"], "steps": r["side"]["steps"], "clap_p": r["p"], "clap_rank": r["rank"],
                                          "source": MODELS[r["model"]], "set_of_origin": SET_OF[r["model"]], "round": "nalati"})
            files.append(f)
        if kind == "oneshot":
            if files:
                man["oneshots"][fam] = {"files": files, "gain": man["oneshots"].get(fam, {}).get("gain", 1.0), "shard": "nalati"}
            else:
                man["oneshots"].pop(fam, None)
        elif not files:
            man["beds"].pop(fam.split("-", 1)[1], None)
        keeps = set(man.get("synth_keeps", []))
        man["synth_keeps"] = sorted(keeps - {fam} if files else keeps | {fam})
    rec["wins"] = {k: sum(1 for t in rec["families"].values() if t["winner"] == k) for k in ("moss", "medium", "synth", "missing")}
    (HERE / "sfx-nalati.json").write_text(json.dumps(rec, indent=2, ensure_ascii=False) + "\n")
    if dry_run:
        print(f"dry run: wins {rec['wins']}")
        return
    # a family the first round shipped but left in synth_keeps (the camp bed's re-roll): out
    shipped = {k for k, v in man["oneshots"].items() if v.get("shard") == "nalati"} | {f"bed-{k}" for k, v in man["beds"].items() if v.get("shard") == "nalati"}
    man["synth_keeps"] = sorted(set(man["synth_keeps"]) - shipped)
    (BEST / "sfx.json").write_text(json.dumps(man, indent=2, ensure_ascii=False) + "\n")
    total = sum((BEST / p["file"]).stat().st_size for p in man["provenance"] if p.get("round") == "nalati")
    rec["bytes"] = total
    (HERE / "sfx-nalati.json").write_text(json.dumps(rec, indent=2, ensure_ascii=False) + "\n")
    bt = json.loads((HERE / "sfx-best.json").read_text())
    bt["nalati"] = {"rule": rec["rule"], "wins": rec["wins"], "bytes": total, "families": rec["families"]}
    (HERE / "sfx-best.json").write_text(json.dumps(bt, indent=2) + "\n")
    print(f"nalati ({','.join(sorted(only))}): {total / 1e6:.2f} MB of Nalati files in best/, wins {rec['wins']}")


if __name__ == "__main__":
    main()
