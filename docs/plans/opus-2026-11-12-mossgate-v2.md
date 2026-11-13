# Mossgate v2: the Template rebuilt from a clean slate

> Written by: Claude (opus-mossgate-plan)

> **State:** in progress, 2026-11-12: the rebuild is approved (J311), so
> every row below builds without review. Six design calls (D1 to D6) wait
> on Jake's board; rows that need one say so and take the recommendation
> if Jake says "approve Mossgate". Nothing built yet.

Board: <https://claude.ai/artifact/4SY6QDNHx9NiLhdZTKnLEY>. Local copy:
`~/.cache/wildshard/plan-artifacts/mossgate-redesign/`. Pointer row:
meta `docs/plans/TEMPLATE-E2E-PLAN.md` and meta QA-FEEDBACK-2026-11-12
row 50.

## Words used here

- **Mossgate**: this shard. Folder `src/shards/_template`, cell slug
  `_template`, API slug `template`. "Template", "Template 1" and
  "Mossgate Hollow" all mean this shard; this plan says Mossgate.
- **v2**: this rebuild, the second design. The old "Mossgate Hollow v1
  to v3" were look rounds on the first design; those names are retired.
- **The hollow**: the playable bowl in the middle of the 500 m cell.
- **Zone**: one place in the hollow that shows one mechanic.
- **Kit**: the shard's own models (hut, gate, brazier, walls, rocks),
  made by a script in this folder.
- **Dev overlay**: the teaching marks (grid, sizes, zone captions) that
  show only with Developer on.
- **Source version**: the shard's own version on upload (J306).
  Today 0.2.x; v2 ships as 0.3.0.

## Why

Jake, 2026-11-12 ~23:25 Cancún, after playing Mossgate on preview:
"Template shard is mostly graphical trash btw", "Every other shard is
better", "Re-design and re-implement mossgate from scratch, empty slate,
redo it completely cleanroom, first principles." Recorded as J311 in
meta `docs/plans/multi-repo/MULTI-REPO-PLAN.md`.

What is wrong today, measured on the rev 3 captures
(`plan-artifacts/look-loop/mossgate-lut/flat/`, 2026-11-12):

1. Every surface wears the measure family (`look.json` `pbr.measure`,
   `Kit.mesh` in `generators/kit.ts`): grid lines on floor, walls and
   roof, and stencilled "2x3" labels. It reads as a blockout.
2. Everything is an unbevelled box (`measureBox`). No silhouettes.
3. The 500 m cell is filled with dev districts (`generators/cell.ts`,
   `districts.ts`: ziggurat, scaffold yard, billboard row, hangars,
   overpass, hover test course). They crowd every horizon.
4. The grade is zeroed (`manifest.json` `grade`, all 0 and 1), the sky
   is one flat pink, `style` is `greybox`, the score is `none`.
5. The held whip is a grey stick and the arm an orange cube.

The 2026-11-11 rules that produced this ("simple art", "grid floors",
"size labels", "feel like a developer test level"; meta TEMPLATE-E2E
"The look") are replaced for Mossgate by J311. Brasscap Mesa (Template
2) is untouched.

## What Mossgate is for

1. **The starter shard authors copy.** `wildshard new` copies it (SA16).
   An author must find each mechanic in one hop: zone, then file.
2. **A cell at (1,1) in the centre 3x3 (J305),** beside Pine Hollow,
   Nalati and Driftwood. Players walk into it from those cells, so it
   has to stand next to them.
3. **The shard that shows every mechanic the SDK path offers:** NPC
   talk, quests, doors and hooks, items, the lantern, braziers, movers,
   water and swimming, creatures, whip and sword combat, coins and loot,
   a scripted boss, the hoverboard, MMO shared state.

"Good" means: a player can't tell it's a template; an author reading the
README reaches any mechanic's file in one step; the phone holds 30 fps
with room to spare.

## The design (recommended answers to D1 to D6)

