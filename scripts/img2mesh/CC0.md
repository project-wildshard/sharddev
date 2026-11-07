# CC0 model library (outside the repo)

A local library of CC0 (public domain) low-poly models for Driftwood Isle, downloaded 2026-09-23 into
`~/models/cc0/<author>/<pack>/`. Nothing here is in git. It is about 791 MB on disk: 304 MB of original
zips kept in `*/_zips/` and about 487 MB unpacked, with 968 `.glb`/`.gltf` files. Every pack below is
CC0. The licence was checked in the pack's own `License.txt`, or on its official page where the pack
ships without one. Helper scripts and raw search results are in `~/models/cc0/_tools/`.

Texture note: Kenney Pirate, Survival and Watercraft GLBs load `Textures/colormap.png` from the folder
next to them. The Quaternius Stylized Nature and Fantasy Props `.gltf` files and the KayKit `.gltf` files
load `.bin` and `.png` files from their own folder. Keep each folder whole when you copy a model out.
Kenney Nature Kit GLBs, Quaternius Pirate Kit `.gltf` files (buffers and atlas embedded) and all
Poly Pizza GLBs are self-contained.

## Kenney (kenney.nl)

| Pack | Licence | Source | Local path | Format | Models | Fits Driftwood |
|---|---|---|---|---|---|---|
| Pirate Kit | CC0, `kenney/pirate-kit/License.txt` | https://kenney.nl/assets/pirate-kit | `~/models/cc0/kenney/pirate-kit/Models/GLB format/` | GLB, FBX, OBJ | 72 | palm-straight, palm-bend, palm-detailed-straight, palm-detailed-bend, rocks-a/b/c, rocks-sand-a/b/c, patch-sand, boat-row-small/large, ship-wreck, ship-small/medium, structure-platform-dock(-small), platform-planks, barrel, crate, crate-bottles, chest, bottle, mast-ropes, tool-paddle, tool-shovel, cannon |
| Nature Kit | CC0, `kenney/nature-kit/License.txt` | https://kenney.nl/assets/nature-kit | `~/models/cc0/kenney/nature-kit/Models/GLTF format/` (these are `.glb`) | GLB, FBX, OBJ, DAE, STL | 329 | tree_palm, tree_palmBend, tree_palmTall, tree_palmShort, tree_palmDetailedShort/Tall, rock_largeA–F, rock_tallA–J, rock_smallA–I, stone_tallA–J (monoliths), stone_largeA–F, cliff_*_rock / cliff_*_stone, log, log_large, log_stack, stump_old, canoe, canoe_paddle, bridge_wood, path_wood, campfire_stones, campfire_logs |
| Survival Kit | CC0, `kenney/survival-kit/License.txt` | https://kenney.nl/assets/survival-kit | `~/models/cc0/kenney/survival-kit/Models/GLB format/` | GLB, FBX, OBJ | 80 | rock-sand-a/b/c, rock-flat, tree-log, tree-log-small, resource-wood, resource-planks, campfire-pit, campfire-fishing-stand, fish, fish-large, bucket, barrel, barrel-open, box, box-large, chest, tent, signpost, fence |
| Watercraft Pack | CC0, `kenney/watercraft-pack/License.txt` | https://kenney.nl/assets/watercraft-kit | `~/models/cc0/kenney/watercraft-pack/Models/GLB format/` | GLB, FBX, OBJ | 46 | boat-row-small, boat-row-large, boat-sail-a, boat-sail-b, boat-fishing-small, buoy, buoy-flag, cargo-pile-a/b |

## Quaternius (quaternius.com)

