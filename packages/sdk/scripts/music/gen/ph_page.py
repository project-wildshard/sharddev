"""PINE-HOLLOW-REMASTER PH-A1..A4: Pine Hollow's sound listening page for Jake (the E57 pattern, build_page.py's look).

    python3 scripts/music/gen/ph_page.py <raw-music-dir> <sfx-raw-dir>

Reads what the pipeline already decided - nothing is ranked here:
  music  scripts/music/gen/v3-ph-<style>.json (rank_v3.py --set pine-hollow), public/assets/music/pine-hollow-<style>/music.json
         (stems.py --set pine-hollow: what ships) and public/assets/music/<style>/music.json (theme 1, kept)
  sfx    scripts/music/gen/sfx-ph-moss.json / sfx-ph-sa3-medium.json (sfx_build.py --stage) + sfx-best.json (sfx_merge.py)
Writes art/music/round-3-pine-hollow/:
  <style>/theme1.m4a            theme 1 as the game plays it in a fight (calm + tension), one loop
  <style>/night-built.m4a       calm-night as shipped: 2 loops, the tension layer joining on the second
  <style>/boss-phase<n>.m4a     the Antler King as shipped, one loop per phase (I base + half bass, II + drums at 55 %, III all)
  <style>/sting-dawn.m4a        the reward sting as shipped
  <style>/<slot>-alt-<seed>.m4a the runner-up take per slot (45 s) and the dawn pick in full, for a veto
  sfx/<model>/<family>.m4a      each sound's best take per model (beds: 15 s), mono
  index.html                    the page
Previews are AAC 64 kb/s (music stereo, sfx mono). Raw takes are levelled to -18 LUFS (sfx -20), so no take wins by being
louder; what ships is heard as shipped (-18 LUFS calm, the boss phases gaining weight on top, the sting at -16).
"""

from __future__ import annotations

import html
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
ART = REPO / "art/music/round-3-pine-hollow"
MUSIC = REPO / "public/assets/music"
STYLES = ("piano", "orchestral", "folk")
STYLE_TITLE = {"piano": "Piano + ambient", "orchestral": "Warm orchestral", "folk": "Folk"}
PHASES = {"1": "I, the Warden", "2": "II, Lanterns Fall", "3": "III, the Last Light"}
MODELS = {"moss": "MOSS-SoundEffect v2", "sa3-medium": "Stable Audio 3 Medium"}
RAW_DIR = {"moss": "moss", "sa3-medium": "medium"}  # the generators' folder names in the raw dir
# the sound-gaps round (the remaster's A-rows): the sounds the game played borrowed or not at all, on the page together
GAPS = ("longbowLoose", "boltImpact-rock", "leverDry", "leverRoundIn", "raven_caw", "raven_pair", "raven_flap", "owl_hoot",
        "woodpecker_drum", "woodpecker_call", "skinCut-a", "skinCut-b")


def esc(x: object) -> str:
    return html.escape(str(x), quote=True)


def ff(args: list[str]) -> None:
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *args], check=True)


