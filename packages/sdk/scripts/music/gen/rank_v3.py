"""MUSIC.md v3 row 4: rank the MiniMax takes per slot, pick the top take + 2 alternates, build the round-2 listening page.

    python3 scripts/music/gen/rank_v3.py <raw3-dir> [--set pine-hollow]

--set pine-hollow (PINE-HOLLOW-REMASTER PH-A1): the slots of ph-jobs.json instead - night + boss (loops, groove scored: the
boss's phases are its stems) and dawn (scored like the title: the reward sting is cut from it). Writes
scripts/music/gen/v3-ph-<style>.json only; the page and its previews are scripts/music/gen/ph_page.py's (theme 1 next to
the new slots, the built phases and sting, the NPC barks, every sound's two takes).

Reads <raw3>/<style>-<slot>/minimax3-<seed>.wav + .json (gen_minimax.py --jobs) + .metrics.json (analyze.py).
Writes:
  scripts/music/gen/v3-<style>.json            every take per slot: prompt, seed, timing, metrics, score, the pick
  art/music/round-2-minimax/<style>/<slot>-<seed>.mp3   pick + 2 alternates per slot (MP3 128 kb/s, -18 LUFS)
  art/music/round-2-minimax/index.html          the listening page for the user's veto
Nobody listens while ranking, so this is a filter built from measurements (see SCORE); the user vetoes by ear.
"""

from __future__ import annotations

import html
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
ART = REPO / "art/music/round-2-minimax"
STYLES = ("piano", "orchestral", "folk")
LOOP_SLOTS = ("pine", "island")
SLOTS = ("pine", "island", "title")
TARGET_LUFS = -18.0
VOCAL_DQ = 0.20

# loops need a groove demucs can lift out as the tension layer; the title does not
SCORE_LOOP = {"style": 0.30, "groove": 0.25, "seam": 0.20, "clean": 0.15, "full": 0.10}
SCORE_TITLE = {"style": 0.45, "seam": 0.15, "clean": 0.20, "full": 0.20}


def clean_part(m: dict) -> float:
    c = 1.0
    if m["clipping"]["clipped_frac"] > 1e-4:
        c -= 0.5
    if m["silence"]["longest_internal_gap_s"] > 2.0:
        c -= 0.3
    if m["spectrum"]["rolloff95_hz"] < 7000:
        c -= 0.2
    return max(c, 0.0)


def score(m: dict, style: str, slot: str) -> tuple[float, dict, str | None]:
    v = m.get("vocals", {})
    voice = v.get("vocal_energy_share", 0.0)
    if voice > VOCAL_DQ:
        return -1.0, {}, f"voice {voice * 100:.0f}% of the energy"
    parts = {
        "style": m.get("clap", {}).get("style_prob", {}).get(style, 0.0),
        "seam": max(0.0, min(1.0, (m["loop"].get("score", -1) - 0.1) / 0.6)) if m["loop"].get("score", -1) > 0 else 0.0,
        "clean": clean_part(m),
        # full length and no fade-out: the loop body wants the whole take, the tail silence says it faded
        "full": max(0.0, min(1.0, (m["duration_s"] - m["silence"]["tail_silence_s"] - 50) / 20)),
    }
    if slot in LOOP_SLOTS:
        parts["groove"] = 0.5 * v.get("groove_active_frac", 0.0) + 0.5 * v.get("drums_active_frac", 0.0)
    w = SCORE_LOOP if slot in LOOP_SLOTS else SCORE_TITLE
    total = sum(w[k] * parts[k] for k in w) - 0.5 * max(0.0, voice - 0.03)
    return round(total, 3), {k: round(x, 3) for k, x in parts.items()}, None


def mp3(wav: Path, m: dict, dest: Path) -> int:
    dest.parent.mkdir(parents=True, exist_ok=True)
    gain = min(TARGET_LUFS - m["loudness"]["lufs"], -1.0 - m["loudness"]["true_peak_dbfs"])
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-af", f"volume={gain:.2f}dB",
                    "-c:a", "libmp3lame", "-b:a", "128k", str(dest)], check=True)
    return dest.stat().st_size


def load(raw: Path, style: str, slot: str) -> list[dict]:
    takes = []
    for side_p in sorted((raw / f"{style}-{slot}").glob("minimax3-*.json")):
        if side_p.name.endswith((".metrics.json", ".sfx.json")):
            continue
        mp = side_p.with_name(side_p.stem + ".metrics.json")
        if mp.exists():
            takes.append({"id": side_p.stem, "wav": str(side_p.with_suffix(".wav")), "side": json.loads(side_p.read_text()),
                          "metrics": json.loads(mp.read_text())})
    return takes


