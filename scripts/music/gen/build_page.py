"""Rank the bake-off takes, encode the shortlist, write <style>.json and the listening page.

    python3 scripts/music/gen/build_page.py <raw-dir>

Reads <raw-dir>/<style>/<take>.wav + .json (generator sidecar) + .metrics.json (analyze.py).
Writes, in this repo:
  scripts/music/gen/<style>.json          every take: model, version, prompt, seed, timing, metrics, score
  art/music/round-1-bakeoff/<style>/*.m4a the shortlist (3 per style), AAC-LC 96 kb/s, <= 75 s,
                                          gain-matched to -18 LUFS so no take wins by being louder
  art/music/round-1-bakeoff/index.html    the listening page (audio referenced relatively)
Only the shortlist is encoded/committed; the full take set stays in <raw-dir>.

Nobody could listen while ranking, so the score is objective checks only (see SCORE below). It is a
shortlist filter, not a verdict - the user's ears pick.
"""

from __future__ import annotations

import html
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
ART = REPO / "art/music/round-1-bakeoff"
STYLES = ("piano", "orchestral", "folk")
MAX_S = 75.0
TARGET_LUFS = -18.0

SCORE = {
    "style": 0.35,      # CLAP: probability the take matches its own style brief (of the three)
    "seam": 0.20,       # best bar-exact loop seam similarity
    "length": 0.10,     # >= 60 s is a theme; 47 s is short; 11 s is a loop/one-shot
    "tempo": 0.10,      # beat-tracked tempo vs brief BPM (half/double tolerated)
    "key": 0.10,        # D major (or relative B minor) by chroma
    "clean": 0.15,      # no clipping, no internal dropouts, not dull (95 % rolloff)
}
VOCAL_PENALTY = 0.0     # CLAP vocals-vs-instrumental: shown, NOT scored - it rated ~every full-band take (folk,
                        # orchestral) >= 0.9 "vocal", so it cannot tell a fiddle or a choir pad from a singer


def family(side: dict) -> str:
    return side["model"]


def score(m: dict, style: str) -> tuple[float, dict]:
    clap = m.get("clap", {})
    parts = {
        "style": clap.get("style_prob", {}).get(style, 0.0),
        "seam": max(0.0, min(1.0, (m["loop"].get("score", -1) - 0.1) / 0.6)) if m["loop"].get("score", -1) > 0 else 0.0,
        "length": 1.0 if m["duration_s"] >= 59 else (0.6 if m["duration_s"] >= 40 else 0.15),
        "tempo": 1.0 - min(m["tempo"]["rel_err"] / 0.1, 1.0),
        "key": 1.0 if m["key"]["key_ok"] else (0.5 if m["key"]["d_major_rank"] <= 4 else 0.0),
    }
    clean = 1.0
    if m["clipping"]["clipped_frac"] > 1e-4:
        clean -= 0.5
    if m["silence"]["longest_internal_gap_s"] > 2.0:
        clean -= 0.3
    if m["spectrum"]["rolloff95_hz"] < 7000:
        clean -= 0.2
    if m.get("vocals", {}).get("vocal_energy_share", 0) > 0.10:  # demucs: a real voice, not lead-instrument bleed
        clean -= 0.6
    parts["clean"] = max(clean, 0.0)
    total = sum(SCORE[k] * v for k, v in parts.items()) - VOCAL_PENALTY * clap.get("vocal_prob", 0.0)
    return round(total, 3), {k: round(v, 3) for k, v in parts.items()}


def encode(wav: Path, m: dict, dest: Path) -> dict:
    dest.parent.mkdir(parents=True, exist_ok=True)
    lufs, tp = m["loudness"]["lufs"], m["loudness"]["true_peak_dbfs"]
    gain = min(TARGET_LUFS - lufs, -1.0 - tp)
    dur = min(m["duration_s"], MAX_S)
    af = f"volume={gain:.2f}dB"
    if m["duration_s"] > MAX_S:
        af += f",afade=t=out:st={MAX_S - 2:.2f}:d=2"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-t", f"{dur:.2f}", "-af", af,
                    "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(dest)], check=True)
    return {"gain_db": round(gain, 2), "seconds": round(dur, 2), "bytes": dest.stat().st_size}