def enc(inputs: list[str], dest: Path, filt: str, mono: bool = False, lufs: float | None = -18.0) -> str:
    """ffmpeg filter graph `filt` over `inputs` ([out] label) -> loudnorm (lufs=None: as shipped, already levelled, so the
    boss phases keep their difference in weight) -> AAC 64k; returns the page-relative path"""
    dest.parent.mkdir(parents=True, exist_ok=True)
    args = []
    for i in inputs:
        args += ["-i", i]
    norm = "anull" if lufs is None else f"loudnorm=I={lufs}:TP=-1.5"
    ff(args + ["-filter_complex", f"{filt};[out]{norm}[o]", "-map", "[o]", "-ac", "1" if mono else "2",
               "-ar", "48000", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", str(dest)])
    return str(dest.relative_to(ART))


def audio(src: str, label: str, note: str = "") -> str:
    return (f'<div class="clip"><div class="clip-head"><b>{esc(label)}</b>{f" <span class=meta>{esc(note)}</span>" if note else ""}</div>'
            f'<audio controls preload="none" src="{esc(src)}"></audio></div>')


def music_section(raw: Path) -> tuple[str, int]:
    secs, total = [], 0
    for style in STYLES:
        v3p, manp = HERE / f"v3-ph-{style}.json", MUSIC / f"pine-hollow-{style}" / "music.json"
        if not v3p.exists() or not manp.exists():
            continue
        v3, man, base = json.loads(v3p.read_text()), json.loads(manp.read_text()), json.loads((MUSIC / style / "music.json").read_text())
        d = MUSIC / f"pine-hollow-{style}"
        out = ART / style
        blocks = []
        # theme 1 (kept): calm + tension, one loop from loopStart
        p = base["slots"]["pine"]
        t1 = enc([str(MUSIC / style / p["calm"]), str(MUSIC / style / p["tension"])], out / "theme1.m4a",
                 f"[0][1]amix=inputs=2:normalize=0,atrim={p['loopStart']}:{p['loopEnd']},asetpts=N/SR/TB[out]", lufs=None)
        blocks.append(f'<div class="slot"><h3>Theme 1 <span class="tag">kept</span></h3><p class="meta">Pine Hollow by day, as the game plays it with danger near (calm + tension).</p>{audio(t1, "Theme 1, one loop")}</div>')
        # night: 2 loops, tension in on the second
        n = man["slots"]["night"]
        L = n["loopEnd"] - n["loopStart"]
        nb = enc([str(d / n["calm"]), str(d / n["tension"])], out / "night-built.m4a",
                 f"[0]atrim={n['loopStart']}:{n['loopEnd']},asetpts=N/SR/TB,aloop=loop=1:size={int(L * 48000)}[c];"
                 f"[1]atrim={n['loopStart']}:{n['loopEnd']},asetpts=N/SR/TB,aloop=loop=1:size={int(L * 48000)},"
                 f"volume='if(lt(t,{L:.3f}),0,1)':eval=frame[t];[c][t]amix=inputs=2:normalize=0[out]", lufs=None)
        clips = [audio(nb, "As built", f"{n['bpm']:.0f} bpm, a {L:.0f} s loop heard twice: calm, then the tension layer joins")]
        # boss: one loop per phase
        b = man["slots"]["boss"]
        bars = []
        for ph, name in PHASES.items():
            g = b["phases"][ph]
            f = enc([str(d / b["calm"]), str(d / b["layers"][0]), str(d / b["layers"][1])], out / f"boss-phase{ph}.m4a",
                    f"[0]atrim={b['loopStart']}:{b['loopEnd']},asetpts=N/SR/TB[a];[1]atrim={b['loopStart']}:{b['loopEnd']},asetpts=N/SR/TB,volume={g[0]}[bb];"
                    f"[2]atrim={b['loopStart']}:{b['loopEnd']},asetpts=N/SR/TB,volume={g[1]}[dd];[a][bb][dd]amix=inputs=3:normalize=0[out]", lufs=None)
            bars.append(audio(f, f"Phase {name}", f"bass {g[0]:.0%}, drums {g[1]:.0%}"))
        sting = man["stings"]["dawn"]
        sd = enc([str(d / sting)], out / "sting-dawn.m4a", "[0]anull[out]", lufs=None)
        alts = {}
        for slot in ("night", "boss", "dawn"):
            rec = v3["slots"][slot]
            ranked = sorted([t for t in rec["takes"] if t.get("rank")], key=lambda t: t["rank"])
            picks = ranked[:2] if slot == "dawn" else ranked[1:2]
            alts[slot] = []
            for t in picks:
                wav = raw / f"{style}-{slot}" / f"{t['id']}.wav"
                if not wav.exists():
                    continue
                label = "The pick, in full" if t["rank"] == 1 else f"Runner-up, seed {t['seed']}"
                trim = "" if slot == "dawn" else ",atrim=0:45,afade=t=out:st=42:d=3"
                f = enc([str(wav)], out / f"{slot}-{'pick' if t['rank'] == 1 else 'alt'}-{t['seed']}.m4a", f"[0]anull{trim}[out]")
                alts[slot].append(audio(f, label, f"score {t['score']:.2f}"))
        blocks.append(f'<div class="slot"><h3>Calm night <span class="tag new">new</span></h3><p class="meta">Eerie folklore: lantern-lit pines, fog, something old watching.</p>{"".join(clips + alts["night"])}</div>')
        blocks.append(f'<div class="slot"><h3>The Antler King <span class="tag new">new</span></h3><p class="meta">One take, three layers on one grid: each phase adds weight on the bar.</p>{"".join(bars + alts["boss"])}</div>')
        blocks.append(f'<div class="slot"><h3>Dawn sting <span class="tag new">new</span></h3><p class="meta">The quest\'s end: the King at rest, dawn over the Hollow. The sting is the dawn take\'s last 8 s.</p>{audio(sd, "The sting, as built")}{"".join(alts["dawn"])}</div>')
        secs.append(f'<section class="style" id="{style}"><header class="style-head"><h2>{esc(STYLE_TITLE[style])}</h2></header><div class="slots">{"".join(blocks)}</div></section>')
    total = sum(p.stat().st_size for p in ART.glob("*/*.m4a") if p.parent.name in STYLES)
    return "".join(secs), total


def sfx_section(sfx_raw: Path) -> tuple[str, str, int]:
    fams = json.loads((HERE / "sfx-ph-jobs.json").read_text())["families"]
    rank = {m: json.loads(p.read_text())["families"] for m in MODELS if (p := HERE / f"sfx-ph-{m}.json").exists()}
    table = json.loads((HERE / "sfx-best.json").read_text())["families"]
    rows: dict[str, list[str]] = {"gap": [], "bark": [], "bed": [], "oneshot": []}
    for fam, j in fams.items():
        if not all(fam in rank.get(m, {}) for m in MODELS):
            continue
        row = table.get(fam, {})
        win = row.get("winner", "?")
        cells = []
        for m in MODELS:
            r = rank[m][fam][0]
            wav = sfx_raw / RAW_DIR[m] / fam / f"{r['seed']}.wav"
            if not wav.exists():
                cells.append("<td class='empty'>missing</td>")
                continue
            cut = ",atrim=0:15,afade=t=out:st=13.5:d=1.5" if j["kind"] == "bed" else ""
            f = enc([str(wav)], ART / "sfx" / m / f"{fam}.m4a", f"[0]anull{cut}[out]", mono=True, lufs=-20.0)
            tone = "good" if r["rank"] == 1 else ("warn" if r["rank"] <= 5 else "bad")
            star = "<span class='chip good'><b>ships</b></span>" if m == win else ""
            cells.append(f"<td><audio controls preload='none' src='{esc(f)}'></audio><div class='chips'>"
                         f"<span class='chip {tone}'><b>CLAP</b> rank {r['rank']} &middot; {r['p'] * 100:.0f}%</span>{star}</div></td>")
        where = {"best": "in the game now", "pine-hollow": "Pine Hollow set"}.get(j.get("into", ""), "")
        if win in ("synth", "kept-round-2"):
            where = "neither take ranked: " + ("the synth plays it" if win == "synth" else "the old take stays")
        kind = "gap" if fam in GAPS else "bark" if fam.startswith("bark-") else j["kind"] if j["kind"] == "bed" else "oneshot"
        rows[kind].append(f"<tr><th scope='row'>{esc(fam)}<br><span class='meta'>{esc(j['desc'])}</span><br><span class='meta'>{esc(where)}</span></th>{''.join(cells)}</tr>")
    head = f"<thead><tr><th>sound</th>{''.join(f'<th>{esc(t)}</th>' for t in MODELS.values())}</tr></thead>"
    tab = lambda k: f"<div class='tablewrap'><table class='grid'>{head}<tbody>{''.join(rows[k])}</tbody></table></div>" if rows[k] else "<p class='empty'>Not rendered yet.</p>"  # noqa: E731
    gaps = (f'<section class="style" id="gaps"><header class="style-head"><h2>New: the missing sounds <span class="tag new">new</span></h2><p class="ref">'
            f'The sounds the game played borrowed or not at all: the Warden\'s Longbow loose (it played the crossbow\'s), an arrow on stone, '
            f'the lever gun\'s dry click and a round thumbed through its gate, the ravens (a croak, a pair, the take-off wings), the owl, the woodpecker '
            f'(its drum was a synth roll), and two skinning strokes (the harvest reused the arrow-in-flesh hit). Both engines side by side; the chip marks the take that ships.</p></header>{tab("gap")}</section>')
    barks = f'<section class="style" id="barks"><header class="style-head"><h2>NPC barks</h2><p class="ref">The ranger, the miller and the trader: short non-verbal or one-word barks, both engines side by side, the better take ships.</p></header>{tab("bark")}</section>'
    rest = (f'<section class="style" id="ambience"><header class="style-head"><h2>Zoned ambience</h2><p class="ref">Each bed, 15 s of its best take per engine.</p></header>{tab("bed")}</section>'
            f'<section class="style" id="sfx"><header class="style-head"><h2>Sound effects</h2><p class="ref">Crossbow, lever-action, longbow, animals, the thralls, the Antler King, footsteps, doors, lanterns, the zipline.</p></header>{tab("oneshot")}</section>')
    total = sum(p.stat().st_size for p in (ART / "sfx").glob("*/*.m4a"))
    return gaps + barks, rest, total


CSS_EXTRA = """
.slots { display: grid; gap: 18px; margin-top: 16px; }
.slot { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; display: grid; gap: 10px; }
.slot h3 { font-size: 22px; }
.tag { font: 500 11px/1 "IBM Plex Mono", monospace; text-transform: uppercase; letter-spacing: 0.05em; padding: 3px 6px; border-radius: 5px; background: var(--ground); color: var(--muted); vertical-align: middle; }
.tag.new { background: var(--accent-soft); color: var(--accent); }
.clip { display: grid; gap: 4px; }
.clip-head { font-size: 14px; }
.grid td, .grid th { white-space: normal; vertical-align: top; }
.grid th[scope=row] { text-transform: none; letter-spacing: 0; font-size: 13px; color: var(--ink); min-width: 150px; }
.grid audio { width: 220px; max-width: 100%; }
"""


def main() -> None:
    from build_page import PAGE_CSS

    raw, sfx_raw = Path(sys.argv[1]), Path(sys.argv[2])
    for old in ART.glob("**/*.m4a"):  # this folder holds only this script's output
        old.unlink()
    music, mbytes = music_section(raw)
    barks, rest, sbytes = sfx_section(sfx_raw)
    styles = [s for s in STYLES if (ART / s).exists()]
    nav = "".join(f'<a href="#{s}">{esc(STYLE_TITLE[s])}</a>' for s in styles) + '<a href="#gaps">New sounds</a><a href="#barks">Barks</a><a href="#ambience">Ambience</a><a href="#sfx">Sound effects</a>'
    (ART / "index.html").write_text(f"""<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pine Hollow Sound</title>
<meta name="description" content="Pine Hollow's new music (calm night, the Antler King in three phases, the dawn sting) next to theme 1, and its generated barks, ambience and sound effects.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500;6..72,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
{PAGE_CSS}
{CSS_EXTRA}
</style>
<div class="wrap">
  <header>
    <h1>Pine Hollow, the sound</h1>
    <p class="lede">Theme 1 stays. New for each style: a calm-night loop, the Antler King's fight in three phases, and the dawn sting that ends the quest. MiniMax Music 3 wrote about six takes per piece; the ranker picked one (CLAP style match, a groove the stems can split, a clean loop seam, no singing), and it is built the way the game plays it. A runner-up sits under each pick. Veto anything and name the take you want instead.</p>
    <div class="brief"><p>&ldquo;Eerie folklore: fog, lantern light, glassy-eyed thralls, the King an ancient guardian gone wrong. Unsettling, not gory; cleansed at dawn.&rdquo;</p><small>music at -18 LUFS, stings -16, sound effects -20 &middot; AAC previews, 64 kb/s</small></div>
    <nav class="jump">{nav}</nav>
  </header>
  {music}
  {barks}
  {rest}
  <section class="notes"><h2>How it was made</h2>
    <p>Music: MiniMax Music 3, run locally. Each slot's pick is split by demucs into stems on one timeline and cut to a loop of whole bars. Calm night plays like theme 1: the calm stem, with the drums and bass joining when danger is near. The Antler King is a single take in three layers. Phase I is the melody and the low strings with half the bass. Phase II brings in the full bass and the drums at 55 %. Phase III plays everything. Each change lands on the next bar.</p>
    <p>Sounds: every sound was rendered 3 times by each engine (the longbow's loose and the arrow on stone, which missed the first round, 3 more times with a sharper prompt), MOSS-SoundEffect v2 and Stable Audio 3 Medium. CLAP ranks every take against every other sound's description. The better engine's best take ships, if it ranks in the top 5. An NPC's barks, and the footstep surfaces, are not ranked against each other.</p>
  </section>
</div>
""")
    print(f"page -> {ART / 'index.html'}  music previews {mbytes / 1e6:.1f} MB, sfx previews {sbytes / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
