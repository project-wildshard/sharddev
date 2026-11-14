---
name: wildshard-mockup-to-model
description: Model one thing (a prop, building, rock, plant or creature) for a Wildshard shard repo from a reference image or mockup, in code or in Blender, into the shard source. Use when asked to model, add or replace a prop, building or creature, or to turn a picture into a model.
---

# wildshard-mockup-to-model

One model, from a picture to a model the shard source uses and `wildshard check .` passes. `GUIDE.md` at the repo root
holds the facts; this skill holds the order. A pointer `GUIDE.md#<anchor>` is the guide heading with that anchor.
Read `GUIDE.md#2-the-shard-source` before your first edit: it says what ships in the shard file and what never does.

## The steps, in order

1. **The reference.** One object alone on a plain background, three-quarter view, whole and unoccluded; add a front
   and a side view when proportions matter. Keep the image and any mockup outside the shard source, in a folder of
   your own such as `blender/` or `art/`: they never ship (`GUIDE.md#2-the-shard-source`). Done when the reference is
   saved there.
2. **The detail list and the numbers.** Beside the reference, write a short README: the details that make the thing
   recognisable (silhouette, bands, marks, colour zones), numbered; its height and footprint in metres; how many copies
   the world places; what it collides with. Give the model its own space: metres, +Y up, pivot at the centre of its
   foot on y = 0, front toward +Z. Done when every detail has a number and the README has the sizes.
3. **Pick one way to build it.**
   - **Code:** a generator in `generators/` that builds the mesh at build time. Pick it when the shape follows numbers
     or data (stairs, fences, a row of posts), or changes often. Generators run only at build time and must not import
     runtime code (`GUIDE.md#lint-no-runtime-in-build`). An old repo made with the retired `--template blender` has
     no generators: use Blender.
   - **Blender:** model it by hand or with a Blender script, keep the `.blend` or script in `blender/`, and export a
     GLB. Pick it for an organic shape, a UV unwrap, a baked texture or a bevel.
   - **An image-to-3D tool or a CC0 model** you are licensed to use: treat its GLB as the Blender path's export.
   Done when you have named the way in the README.
4. **Build it** to the README's numbers, then look at it beside the reference, detail by detail. Place each detail on
   a real part of the mesh, or drop it. Done when every numbered detail is placed or dropped.
5. **Into the shard source.**
   - **Code:** import the generator from `generators/generate.ts` (the reference world's props come in through
     `generators/props.ts`) or from `shard.config.ts`; a file nothing imports never runs.
   - **A GLB:** copy it into `assets/` named by its SHA-256 (`shasum -a 256 model.glb`), with no extension. Find every
     file that names the old hash (`grep -rl <old-hash> src`) and change each to the new one; delete the old file when
     nothing names it. A creature's GLB is named in `data/skins.json` and its skin file together with measured sizes:
     replacing one needs the Wildshard team today. If nothing names a model of its kind yet, ask the Wildshard team
     how it is loaded; the guide does not say yet.
   - **An old `--template blender` repo** (retired, J341; still checks and uploads): the GLB goes in `blobs/glb/` as
     `<sha256>.glb`, and every `sections/` row that names it changes to match; `wildshard check .` settles the sizes
     (`GUIDE.md#2-the-shard-source`).
   Done when `git status` shows the new file and the changed rows or imports.
6. **Check.** `wildshard check .` (`GUIDE.md#1-the-loop`). The report card measures draws, triangles, memory and
   download against their limits (`GUIDE.md#3-budgets`); a refusal names its fix, for example
   `GUIDE.md#budget-triangles` or `GUIDE.md#budget-download`. Done when the last line reads `check pass`.
7. **See it in the world.** `wildshard dev .`, then walk to where the model stands (`GUIDE.md#walking-your-shard`).
   Done when you have seen it there.
8. **The hero.** The world changed, so before the next upload follow the `wildshard-goldens` skill
   (`GUIDE.md#the-hero`). Done when that skill's hero steps are done, or you have written down that this repo has no
   `manifest.json` card to capture.

## Rules

- A model is one thing. A place (a camp, a field) is several models placed by the shard's data: split it first.
- Seed every random choice in a generator, so the same shard source builds the same shard file twice.
- Take every limit and number from the guide or `wildshard check . --json`; this skill carries none.
