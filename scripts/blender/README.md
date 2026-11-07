# Blender models: the scripts are the source (M10, E315)

**Every Blender-made model is a headless `bpy` script. The GLB it exports is committed, and a `.blend` never is.** The
reasoning is in [docs/design/blender-practice.md](../../docs/design/blender-practice.md).

```
scripts/blender/
  build.sh            the one runner: build.sh <target>… | --check | --all | --list | --save-blend | --no-copy
  targets.json        target → script, args, pre / post steps, sources, outputs, lock; Blender 5.2.1 pinned
  lib/                shared: export-scene.mjs (the game's data → the cache), glb.py (a minimal glTF writer),
                      glb-digest.mjs (--check's comparison), save_blend.py (--save-blend)
  driftwood-isle/     the spawn cove: build_island.py, assets.py, export.mjs (its half of the export), post.sh
  pine-hollow/        trees/, crags/ (kit + cave), weapons/ (rifle, knife), export.mjs (its half of the export)
  nine-dragon-stack/  viewmodel/ (the first-person arms: fp-rig.glb's sources, README), lab/fei_zhua.py (lab only)
```

- **Build:** `bash scripts/blender/build.sh <target>`. `--list` shows the targets. `pnpm blender:island` is
  `build.sh driftwood-isle/island`. Script flags pass through: `build.sh pine-hollow/trees --quick --only=trees`.
- **What a run does:**
  - the target's `pre` steps (the game's heights and layout → `~/.cache/wildshard-blender/<target>/`, downloads);
  - `blender -b --factory-startup -noaudio --python-exit-code 1 -P <script> -- <args>`: a Python exception fails the
    build;
  - the model lock (`lockf -k ~/projects/localai/.model.lock`) for every Cycles target, which is all of them today;
  - then meshopt and copy into `public/`, then the target's `post` step.
- **Inspect:** `--save-blend` also saves the final scene as `~/.cache/wildshard-blender/<target>/<name>.blend`. Open it,
  never commit it: `.gitignore` and `.githooks/pre-commit` refuse `*.blend`.
- **Check:** `build.sh --check <target>` (or `--check --all`) rebuilds into the cache, meshopts each GLB and compares it
  with the committed one (`lib/glb-digest.mjs`): the structure, the vertex and triangle counts, the materials, the
  bounds, and an order-free position hash. Bytes are not compared, because Cycles bakes and the exporter aren't
  byte-stable. Run it after a Blender upgrade and after moving a builder.
- **Add a model:** a script under `scripts/blender/<shard>/`, a `targets.json` row (`script`, `sources`, `outputs`, …)
  and a build. `node scripts/check-model-sources.mjs` (in `pnpm test`) refuses:
  - a Blender output GLB with no target;
  - an unreferenced file under `scripts/blender/`;
  - a tracked `.blend`.

| Target | Builds | Minutes | `--check` on 2026-09-29 |
|---|---|---|---|
| `driftwood-isle/island` | `public/assets/models/driftwood-blender/` (island.glb, placements.bin, lightmaps) | ~0.5 | IDENTICAL, placements.bin same bytes |
| `pine-hollow/trees` | `public/assets/models/pine-hollow-trees/` + 4 bark sets | ~1.5 | IDENTICAL, trees.json same bytes |
| `pine-hollow/crags` | `pine-hollow-crags/crags.glb` | < 0.1 | IDENTICAL (crags.json AO means differ: Cycles noise) |
| `pine-hollow/cave` | `pine-hollow-crags/cave.glb` | < 0.1 | IDENTICAL, cave.json same bytes |
| `pine-hollow/lever-rifle` | `pine-hollow/weapons/lever-rifle{,.phone}.glb` | ~3 | IDENTICAL (both tiers) |
| `pine-hollow/skinning-knife` | `pine-hollow/weapons/skinning-knife{,.phone}.glb` + `.json` | ~1 | IDENTICAL (both tiers) |
| `pine-hollow/area-export` | the cache only (the Blender build is PH-U17, wave 2) | < 0.1 | export only |
| `nine-dragon-stack/fei-zhua` | `nine-dragon/lab/grapple/fei-zhua.glb` (the dev lab page only) | < 0.1 | IDENTICAL |
| `nine-dragon-stack/fp-rig` | `nine-dragon/viewmodel/fp-rig.glb` + maps | manual | the 16 clips within 0.031° ([viewmodel/README](nine-dragon-stack/viewmodel/README.md)) |