def main() -> None:
    raw = Path(sys.argv[1])
    briefs = json.loads((HERE / "briefs.json").read_text())
    models = json.loads((HERE / "models.json").read_text())
    exclude = tuple(models.get("_exclude_prefixes", []))
    out: dict = {}
    for style in STYLES:
        takes = []
        for side_p in sorted((raw / style).glob("*.json")):
            if side_p.name.endswith(".metrics.json"):
                continue
            name = side_p.stem
            if name.startswith(exclude):
                continue
            mp = side_p.with_name(name + ".metrics.json")
            if not mp.exists():
                continue
            side, m = json.loads(side_p.read_text()), json.loads(mp.read_text())
            total, parts = score(m, style)
            takes.append({"id": name, "side": side, "metrics": m, "score": total, "parts": parts})
        takes.sort(key=lambda t: -t["score"])
        short, per_family = [], {}
        for t in takes:
            fam = family(t["side"])
            sung = t["metrics"].get("vocals", {}).get("vocal_energy_share", 0) > 0.20
            if t["metrics"]["duration_s"] < 30 or sung or per_family.get(fam, 0) >= 1:  # one per model: the bake-off is between models
                continue
            short.append(t)
            per_family[fam] = per_family.get(fam, 0) + 1
            if len(short) == 3:
                break
        for old in (ART / style).glob("*.m4a"):  # this folder holds only this script's output
            old.unlink()
        for rank, t in enumerate(short, 1):
            t["shortlist"] = rank
            t["file"] = f"{style}/{t['id']}.m4a"
            t["encode"] = encode(raw / style / f"{t['id']}.wav", t["metrics"], ART / t["file"])
        out[style] = takes
        rec = {
            "style": style,
            "brief": briefs["shared"] | briefs["styles"][style],
            "scoring": {"weights": SCORE, "vocal_penalty": VOCAL_PENALTY, "target_lufs": TARGET_LUFS},
            "shortlist": [t["id"] for t in short],
            "takes": [
                {
                    "id": t["id"], "score": t["score"], "parts": t["parts"], "shortlist": t.get("shortlist"),
                    "file": t.get("file"), "encode": t.get("encode"),
                    **{k: t["side"].get(k) for k in ("model", "variant", "lm", "codec", "code_commit", "backend", "seed", "prompt",
                                                    "negative_prompt", "lyrics", "bpm", "key", "duration_s", "steps", "guidance",
                                                    "cfg", "cfg_scale", "temperature", "topk", "gen_time_s", "model_load_s",
                                                    "mlx_peak_gb", "mps_driver_gb") if t["side"].get(k) is not None},
                    "metrics": t["metrics"],
                }
                for t in takes
            ],
        }
        (HERE / f"{style}.json").write_text(json.dumps(rec, indent=2, ensure_ascii=False) + "\n")
        print(f"{style}: {len(takes)} takes, shortlist {[t['id'] for t in short]}")
    (ART / "index.html").write_text(page(out, briefs, models))
    total = sum(p.stat().st_size for p in ART.glob("*/*.m4a"))
    print(f"audio total {total / 1e6:.1f} MB -> {ART}")


# ---------------------------------------------------------------- page