| Pack | Licence | Source | Local path | Format | Models | Fits Driftwood |
|---|---|---|---|---|---|---|
| Pirate Kit | CC0. The Drive folder has no licence file, so this comes from the pack page's licence field (link to creativecommons.org/publicdomain/zero/1.0) | https://quaternius.com/packs/piratekit.html → Google Drive folder `1KjMzhVsDcyvYMWeVjZcRfuu8auBLpNi2`, glTF subfolder | `~/models/cc0/quaternius/pirate-kit/glTF/` | glTF (embedded buffers and atlas) | 72 | Environment_PalmTree_1/2/3, Environment_Rock_1–5, Environment_Cliff1–4, Environment_Dock, Environment_Dock_Broken, Environment_Dock_Pole, Environment_LargeBones (whale ribs), Environment_Skulls, Ship_Small, Ship_Large, Prop_Barrel, Prop_Chest_Closed, Prop_Chest_Gold, Prop_Anchor, Prop_Bucket_Fishes, Prop_Bottle_1/2, Prop_Cannon. Environment_House1–3 are ship-hull taverns, not huts |
| Ultimate Nature Pack | CC0, `quaternius/ultimate-nature-pack/License.txt` | https://quaternius.itch.io/150-lowpoly-nature-models | `~/models/cc0/quaternius/ultimate-nature-pack/{FBX,OBJ,Blends}/` | FBX, OBJ, .blend (no glTF) | 150 | PalmTree_1–4, Rock_1–7, WoodLog, TreeStump, Plant_1–5, Bush_1/2, Grass |
| Stylized Nature MegaKit (free Standard) | CC0, `quaternius/stylized-nature-megakit/License_Standard.txt` | https://quaternius.itch.io/stylized-nature-megakit | `~/models/cc0/quaternius/stylized-nature-megakit/glTF/` | glTF + bin + textures, FBX, OBJ | 68 | Rock_Medium_1–3, Pebble_Round_1–5, Pebble_Square_1–6, RockPath_*, DeadTree_1–5 (driftwood shapes), Fern_1, Plant_1/7(_Big), Grass_Wispy_*. There are no palms |
| Fantasy Props MegaKit (free Standard) | CC0, `quaternius/fantasy-props-megakit/License_Standard.txt` | https://quaternius.itch.io/fantasy-props-megakit | `~/models/cc0/quaternius/fantasy-props-megakit/Exports/glTF/` | glTF + bin + PBR textures, FBX, OBJ | 94 | Barrel, Barrel_Holder, Crate_Wooden, Chest_Wood, Rope_1/2/3, Chain_Coil, Bucket_Wooden_1, Lantern_Wall, Coin_Pile, Stall_Empty, Bench, Stool |

## KayKit (Kay Lousberg)

| Pack | Licence | Source | Local path | Format | Models | Fits Driftwood |
|---|---|---|---|---|---|---|
| Forest Nature Pack 1.0 (FREE) | CC0, `kaykit/forest-nature-pack/KayKit_Forest_Nature_Pack_1.0_FREE/License.txt` | https://kaylousberg.itch.io/kaykit-forest | `~/models/cc0/kaykit/forest-nature-pack/KayKit_Forest_Nature_Pack_1.0_FREE/Assets/gltf/` | glTF + bin + one shared texture, FBX, OBJ | 105 | Rock_1_A–Q, Rock_2_A–H, Rock_3_A–R (beach and cliff rocks), Tree_Bare_1/2_A–C (driftwood silhouettes), Bush_1–4, Grass_1/2. The trees are not palms |

## Poly Pizza singles (poly.pizza, CC0 only)

- **Licence:** CC0 1.0 for every file. This is Poly Pizza's per-model `licence` field. The search used the site's CC0 filter (`/api/search/<q>?lic=1`), and one page was spot-checked (`/m/A6cKJYFsIb` → "CC0 1.0").
- **Local path and format:** `~/models/cc0/poly-pizza/<category>/<Creator>-<Title>_<id>.glb`, all GLB.
- **Per-model record:** `~/models/cc0/poly-pizza/manifest.json` holds the id, title, creator, licence, page URL (`https://poly.pizza/m/<id>`), GLB URL and path.
- **Thumbnails:** `~/models/cc0/poly-pizza/_contact-sheet.png` shows every download.
- **Set aside:** 5 wrong-looking results are in `poly-pizza/_offtheme/`: "Star" (a collectible star, not a starfish), two alien "Tree Floating", a metal oil drum and a plain cube.