- **Look (D1, D2):** stylised low-poly toon at Driftwood's level, with
  its own palette and hour: early morning, low gold sun from the east,
  mist in the hollow, sage and mint moss, cream stone, honey firelight.
  Pine is dusk, Nalati sunset, Driftwood noon; morning is free.
- **Scaffolding (D3):** the art is clean. Grid, sizes, POI rings and
  zone-to-file captions live in the dev overlay.
- **Art source (D4):** a Blender script in this folder makes the kit
  (as Driftwood's `blender/assets.py` does); TS generators place it and
  scatter foliage. Authors learn the real pipeline.
- **The rest of the cell (D6):** the dev districts go. The hover course
  becomes a ring road round the hollow; the 4 copy plots stay as forest
  clearings so outer-ring copies (J305) still differ.
- **Release (D5):** `--channel staging` first; prod at Jake's word.

Layout, the hollow about 140 m across, spawn at its south side,
clockwise:

| Zone | Where | Shows | Today's ids kept |
|---|---|---|---|
| Spawn green | south, (0, 0) | spawn, Lamplighter talk, quest start | `lamplighter`, `template.quest` |
| Hut | south-west | door hook, interior, lantern pickup | `hut`, `door.as` |
| Moss Gate | west, in the old wall | brazier A, lantern light, gate mover | `mossgate`, `brazier-a` |
| Pond | north-west | water, swimming, brazier B raises the stepping stones | `brazier-b` (was the far brazier) |
| Training ground | north-east | blob and Greyback, whip and sword, coins | `blob`, `greyback` |
| Barrow | east | brazier C opens it; Barrow Warden boss | `brazier-c`, `barrow-warden`, `boss.as` |
| Ring road | round the ridge | hoverboard | new `ring-road` |

The 4 entry roads keep their sockets at the cell edges (grid crossing).

## Budgets

**Phone frame** (402x874, pixel density 2, phone tier, headless
Chromium with `--use-angle=metal`), at each zone's camera:

| Measure | Phone | Desktop |
|---|---|---|
| Frame p95 | 33 ms or less (30 fps) | 16.7 ms or less |
| Draw calls | 120 or less | 250 or less |
| Triangles in view | 150k or less | 400k or less |
| GPU memory | 64 MB or less (today's ceiling 76.7) | 160 MB or less |
| Kit GLBs, all | 1.5 MB or less | same |

Today's rev 3 spawn: 84 to 93 calls, 0.08 M triangles; overhead 175 to
293 calls. The budget allows a richer scene, not a heavier one.

**Audio** (J303 green is 6 MB or less per shard; J304 one style):
Mossgate plays the engine's piano style. Its own audio: a piano calm
loop, a tension loop for the fights and a boss loop (about 2.2 MB at
AUDIO-PLAN AU7's encoder targets), a morning ambience bed with birds,
water and brazier crackle (about 0.6 MB). Own audio 3 MB or less; own
plus the engine's piano boot set 4 MB or less, green by AU6's report.

## Rows

Mode: J290 mode 2. Branch `plan/mossgate-v2` in
`sharddev/.worktrees/mossgate-v2` (`node scripts/worktree.mjs new
mossgate-v2`), landed with `WS_LANE_NAME=<lane> node scripts/land.mjs`
at milestones L1, L2, L3 only, or once a day. Graphical rows are Opus
only (lane-model-routing); rows marked Codex may go to Codex.
Every row is auto-approved (J311) unless it names a D it waits on.

| Row | Work | Done when |
|---|---|---|
| MG1 | **Clean slate (Codex or Opus).** Delete the old world: `world.ts` set pieces, `districts.ts`, `kit.ts` measure boxes, the `measure` family and labels in `look.json`, `style: greybox`. Keep every declared system and its ids: items, quests, encounters, creatures, `behaviour/*.as`, `bossDecision.json`, water, ledger, audio cues, the 4 entry sockets and the 4 copy plots (`copyLayout.ts` reads them) | `wildshard build` and `wildshard validate out/_template` pass; the shard boots on a local dev page to a flat cell; `rg -n "measureBox\|greybox\|2x3" src/shards/_template` finds nothing; `test/scripts/_template-boss.test.ts` passes |
| MG2 | **The budget gate (Codex).** A capture script in `scripts/` that boots the built shard headless at 402x874 and at desktop, stands at each zone camera (`data/cameras.json`, 7 zones) and writes frame p95, draw calls, triangles and GPU MB to JSON; `data/budgets.json` gets the table above | The script runs on MG1's empty slate and prints all 7 cameras; a test fails when a number in the JSON is over its budget |
| MG3 | **Terrain and layout.** The hollow, ridge, old wall line, paths and the 7 zone sites as the table and the board's sketch; POIs in `manifest.json`; spawn on the green. Plain toon ground colour, no kit yet | The baked top map matches the sketch; a walk test (engine `walkLeg`) reaches every zone POI on foot from spawn; no POI stands on a slope over 25 degrees |
| MG4 | **Palette, sky and light** (D1, D2). `data/palette.json` (16 colours) is the only colour source; morning sky, sun, hemisphere, fog and grade in `manifest.json`; `style: toon` | A test reads the built product and finds no material colour outside `palette.json`; the 7 zone captures are saved to the board folder. **L1 lands here** |
| MG5 | **Kit 1, buildings** (D4). `blender/kit.py`: hut with interior, Moss Gate (closed and open parts), old wall pieces, brazier, barrow door, lamp post; bevelled, one palette atlas | `blender -b -P blender/kit.py` twice gives byte-equal GLBs; each under 6k triangles; placed in the hollow; MG2's gate green |
| MG6 | **Kit 2, nature and props** (D4). Boulders, stepping stones, bridge slabs, bench, barrels, crates, reeds, lily pads, mushrooms | As MG5; all kit GLBs together 1.5 MB or less |
| MG7 | **Trees and ground cover.** Oak and birch with 2 LODs each, ferns, grass tufts, flowers, instanced; phone density half of desktop | MG2's gate green at every camera; the ridge reads as woodland in the captures |
| MG8 | **Hands and held items.** Toon first-person arms; modelled whip, iron sword and lantern from `kit.py`; swing, crack and lantern-raise poses | `test/first-person-arms.test.ts` passes; captures show arms and each held item; whip and sword hits land on the training dummy |
| MG9 | **Spawn green, hut, Moss Gate.** Lamplighter talk starts `template.quest`; hut door hook and lantern pickup; brazier A lit by the lantern opens the gate (mover) | A browser proof does talk, door, lantern, brazier A and walks through the open gate |
| MG10 | **Pond.** Water row, swimming, brazier B raises the stepping stones | The proof swims across, lights B, and walks the raised stones dry |
| MG11 | **Training ground.** Blob and Greyback with the whip and sword; coins and loot | The proof kills both with each weapon; coins rise |
| MG12 | **Barrow.** Brazier C opens the barrow; the Barrow Warden (`boss.as`) with a telegraph and a weak spot; quest completes | The proof wins the fight; the quest reads complete; the boss scenario test passes. **L2 lands here** |
| MG13 | **Ring road.** The hover course as a road round the ridge, joining the 4 entry roads | The proof rides the ring on the hoverboard in under 60 s without falling off |
| MG14 | **Audio** (J303, J304). Piano style declared; own calm, tension and boss loops and the ambience bed; cues kept | AUDIO AU6's cook report shows Mossgate green and own audio 3 MB or less; the proof hears the boss loop start (audio state, not ears) |
| MG15 | **Dev overlay** (D3). Developer on shows grid on walkable ground, kit sizes, POI rings and zone captions naming the file; off shows none. If the engine has no runtime switch for this, add an engine row in engine's plan and use a shard-side layer until it lands | Two captures of the same camera, off and on; a test finds no overlay mesh in the scene with Developer off |
| MG16 | **Author teaching (Codex).** README rewritten as a zone, mechanic, file table; the 4 copy plots and how a copy seeds them; `wildshard new` copies v2 | `wildshard new` then `wildshard check` pass on a fresh project; SD-14 (three templates build twice cold, byte-equal) passes; README names a file for every zone |
| MG17 | **Grid fit.** Edge roads meet Pine, Nalati and Driftwood; far proxy (`farLook.ts`) and minimap from the new art; copy plots as clearings | Engine `grid-one-layout` and `grid-seam-plans` pass against a local build; a capture from Pine's edge looking into Mossgate. **L3 lands here** |
| MG18 | **Engine pin (Codex, engine's rules).** Fresh pin per TEMPLATE-E2E Q3 (sharddev tag, upload, `pins.ts refresh`); fix engine tests that name old positions; retarget T1E rows to v2's POIs | Engine `ci` green on the new pin |
| MG19 | **Hero and upload** (J306, J301, D5). `wildshard hero` from an in-game capture; source version 0.3.0; `wildshard upload --channel staging` once SHARD-AUTHORING UP3 is live (until then wait: the old path moves prod too). Never `--channel prod` without Jake's word | `GET /api/catalogue` shows `template` 0.3.0 on preview and staging with `channel: staging`, its three versions and the new hero; prod unchanged |
| MG20 | **The proof.** On staging, phone 402x874 and desktop, headless: fresh save, every zone in order to quest complete; two players see each other's braziers lit; walk in from Pine's cell; MG2 numbers at every zone. Board with the 7 zone shots beside Driftwood and Pine goldens | The receipt lists each step green and every budget met; board on the JAKE-READ-LIST |

## Seams

- **Owned files:** `src/shards/_template/**`, the new `blender/` and
  `data/cameras.json` there, and MG2's script. On `plan/mossgate-v2`
  only; main stays on rev 3 until a land.
- **Engine:** about 15 tests name `_template` (`grid-one-layout`,
  `template-source-layout`, `frame-floor-*`, `look-loop`, others). They
  read the pinned shardfile, so nothing goes red until MG18 bumps it.
  MG15 may need an engine row.
- **TEMPLATE-E2E (meta):** T1E-0 to T1E-9 and S-T1 rows target this
  shard; MG18 retargets their POIs. LF rows stay stopped (J281); this
  plan runs no look-loop or LUT rounds.
- **GRID-CROSSING:** keeps the entry sockets; copies on the outer ring
  read the copy plots.
- **SHARD-AUTHORING UP3/UP4:** MG19 waits on them. SA16 reads MG16.
- **AUDIO:** MG14 uses AU6's report and AU7's encoder.
- **api-server:** `src/test/helpers/template-2.ts` is Brasscap's; no
  change.

## Verification

The real path is MG20 on staging. Before it, MG2's gate and the
browser proofs in MG9 to MG13 run on every land; the boss scenario
and SD-14 run in sharddev `ci`.

## Sync

- Meta MULTI-REPO-PLAN section 2: J311 (this rebuild).
- Meta STATE.md: none until MG19 changes what is live.
- Meta TEMPLATE-E2E-PLAN: a pointer line to this plan.
- Meta docs/README.md: none, no new theme.
- AGENTS.md: none.

## Open decisions for Jake

On the board. "approve Mossgate" takes every recommendation.

| D | Question | Recommended | Blocks |
|---|---|---|---|
| D1 | Art style | Stylised low-poly toon, Driftwood's level | MG4 to MG8 |
| D2 | Hour and palette | Early morning, mist, moss greens, cream stone | MG4 |
| D3 | Where the teaching marks go | Dev overlay, Developer only | MG15 |
| D4 | How the art is made | Blender script kit plus TS placement | MG5, MG6 |
| D5 | Where it ships first | Staging, then prod at your word | MG19 |
| D6 | The dev districts | Remove; hover course becomes a ring road | MG1's district step, MG13 |