Image-to-3D models (TRELLIS.2, Hunyuan3D-2, CC0) and their Blender clean-up are `scripts/img2mesh/`, not here. Their
recipes are the prop lists in `scripts/img2mesh/props/`; Nalati's is `nalati.json`.

## The Driftwood island (DRIFTWOOD-REMASTER X2, E52)

`pnpm blender:island [--quick]` rebuilds Driftwood's spawn cove in Blender, headless, and writes
`public/assets/models/driftwood-blender/`. The game always loads it in place of the procedural cove (the user's pick, E7;
the `?island` switch is gone since E136). The runtime still constructs procedural content before
replacing or clipping its drawing inside the Blender area; this is remaining loading
work, not a supported load-failure fallback. A required island asset failure refuses
boot. SF67 baking work must remove redundant construction while preserving colliders
and authored content; it has not landed yet.

**Per shard (PINE-HOLLOW-REMASTER PH-0.3).** Three things name a shard:
- its area: `src/world/blenderArea.ts`, `blenderAreaFor(slug)`. Driftwood's is also the `area` export that
  BlenderIsland.ts clips at.
- its half of the export: `scripts/blender/<slug>/export.mjs`. `groundColor(ctx)` gives the area grid's colour;
  `layout(ctx)` gives scene.json's shard keys, plus bake occluders through `ctx.addObject`.
- its Blender builder: a `targets.json` target (`driftwood-isle/island` → `driftwood-isle/build_island.py`). A shard
  without one has an export-only target.

Pine Hollow has an area (provisional: the Hollow, until board B1) and an exporter:
- `area.bin` holds the splat-weighted PBR ground albedo;
- `splat.bin` holds the real layer weights;
- `scene.json` holds every tree, the cabin sites, the pond and the trails.

Its builder is wave 2 (PH-U17), so `build.sh pine-hollow/area-export` exports to
`~/.cache/wildshard-blender/pine-hollow/area-export/` and writes nothing to `public/`. Every export reads the shard's
baked grid, `public/assets/baked/<slug>/terrain.bin`.

| Step | File | What |
|---|---|---|
| 1 | `lib/export-scene.mjs` + `driftwood-isle/export.mjs` | Runs the game's own code in Node: the area's heights from the baked grid (the surface `heightAt` walks), the game's ground colour (`lowPolyGroundColor`), slope, trail distance; the whole chunk's coarse heights; the palms / boulders / bushes / trailside specs; the pier, hut and trailside meshes as triangle soup. → the target's cache |
| 2 | `driftwood-isle/build_island.py` + `assets.py` | Blender 5.2, Cycles on the Metal GPU. Terrain on a grid twice the game's (edges on the game's grid lines, interior jittered for natural facets), ~60 prototypes from code (palms, crag slabs, boulders, ferns, hibiscus, bushes, flowers, grass, beach grass, shells, starfish, pebbles, driftwood), ~13 k placements by height / slope / path rules. Bakes, exports `island.glb` (no materials, no normals), `placements.bin`, `island.json`. |
| 3 | `build.sh` + `driftwood-isle/post.sh` | meshopt (`gltf-transform meshopt`), lightmaps to WebP (desktop 2048 / 1024, phone half), copy into `public/`. |

The area is `src/world/blenderArea.ts` (x −110.8…110.8, z −214.7…−20.6: the pier landing, the crescent beach, the plank
stair, the hut plateau). Terrain, crag slabs, plants and beach scatter are modelled from code (`assets.py`); the palms,
shore boulders, driftwood and coconuts are the asset-agent's kit (`public/assets/models/driftwood-hero/`, image-to-3D, and
`driftwood-cc0/`, CC0 1.0 — licences in `scripts/img2mesh/CC0.md`), imported by `build_island.py`. The kit palms are
used as authored near the camera (collapse-decimating tore their trunks apart); their far cut is the code palm at the same
height / lean in their own colours. The game draws the props as 4×4 / 3×3 caster tiles (near + far copy) and 8×8 / 4×4
cover tiles (drawn within 32 m on phone, 150 m desktop), phone / desktop.

