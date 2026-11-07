"""Build the Nine Dragon future play-by-play and generic guide as A4 portrait PDFs."""

from pathlib import Path
from tempfile import gettempdir

from PIL import Image
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import simpleSplit
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs/process"
TMP = Path(gettempdir()) / "wildshard-nd-process-pdf"
OUT.mkdir(parents=True, exist_ok=True)
TMP.mkdir(parents=True, exist_ok=True)
W, H = A4
M = 42
CW = W - 2 * M
INK = HexColor("#102A36")
BLUE = HexColor("#087A9D")
MUTED = HexColor("#526873")
RULE = HexColor("#CCDBE0")
PANEL = HexColor("#F2F7F8")
GOLD = HexColor("#98551C")
GREEN = HexColor("#1D7058")


def text(c, x, y, value, width, size=10.5, leading=15, color=INK, bold=False):
    font = "Helvetica-Bold" if bold else "Helvetica"
    c.setFillColor(color)
    c.setFont(font, size)
    for paragraph in value.split("\n"):
        for line in simpleSplit(paragraph, font, size, width):
            c.drawString(x, y, line)
            y -= leading
    return y


def label(c, x, y, value, color=BLUE):
    c.setFillColor(color)
    c.setFont("Helvetica-Bold", 8.8)
    c.drawString(x, y, value.upper())


def panel(c, x, y, width, height):
    c.setFillColor(PANEL)
    c.setStrokeColor(RULE)
    c.setLineWidth(.7)
    c.roundRect(x, y, width, height, 7, fill=1, stroke=1)


def header(c, series, number, total, title, subtitle):
    c.setFillColor(HexColor("#FFFFFF"))
    c.rect(0, 0, W, H, fill=1, stroke=0)
    label(c, M, H - 37, series)
    c.setFont("Helvetica", 8.5)
    c.setFillColor(MUTED)
    c.drawRightString(W - M, H - 37, "PROJECT WILDSHARD  /  A4 PORTRAIT")
    y = H - 71
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 22)
    for line in title:
        c.drawString(M, y, line)
        y -= 26
    text(c, M, y - 4, subtitle, CW, 9.5, 12.5, MUTED)
    c.setStrokeColor(RULE)
    c.line(M, H - 128, W - M, H - 128)
    c.line(M, 44, W - M, 44)
    c.setFont("Helvetica", 8)
    c.setFillColor(MUTED)
    footer = "A fictional future sequence unless marked CURRENT" if total == 5 else "SHARD CHECKPOINTS  /  USER GUIDE"
    c.drawString(M, 28, footer)
    c.drawRightString(W - M, 28, f"{number:02d} / {total:02d}")


def image(c, path, x, y, width, height, caption):
    original = Image.open(path).convert("RGB")
    original.thumbnail((round(width * 3), round(height * 3)), Image.Resampling.LANCZOS)
    iw, ih = original.size
    scale = min((width - 12) / iw, (height - 30) / ih)
    dw, dh = iw * scale, ih * scale
    c.setFillColor(HexColor("#0C1F29"))
    c.roundRect(x, y, width, height, 5, fill=1, stroke=0)
    mini = TMP / f"a4-{Path(path).stem}-{round(width)}x{round(height)}.jpg"
    original.save(mini, quality=90, optimize=True)
    c.drawImage(str(mini), x + (width - dw) / 2, y + 25 + (height - 30 - dh) / 2, dw, dh)
    c.setFont("Helvetica-Bold", 7.5)
    c.setFillColor(HexColor("#DDF5F9"))
    c.drawString(x + 9, y + 10, caption.upper())


def row(c, y, phase, what, gate, height=91):
    panel(c, M, y - height, CW, height)
    label(c, M + 15, y - 23, phase)
    bottom = text(c, M + 15, y - 43, what, CW - 30, 10.5, 15)
    text(c, M + 15, min(bottom - 6, y - 69), gate, CW - 30, 9.5, 13, GREEN)