| Category | Count | Models (creator) |
|---|---|---|
| palm | 8 | Palm Tree x4, Palm Trees (cluster), Bamboo x3 (Quaternius) |
| beach | 6 | Coconut Half, Mussel Open (Kenney), Sea Urchin Open, Crab Enemy (Quaternius), Seaweed (Mohabins), Coral Reef Set (MiniPoly) |
| boat | 11 | Boat x2, Sail Boat, Small Ship, Sail Ship, Lifeboat, Raft (inflatable), Raft Paddle, Anchor (Quaternius), Ship, Ship Wreck (Kenney) |
| pier | 11 | Docks, Dock x3, Dock Long, Dock Long No Rope, Dock Wide, Dock Stairs, Dock Broken, Small Bridge, Bridge (Quaternius) |
| hut | 8 | Hut x3, Huts, Shack x2, Storage Hut, Tribal (tiki mask creature) (Quaternius) |
| ruin | 9 | Arch x2, Arch Round, Column, Large Bone (Quaternius), Arch, Pillar, Broken Fence Pillar (Kay Lousberg), Column Wide (Kenney) |
| driftwood | 10 | Wood Log, Wood Log with Moss, Wood, Logs, Wood Planks, Pallet Broken, Dead Tree x3 (Quaternius), Dead tree (Kay Lousberg) |
| prop | 23 | Barrel x3, Crate x4, Chest, Chest Closed, Chest Open, Chest Gold, Chest with Gold, Ocean Chest, Wood Chest, Bucket of Fish, Fishing Rod, Cable, Torch, Wooden Torch, Bonfire x2 (Quaternius), Fishing Stand (Kenney), Lantern (Kay Lousberg) |
| rock | 11 | Rock x3, Rocks x2, Rock Large x3, Rock Medium (Quaternius), Rock Flat, Rock Formation (Kenney) |

## Export these first (top 30)