### Lighting: what is baked and what stays live (the decision)

The island runs a 20 + 4 min day/night clock (`src/world/DayNight.ts`), so the sun cannot be baked. Baked, once:

- **AO lightmap** (terrain, 2048², 5 m sky visibility). Every object occludes: palms, crag slabs, scatter, pier, hut. In
  game it multiplies the indirect term (the hemisphere fill that the clock tints, the toon shade lift), never the sun.
- **Bounce lightmap** (terrain, 1024²): Cycles indirect diffuse with the sun alone at the midday reference (62° up,
  due south), irradiance 1, sky black. In game it is added to the indirect term × the live sun (colour × intensity ×
  its elevation relative to the reference), so it fades with the sun and is gone at night.
- **Prototype AO** in the vertex colour's alpha (self-occlusion + ground contact). Multiplies the fill, and 35 % of
  the direct light (the inside of a palm crown).

Live: the sun's direct light, its CSM shadows and the toon ramp (`stylize.ts`), the hemisphere fill, fog, sky, sea.
Rejected: baking the four DayNight presets and blending (4× the textures and the bake time for a term that the live
sun already gets right); baking the full combined light (static, wrong 23 minutes out of 24).

Measured (first bake): AO mean 0.83; the bounce is small on open ground (mean 0.003 of the sun's irradiance, up to
0.08–0.11 at the foot of the crag and under the pier): honest for a low-poly beach, most of its GI is sky occlusion.

## The tree species set (PINE-HOLLOW-REMASTER PH-B4)

`bash scripts/blender/build.sh pine-hollow/trees [--quick] [--only=bark,cards,trees,lineup] [--no-copy]` builds Pine
Hollow's photoreal species set:
- Scots pine ×4, fir ×2, old-growth giant ×2 (4–6× a pine's girth), silver birch ×2, dead snag ×2, sapling ×2;
- under the machine-wide model lock (it waits for a running model job), in ~90 s of Blender once it has the lock.

| File | What |
|---|---|
| `pine-hollow/trees/treegen.py` | The species as numpy geometry, per variant five LOD parts (trunk / trunkLo bark, hi / lo / twigs cards) + the vertex data the game reads (bark layer, bark tint, crown occlusion, crown-bent card normals). `SPECS` = the game's `TREE_SPECS_V2` (`src/world/treeSpecies.ts`, checked by `test/tree-species.test.ts`). |
| `pine-hollow/trees/barkgen.py` | The silver birch's bark, generated seamless (Poly Haven has none). |
| `pine-hollow/trees/build_trees.py` | Blender 5.2: the bark sets, the branch-card atlas (branches modelled from CC0 photoscan sprigs, rendered top-down in Cycles: albedo × AO, camera-space normal, ARM), `trees.glb`, the impostor atlas (each variant's hi LOD from the side), a lit lineup preview. |
| `lib/glb.py` | A minimal glTF writer (meshes `<variant>__<part>`). |
| `pine-hollow/trees/post.sh` | After build.sh's meshopt of `trees.glb`: pngquant / JPEG / half-size `.phone.webp` → `public/assets/models/pine-hollow-trees/` + `public/assets/tex/{fir_bark,metasequoia_bark,birch_bark,bark_willow_02}/`. |

Sources are Poly Haven CC0 (fir_tree_01's sprays + bark, tree_small_02's leaves, pine_tree_01's twig, metasequoia_bark,
bark_willow_02), cached in `~/.cache/wildshard-blender/trees-src/`. The game side is `src/world/treeSet.ts` (the GLB →
plain float geometry, the bark array lookups) and `TreeFactory.buildSet`; a build without the set's files plants the runtime pines.