def configure(argv: list[str]) -> tuple[Path, str | None]:
    """the positional raw dir + the optional --set; --set pine-hollow swaps the slot tables and the output paths"""
    global ART, LOOP_SLOTS, SLOTS
    args = [a for a in argv if not a.startswith("--set")]
    tag = next((a.split("=", 1)[1] for a in argv if a.startswith("--set=")), None)
    if "--set" in argv:
        tag = argv[argv.index("--set") + 1]
        args = [a for a in args if a != tag]
    if tag == "pine-hollow":
        ART, LOOP_SLOTS, SLOTS = REPO / "art/music/round-3-pine-hollow", ("night", "boss"), ("night", "boss", "dawn")
    elif tag is not None:
        raise SystemExit(f"unknown --set {tag}")
    return Path(args[0]), tag


def main() -> None:
    raw, tag = configure(sys.argv[1:])
    for old in ART.glob("*/*.mp3"):  # this folder holds only this script's output
        old.unlink()
    result: dict = {}
    for style in STYLES:
        result[style] = {}
        for slot in SLOTS:
            takes = load(raw, style, slot)
            for t in takes:
                sc = score(t["metrics"], style, slot)
                t["score"], t["parts"], t["dq"] = sc
            takes.sort(key=lambda t: -t["score"])
            ok = [t for t in takes if t["dq"] is None]
            for i, t in enumerate(ok[:3]):
                t["rank"] = i + 1
                if tag is not None:  # the Pine Hollow page encodes its own (lighter) previews: ph_page.py
                    continue
                t["mp3"] = f"{style}/{slot}-{t['side']['seed']}.mp3"
                t["mp3_bytes"] = mp3(Path(t["wav"]), t["metrics"], ART / t["mp3"])
            result[style][slot] = takes
            print(f"{style:10s} {slot:13s} {len(takes)} takes, {len(ok)} ok, pick {[t['id'] for t in ok[:3]]}")
        rec = {
            "style": style,
            "scoring": {"loop": SCORE_LOOP, "title": SCORE_TITLE, "vocal_disqualify": VOCAL_DQ},
            "slots": {
                slot: {
                    "pick": next((t["id"] for t in takes if t.get("rank") == 1), None),
                    "alternates": [t["id"] for t in takes if t.get("rank") in (2, 3)],
                    "takes": [{"id": t["id"], "seed": t["side"]["seed"], "score": t["score"], "parts": t["parts"],
                               "disqualified": t["dq"], "rank": t.get("rank"), "mp3": t.get("mp3"),
                               "prompt": t["side"]["prompt"], "lyrics": t["side"]["lyrics"], "duration_s": t["side"]["duration_s"],
                               "steps": t["side"]["steps"], "gen_time_s": t["side"]["gen_time_s"],
                               "code_commit": t["side"]["code_commit"], "metrics": t["metrics"]} for t in takes],
                }
                for slot, takes in result[style].items()
            },
        }
        (HERE / (f"v3-ph-{style}.json" if tag else f"v3-{style}.json")).write_text(json.dumps(rec, indent=2, ensure_ascii=False) + "\n")
    if tag is None:
        (ART / "index.html").write_text(page(result))
    total = sum(p.stat().st_size for p in ART.glob("*/*.mp3"))
    print(f"mp3 total {total / 1e6:.1f} MB -> {ART}")


# ---------------------------------------------------------------- page

SLOT_TITLE = {"pine": "Pine Hollow", "island": "Driftwood Isle", "title": "Title theme"}
SLOT_NOTE = {"pine": "calm exploration, forest - the tension layer is this take's drums + bass",
             "island": "calm exploration, sea and island colour - the tension layer is this take's drums + bass",
             "title": "the fuller main theme, heard on the title screen"}
STYLE_TITLE = {"piano": "Piano + ambient", "orchestral": "Warm orchestral", "folk": "Folk-adventure"}


def esc(x: object) -> str:
    return html.escape(str(x), quote=True)


def chips(t: dict, style: str, slot: str) -> str:
    from build_page import chip

    m, v = t["metrics"], t["metrics"].get("vocals", {})
    sp = m.get("clap", {}).get("style_prob", {}).get(style, 0)
    loop = m["loop"]
    out = [
        chip("length", f"{m['duration_s']:.0f} s"),
        chip("style match", f"{sp * 100:.0f}%", "good" if sp >= 0.6 else ("warn" if sp < 0.34 else "")),
        chip("tempo", f"{m['tempo']['estimated_bpm']:.0f} bpm"),
        chip("key", m["key"]["best_key"]),
        chip("loop seam", f"{loop.get('score', -1):.2f}", "" if loop.get("score", -1) > 0.35 else "warn"),
    ]
    if slot in LOOP_SLOTS:
        g = v.get("drums_active_frac", 0)
        out.append(chip("groove", f"drums in {g * 100:.0f}% of the take", "good" if g >= 0.7 else ("warn" if g < 0.4 else "")))
    share = v.get("vocal_energy_share", 0)
    out.append(chip("voice", f"{share * 100:.1f}%", "bad" if share > 0.10 else ("warn" if share > 0.03 else "good")))
    return "".join(out)