art = ROOT / "art/nine-dragon-stack"
concept = art / "round-1-concept"
hud = ROOT / "art/hud-explorer/round-1-arena"
section = concept / "02-section-nine-strata.jpg"
slab = concept / "01-key-art-slab.jpg"
old_street = concept / "07-old-street-alley.jpg"
market = concept / "06-shelter-market.jpg"
crown = concept / "05-the-crown-rooftops.jpg"
target = art / "round-6-baseline-hud/style-A-jiehua-neon.jpg"
live = hud / "ref-live.jpg"

story = canvas.Canvas(str(OUT / "nine-dragon-imaginary-play-by-play.pdf"), pagesize=A4, pageCompression=1)
story.setTitle("Nine Dragon - from partial prototype to finished shard")

# 1 - The whole destination, rather than a retrospective of the fragment.
header(
    story, "Nine Dragon / imaginary future play-by-play", 1, 5,
    ["From the partial shard", "to the finished city"],
    "An imagined sequence of many tiny approved releases, based on the Nine Dragon mega plan (P1-P7).",
)
image(story, section, M, 424, CW, 280, "Concept target - nine strata; this city is not built")
panel(story, M, 264, CW, 144)
label(story, M + 15, 381, "Today - current playable fragment")
text(story, M + 15, 361, "Lantern Square at +125 m, a short street and stair, upper Well galleries, a basic playable Fei Zhua zip. Roughly a 100 x 125 m corridor in plan; it does not fill that rectangle.", CW - 30, 11, 16)
label(story, M + 15, 309, "The finished destination", GREEN)
text(story, M + 15, 289, "A 500 x 500 x 500 m city with nine distinct, traversable strata; complete routes, combat, life, quests, weather and sound; stable portrait iPhone PWA performance.", CW - 30, 10.5, 15)
text(story, M, 237, "The pages that follow are future checkpoints, not a claim that the other eight strata or the full game already exist.", CW, 11, 16, GOLD, True)
text(story, M, 190, "The rule: show one small new piece beside the pinned world. Jake steers its look and feel. The agent checks every angle, plays it, tests the phone, and pins it only when it passes.", CW, 11.5, 17)
text(story, M, 101, "Finish line: the city has no inaccessible placeholder districts, no unreviewed model pile, no double loading, and no phone-only failure hidden behind a pretty still.", CW, 10, 15, MUTED)
story.showPage()

# 2 - First real vertical release, around the fragment.
header(
    story, "Nine Dragon / imaginary future play-by-play", 2, 5,
    ["Release 1: three levels", "that actually connect"],
    "Finish the fragment, then make Terrace Row (5), Lantern Square (6), and Cable Deck (7) one playable route.",
)
image(story, target, M, 295, 245, 398, "Approved style target - not final engine output")
image(story, live, M + 259, 295, 252, 398, "Current engine capture - starting point")
label(story, M, 273, "Imagined sequence")
text(story, M, 252, "First we fix the double-load cause and finish the Fei Zhua bite, line, miss and landing. We polish the eight existing domes and run the real iPhone gate. Then we add one Terrace stair and one Cable Deck arrival - not their whole districts.", CW, 10.5, 15)
text(story, M, 174, 'Jake sees a portrait target / current / next board and a 20-second crossing. He says, "The upper deck looks like another square; give it cableway scale." We change that one view and replay the route.', CW, 10.5, 15)
text(story, M, 95, "Pin only when the three levels feel different, the player can travel both ways, the Explorer models are inspectable, and the physical phone stays stable.", CW, 10, 15, GREEN, True)
story.showPage()

# 3 - The full cube becomes playable before it is detailed.
header(
    story, "Nine Dragon / imaginary future play-by-play", 3, 5,
    ["Release 2: nine levels", "in a safe greybox"],
    "The 500 m structure arrives as routes and collision first; rough districts remain behind the review boundary.",
)
levels = [
    ("9", "Crown", "+250", "#7B6BA5"), ("8", "Antenna Forest", "+210", "#8B9AA9"),
    ("7", "Cable Deck", "+165", "#408AA2"), ("6", "Lantern Square", "+125", "#B45455"),
    ("5", "Terrace Row", "+70", "#B69056"), ("4", "Old Street", "0", "#65745D"),
    ("3", "Rail Cut", "-70", "#95724B"), ("2", "Shelter Market", "-150", "#A85B4D"),
    ("1", "Sump", "-250", "#376D68"),
]
top = 693
for i, (num, name, altitude, color) in enumerate(levels):
    y = top - i * 45
    c = HexColor(color)
    story.setFillColor(c)
    story.roundRect(M, y - 30, CW, 35, 4, fill=1, stroke=0)
    story.setFillColor(HexColor("#FFFFFF"))
    story.setFont("Helvetica-Bold", 11)
    story.drawString(M + 12, y - 18, f"{num}  {name}")
    story.setFont("Helvetica", 10)
    story.drawRightString(W - M - 12, y - 18, f"{altitude} m")