PAGE_CSS = """:root {
  --ground: #eef2f1; --surface: #ffffff; --ink: #14201e; --muted: #56655f; --line: #d3dcd9;
  --accent: #0f6e66; --accent-soft: #dcefeb; --warn: #9a5b00; --warn-soft: #fbefd9; --bad: #a3222b; --bad-soft: #f8dfe1;
  --good: #1d6b3a; --good-soft: #def1e4;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --ground: #0d1413; --surface: #141d1c; --ink: #e2ebe8; --muted: #93a39e; --line: #26332f;
    --accent: #5fc9b9; --accent-soft: #173330; --warn: #e3a64a; --warn-soft: #33270f; --bad: #f08a91; --bad-soft: #3a1a1d;
    --good: #7fd49c; --good-soft: #15301f;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --ground: #0d1413; --surface: #141d1c; --ink: #e2ebe8; --muted: #93a39e; --line: #26332f;
  --accent: #5fc9b9; --accent-soft: #173330; --warn: #e3a64a; --warn-soft: #33270f; --bad: #f08a91; --bad-soft: #3a1a1d;
  --good: #7fd49c; --good-soft: #15301f;
}
body { background: var(--ground); color: var(--ink); font: 15px/1.55 "IBM Plex Sans", system-ui, sans-serif; }
.wrap { max-width: 980px; margin: 0 auto; padding-inline: 16px; padding-block: 28px 64px; }
h1, h2, h3 { font-family: "Newsreader", Georgia, serif; font-weight: 600; text-wrap: balance; margin: 0; }
h1 { font-size: clamp(30px, 6vw, 46px); line-height: 1.05; letter-spacing: -0.01em; }
.lede { max-width: 62ch; color: var(--muted); margin: 12px 0 0; }
.brief { margin: 22px 0 0; padding: 14px 16px; border-left: 3px solid var(--accent); background: var(--surface); max-width: 70ch; }
.brief p { margin: 0; font-family: "Newsreader", Georgia, serif; font-size: 18px; line-height: 1.45; }
.brief small { display: block; margin-top: 6px; color: var(--muted); font: 12px/1.4 "IBM Plex Mono", monospace; }
nav.jump { display: flex; flex-wrap: wrap; gap: 8px; margin: 22px 0 0; }
nav.jump a { color: var(--accent); text-decoration: none; border: 1px solid var(--line); background: var(--surface); padding: 6px 12px; border-radius: 999px; font-weight: 500; }
nav.jump a:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.style { margin-top: 44px; }
.style-head { display: grid; gap: 4px; border-bottom: 1px solid var(--line); padding-bottom: 12px; }
.style-head h2 { font-size: 30px; }
.ref { margin: 0; color: var(--muted); font-style: italic; font-family: "Newsreader", Georgia, serif; font-size: 17px; }
.spec { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 4px 0 0; font: 12px/1.4 "IBM Plex Mono", monospace; color: var(--muted); letter-spacing: 0.02em; text-transform: uppercase; }
.takes { display: grid; gap: 14px; margin-top: 16px; }
.take { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; display: grid; gap: 10px; }
.take-head { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; }
.rank { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: var(--accent); color: var(--surface); font: 600 16px/1 "IBM Plex Mono", monospace; }
.take h3 { font-size: 20px; }
.seed { font: 400 13px "IBM Plex Mono", monospace; color: var(--muted); margin-left: 6px; }
.meta { margin: 2px 0 0; color: var(--muted); font-size: 13px; }
.score { font: 500 14px "IBM Plex Mono", monospace; color: var(--accent); background: var(--accent-soft); padding: 4px 8px; border-radius: 6px; font-variant-numeric: tabular-nums; }
audio { width: 100%; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { font: 12px/1.3 "IBM Plex Mono", monospace; padding: 3px 8px; border-radius: 6px; background: var(--ground); color: var(--ink); }
.chip b { font-weight: 500; color: var(--muted); }
.chip.good { background: var(--good-soft); } .chip.good b { color: var(--good); }
.chip.warn { background: var(--warn-soft); } .chip.warn b { color: var(--warn); }
.chip.bad { background: var(--bad-soft); } .chip.bad b { color: var(--bad); }
details summary { cursor: pointer; color: var(--accent); font-weight: 500; }
.prompt { margin: 6px 0 0; color: var(--muted); font-size: 14px; max-width: 75ch; }
details.all { margin-top: 14px; }
.tablewrap { overflow-x: auto; margin-top: 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
table { border-collapse: collapse; width: 100%; font: 12.5px/1.4 "IBM Plex Mono", monospace; font-variant-numeric: tabular-nums; }
th, td { padding: 6px 10px; text-align: left; border-bottom: 1px solid var(--line); white-space: nowrap; }
th { color: var(--muted); font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; font-size: 11px; }
td.n { text-align: right; }
tr.on td { background: var(--accent-soft); }
.models td { white-space: normal; vertical-align: top; min-width: 110px; }
.notes { margin-top: 48px; display: grid; gap: 14px; }
.notes h2 { font-size: 26px; }
.notes p, .notes li { max-width: 75ch; }
.empty { color: var(--muted); }
@media (max-width: 560px) { .take-head { grid-template-columns: auto 1fr; } .score { grid-column: 2; justify-self: start; } }
"""