| # | Category | File |
|---|---|---|
| 1 | palm | `~/models/cc0/quaternius/pirate-kit/glTF/Environment_PalmTree_1.gltf` |
| 2 | palm | `~/models/cc0/quaternius/pirate-kit/glTF/Environment_PalmTree_3.gltf` |
| 3 | palm | `~/models/cc0/kenney/pirate-kit/Models/GLB format/palm-detailed-bend.glb` |
| 4 | palm | `~/models/cc0/poly-pizza/palm/Quaternius-Palm-Tree_A6cKJYFsIb.glb` |
| 5 | palm | `~/models/cc0/poly-pizza/palm/Quaternius-Palm-Tree_nr1B5DbICA.glb` (leaning) |
| 6 | rock | `~/models/cc0/quaternius/pirate-kit/glTF/Environment_Cliff1.gltf` |
| 7 | rock | `~/models/cc0/quaternius/pirate-kit/glTF/Environment_Rock_2.gltf` |
| 8 | rock | `~/models/cc0/kenney/pirate-kit/Models/GLB format/rocks-sand-a.glb` |
| 9 | rock | `~/models/cc0/kenney/nature-kit/Models/GLTF format/rock_largeA.glb` |
| 10 | rock | `~/models/cc0/poly-pizza/rock/Kenney-Rock-Formation_pRY9BCFbmQ.glb` (sea stack) |
| 11 | boat | `~/models/cc0/kenney/pirate-kit/Models/GLB format/boat-row-small.glb` |
| 12 | boat | `~/models/cc0/kenney/pirate-kit/Models/GLB format/ship-wreck.glb` |
| 13 | boat | `~/models/cc0/quaternius/pirate-kit/glTF/Ship_Small.gltf` |
| 14 | boat | `~/models/cc0/poly-pizza/boat/Quaternius-Sail-Boat_BgSZXwmm7k.glb` |
| 15 | pier | `~/models/cc0/quaternius/pirate-kit/glTF/Environment_Dock.gltf` |
| 16 | pier | `~/models/cc0/quaternius/pirate-kit/glTF/Environment_Dock_Broken.gltf` |
| 17 | pier | `~/models/cc0/poly-pizza/pier/Quaternius-Dock-Long_bN9Oz3niNm.glb` |
| 18 | hut | `~/models/cc0/poly-pizza/hut/Quaternius-Hut_4MJWbyd6vw.glb` |
| 19 | hut | `~/models/cc0/poly-pizza/hut/Quaternius-Huts_j9uMWazOBh.glb` |
| 20 | prop | `~/models/cc0/quaternius/pirate-kit/glTF/Prop_Barrel.gltf` |
| 21 | prop | `~/models/cc0/kenney/pirate-kit/Models/GLB format/crate.glb` |
| 22 | prop | `~/models/cc0/quaternius/pirate-kit/glTF/Prop_Chest_Gold.gltf` |
| 23 | prop | `~/models/cc0/quaternius/fantasy-props-megakit/Exports/glTF/Rope_1.gltf` (needs its folder's textures; shape not checked) |
| 24 | clutter | `~/models/cc0/poly-pizza/beach/Kenney-Coconut-Half_ufT2tXnLFc.glb` |
| 25 | clutter | `~/models/cc0/poly-pizza/beach/Kenney-Mussel-Open_eWHAc3Pq8z.glb` (shell) |
| 26 | clutter | `~/models/cc0/poly-pizza/driftwood/Kay-Lousberg-Dead-tree_k80NkrvY2f.glb` (driftwood branch) |
| 27 | clutter | `~/models/cc0/poly-pizza/driftwood/Quaternius-Wood-Log_L4E32Wee6C.glb` |
| 28 | clutter | `~/models/cc0/quaternius/pirate-kit/glTF/Environment_LargeBones.gltf` (whale ribs) |
| 29 | ruin | `~/models/cc0/poly-pizza/ruin/Quaternius-Arch-Round_B9QABewqLv.glb` |
| 30 | ruin | `~/models/cc0/kenney/nature-kit/Models/GLTF format/stone_tallA.glb` (monolith) |

## How each download worked, and what failed

- **Kenney:** direct zips from `kenney.nl/media/pages/assets/<pack>/…/kenney_<pack>.zip`, taken from each pack page. The Watercraft page is `/assets/watercraft-kit`; `/assets/watercraft-pack` has no download link.
- **itch.io (Quaternius Ultimate Nature, Stylized Nature, Fantasy Props; KayKit Forest):** fetched without a browser. The script gets the page's `csrf_token`, then POSTs to `https://<user>.itch.io/<slug>/file/<upload_id>?source=view_game&as_props=1` and gets back a signed URL (see `_tools/itch_get.sh`). The `source=game_download&key=…` route returned "invalid key".
- **Quaternius Pirate Kit:** only offered as a Google Drive folder. It was listed through `drive.google.com/embeddedfolderview?id=…`, and each file came from `drive.usercontent.google.com/download?id=…&export=download&confirm=t`. This worked, but only the glTF subfolder was taken (no FBX/OBJ/Blends).
- **Poly Pizza:** scraping model pages hit HTTP 429 quickly. The JSON search endpoint `poly.pizza/api/search/<q>?lic=1` (CC0 only) worked. GLB URL = the result's `previewUrl` with `.webp` changed to `.glb`.
- **Not found or skipped:**
  - **KayKit Pirate pack:** no such pack exists on KayKit's itch page or GitHub (`KayKit-Game-Assets`).
  - **KayKit Adventurers:** characters only, so skipped.
  - **KayKit Dungeon Remastered:** barrels, crates and chests are already covered, so skipped.
  - **Poly Pizza CC0 gaps:** no CC0 **starfish**, **fishing net** or rope-coil model exists (the rest of those search results were CC-BY and were excluded).
  - **Quaternius packs:** there are no palms in the Stylized Nature MegaKit, and the Ultimate Nature Pack has no glTF (FBX/OBJ/.blend only).