label(story, M, 272, "The actual build order")
text(story, M, 251, "A vertical-extent field, height streaming, multi-layer navmesh, per-level map and lights make the cube viable. Greybox the full Well, four Light Wells, lifts, gates, cliff faces, highway, monorail path and fall catches.", CW, 10.5, 15)
text(story, M, 174, "Jake tests one new route at a time. The agent proves zero stuck or escape cases and checks that at least five levels feel like ground from a standing eye. A level remains gated until its route works.", CW, 10.5, 15)
text(story, M, 95, "This milestone is a connected skeleton, not nine polished districts. Approved earlier routes remain the public demo; the new greybox is exposed only for review.", CW, 10, 15, GREEN, True)
story.showPage()

# 4 - Repeatable district-by-district transformation.
header(
    story, "Nine Dragon / imaginary future play-by-play", 4, 5,
    ["Release 3: turn the", "skeleton into a city"],
    "For each hero space: portrait mockups, two domes, nine-angle targets, playable loop, phone gate, one decision.",
)
gap = 9
pw = (CW - 2 * gap) / 3
image(story, old_street, M, 474, pw, 222, "Old Street concept")
image(story, crown, M + pw + gap, 474, pw, 222, "Crown concept")
image(story, market, M + 2 * (pw + gap), 474, pw, 222, "Market concept")
label(story, M, 450, "Imagined review rhythm")
row(story, 432, "Wave 1 - nearby", "Finish 6, 5, 7: north street, terraces, cableway stations.", "Gate: three distinct ground-level views and a reliable route.", 89)
row(story, 334, "Wave 2 - contrast", "Build 4, 8, 9: dark alleys, shanty roofs, open Crown.", "Gate: each level has its own silhouette, light and approved models.", 89)
row(story, 236, "Wave 3 - depth", "Build 3, 2, 1: train cut, shelter market, flooded Sump.", "Gate: the lower colour flip and Well depth read in motion.", 89)
text(story, M, 110, "The agent keeps the nine-view comparisons internally. Jake gets one portrait board and one taste decision per pocket - never nine floors of variants at once.", CW, 10.5, 15, GREEN, True)
story.showPage()

# 5 - Real full-game scope and ship gate.
header(
    story, "Nine Dragon / imaginary future play-by-play", 5, 5,
    ["Release 4: life, story,", "combat - then ship"],
    "The city is finished only when its systems and the physical iPhone pass, not when the last still looks good.",
)
image(story, slab, M, 455, CW, 241, "Full slab concept - finish-line target, not gameplay")
row(story, 434, "Life and combat", "Crowds, fauna, Tong, Jiangshi, drones, elites and the Well Dragon.", "Gate: combat and animations are readable in play and in Explorer.", 90)
row(story, 334, "Quest and atmosphere", "Nine Red Envelopes, lift unlocks, typhoon, nine music arrangements and stratum SFX.", "Gate: a full route has purpose, sound and distinct weather.", 90)
row(story, 234, "Physical iPhone", "All nine levels load and stream within memory and frame budgets; no restart or double load.", "Gate: real home-screen PWA playthrough and 60 fps final-game target.", 90)
text(story, M, 119, "At the end Jake reviews one full portrait playthrough and the final public card. The agent has already cleared collision, model, audio, code, build and phone checks. The lab is archived only after feature parity.", CW, 10.5, 15, GREEN, True)
story.save()