def esc(x: object) -> str:
    return html.escape(str(x), quote=True)


def chip(label: str, value: str, tone: str = "") -> str:
    return f'<span class="chip {tone}"><b>{esc(label)}</b> {esc(value)}</span>'


def take_chips(t: dict, style: str) -> str:
    m = t["metrics"]
    c = m.get("clap", {})
    sp = c.get("style_prob", {}).get(style)
    loop = m["loop"]
    out = [
        chip("length", f"{min(m['duration_s'], MAX_S):.0f} s"),
        chip("style match", f"{sp * 100:.0f}%" if sp is not None else "-", "good" if (sp or 0) >= 0.6 else ("warn" if (sp or 0) < 0.34 else "")),
        chip("tempo", f"{m['tempo']['estimated_bpm']:.0f} bpm"),
        chip("key", m["key"]["best_key"], "" if m["key"]["key_ok"] else "warn"),
        chip("loop", f"{loop['bars']} bars @ {loop['start_s']:.1f}s, seam {loop['score']:.2f}" if loop.get("score", -1) > 0 else "none found", "" if loop.get("score", -1) > 0.35 else "warn"),
        chip("level", f"{m['loudness']['lufs']:.0f} LUFS, LRA {m['loudness']['lra']:.0f}"),
    ]
    v = m.get("vocals")
    if v:
        share = v["vocal_energy_share"]
        out.append(chip("voice", f"{share * 100:.1f}% of energy", "bad" if share > 0.10 else ("warn" if share > 0.03 else "good")))
    if m["silence"]["longest_internal_gap_s"] > 2:
        out.append(chip("dropout", f"{m['silence']['longest_internal_gap_s']:.1f} s", "bad"))
    if m["clipping"]["clipped_frac"] > 1e-4:
        out.append(chip("clipping", f"{m['clipping']['clipped_frac'] * 100:.2f}%", "bad"))
    return "".join(out)