def page(result: dict) -> str:
    from build_page import PAGE_CSS

    secs = []
    for style in STYLES:
        blocks = []
        for slot in SLOTS:
            takes = [t for t in result[style][slot] if t.get("rank")]
            cards = []
            for t in sorted(takes, key=lambda t: t["rank"]):
                label = "pick" if t["rank"] == 1 else "alternate"
                cards.append(f"""
      <article class="take">
        <div class="take-head">
          <span class="rank">{t['rank']}</span>
          <div><h3>{esc(label.capitalize())} <span class="seed">seed {esc(t['side']['seed'])}</span></h3>
          <p class="meta">MiniMax Music 3 &middot; {esc(t['side']['gen_time_s'])} s to render</p></div>
          <span class="score" title="objective score, not a verdict">{t['score']:.2f}</span>
        </div>
        <audio controls preload="none" src="{esc(t['mp3'])}"></audio>
        <div class="chips">{chips(t, style, slot)}</div>
      </article>""")
            n, dq = len(result[style][slot]), sum(1 for t in result[style][slot] if t["dq"])
            prompt = result[style][slot][0]["side"]["prompt"] if result[style][slot] else ""
            blocks.append(f"""
    <div class="slot">
      <h3 class="slot-name">{esc(SLOT_TITLE[slot])}</h3>
      <p class="meta">{esc(SLOT_NOTE[slot])} &middot; {n} takes rendered, {dq} disqualified for a voice</p>
      <div class="takes">{''.join(cards) or '<p class="empty">No usable take.</p>'}</div>
      <details><summary>Prompt</summary><p class="prompt">{esc(prompt)}</p></details>
    </div>""")
        secs.append(f"""
  <section class="style" id="{style}">
    <header class="style-head"><h2>{esc(STYLE_TITLE[style])}</h2>
      <p class="ref">three slots, the pick first</p></header>
    {''.join(blocks)}
  </section>""")
    return f"""<title>Wildshard Music Round 2</title>
<meta name="description" content="Round 2 of the Wildshard music: MiniMax Music 3 themes for Pine Hollow, Driftwood Isle and the title, in three styles, for the user's veto.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500;6..72,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
{PAGE_CSS}
.slot {{ margin-top: 22px; display: grid; gap: 8px; }}
.slot-name {{ font-size: 22px; }}
</style>
<div class="wrap">
  <header>
    <h1>Wildshard music, round 2</h1>
    <p class="lede">MiniMax Music 3 won round 1. Each style now needs three pieces: a Pine Hollow theme, a Driftwood Isle theme and a title theme. About six takes were rendered for each slot and ranked by measurement, since nobody could listen while ranking. The pick for each slot is first, with two alternates below it. Veto anything that sounds wrong and name the take you want instead.</p>
    <div class="brief"><p>&ldquo;Wonder first, adventure second, a little melancholy underneath: a world arriving one chunk at a time.&rdquo;</p><small>players gain-matched to {TARGET_LUFS:.0f} LUFS &middot; the game plays each loop theme as two layers, calm on its own, with the drums + bass added when danger is near</small></div>
    <nav class="jump">{''.join(f'<a href="#{s}">{esc(STYLE_TITLE[s])}</a>' for s in STYLES)}</nav>
  </header>
  {''.join(secs)}
  <section class="notes">
    <h2>How the picks were made</h2>
    <p>Loop themes: CLAP style match {int(SCORE_LOOP['style'] * 100)}%, groove {int(SCORE_LOOP['groove'] * 100)}% (drums and bass present across the take, measured by htdemucs separation, because the game's tension layer is exactly those stems), bar-aligned loop seam {int(SCORE_LOOP['seam'] * 100)}%, clean audio {int(SCORE_LOOP['clean'] * 100)}%, and full length with no fade-out {int(SCORE_LOOP['full'] * 100)}%. Title: style {int(SCORE_TITLE['style'] * 100)}%, seam {int(SCORE_TITLE['seam'] * 100)}%, clean {int(SCORE_TITLE['clean'] * 100)}%, full {int(SCORE_TITLE['full'] * 100)}%. Any take whose separated vocal stem carries more than {int(VOCAL_DQ * 100)}% of the energy is out, because MiniMax sometimes sings despite an instrumental prompt.</p>
  </section>
</div>
"""


if __name__ == "__main__":
    main()