# Generic manual for Matthew - no Nine Dragon-specific work program.
manual = canvas.Canvas(str(OUT / "shard-checkpoints-user-guide.pdf"), pagesize=A4, pageCompression=1)
manual.setTitle("Shard Checkpoints - a three-page user guide")
header(manual, "Shard Checkpoints / user guide", 1, 3, ["Build without a", "review avalanche"], "A three-page user guide for using the shard-checkpoints skill.")
panel(manual, M, 476, CW, 220)
label(manual, M + 18, 663, "The rule")
text(manual, M + 18, 627, "Keep most of the exposed shard polished and demo-ready. Build one small rough pocket or interaction at a time.", CW - 36, 17, 24, INK, True)
text(manual, M + 18, 538, "80 / 20 is a scope discipline, not a numerical quality score. Do not expose the next rough pocket until the current one has passed review and phone play.", CW - 36, 11.5, 17)
panel(manual, M, 277, CW, 177)
label(manual, M + 18, 421, "What Matthew does")
text(manual, M + 18, 392, "Review one portrait target / before / current board and a short playable demo. Approve the slice or name the first thing that breaks the taste.", CW - 36, 12, 18)
panel(manual, M, 79, CW, 177)
label(manual, M + 18, 223, "What the agent does")
text(manual, M + 18, 194, "Create the visual options, build collision and controls, capture other angles, play through the slice, verify the real iPhone, and keep the project gates green.", CW - 36, 12, 18)
manual.showPage()

header(manual, "Shard Checkpoints / user guide", 2, 3, ["One checkpoint from", "idea to pinned"], "Use the same loop for a world pocket, model, weapon or HUD interaction.")
steps = [
    ("01", "Frame", "Choose one small slice and camera. Show an ambitious target and a plausible near-term game view."),
    ("02", "Inspect", "Check front, sides, back and three-quarter angles. Register used models in Model Explorer."),
    ("03", "Build", "Put it in the real world with controls and collision. Compare target, before and current."),
    ("04", "Play", "Walk or fight through it. Use World Explorer for placement and HUD Explorer for feedback."),
    ("05", "Pin", "Test the home-screen iPhone PWA and code gates. Ask one taste question, then deploy."),
]
for i, (num, title, body) in enumerate(steps):
    top = 695 - i * 122
    panel(manual, M, top - 107, CW, 107)
    label(manual, M + 17, top - 25, num, GOLD)
    manual.setFillColor(INK)
    manual.setFont("Helvetica-Bold", 16)
    manual.drawString(M + 57, top - 28, title)
    text(manual, M + 57, top - 55, body, CW - 76, 11, 16)
manual.showPage()

header(manual, "Shard Checkpoints / user guide", 3, 3, ["What a useful review", "actually looks like"], "One board, one playable link and one decision. The technical grids stay internal.")
panel(manual, M, 457, CW, 239)
label(manual, M + 18, 661, "A useful note")
text(manual, M + 18, 626, '"The target is wet and dense. The current frame is too bright near the floor. Keep the camera; darken only the ground."', CW - 36, 15, 22, INK, True)
text(manual, M + 18, 500, "This names one lever and preserves the already approved parts.", CW - 36, 11.5, 17)
panel(manual, M, 269, CW, 168)
label(manual, M + 18, 404, "The verdict")
text(manual, M + 18, 377, "APPROVE - pin it. REVISE - say what reads wrong first. HOLD - the phone or play test fails.", CW - 36, 12, 18, INK, True)
text(manual, M + 18, 309, "No long form, variant maze or dozens of simultaneous toggles.", CW - 36, 11, 16)
panel(manual, M, 76, CW, 172)
label(manual, M + 18, 214, "Prompt the skill")
text(manual, M + 18, 188, '"Use shard-checkpoints on the next small pocket. Bring me a portrait target / before / current board, a playable link, the phone reading, and one decision."', CW - 36, 11.5, 17, INK, True)
text(manual, M + 18, 112, "If the slice is rough, keep polishing it before expanding.", CW - 36, 10.5, 15, MUTED)
manual.save()

print(OUT / "nine-dragon-imaginary-play-by-play.pdf")
print(OUT / "shard-checkpoints-user-guide.pdf")