def page(out: dict, briefs: dict, models: dict) -> str:
    shared = briefs["shared"]
    sections = []
    for style in STYLES:
        b = briefs["styles"][style]
        takes = out[style]
        short = sorted([t for t in takes if t.get("shortlist")], key=lambda t: t["shortlist"])
        cards = []
        for t in short:
            s = t["side"]
            mi = models["models"].get(s["model"], {})
            cards.append(f"""
      <article class="take">
        <div class="take-head">
          <span class="rank">{t['shortlist']}</span>
          <div>
            <h3>{esc(s['model'])} <span class="seed">seed {esc(s['seed'])}</span></h3>
            <p class="meta">{esc(s.get('variant', ''))} &middot; {esc(mi.get('licence_short', ''))}</p>
          </div>
          <span class="score" title="objective score, not a verdict">{t['score']:.2f}</span>
        </div>
        <audio controls preload="none" src="{esc(t['file'])}"></audio>
        <div class="chips">{take_chips(t, style)}</div>
        <details><summary>Prompt</summary><p class="prompt">{esc(s.get('prompt', ''))}</p></details>
      </article>""")
        rows = []
        for t in takes:
            s, m = t["side"], t["metrics"]
            c = m.get("clap", {})
            rows.append(
                f"<tr class=\"{'on' if t.get('shortlist') else ''}\"><td>{esc(t['id'])}</td><td>{esc(s['model'])}</td>"
                f"<td class=n>{t['score']:.2f}</td><td class=n>{c.get('style_prob', {}).get(style, 0) * 100:.0f}%</td>"
                f"<td class=n>{m['duration_s']:.0f}</td><td class=n>{m['tempo']['estimated_bpm']:.0f}</td><td>{esc(m['key']['best_key'])}</td>"
                f"<td class=n>{m['loop'].get('score', -1):.2f}</td><td class=n>{m['loudness']['lufs']:.1f}</td>"
                f"<td class=n>{m.get('vocals', {}).get('vocal_energy_share', 0) * 100:.1f}%</td><td class=n>{s.get('gen_time_s', '')}</td></tr>")
        sections.append(f"""
  <section class="style" id="{style}">
    <header class="style-head">
      <h2>{esc(b['title'])}</h2>
      <p class="ref">after {esc(b['reference'])}</p>
      <p class="spec"><span>{esc(b['key'])}</span><span>{esc(b['mode_colour'])}</span><span>{b['bpm']} BPM</span><span>{esc(shared['timesig'])}</span></p>
    </header>
    <div class="takes">{''.join(cards) or '<p class="empty">No take long enough to shortlist yet.</p>'}</div>
    <details class="all"><summary>All {len(takes)} takes, ranked</summary>
      <div class="tablewrap"><table>
        <thead><tr><th>take</th><th>model</th><th>score</th><th>style</th><th>s</th><th>bpm</th><th>key</th><th>seam</th><th>LUFS</th><th>voice</th><th>gen s</th></tr></thead>
        <tbody>{''.join(rows)}</tbody>
      </table></div>
    </details>
  </section>""")
    mrows = []
    for name, mi in models["models"].items():
        mrows.append(f"<tr><td><b>{esc(name)}</b><br><span class=meta>{esc(mi.get('version', ''))}</span></td><td>{esc(mi.get('status', ''))}</td>"
                     f"<td>{esc(mi.get('backend', ''))}</td><td>{esc(mi.get('speed', ''))}</td><td>{esc(mi.get('memory', ''))}</td>"
                     f"<td>{esc(mi.get('licence', ''))}</td></tr>")
    weights = ", ".join(f"{k} {int(v * 100)}%" for k, v in SCORE.items())
    return f"""<title>Wildshard Music Bake-off</title>
<meta name="description" content="Round 1 of the Wildshard music bake-off: three styles, locally generated by open-weight models, shortlisted by objective checks.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500;6..72,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
{PAGE_CSS}</style>
<div class="wrap">
  <header>
    <h1>Wildshard music bake-off</h1>
    <p class="lede">Round 1. Every take below was composed on the Mac by an open-weight model, from the same brief per style. The three per style are a shortlist picked by objective checks, since nobody could listen while ranking. Pick one track per style by ear.</p>
    <div class="brief"><p>&ldquo;{esc(shared['brief'])}&rdquo;</p><small>shared brief &middot; {shared['duration_s']} s target &middot; players are gain-matched to {TARGET_LUFS:.0f} LUFS</small></div>
    <nav class="jump">{''.join(f'<a href="#{s}">{esc(briefs["styles"][s]["title"])}</a>' for s in STYLES)}<a href="#models">Models</a></nav>
  </header>
  {''.join(sections)}
  <section class="notes" id="models">
    <h2>The models</h2>
    <div class="tablewrap"><table class="models">
      <thead><tr><th>model</th><th>status</th><th>engine</th><th>speed</th><th>peak memory</th><th>licence</th></tr></thead>
      <tbody>{''.join(mrows)}</tbody>
    </table></div>
    <h2>How the shortlist was picked</h2>
    <p>Score = {esc(weights)}. Style match comes from CLAP (laion/clap-htsat-fused) comparing each take to the three style briefs; its own vocals guess called almost every full-band take vocal, so the voice check is source separation instead (htdemucs vocal-stem share of energy: over 10% costs the take, over 20% keeps it off the shortlist); tempo and key from librosa; the loop seam is the most similar pair of bar-aligned cut points; loudness and dropouts from ffmpeg. One shortlist place per model, so each style is heard from three different models, and nothing under 30 s (those are loop or sting material, not a theme).</p>
    <ul>{''.join(f'<li>{esc(n)}</li>' for n in models.get('notes', []))}</ul>
  </section>
</div>
"""


if __name__ == "__main__":
    main()
